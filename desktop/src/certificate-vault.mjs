import { dialog, safeStorage } from "electron";
import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import tls from "node:tls";

export function createCertificateVault({ dataDir, readJson, writeJson }) {
  const indexFile = "certificate-vault-index.json";
  const vaultDir = path.join(dataDir, "certificate-vault");

  async function list() {
    const rows = await readJson(indexFile, []);
    return Array.isArray(rows) ? rows : [];
  }

  async function importPfx({ passphrase = "" } = {}) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error("O armazenamento seguro do Windows/macOS não está disponível.");
    const result = await dialog.showOpenDialog({
      title: "Selecionar certificado digital A1",
      properties: ["openFile"],
      filters: [{ name: "Certificado A1 PKCS#12", extensions: ["pfx", "p12"] }],
    });
    if (result.canceled || !result.filePaths?.[0]) return { canceled: true };
    const sourcePath = result.filePaths[0];
    const pfx = await readFile(sourcePath);
    if (!pfx.length) throw new Error("O arquivo de certificado está vazio.");
    try {
      tls.createSecureContext({ pfx, passphrase: String(passphrase || "") });
    } catch (error) {
      throw new Error(`Não foi possível abrir o certificado. Verifique o arquivo e a senha. ${error instanceof Error ? error.message : ""}`.trim());
    }

    const id = randomUUID();
    await mkdir(vaultDir, { recursive: true });
    const encrypted = safeStorage.encryptString(JSON.stringify({ pfx: pfx.toString("base64"), passphrase: String(passphrase || "") }));
    await writeFile(path.join(vaultDir, `${id}.bin`), encrypted, { mode: 0o600 });
    const metadata = {
      id,
      type: "A1-PKCS12",
      originalName: path.basename(sourcePath),
      sha256: createHash("sha256").update(pfx).digest("hex"),
      size: pfx.length,
      importedAt: new Date().toISOString(),
      validatedLocally: true,
      storage: "os-encrypted-local-vault",
    };
    const rows = await list();
    rows.push(metadata);
    await writeJson(indexFile, rows);
    return { canceled: false, certificate: metadata };
  }

  async function remove(id) {
    const rows = await list();
    const next = rows.filter((item) => item.id !== id);
    if (next.length === rows.length) return { removed: false };
    try { await unlink(path.join(vaultDir, `${id}.bin`)); } catch {}
    await writeJson(indexFile, next);
    return { removed: true };
  }

  async function loadSecret(id) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error("Cofre seguro indisponível.");
    const metadata = (await list()).find((item) => item.id === id);
    if (!metadata) throw new Error("Certificado não encontrado neste computador.");
    const encrypted = await readFile(path.join(vaultDir, `${id}.bin`));
    const decoded = JSON.parse(safeStorage.decryptString(encrypted));
    return { metadata, pfx: Buffer.from(decoded.pfx, "base64"), passphrase: decoded.passphrase || "" };
  }

  async function validate(id) {
    const secret = await loadSecret(id);
    try {
      tls.createSecureContext({ pfx: secret.pfx, passphrase: secret.passphrase });
      return { valid: true, certificate: secret.metadata };
    } catch (error) {
      return { valid: false, certificate: secret.metadata, error: error instanceof Error ? error.message : "Certificado inválido." };
    }
  }

  return { list, importPfx, remove, loadSecret, validate };
}
