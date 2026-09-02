import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const VERSION = 1;
const allowedSections = new Set(["nfe", "nfce", "nfse", "danfe"]);
const now = () => new Date().toISOString();
const clone = (value) => JSON.parse(JSON.stringify(value));
const clean = (value, max = 500) => String(value ?? "").trim().slice(0, max);

function defaults() {
  return {
    version: VERSION,
    nfe: { environment: "homologation", uf: "RS", series: "1", nextNumber: 1, crt: "1", defaultCfop: "5102", natureOperation: "VENDA DE MERCADORIA", finalConsumerDefault: false, presenceIndicator: "9", contingency: "normal" },
    nfce: { environment: "homologation", uf: "RS", series: "1", nextNumber: 1, crt: "1", cscId: "", printWidthMm: 80, contingency: "offline_when_legal" },
    nfse: { environment: "homologation", provider: "padrao_nacional", municipalityCode: "", cnae: "", serviceCode: "", rpsSeries: "1", issRate: 0, baseUrl: "" },
    danfe: { orientation: "portrait", copies: 1, printer: "", previewBeforePrint: true, autoPrintAfterAuthorization: false, additionalInfo: "", logoMode: "company" },
    audit: [], updatedAt: now(),
  };
}

function sanitize(section, payload) {
  const p = payload && typeof payload === "object" ? payload : {};
  if (section === "nfe") return {
    environment: p.environment === "production" ? "production" : "homologation", uf: clean(p.uf, 2).toUpperCase() || "RS", series: clean(p.series, 3) || "1", nextNumber: Math.max(1, Math.trunc(Number(p.nextNumber) || 1)),
    crt: ["1", "2", "3", "4"].includes(String(p.crt)) ? String(p.crt) : "1", defaultCfop: clean(p.defaultCfop, 4), natureOperation: clean(p.natureOperation, 120), finalConsumerDefault: Boolean(p.finalConsumerDefault),
    presenceIndicator: clean(p.presenceIndicator, 2) || "9", contingency: ["normal", "svc_an", "svc_rs", "epec"].includes(p.contingency) ? p.contingency : "normal",
  };
  if (section === "nfce") return {
    environment: p.environment === "production" ? "production" : "homologation", uf: clean(p.uf, 2).toUpperCase() || "RS", series: clean(p.series, 3) || "1", nextNumber: Math.max(1, Math.trunc(Number(p.nextNumber) || 1)),
    crt: ["1", "2", "3", "4"].includes(String(p.crt)) ? String(p.crt) : "1", cscId: clean(p.cscId, 20), printWidthMm: Number(p.printWidthMm) === 58 ? 58 : 80,
    contingency: p.contingency === "normal" ? "normal" : "offline_when_legal",
  };
  if (section === "nfse") return {
    environment: p.environment === "production" ? "production" : "homologation", provider: ["padrao_nacional", "acbr", "municipal"].includes(p.provider) ? p.provider : "padrao_nacional", municipalityCode: clean(p.municipalityCode, 20),
    cnae: clean(p.cnae, 20), serviceCode: clean(p.serviceCode, 30), rpsSeries: clean(p.rpsSeries, 10) || "1", issRate: Math.max(0, Math.min(100, Number(p.issRate) || 0)), baseUrl: clean(p.baseUrl, 500),
  };
  if (section === "danfe") return {
    orientation: p.orientation === "landscape" ? "landscape" : "portrait", copies: Math.max(1, Math.min(5, Math.trunc(Number(p.copies) || 1))), printer: clean(p.printer, 250), previewBeforePrint: p.previewBeforePrint !== false,
    autoPrintAfterAuthorization: Boolean(p.autoPrintAfterAuthorization), additionalInfo: clean(p.additionalInfo, 2000), logoMode: p.logoMode === "none" ? "none" : "company",
  };
  throw new Error("Seção fiscal inválida.");
}

export function createFiscalConfigurationStore({ dataDir }) {
  const file = path.join(dataDir, "fiscal-configurations.json");
  const backupDir = path.join(dataDir, "backups", "fiscal-configurations");
  let state = defaults(); let chain = Promise.resolve();
  async function backup() { try { await mkdir(backupDir, { recursive: true }); await copyFile(file, path.join(backupDir, `fiscal-config-${now().replace(/[:.]/g, "-")}.json`)); } catch (error) { if (error?.code !== "ENOENT") throw error; } }
  async function persist() { chain = chain.then(async () => { await mkdir(dataDir, { recursive: true }); await backup(); const tmp = `${file}.tmp`; state.updatedAt = now(); await writeFile(tmp, JSON.stringify(state, null, 2), { encoding: "utf8", mode: 0o600 }); await rename(tmp, file); }); return chain; }
  async function initialize() { try { const value = JSON.parse(await readFile(file, "utf8")); state = { ...defaults(), ...value, version: VERSION, audit: Array.isArray(value.audit) ? value.audit.slice(-1000) : [] }; } catch (error) { if (error?.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error; state = defaults(); await persist(); } }
  async function get(section) { if (section && !allowedSections.has(section)) throw new Error("Seção fiscal inválida."); return section ? clone(state[section]) : clone({ nfe: state.nfe, nfce: state.nfce, nfse: state.nfse, danfe: state.danfe, updatedAt: state.updatedAt }); }
  async function set(section, payload, actor = "local-user") { if (!allowedSections.has(section)) throw new Error("Seção fiscal inválida."); const previous = JSON.stringify(state[section]); const next = sanitize(section, payload); state[section] = next; state.audit.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, event: "fiscal_configuration_changed", section, actor: clean(actor, 120) || "local-user", changed: previous !== JSON.stringify(next), createdAt: now() }); state.audit = state.audit.slice(-1000); await persist(); return clone(next); }
  async function audit(limit = 100) { return clone(state.audit.slice(-Math.max(1, Math.min(500, Number(limit) || 100))).reverse()); }
  return { initialize, get, set, audit };
}
