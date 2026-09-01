import { gzip, gunzip } from "node:zlib";
import { promisify } from "node:util";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

const normalizeAccessKey = (value) => String(value || "").replace(/\D/g, "");
const nowIso = () => new Date().toISOString();

export function createFiscalDocumentStore({ dataDir }) {
  const rootDir = path.join(dataDir, "fiscal-documents");
  const receivedDir = path.join(rootDir, "received");
  const indexPath = path.join(rootDir, "received-index.json");

  function fileFor(accessKey) {
    const key = normalizeAccessKey(accessKey);
    if (!/^\d{44}$/.test(key)) throw new Error("Chave de acesso fiscal inválida para armazenamento local.");
    return path.join(receivedDir, `${key}.xml.gz`);
  }

  async function readIndex() {
    try {
      const rows = JSON.parse(await readFile(indexPath, "utf8"));
      return Array.isArray(rows) ? rows : [];
    } catch { return []; }
  }

  async function writeIndex(rows) {
    await mkdir(rootDir, { recursive: true });
    const temporary = `${indexPath}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(rows, null, 2), { encoding: "utf8", mode: 0o600 });
    await rename(temporary, indexPath);
  }

  async function saveReceived({ accessKey, xml, metadata = {} }) {
    const key = normalizeAccessKey(accessKey);
    const target = fileFor(key);
    const source = String(xml || "").trim();
    if (!source.startsWith("<")) throw new Error("XML fiscal inválido para armazenamento local.");
    await mkdir(receivedDir, { recursive: true });
    const compressed = await gzipAsync(Buffer.from(source, "utf8"), { level: 9 });
    const temporary = `${target}.${process.pid}.tmp`;
    await writeFile(temporary, compressed, { mode: 0o600 });
    await rename(temporary, target);

    const rows = await readIndex();
    const existing = rows.find((item) => item.accessKey === key);
    const savedAt = nowIso();
    const record = {
      ...(existing || {}),
      ...metadata,
      accessKey: key,
      bytes: compressed.length,
      storage: "local-gzip",
      xmlStoredLocally: true,
      firstStoredAt: existing?.firstStoredAt || savedAt,
      storedAt: savedAt,
      updatedAt: savedAt,
    };
    if (existing) Object.assign(existing, record); else rows.push(record);
    rows.sort((a, b) => String(b.issueDate || b.storedAt || "").localeCompare(String(a.issueDate || a.storedAt || "")));
    await writeIndex(rows.slice(0, 5000));
    return record;
  }

  async function listReceived() {
    return readIndex();
  }

  async function hasReceived(accessKey) {
    try { await stat(fileFor(accessKey)); return true; }
    catch { return false; }
  }

  async function readReceived(accessKey) {
    const compressed = await readFile(fileFor(accessKey));
    return (await gunzipAsync(compressed)).toString("utf8");
  }

  return { saveReceived, listReceived, hasReceived, readReceived };
}
