import { app, ipcMain } from "electron";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const FILE_NAME = "company-logos.json";
const MAX_LOGO_LENGTH = 900_000;
const cleanTaxId = (value) => String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const validLogo = (value) => {
  const raw = String(value || "").trim();
  return raw.length <= MAX_LOGO_LENGTH && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(raw) ? raw : "";
};

function targetFile() { return path.join(app.getPath("userData"), FILE_NAME); }
async function readState() {
  try {
    const parsed = JSON.parse(await readFile(targetFile(), "utf8"));
    return { version: 1, logos: {}, ...parsed, logos: parsed?.logos && typeof parsed.logos === "object" ? parsed.logos : {} };
  } catch { return { version: 1, logos: {}, updatedAt: null }; }
}
async function writeState(state) {
  const file = targetFile();
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2), { encoding: "utf8", mode: 0o600 });
  await rename(temp, file);
}

ipcMain.handle("seven:company-logo", async (_event, request = {}) => {
  const action = String(request.action || "get").toLowerCase();
  const taxId = cleanTaxId(request.taxId);
  if (taxId.length !== 14) return { ok: false, error: "Informe o CNPJ do estabelecimento para vincular o logotipo." };
  const state = await readState();
  if (action === "get") return { ok: true, taxId, logoDataUrl: validLogo(state.logos[taxId]?.logoDataUrl), updatedAt: state.logos[taxId]?.updatedAt || null };
  if (action === "remove") {
    delete state.logos[taxId];
    await writeState(state);
    return { ok: true, removed: true, taxId };
  }
  if (action === "set") {
    const logoDataUrl = validLogo(request.logoDataUrl);
    if (!logoDataUrl) return { ok: false, error: "Logo inválido. Use PNG, JPG/JPEG ou WebP com tamanho otimizado." };
    state.logos[taxId] = { logoDataUrl, updatedAt: new Date().toISOString() };
    await writeState(state);
    return { ok: true, taxId, logoDataUrl, updatedAt: state.logos[taxId].updatedAt };
  }
  return { ok: false, error: "Ação de logotipo não reconhecida." };
});
