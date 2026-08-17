import http from "node:http";
import dgram from "node:dgram";
import os from "node:os";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const DEFAULT_PORT = 47821;
const DISCOVERY_PORT = 47822;
const MULTICAST_ADDRESS = "239.77.7.7";
const DISCOVERY_INTERVAL = 5000;
const SYNC_INTERVAL = 12000;
const PAIRING_TTL = 15 * 60 * 1000;
const MAX_BODY = 8 * 1024 * 1024;

const nowIso = () => new Date().toISOString();
const sha = (value) => createHash("sha256").update(String(value)).digest("hex");
const hmac = (key, value) => createHmac("sha256", key).update(value).digest("hex");

function normalizeAddress(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const candidate = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  const url = new URL(candidate);
  if (!url.port) url.port = String(DEFAULT_PORT);
  return `${url.protocol}//${url.hostname}:${url.port}`;
}

function localAddresses() {
  const values = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const item of entries || []) {
      if (item.family === "IPv4" && !item.internal) values.push(item.address);
    }
  }
  return values;
}

async function readRequest(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY) throw new Error("Pacote de sincronização excede o limite permitido.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
  res.end(body);
}

export function createMesh({ core, deviceId, getDeviceName, appVersion, getWorkspace, setWorkspace, onStatus }) {
  let server = null;
  let udp = null;
  let listenPort = DEFAULT_PORT;
  let pairing = null;
  let discoveryTimer = null;
  let syncTimer = null;
  let syncing = false;
  let lastSyncAt = null;
  let reachablePeers = 0;
  const discovered = new Map();

  async function signedSyncResponse(workspace, payload) {
    const encoded = JSON.stringify(payload);
    return { payload, signature: hmac(workspace.key, encoded) };
  }

  function verifySignedResponse(workspace, result) {
    if (!result?.payload || !result?.signature) throw new Error("Resposta do peer sem assinatura.");
    const expected = hmac(workspace.key, JSON.stringify(result.payload));
    const a = Buffer.from(expected, "hex"), b = Buffer.from(String(result.signature), "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Assinatura de sincronização inválida.");
    return result.payload;
  }

  async function handleRequest(req, res) {
    try {
      const url = new URL(req.url || "/", "http://mesh.local");
      if (req.method === "GET" && url.pathname === "/mesh/health") return sendJson(res, 200, { ok: true, product: "Seven ERP Mesh", deviceId, port: listenPort });
      if (req.method === "GET" && url.pathname === "/mesh/info") {
        const workspace = await getWorkspace();
        return sendJson(res, 200, {
          product: "Seven ERP Mesh", deviceId, deviceName: await getDeviceName(), appVersion, port: listenPort,
          workspaceId: workspace?.id || null, workspaceName: workspace?.name || null, paired: Boolean(workspace?.id),
        });
      }
      if (req.method === "POST" && url.pathname === "/mesh/pair") {
        const raw = await readRequest(req);
        const data = JSON.parse(raw || "{}");
        if (!pairing || Date.now() > pairing.expiresAt || String(data.code || "").toUpperCase() !== pairing.code) {
          return sendJson(res, 403, { error: "Código de pareamento inválido ou expirado." });
        }
        const workspace = await getWorkspace();
        if (!workspace?.id || !workspace?.key) return sendJson(res, 409, { error: "Este computador ainda não possui um ambiente Seven Mesh." });
        pairing = null;
        const remoteIp = String(req.socket.remoteAddress || "").replace(/^::ffff:/, "");
        const remotePort = Number(data.port) || DEFAULT_PORT;
        if (data.deviceId && remoteIp) {
          await core.upsertPeer({
            id: String(data.deviceId), name: String(data.deviceName || "Computador Seven ERP"),
            url: `http://${remoteIp}:${remotePort}`, source: "pairing", status: "paired", lastSeenAt: nowIso(),
          });
        }
        await onStatus?.();
        return sendJson(res, 200, {
          workspace: { id: workspace.id, name: workspace.name, key: workspace.key },
          snapshot: core.exportSnapshot(),
          host: { id: deviceId, name: await getDeviceName(), url: remoteIp ? `http://${localAddresses()[0] || "127.0.0.1"}:${listenPort}` : null, port: listenPort },
        });
      }
      if (req.method === "POST" && url.pathname === "/mesh/sync") {
        const workspace = await getWorkspace();
        if (!workspace?.id || !workspace?.key) return sendJson(res, 401, { error: "Ambiente local não configurado." });
        const raw = await readRequest(req);
        const ts = String(req.headers["x-seven-ts"] || "");
        const signature = String(req.headers["x-seven-signature"] || "");
        const timestamp = Number(ts);
        if (!timestamp || Math.abs(Date.now() - timestamp) > 5 * 60 * 1000) return sendJson(res, 401, { error: "Assinatura expirada." });
        const expected = hmac(workspace.key, `${ts}.${raw}`);
        const a = Buffer.from(expected, "hex"), b = Buffer.from(signature, "hex");
        if (a.length !== b.length || !timingSafeEqual(a, b)) return sendJson(res, 401, { error: "Assinatura inválida." });
        const data = JSON.parse(raw || "{}");
        if (data.workspaceId !== workspace.id) return sendJson(res, 409, { error: "Ambiente Seven Mesh diferente." });
        const applied = await core.applyChanges(data.changes || []);
        const remoteIp = String(req.socket.remoteAddress || "").replace(/^::ffff:/, "");
        if (data.device?.id && remoteIp) {
          await core.upsertPeer({
            id: String(data.device.id), name: String(data.device.name || "Computador Seven ERP"),
            url: `http://${remoteIp}:${Number(data.device.port) || DEFAULT_PORT}`, source: "sync", status: "online", lastSeenAt: nowIso(),
          });
        }
        lastSyncAt = nowIso();
        await onStatus?.();
        return sendJson(res, 200, await signedSyncResponse(workspace, { applied, changes: core.exportChanges(), serverTime: lastSyncAt }));
      }
      return sendJson(res, 404, { error: "Rota Seven Mesh não encontrada." });
    } catch (error) {
      return sendJson(res, 500, { error: error instanceof Error ? error.message : "Falha no Seven Mesh." });
    }
  }

  async function startHttp() {
    for (let offset = 0; offset < 20; offset += 1) {
      const port = DEFAULT_PORT + offset;
      try {
        await new Promise((resolve, reject) => {
          const candidate = http.createServer(handleRequest);
          candidate.once("error", reject);
          candidate.listen(port, "0.0.0.0", () => {
            candidate.removeListener("error", reject);
            server = candidate;
            listenPort = port;
            resolve();
          });
        });
        return;
      } catch {
        // tenta a próxima porta local
      }
    }
    throw new Error("Não foi possível abrir uma porta local para o Seven Mesh.");
  }

  async function announce() {
    if (!udp) return;
    const workspace = await getWorkspace();
    const message = Buffer.from(JSON.stringify({
      type: "seven-erp-mesh", deviceId, deviceName: await getDeviceName(), appVersion, port: listenPort,
      workspaceId: workspace?.id || null, workspaceTag: workspace?.id ? sha(workspace.id).slice(0, 12) : null,
    }));
    try { udp.send(message, DISCOVERY_PORT, MULTICAST_ADDRESS); } catch { /* rede local indisponível */ }
  }

  async function startDiscovery() {
    udp = dgram.createSocket({ type: "udp4", reuseAddr: true });
    udp.on("message", async (buffer, rinfo) => {
      try {
        const data = JSON.parse(buffer.toString("utf8"));
        if (data.type !== "seven-erp-mesh" || !data.deviceId || data.deviceId === deviceId) return;
        const peer = { id: String(data.deviceId), name: String(data.deviceName || "Computador Seven ERP"), url: `http://${rinfo.address}:${Number(data.port) || DEFAULT_PORT}`, workspaceId: data.workspaceId || null, lastSeenAt: nowIso() };
        discovered.set(peer.id, peer);
        const workspace = await getWorkspace();
        if (workspace?.id && data.workspaceId === workspace.id) await core.upsertPeer({ ...peer, source: "lan", status: "discovered" });
      } catch { /* ignora multicast de outros programas */ }
    });
    udp.bind(DISCOVERY_PORT, () => {
      try { udp.addMembership(MULTICAST_ADDRESS); udp.setMulticastTTL(1); } catch { /* interface sem multicast */ }
      void announce();
    });
    discoveryTimer = setInterval(() => void announce(), DISCOVERY_INTERVAL);
    discoveryTimer.unref?.();
  }

  async function requestJson(base, pathname, options = {}) {
    const url = `${base.replace(/\/$/, "")}${pathname}`;
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(options.timeout || 5000) });
    const body = await response.text();
    let data = {};
    try { data = body ? JSON.parse(body) : {}; } catch { data = {}; }
    if (!response.ok) throw new Error(data.error || `Peer respondeu HTTP ${response.status}`);
    return data;
  }

  async function syncPeer(peer) {
    const workspace = await getWorkspace();
    if (!workspace?.id || !workspace?.key || !peer?.url) return false;
    const body = JSON.stringify({
      workspaceId: workspace.id,
      device: { id: deviceId, name: await getDeviceName(), port: listenPort, appVersion },
      changes: core.exportChanges(),
    });
    const ts = String(Date.now());
    const result = await requestJson(peer.url, "/mesh/sync", {
      method: "POST", headers: { "content-type": "application/json", "x-seven-ts": ts, "x-seven-signature": hmac(workspace.key, `${ts}.${body}`) }, body, timeout: 6000,
    });
    const payload = verifySignedResponse(workspace, result);
    await core.applyChanges(payload.changes || []);
    await core.upsertPeer({ ...peer, status: "online", lastSeenAt: nowIso(), lastError: null });
    return true;
  }

  async function syncAll() {
    if (syncing) return;
    const workspace = await getWorkspace();
    if (!workspace?.id) return;
    syncing = true;
    let reached = 0;
    try {
      const peers = core.getPeers();
      for (const peer of peers) {
        if (peer.id === deviceId || !peer.url) continue;
        try { if (await syncPeer(peer)) reached += 1; }
        catch (error) { await core.upsertPeer({ ...peer, status: "offline", lastError: error instanceof Error ? error.message : "Peer indisponível" }); }
      }
      reachablePeers = reached;
      if (reached) lastSyncAt = nowIso();
    } finally {
      syncing = false;
      await onStatus?.();
    }
  }

  function createPairingCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = randomBytes(8);
    const code = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
    pairing = { code, expiresAt: Date.now() + PAIRING_TTL };
    return { code, expiresAt: new Date(pairing.expiresAt).toISOString(), validForSeconds: PAIRING_TTL / 1000 };
  }

  async function pairWithCode({ code, deviceName, address }) {
    const cleanCode = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (cleanCode.length !== 8) throw new Error("Informe o código de pareamento com 8 caracteres.");
    const candidates = [];
    const manual = normalizeAddress(address);
    if (manual) candidates.push({ id: `manual:${manual}`, url: manual, name: manual });
    for (const peer of discovered.values()) if (!candidates.some((item) => item.url === peer.url)) candidates.push(peer);
    for (const peer of core.getPeers()) if (peer.url && !candidates.some((item) => item.url === peer.url)) candidates.push(peer);
    if (!candidates.length) throw new Error("Nenhum Seven ERP foi encontrado. Na mesma rede, deixe o outro computador aberto. Em redes diferentes, informe o IP/VPN do computador principal.");

    let lastError = null;
    for (const peer of candidates) {
      try {
        const data = await requestJson(peer.url, "/mesh/pair", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ code: cleanCode, deviceId, deviceName, port: listenPort, appVersion }), timeout: 4500,
        });
        if (!data.workspace?.id || !data.workspace?.key) throw new Error("Peer não retornou um ambiente válido.");
        await setWorkspace({ id: data.workspace.id, name: data.workspace.name || "Empresa Seven ERP", key: data.workspace.key });
        await core.importSnapshot(data.snapshot || {});
        const info = await requestJson(peer.url, "/mesh/info", { timeout: 3500 });
        await core.upsertPeer({ id: info.deviceId || peer.id, name: info.deviceName || peer.name, url: peer.url, source: manual ? "manual" : "lan", status: "online", lastSeenAt: nowIso() });
        await syncAll();
        return { paired: true, device: { id: deviceId, name: deviceName }, workspace: data.workspace };
      } catch (error) { lastError = error; }
    }
    throw new Error(lastError instanceof Error ? lastError.message : "Não foi possível conectar ao outro computador.");
  }

  async function addRemotePeer(address) {
    const base = normalizeAddress(address);
    if (!base) throw new Error("Informe um IP ou endereço válido.");
    const workspace = await getWorkspace();
    if (!workspace?.id) throw new Error("Crie ou conecte um ambiente Seven Mesh primeiro.");
    const info = await requestJson(base, "/mesh/info", { timeout: 5000 });
    if (info.workspaceId !== workspace.id) throw new Error("O computador informado pertence a outro ambiente Seven ERP.");
    const peer = await core.upsertPeer({ id: info.deviceId, name: info.deviceName || base, url: base, source: "manual", status: "configured", lastSeenAt: nowIso() });
    await syncPeer(peer);
    await onStatus?.();
    return peer;
  }

  async function removePeer(peerId) {
    await core.removePeer(peerId);
    await onStatus?.();
  }

  async function start() {
    await startHttp();
    await startDiscovery();
    syncTimer = setInterval(() => void syncAll(), SYNC_INTERVAL);
    syncTimer.unref?.();
    await onStatus?.();
  }

  async function stop() {
    if (discoveryTimer) clearInterval(discoveryTimer);
    if (syncTimer) clearInterval(syncTimer);
    try { udp?.close(); } catch { /* já fechado */ }
    await new Promise((resolve) => server ? server.close(() => resolve()) : resolve());
  }

  function status() {
    return {
      mode: "mesh", listenPort, localAddresses: localAddresses().map((ip) => `${ip}:${listenPort}`),
      discovered: Array.from(discovered.values()), reachablePeers, lastSyncAt,
      pairingActive: Boolean(pairing && Date.now() <= pairing.expiresAt),
    };
  }

  return { start, stop, status, createPairingCode, pairWithCode, addRemotePeer, removePeer, syncAll };
}
