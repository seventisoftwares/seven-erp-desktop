import { safeStorage } from "electron";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";

const safeName = (value) => String(value || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);

export function createSecretVault({ dataDir }) {
  const dir = path.join(dataDir, "integration-secrets");

  async function get(connector) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error("Cofre seguro indisponível.");
    const name = safeName(connector);
    try {
      const encrypted = await readFile(path.join(dir, `${name}.bin`));
      return JSON.parse(safeStorage.decryptString(encrypted));
    } catch { return {}; }
  }

  async function set(connector, secrets) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error("O armazenamento seguro do sistema operacional não está disponível.");
    const name = safeName(connector);
    if (!name) throw new Error("Integração inválida.");
    await mkdir(dir, { recursive: true });
    const existing = await get(connector);
    const merged = { ...existing };
    for (const [key, value] of Object.entries(secrets || {})) {
      if (value === null) delete merged[key];
      else if (typeof value === "string" && value.trim()) merged[key] = value;
    }
    const encrypted = safeStorage.encryptString(JSON.stringify(merged));
    await writeFile(path.join(dir, `${name}.bin`), encrypted, { mode: 0o600 });
    return status(connector);
  }

  async function status(connector) {
    const secrets = await get(connector);
    return {
      connector: safeName(connector),
      stored: Object.keys(secrets),
      configured: Object.keys(secrets).length > 0,
      certificateId: typeof secrets.certificateId === "string" ? secrets.certificateId : null,
      localValidationStatus: typeof secrets.localValidationStatus === "string" ? secrets.localValidationStatus : null,
      localValidationMessage: typeof secrets.localValidationMessage === "string" ? secrets.localValidationMessage : null,
      localValidatedAt: typeof secrets.localValidatedAt === "string" ? secrets.localValidatedAt : null,
    };
  }

  async function remove(connector) {
    const name = safeName(connector);
    try { await unlink(path.join(dir, `${name}.bin`)); } catch {}
    return { removed: true };
  }

  return { set, get, status, remove };
}
