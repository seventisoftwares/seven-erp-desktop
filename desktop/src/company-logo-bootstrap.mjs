import { app, ipcMain } from "electron";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { cleanTaxId, companyLogoEntry, replaceCompanyLogoCache, validLogo } from "./company-logo-store.mjs";

const FILE_NAME = "company-logos.json";
let cacheReady = false;

function targetFile() { return path.join(app.getPath("userData"), FILE_NAME); }
async function readState() {
  try {
    const parsed = JSON.parse(await readFile(targetFile(), "utf8"));
    return { version: 1, logos: {}, ...parsed, logos: parsed?.logos && typeof parsed.logos === "object" ? parsed.logos : {} };
  } catch {
    return { version: 1, logos: {}, updatedAt: null };
  }
}
async function refreshCache() {
  const state = await readState();
  replaceCompanyLogoCache(state.logos || {});
  cacheReady = true;
  return state;
}
async function writeState(state) {
  const file = targetFile();
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2), { encoding: "utf8", mode: 0o600 });
  await rename(temp, file);
  replaceCompanyLogoCache(state.logos || {});
  cacheReady = true;
}

export async function getCompanyLogo(taxId) {
  if (!cacheReady) await refreshCache();
  return companyLogoEntry(taxId);
}

app.whenReady().then(() => refreshCache()).catch(() => undefined);

ipcMain.handle("seven:company-logo", async (_event, request = {}) => {
  const action = String(request.action || "get").toLowerCase();
  const taxId = cleanTaxId(request.taxId);
  if (taxId.length !== 14) return { ok: false, error: "Informe o CNPJ do estabelecimento para vincular o logotipo." };
  const state = await refreshCache();
  if (action === "get") return { ok: true, ...companyLogoEntry(taxId) };
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
    return { ok: true, ...companyLogoEntry(taxId) };
  }
  return { ok: false, error: "Ação de logotipo não reconhecida." };
});
