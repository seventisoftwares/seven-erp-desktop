import { app, BrowserWindow, ipcMain, net, safeStorage, shell } from "electron";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const APP_DIR = path.dirname(fileURLToPath(import.meta.url));
const API_BASE = process.env.SEVEN_ERP_API_URL || "https://seven-erp.marcoopiovezanaa.chatgpt.site";
const SYNC_INTERVAL_MS = 30_000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;

let mainWindow = null;
let isOnline = false;
let syncing = false;

function userDataPath(file) { return path.join(app.getPath("userData"), file); }

async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(userDataPath(file), "utf8")); }
  catch { return fallback; }
}

async function writeJson(file, value) {
  await mkdir(app.getPath("userData"), { recursive: true });
  const target = userDataPath(file);
  const temporary = `${target}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2), { encoding: "utf8", mode: 0o600 });
  await rename(temporary, target);
}

async function loadConfig() {
  const config = await readJson("device.json", {});
  if (!config.installationId) {
    config.installationId = randomUUID();
    await writeJson("device.json", config);
  }
  return config;
}

async function saveToken(token) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("O armazenamento seguro do sistema não está disponível.");
  const config = await loadConfig();
  config.encryptedToken = safeStorage.encryptString(token).toString("base64");
  await writeJson("device.json", config);
}

async function loadToken() {
  const config = await loadConfig();
  if (!config.encryptedToken || !safeStorage.isEncryptionAvailable()) return null;
  try { return safeStorage.decryptString(Buffer.from(config.encryptedToken, "base64")); }
  catch { return null; }
}

function allowedApiPath(value) {
  return typeof value === "string" && value.startsWith("/api/") && !value.includes("..") && !value.includes("//");
}

async function remoteRequest(apiPath, options = {}, tokenOverride) {
  if (!allowedApiPath(apiPath)) throw new Error("Rota de API não permitida.");
  const token = tokenOverride === undefined ? await loadToken() : tokenOverride;
  const headers = new Headers();
  headers.set("accept", "application/json");
  if (options.headers?.["content-type"]) headers.set("content-type", options.headers["content-type"]);
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (options.operationId) headers.set("x-seven-operation-id", options.operationId);
  const body = options.body || undefined;
  if (body && Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) throw new Error("Operação excede o limite local de 2 MB.");
  const response = await net.fetch(`${API_BASE}${apiPath}`, { method: options.method || "GET", headers, body });
  const responseBody = await response.text();
  return { status: response.status, ok: response.ok, headers: { "content-type": response.headers.get("content-type") || "application/json" }, body: responseBody };
}

async function getStatus() {
  const config = await loadConfig();
  const queue = await readJson("offline-queue.json", []);
  return { online: isOnline, paired: Boolean(await loadToken()), pending: queue.length, deviceName: config.deviceName || os.hostname(), apiBase: API_BASE };
}

async function broadcastStatus() {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("seven:status", await getStatus());
}

async function queueOperation(apiPath, options) {
  const queue = await readJson("offline-queue.json", []);
  const operationId = options.operationId || randomUUID();
  if (!queue.some((item) => item.operationId === operationId)) {
    queue.push({ id: randomUUID(), operationId, path: apiPath, method: options.method || "POST", headers: options.headers || {}, body: options.body || null, queuedAt: new Date().toISOString(), attempts: 0 });
    await writeJson("offline-queue.json", queue);
  }
  await broadcastStatus();
  let payload = {};
  try { payload = options.body ? JSON.parse(options.body) : {}; } catch { payload = {}; }
  if (apiPath === "/api/customers") return { status: 202, ok: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ queued: true, offline: true, operationId, customer: { id: `offline-${operationId}`, ...payload } }) };
  if (apiPath === "/api/nfe-drafts") return { status: 202, ok: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ queued: true, offline: true, operationId, draft: { id: `offline-${operationId}`, ...payload }, validationErrors: [], readiness: { transmissionEnabled: false, blockers: ["Aguardando conexão para validação no servidor."] } }) };
  return { status: 202, ok: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ queued: true, offline: true, operationId }) };
}

async function cachedRequest(apiPath) {
  const cache = await readJson("api-cache.json", {});
  const cached = cache[apiPath];
  if (!cached) return { status: 503, ok: false, headers: { "content-type": "application/json", "x-seven-offline": "true" }, body: JSON.stringify({ error: "Este conteúdo ainda não foi sincronizado neste computador.", offline: true }) };
  return { ...cached, headers: { ...cached.headers, "x-seven-offline": "true" } };
}

async function requestWithOffline(apiPath, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const operationId = method === "GET" ? undefined : options.operationId || randomUUID();
  const token = await loadToken();
  if (!token) return { status: 401, ok: false, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Este computador ainda não foi autorizado." }) };
  try {
    const result = await remoteRequest(apiPath, { ...options, method, operationId });
    isOnline = true;
    if (method === "GET" && result.ok) {
      const cache = await readJson("api-cache.json", {});
      cache[apiPath] = result;
      await writeJson("api-cache.json", cache);
    }
    await broadcastStatus();
    return result;
  } catch {
    isOnline = false;
    return method === "GET" ? cachedRequest(apiPath) : queueOperation(apiPath, { ...options, method, operationId });
  }
}

async function flushQueue() {
  if (syncing || !(await loadToken())) return;
  syncing = true;
  try {
    const queue = await readJson("offline-queue.json", []);
    const remaining = [];
    const failed = await readJson("failed-operations.json", []);
    for (let index = 0; index < queue.length; index += 1) {
      const item = queue[index];
      try {
        const result = await remoteRequest(item.path, { ...item, operationId: item.operationId });
        if (!result.ok) {
          const next = { ...item, attempts: item.attempts + 1, lastStatus: result.status, lastAttemptAt: new Date().toISOString() };
          if (result.status >= 400 && result.status < 500 && result.status !== 408 && result.status !== 409 && result.status !== 429) failed.push(next);
          else remaining.push(next);
        }
      } catch {
        remaining.push({ ...item, attempts: item.attempts + 1 });
        remaining.push(...queue.slice(index + 1));
        break;
      }
    }
    await writeJson("offline-queue.json", remaining);
    await writeJson("failed-operations.json", failed.slice(-500));
    const config = await loadConfig();
    try {
      const result = await remoteRequest(`/api/sync/bootstrap?cursor=${config.syncCursor || 0}`);
      if (result.ok) {
        const data = JSON.parse(result.body);
        config.syncCursor = data.cursor || config.syncCursor || 0;
        config.lastSyncAt = new Date().toISOString();
        await writeJson("device.json", config);
        const cache = await readJson("api-cache.json", {});
        cache["/api/sync/bootstrap"] = result;
        for (const apiPath of ["/api/dashboard", "/api/customers", "/api/integrations", "/api/nfe-drafts", "/api/recipient-manifestations"]) {
          try {
            const refreshed = await remoteRequest(apiPath);
            if (refreshed.ok) cache[apiPath] = refreshed;
          } catch { /* mantém o último cache válido desta rota */ }
        }
        await writeJson("api-cache.json", cache);
        isOnline = true;
      }
    } catch { isOnline = false; }
  } finally {
    syncing = false;
    await broadcastStatus();
  }
}

async function pairDevice({ code, deviceName }) {
  const config = await loadConfig();
  const result = await remoteRequest("/api/sync/pair", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, deviceName, installationId: config.installationId, platform: `${process.platform}-${process.arch}`, appVersion: app.getVersion() }),
  }, null);
  const data = JSON.parse(result.body || "{}");
  if (!result.ok || !data.token) throw new Error(data.error || "Não foi possível autorizar este computador.");
  await saveToken(data.token);
  config.deviceName = deviceName;
  config.deviceId = data.device.id;
  config.organizationId = data.device.organizationId;
  config.syncCursor = data.sync?.cursor || 0;
  await writeJson("device.json", { ...(await loadConfig()), ...config });
  isOnline = true;
  await flushQueue();
  return { paired: true, device: data.device };
}

async function forgetDevice() {
  const config = await loadConfig();
  delete config.encryptedToken;
  delete config.deviceId;
  delete config.organizationId;
  config.syncCursor = 0;
  await writeJson("device.json", config);
  isOnline = false;
  await broadcastStatus();
  return { paired: false };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1040,
    minHeight: 680,
    show: false,
    backgroundColor: "#f5f7fb",
    title: "Seven ERP",
    icon: path.join(APP_DIR, "../build/icon.png"),
    webPreferences: {
      preload: path.join(APP_DIR, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  void mainWindow.loadFile(path.join(APP_DIR, "../dist/index.html"));
}

const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();
else {
  app.on("second-instance", () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } });
  app.whenReady().then(async () => {
    ipcMain.handle("seven:get-status", getStatus);
    ipcMain.handle("seven:pair", (_event, payload) => pairDevice(payload));
    ipcMain.handle("seven:forget", forgetDevice);
    ipcMain.handle("seven:api-request", (_event, apiPath, options) => requestWithOffline(apiPath, options));
    createWindow();
    await flushQueue();
    setInterval(() => void flushQueue(), SYNC_INTERVAL_MS).unref();
    app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
}

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
