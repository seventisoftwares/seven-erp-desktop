import { gzip, gunzip } from "node:zlib";
import { promisify } from "node:util";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const nowIso = () => new Date().toISOString();

const normalizeAccessKey = (value) => String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const safeStage = (value) => String(value || "document").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40) || "document";
const safeToken = (value, fallback = "document") => String(value || fallback).toLowerCase().replace(/[^a-z0-9._-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 120) || fallback;

export function createFiscalDocumentStore({ dataDir }) {
  const rootDir = path.join(dataDir, "fiscal-documents");
  const receivedDir = path.join(rootDir, "received");
  const issuedDir = path.join(rootDir, "issued");
  const standaloneDir = path.join(rootDir, "standalone");
  const receivedIndexPath = path.join(rootDir, "received-index.json");
  const issuedIndexPath = path.join(rootDir, "issued-index.json");
  const standaloneIndexPath = path.join(rootDir, "standalone-index.json");

  function validateKey(accessKey) {
    const key = normalizeAccessKey(accessKey);
    if (!/^[A-Z0-9]{44}$/.test(key)) throw new Error("Chave de acesso fiscal inválida para armazenamento local.");
    return key;
  }

  function receivedFileFor(accessKey) {
    return path.join(receivedDir, `${validateKey(accessKey)}.xml.gz`);
  }

  function issuedFileFor(accessKey, stage) {
    const key = validateKey(accessKey);
    return path.join(issuedDir, key, `${safeStage(stage)}.xml.gz`);
  }

  function standaloneFileFor(category, id, stage) {
    return path.join(standaloneDir, safeToken(category, "fiscal"), safeToken(id), `${safeStage(stage)}.xml.gz`);
  }

  async function readIndex(indexPath) {
    try {
      const rows = JSON.parse(await readFile(indexPath, "utf8"));
      return Array.isArray(rows) ? rows : [];
    } catch { return []; }
  }

  async function writeIndex(indexPath, rows) {
    await mkdir(rootDir, { recursive: true });
    const temporary = `${indexPath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, JSON.stringify(rows, null, 2), { encoding: "utf8", mode: 0o600 });
    await rename(temporary, indexPath);
  }

  async function writeCompressed(target, source) {
    const xml = String(source || "").trim();
    if (!xml.startsWith("<")) throw new Error("XML fiscal inválido para armazenamento local.");
    await mkdir(path.dirname(target), { recursive: true });
    const compressed = await gzipAsync(Buffer.from(xml, "utf8"), { level: 9 });
    const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, compressed, { mode: 0o600 });
    await rename(temporary, target);
    return compressed.length;
  }

  async function readCompressed(target) {
    const compressed = await readFile(target);
    return (await gunzipAsync(compressed)).toString("utf8");
  }

  async function saveReceived({ accessKey, xml, metadata = {} }) {
    const key = validateKey(accessKey);
    const bytes = await writeCompressed(receivedFileFor(key), xml);
    const rows = await readIndex(receivedIndexPath);
    const existing = rows.find((item) => item.accessKey === key);
    const savedAt = nowIso();
    const record = {
      ...(existing || {}), ...metadata, accessKey: key, bytes, storage: "local-gzip", xmlStoredLocally: true,
      firstStoredAt: existing?.firstStoredAt || savedAt, storedAt: savedAt, updatedAt: savedAt,
    };
    if (existing) Object.assign(existing, record); else rows.push(record);
    rows.sort((a, b) => String(b.issueDate || b.storedAt || "").localeCompare(String(a.issueDate || a.storedAt || "")));
    await writeIndex(receivedIndexPath, rows.slice(0, 5000));
    return record;
  }

  async function saveIssued({ accessKey, stage, xml, metadata = {} }) {
    const key = validateKey(accessKey);
    const normalizedStage = safeStage(stage);
    const bytes = await writeCompressed(issuedFileFor(key, normalizedStage), xml);
    const rows = await readIndex(issuedIndexPath);
    const existing = rows.find((item) => item.accessKey === key);
    const savedAt = nowIso();
    const stages = { ...(existing?.stages || {}) };
    stages[normalizedStage] = { bytes, storedAt: savedAt };
    const record = {
      ...(existing || {}), ...metadata, accessKey: key, storage: "local-gzip", xmlStoredLocally: true,
      stages, latestStage: normalizedStage, firstStoredAt: existing?.firstStoredAt || savedAt, storedAt: savedAt, updatedAt: savedAt,
    };
    if (existing) Object.assign(existing, record); else rows.push(record);
    rows.sort((a, b) => String(b.issuedAt || b.storedAt || "").localeCompare(String(a.issuedAt || a.storedAt || "")));
    await writeIndex(issuedIndexPath, rows.slice(0, 5000));
    return record;
  }

  async function saveStandalone({ category, id, stage = "processed", xml, metadata = {} }) {
    const normalizedCategory = safeToken(category, "fiscal");
    const normalizedId = safeToken(id);
    const normalizedStage = safeStage(stage);
    const bytes = await writeCompressed(standaloneFileFor(normalizedCategory, normalizedId, normalizedStage), xml);
    const rows = await readIndex(standaloneIndexPath);
    const existing = rows.find((item) => item.category === normalizedCategory && item.id === normalizedId);
    const savedAt = nowIso();
    const stages = { ...(existing?.stages || {}) };
    stages[normalizedStage] = { bytes, storedAt: savedAt };
    const record = {
      ...(existing || {}), ...metadata, category: normalizedCategory, id: normalizedId, storage: "local-gzip", xmlStoredLocally: true,
      stages, latestStage: normalizedStage, firstStoredAt: existing?.firstStoredAt || savedAt, storedAt: savedAt, updatedAt: savedAt,
    };
    if (existing) Object.assign(existing, record); else rows.push(record);
    rows.sort((a, b) => String(b.receivedAt || b.storedAt || "").localeCompare(String(a.receivedAt || a.storedAt || "")));
    await writeIndex(standaloneIndexPath, rows.slice(0, 5000));
    return record;
  }

  async function listReceived() { return readIndex(receivedIndexPath); }
  async function listIssued() { return readIndex(issuedIndexPath); }
  async function listStandalone(category = "") {
    const rows = await readIndex(standaloneIndexPath);
    const normalized = category ? safeToken(category, "fiscal") : "";
    return normalized ? rows.filter((item) => item.category === normalized) : rows;
  }

  async function hasReceived(accessKey) { try { await stat(receivedFileFor(accessKey)); return true; } catch { return false; } }
  async function hasIssued(accessKey, stage = "authorized") { try { await stat(issuedFileFor(accessKey, stage)); return true; } catch { return false; } }
  async function hasStandalone(category, id, stage = "processed") { try { await stat(standaloneFileFor(category, id, stage)); return true; } catch { return false; } }

  async function readReceived(accessKey) { return readCompressed(receivedFileFor(accessKey)); }
  async function readIssued(accessKey, stage = "authorized") { return readCompressed(issuedFileFor(accessKey, stage)); }
  async function readStandalone(category, id, stage = "processed") { return readCompressed(standaloneFileFor(category, id, stage)); }

  return {
    saveReceived, saveIssued, saveStandalone,
    listReceived, listIssued, listStandalone,
    hasReceived, hasIssued, hasStandalone,
    readReceived, readIssued, readStandalone,
  };
}
