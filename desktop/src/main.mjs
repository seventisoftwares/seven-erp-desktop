import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from "electron";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createLocalCore } from "./local-core.mjs";
import { createMesh } from "./mesh.mjs";
import { createCertificateVault } from "./certificate-vault.mjs";
import { createSecretVault } from "./secret-vault.mjs";
import { createFiscalDocumentStore } from "./fiscal-document-store.mjs";
import { createNfeSequenceStore } from "./nfe-sequence-store.mjs";
import { createNfeService } from "./nfe-service.mjs";
import { buildDanfeHtml } from "./nfe-danfe.mjs";
import { createErpServices } from "./erp-services.mjs";

const APP_DIR = path.dirname(fileURLToPath(import.meta.url));
const MAX_BODY_BYTES = 8 * 1024 * 1024;

let mainWindow = null;
let localCore = null;
let mesh = null;
let certificateVault = null;
let secretVault = null;
let fiscalDocumentStore = null;
let nfeSequenceStore = null;
let nfeService = null;
let erpServices = null;

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
  let changed = false;
  if (!config.installationId) { config.installationId = randomUUID(); changed = true; }
  if (!config.deviceId) { config.deviceId = randomUUID(); changed = true; }
  if (!config.deviceName) { config.deviceName = os.hostname(); changed = true; }
  if (changed) await writeJson("device.json", config);
  return config;
}

async function getDeviceName() {
  const config = await loadConfig();
  return config.deviceName || os.hostname();
}

async function setDeviceName(value) {
  const config = await loadConfig();
  config.deviceName = String(value || "").trim().slice(0, 80) || os.hostname();
  await writeJson("device.json", config);
  return config.deviceName;
}

async function getWorkspace() {
  const config = await loadConfig();
  if (!config.workspaceId || !config.encryptedWorkspaceKey) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    return {
      id: config.workspaceId,
      name: config.workspaceName || "Empresa Seven ERP",
      key: safeStorage.decryptString(Buffer.from(config.encryptedWorkspaceKey, "base64")),
    };
  } catch { return null; }
}

async function setWorkspace(workspace) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("O armazenamento seguro do Windows/macOS não está disponível para proteger a chave do Seven Mesh.");
  const id = String(workspace?.id || "").trim();
  const key = String(workspace?.key || "").trim();
  if (!id || !key) throw new Error("Ambiente Seven Mesh inválido.");
  const config = await loadConfig();
  config.workspaceId = id;
  config.workspaceName = String(workspace?.name || "Empresa Seven ERP").trim().slice(0, 120);
  config.encryptedWorkspaceKey = safeStorage.encryptString(key).toString("base64");
  config.meshActivatedAt = new Date().toISOString();
  await writeJson("device.json", config);
  await broadcastStatus();
  return { id: config.workspaceId, name: config.workspaceName };
}

async function createWorkspace(payload = {}) {
  const existing = await getWorkspace();
  if (existing) return { created: false, workspace: { id: existing.id, name: existing.name } };
  await setDeviceName(payload.deviceName);
  const workspace = {
    id: randomUUID(),
    name: String(payload.name || "Minha empresa").trim().slice(0, 120) || "Minha empresa",
    key: randomBytes(32).toString("base64url"),
  };
  await setWorkspace(workspace);
  await mesh?.syncAll();
  return { created: true, workspace: { id: workspace.id, name: workspace.name } };
}

function apiResponse(status, payload) {
  return { status, ok: status >= 200 && status < 300, headers: { "content-type": "application/json", "x-seven-local": "true" }, body: JSON.stringify(payload) };
}

async function getStatus() {
  const config = await loadConfig();
  const workspace = await getWorkspace();
  const meshStatus = mesh?.status() || { mode: "mesh", reachablePeers: 0, discovered: [], localAddresses: [], listenPort: null, lastSyncAt: null };
  const peers = localCore?.getPeers?.() || [];
  const certificates = certificateVault ? await certificateVault.list() : [];
  return {
    online: true,
    paired: Boolean(workspace?.id),
    pending: 0,
    deviceName: config.deviceName || os.hostname(),
    apiBase: "local://seven-erp",
    storageMode: "local-first",
    syncMode: "desktop-mesh",
    workspaceId: workspace?.id || null,
    workspaceName: workspace?.name || null,
    peers: peers.length,
    reachablePeers: meshStatus.reachablePeers || 0,
    lastSyncAt: meshStatus.lastSyncAt || null,
    localAddresses: meshStatus.localAddresses || [],
    listenPort: meshStatus.listenPort || null,
    localCertificates: certificates.length,
  };
}

async function broadcastStatus() {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("seven:status", await getStatus());
}

async function meshApiRequest(apiPath, options = {}) {
  const url = new URL(apiPath, "http://seven.local");
  const method = String(options.method || "GET").toUpperCase();
  let payload = {};
  try { payload = options.body ? JSON.parse(options.body) : {}; } catch { payload = {}; }

  if (url.pathname === "/api/sync/pairing") {
    if (method === "GET") {
      const devices = (localCore?.getPeers?.() || []).map((peer) => ({
        id: peer.id, name: peer.name || "Computador Seven ERP", platform: peer.source === "manual" ? "Rede remota/VPN" : "Rede local",
        appVersion: peer.appVersion || app.getVersion(), status: peer.status === "offline" ? "revoked" : "active",
        lastSeenAt: peer.lastSeenAt || null, lastSyncCursor: 0, createdAt: peer.createdAt || peer.updatedAt || null,
        url: peer.url || null,
      }));
      return apiResponse(200, { devices, mesh: mesh?.status() || {}, local: true });
    }
    if (method === "POST") {
      const workspace = await getWorkspace();
      if (!workspace) return apiResponse(409, { error: "Crie ou conecte um ambiente Seven Mesh antes de autorizar outro computador." });
      const result = mesh.createPairingCode();
      return apiResponse(201, { ...result, local: true });
    }
    if (method === "DELETE") {
      if (payload.deviceId) await mesh.removePeer(String(payload.deviceId));
      return apiResponse(200, { revoked: true, deviceId: payload.deviceId, local: true });
    }
  }

  if (url.pathname === "/api/sync/status" && method === "GET") return apiResponse(200, await getStatus());
  if (url.pathname === "/api/sync/bootstrap" && method === "GET") return apiResponse(200, { cursor: Date.now(), snapshot: localCore.exportSnapshot(), mesh: mesh?.status() || {}, local: true });
  return null;
}

async function requestLocal(apiPath, options = {}) {
  if (typeof apiPath !== "string" || !apiPath.startsWith("/api/") || apiPath.includes("..") || apiPath.includes("//")) {
    return apiResponse(400, { error: "Rota de API local não permitida." });
  }
  if (options.body && Buffer.byteLength(String(options.body), "utf8") > MAX_BODY_BYTES) return apiResponse(413, { error: "Operação excede o limite local de 8 MB." });
  const workspace = await getWorkspace();
  if (!workspace) return apiResponse(401, { error: "Este computador ainda não criou nem entrou em um ambiente Seven Mesh." });

  const url = new URL(apiPath, "http://seven.local");
  const method = String(options.method || "GET").toUpperCase();
  let payload = {};
  try { payload = options.body ? JSON.parse(options.body) : {}; } catch { payload = {}; }

  if (url.pathname === "/api/company") {
    const result = await erpServices.companyApi(method, payload);
    if (result.ok && method !== "GET") void mesh?.syncAll();
    return result;
  }

  if (url.pathname === "/api/nfe-drafts") {
    const result = await nfeService.api(method, payload);
    if (result.ok && method === "POST" && !payload.action) void mesh?.syncAll();
    return result;
  }

  const meshResult = await meshApiRequest(apiPath, options);
  if (meshResult) return meshResult;
  const result = await localCore.apiRequest(apiPath, options);
  if (result.ok && method !== "GET") void mesh?.syncAll();
  return result;
}

async function saveDanfePdf(draftId) {
  const listResult = await nfeService.listDrafts();
  let data = {};
  try { data = JSON.parse(listResult.body || "{}"); } catch {}
  const draft = (data.drafts || []).find((item) => item.id === String(draftId || ""));
  if (!draft) throw new Error("NF-e não encontrada para geração do DANFE.");
  if (!["authorized", "cancelled"].includes(String(draft.transmissionStatus || draft.transmission?.status))) throw new Error("O DANFE só pode ser gerado após autorização da NF-e.");
  const accessKey = String(draft.accessKey || draft.transmission?.accessKey || "");
  if (!accessKey) throw new Error("NF-e autorizada sem chave de acesso local.");
  const nfeProcXml = await fiscalDocumentStore.readIssued(accessKey, "authorized");
  const cancelled = String(draft.transmissionStatus || draft.transmission?.status) === "cancelled";
  const html = buildDanfeHtml({ nfeProcXml, cancelled, cancellationProtocol: draft.cancellation?.protocol || draft.transmission?.cancellation?.protocol || "" });
  const printWindow = new BrowserWindow({ show: false, width: 900, height: 1200, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true } });
  try {
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const pdf = await printWindow.webContents.printToPDF({ printBackground: true, pageSize: "A4", preferCSSPageSize: true });
    const safeNumber = String(draft.nfeNumber || draft.transmission?.number || "NF-e").replace(/[^0-9A-Za-z_-]/g, "-");
    const save = await dialog.showSaveDialog(mainWindow || undefined, {
      title: "Salvar DANFE",
      defaultPath: path.join(app.getPath("documents"), `DANFE-NFe-${safeNumber}.pdf`),
      filters: [{ name: "Documento PDF", extensions: ["pdf"] }],
    });
    if (save.canceled || !save.filePath) return { saved: false, canceled: true };
    await writeFile(save.filePath, pdf, { mode: 0o600 });
    return { saved: true, canceled: false, filePath: save.filePath, bytes: pdf.length, accessKey };
  } finally {
    if (!printWindow.isDestroyed()) printWindow.destroy();
  }
}

async function pairDevice(payload = {}) {
  await setDeviceName(payload.deviceName);
  const result = await mesh.pairWithCode({ code: payload.code, deviceName: await getDeviceName(), address: payload.address || "" });
  await broadcastStatus();
  return result;
}

async function addRemotePeer(address) {
  const peer = await mesh.addRemotePeer(address);
  await broadcastStatus();
  return peer;
}

async function forgetDevice() {
  const config = await loadConfig();
  delete config.workspaceId;
  delete config.workspaceName;
  delete config.encryptedWorkspaceKey;
  delete config.meshActivatedAt;
  await writeJson("device.json", config);
  await broadcastStatus();
  return { paired: false, localDataPreserved: true };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1040, minHeight: 680, show: false,
    backgroundColor: "#f5f7fb", title: "Seven ERP", icon: path.join(APP_DIR, "../build/icon.png"),
    webPreferences: { preload: path.join(APP_DIR, "preload.mjs"), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { if (url.startsWith("https://")) void shell.openExternal(url); return { action: "deny" }; });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  void mainWindow.loadFile(path.join(APP_DIR, "../dist/index.html"));
}

const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();
else {
  app.on("second-instance", () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } });

  app.whenReady().then(async () => {
    const config = await loadConfig();
    localCore = createLocalCore({ dataDir: app.getPath("userData"), deviceId: config.deviceId, deviceName: config.deviceName, getWorkspace });
    await localCore.initialize();

    certificateVault = createCertificateVault({ dataDir: app.getPath("userData"), readJson, writeJson });
    secretVault = createSecretVault({ dataDir: app.getPath("userData") });
    fiscalDocumentStore = createFiscalDocumentStore({ dataDir: app.getPath("userData") });
    nfeSequenceStore = createNfeSequenceStore({ dataDir: app.getPath("userData") });
    erpServices = createErpServices({ core: localCore, certificateVault, secretVault, fiscalDocumentStore });
    nfeService = createNfeService({
      dataDir: app.getPath("userData"),
      core: localCore,
      certificateVault,
      secretVault,
      fiscalDocumentStore,
      sequenceStore: nfeSequenceStore,
      appVersion: app.getVersion(),
    });

    mesh = createMesh({ core: localCore, deviceId: config.deviceId, getDeviceName, appVersion: app.getVersion(), getWorkspace, setWorkspace, onStatus: broadcastStatus });
    await mesh.start();

    ipcMain.handle("seven:get-status", getStatus);
    ipcMain.handle("seven:create-workspace", (_event, payload) => createWorkspace(payload));
    ipcMain.handle("seven:pair", (_event, payload) => pairDevice(payload));
    ipcMain.handle("seven:forget", forgetDevice);
    ipcMain.handle("seven:api-request", (_event, apiPath, options) => requestLocal(apiPath, options));
    ipcMain.handle("seven:mesh-add-peer", (_event, address) => addRemotePeer(address));
    ipcMain.handle("seven:mesh-sync", async () => { await mesh.syncAll(); return getStatus(); });
    ipcMain.handle("seven:certificates-list", () => certificateVault.list());
    ipcMain.handle("seven:certificate-import", (_event, payload) => certificateVault.importPfx(payload));
    ipcMain.handle("seven:certificate-remove", (_event, id) => certificateVault.remove(id));
    ipcMain.handle("seven:integration-secrets-set", (_event, connector, secrets) => secretVault.set(connector, secrets));
    ipcMain.handle("seven:integration-secrets-status", (_event, connector) => secretVault.status(connector));
    ipcMain.handle("seven:integration-secrets-remove", (_event, connector) => secretVault.remove(connector));
    ipcMain.handle("seven:integration-test", (_event, payload) => erpServices.testIntegration(payload));
    ipcMain.handle("seven:dfe-sync", (_event, payload) => erpServices.syncDfe(payload));
    ipcMain.handle("seven:dfe-list", () => erpServices.listReceivedDfe());
    ipcMain.handle("seven:nfe-danfe-pdf", (_event, draftId) => saveDanfePdf(draftId));

    createWindow();
    app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
}

app.on("before-quit", () => { void mesh?.stop(); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
