import { app, BrowserWindow, dialog, ipcMain, safeStorage } from "electron";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDocumentTemplateStore } from "./document-template-store.mjs";
import { createDotnetSidecar } from "./dotnet-sidecar.mjs";
import { createCertificateVault } from "./certificate-vault.mjs";

const PLATFORM_DIR = path.dirname(fileURLToPath(import.meta.url));
let store = null;
let storeReady = null;
let certificateVault = null;
const sidecar = createDotnetSidecar({ appDir: PLATFORM_DIR, resourcesPath: process.resourcesPath, isPackaged: app.isPackaged });

function dataPath(file) { return path.join(app.getPath("userData"), file); }
async function readJson(file, fallback) { try { return JSON.parse(await readFile(dataPath(file), "utf8")); } catch { return fallback; } }
async function writeJson(file, value) {
  await mkdir(app.getPath("userData"), { recursive: true });
  const target = dataPath(file); const tmp = `${target}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2), { encoding: "utf8", mode: 0o600 });
  await rename(tmp, target);
}
async function ensureStore() {
  if (!store) store = createDocumentTemplateStore({ dataDir: app.getPath("userData") });
  if (!storeReady) storeReady = store.initialize();
  await storeReady;
  return store;
}
function safeUrl(query = "") { return new URL(`/api/document-templates${query ? `?${String(query).replace(/^\?/, "")}` : ""}`, "http://seven.local"); }
function parentWindow(event) { try { return BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow() || undefined; } catch { return undefined; } }

async function renderDocumentPdf(event, payload = {}) {
  const definition = payload.definition;
  const data = payload.data;
  if (!definition || !data) throw new Error("Modelo e dados do documento são obrigatórios para gerar PDF.");
  const suggested = String(payload.fileName || payload.templateName || "Documento").replace(/[^0-9A-Za-zÀ-ÿ _.-]/g, "-").slice(0, 100) || "Documento";
  let outputPath = String(payload.outputPath || "").trim();
  if (!outputPath) {
    const save = await dialog.showSaveDialog(parentWindow(event), {
      title: "Salvar documento em PDF",
      defaultPath: path.join(app.getPath("documents"), `${suggested.endsWith(".pdf") ? suggested : `${suggested}.pdf`}`),
      filters: [{ name: "Documento PDF", extensions: ["pdf"] }],
    });
    if (save.canceled || !save.filePath) return { saved: false, canceled: true };
    outputPath = save.filePath;
  }
  const result = await sidecar.invoke("report.render", { templateName: payload.templateName || "Documento", definition, data, outputPath }, { timeoutMs: 180000 });
  return { saved: Boolean(result?.success), canceled: false, ...result };
}

async function fiscalZeusCommand(command, payload = {}) {
  const allowed = new Set(["nfe.capabilities", "nfe.validate", "nfe.sign_validate", "nfe.status", "nfe.authorize_sync", "nfce.capabilities", "nfce.validate", "nfce.sign_validate", "nfce.status", "nfce.authorize_sync", "nfse.issue", "nfse.query", "nfse.cancel"]);
  if (!allowed.has(command)) throw new Error("Comando fiscal .NET não permitido pelo bridge.");
  const cloned = structuredClone(payload || {});
  const needsCertificate = /sign_validate|status|authorize_sync/.test(command);
  const certificateId = String(cloned.certificateId || cloned.configuration?.certificateId || "").trim();
  delete cloned.certificateId;
  if (cloned.configuration) delete cloned.configuration.certificateId;
  if (!needsCertificate) return sidecar.invoke(command, cloned, { timeoutMs: 180000 });

  if (!certificateId) throw new Error("Selecione um certificado digital para esta operação fiscal.");
  if (!safeStorage.isEncryptionAvailable()) throw new Error("Cofre seguro do sistema operacional indisponível.");
  if (!certificateVault) certificateVault = createCertificateVault({ dataDir: app.getPath("userData"), readJson, writeJson });
  const secret = await certificateVault.loadSecret(certificateId);
  const certificate = { pfxBase64: secret.pfx.toString("base64"), passphrase: secret.passphrase || "", vaultReference: certificateId };
  const isStatusCommand = command === "nfe.status" || command === "nfce.status";
  if (isStatusCommand) cloned.certificate = certificate;
  else cloned.configuration = { ...(cloned.configuration || {}), certificate };
  try { return await sidecar.invoke(command, cloned, { timeoutMs: 180000 }); }
  finally {
    try { secret.pfx.fill(0); } catch {}
    certificate.pfxBase64 = ""; certificate.passphrase = "";
    if (cloned.certificate) { cloned.certificate.pfxBase64 = ""; cloned.certificate.passphrase = ""; }
    if (cloned.configuration?.certificate) { cloned.configuration.certificate.pfxBase64 = ""; cloned.configuration.certificate.passphrase = ""; }
  }
}

async function danfeZeusPdf(event, payload = {}) {
  const xml = String(payload.nfeProcXml || "");
  if (!xml) throw new Error("XML nfeProc autorizado é obrigatório para gerar DANFE Zeus.");
  const generated = await sidecar.invoke("danfe.generate_html", { nfeProcXml: xml, logoDataUrl: payload.logoDataUrl || null }, { timeoutMs: 120000 });
  const html = String(generated?.html || "");
  if (!html) throw new Error("O gerador Zeus não retornou conteúdo do DANFE.");
  const printWindow = new BrowserWindow({ show: false, width: 900, height: 1200, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true } });
  try {
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const pdf = await printWindow.webContents.printToPDF({ printBackground: true, pageSize: "A4", preferCSSPageSize: true });
    const save = await dialog.showSaveDialog(parentWindow(event), { title: "Salvar DANFE", defaultPath: path.join(app.getPath("documents"), String(payload.fileName || "DANFE-NFe.pdf")), filters: [{ name: "Documento PDF", extensions: ["pdf"] }] });
    if (save.canceled || !save.filePath) return { saved: false, canceled: true };
    await writeFile(save.filePath, pdf, { mode: 0o600 });
    return { saved: true, canceled: false, filePath: save.filePath, bytes: pdf.length, engine: generated.engine || "Zeus.Net.NFe.Danfe.Html" };
  } finally { if (!printWindow.isDestroyed()) printWindow.destroy(); }
}

ipcMain.handle("seven:document-templates", async (_event, request = {}) => {
  const templates = await ensureStore();
  return templates.api(String(request.method || "GET").toUpperCase(), safeUrl(request.query), request.payload || {});
});
ipcMain.handle("seven:reporting-status", () => sidecar.status());
ipcMain.handle("seven:document-render-pdf", (event, payload) => renderDocumentPdf(event, payload));
ipcMain.handle("seven:fiscal-zeus", (_event, command, payload) => fiscalZeusCommand(String(command || ""), payload || {}));
ipcMain.handle("seven:danfe-zeus-pdf", (event, payload) => danfeZeusPdf(event, payload));

app.on("before-quit", () => { storeReady = null; store = null; });
