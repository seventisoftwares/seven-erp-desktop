import { gzip, gunzip } from "node:zlib";
import { promisify } from "node:util";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

const normalizeAccessKey = (value) => String(value || "").replace(/\D/g, "");

export function createFiscalDocumentStore({ dataDir }) {
  const receivedDir = path.join(dataDir, "fiscal-documents", "received");

  function fileFor(accessKey) {
    const key = normalizeAccessKey(accessKey);
    if (!/^\d{44}$/.test(key)) throw new Error("Chave de acesso fiscal inválida para armazenamento local.");
    return path.join(receivedDir, `${key}.xml.gz`);
  }

  async function saveReceived({ accessKey, xml }) {
    const target = fileFor(accessKey);
    const source = String(xml || "").trim();
    if (!source.startsWith("<")) throw new Error("XML fiscal inválido para armazenamento local.");
    await mkdir(receivedDir, { recursive: true });
    const compressed = await gzipAsync(Buffer.from(source, "utf8"), { level: 9 });
    const temporary = `${target}.${process.pid}.tmp`;
    await writeFile(temporary, compressed, { mode: 0o600 });
    await rename(temporary, target);
    return { accessKey: normalizeAccessKey(accessKey), bytes: compressed.length, storage: "local-gzip", storedAt: new Date().toISOString() };
  }

  async function hasReceived(accessKey) {
    try { await stat(fileFor(accessKey)); return true; }
    catch { return false; }
  }

  async function readReceived(accessKey) {
    const compressed = await readFile(fileFor(accessKey));
    return (await gunzipAsync(compressed)).toString("utf8");
  }

  return { saveReceived, hasReceived, readReceived };
}
