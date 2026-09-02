import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const STORE_VERSION = 1;
const nowIso = () => new Date().toISOString();
const cleanText = (value, max = 300) => String(value ?? "").trim().slice(0, max);

function emptyState() { return { version: STORE_VERSION, templates: [], versions: [], migratedLegacyOs: false, updatedAt: nowIso() }; }
function response(status, payload) { return { status, ok: status >= 200 && status < 300, headers: { "content-type": "application/json", "x-seven-local": "true" }, body: JSON.stringify(payload) }; }

export function createDocumentTemplateStore({ dataDir }) {
  const filePath = path.join(dataDir, "document-templates.json");
  const backupDir = path.join(dataDir, "backups", "document-templates");
  let state = emptyState();
  let writeChain = Promise.resolve();

  async function backupExisting(reason = "update") {
    try {
      await mkdir(backupDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      await copyFile(filePath, path.join(backupDir, `document-templates-${stamp}-${reason}.json`));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  async function persist(reason = "update") {
    writeChain = writeChain.then(async () => {
      await mkdir(dataDir, { recursive: true });
      await backupExisting(reason);
      const tmp = `${filePath}.tmp`;
      state.updatedAt = nowIso();
      await writeFile(tmp, JSON.stringify(state, null, 2), { encoding: "utf8", mode: 0o600 });
      await rename(tmp, filePath);
    });
    return writeChain;
  }

  async function initialize() {
    await mkdir(dataDir, { recursive: true });
    try {
      const parsed = JSON.parse(await readFile(filePath, "utf8"));
      state = { ...emptyState(), ...parsed, version: STORE_VERSION, templates: Array.isArray(parsed.templates) ? parsed.templates : [], versions: Array.isArray(parsed.versions) ? parsed.versions : [] };
      if (Number(parsed.version || 0) !== STORE_VERSION) await persist("migration");
    } catch (error) {
      if (error?.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
      state = emptyState();
      await persist("initial");
    }
  }

  function normalizeDefinition(definition) {
    if (!definition || Number(definition.schemaVersion) !== 1 || !Array.isArray(definition.elements)) throw new Error("Definição de modelo inválida.");
    const pageWidthMm = Number(definition.pageWidthMm);
    const pageHeightMm = Number(definition.pageHeightMm);
    if (!(pageWidthMm >= 30 && pageWidthMm <= 1000 && pageHeightMm >= 30 && pageHeightMm <= 2000)) throw new Error("Tamanho de página inválido.");
    return JSON.parse(JSON.stringify(definition));
  }

  function versionSnapshot(template, version, note) {
    return { id: randomUUID(), templateId: template.id, version, definition: normalizeDefinition(template.definition), note: cleanText(note || `Versão ${version}`, 500), createdAt: nowIso() };
  }

  async function createTemplate(payload) {
    const name = cleanText(payload.name, 160);
    const documentType = cleanText(payload.documentType, 60);
    if (!name || !documentType) throw new Error("Nome e tipo do documento são obrigatórios.");
    const createdAt = nowIso();
    const template = {
      id: cleanText(payload.id, 120) || randomUUID(), documentType, name,
      description: cleanText(payload.description, 1000), isDefault: Boolean(payload.isDefault), currentVersion: 1,
      definition: normalizeDefinition(payload.definition), createdAt, updatedAt: createdAt,
    };
    if (state.templates.some((item) => item.id === template.id)) throw new Error("Já existe um modelo com este identificador.");
    if (template.isDefault) for (const item of state.templates) if (item.documentType === template.documentType) item.isDefault = false;
    state.templates.push(template);
    state.versions.push(versionSnapshot(template, 1, payload.note || "Versão inicial"));
    await persist("create");
    return template;
  }

  async function updateTemplate(id, payload) {
    const index = state.templates.findIndex((item) => item.id === id);
    if (index < 0) throw Object.assign(new Error("Modelo não encontrado."), { statusCode: 404 });
    const current = state.templates[index];
    const nextVersion = Number(current.currentVersion || 1) + 1;
    const definition = payload.definition ? normalizeDefinition(payload.definition) : current.definition;
    const next = {
      ...current,
      name: payload.name === undefined ? current.name : cleanText(payload.name, 160) || current.name,
      description: payload.description === undefined ? current.description : cleanText(payload.description, 1000),
      documentType: payload.documentType === undefined ? current.documentType : cleanText(payload.documentType, 60) || current.documentType,
      definition,
      currentVersion: nextVersion,
      updatedAt: nowIso(),
    };
    state.templates[index] = next;
    state.versions.push(versionSnapshot(next, nextVersion, payload.note || "Alteração do modelo"));
    await persist("update");
    return next;
  }

  async function restoreVersion(templateId, versionNumber) {
    const template = state.templates.find((item) => item.id === templateId);
    const source = state.versions.find((item) => item.templateId === templateId && Number(item.version) === Number(versionNumber));
    if (!template || !source) throw Object.assign(new Error("Modelo ou versão não encontrado."), { statusCode: 404 });
    return updateTemplate(templateId, { definition: source.definition, note: `Restaurado da versão ${source.version}` });
  }

  async function setDefault(id) {
    const template = state.templates.find((item) => item.id === id);
    if (!template) throw Object.assign(new Error("Modelo não encontrado."), { statusCode: 404 });
    for (const item of state.templates) if (item.documentType === template.documentType) item.isDefault = item.id === id;
    template.updatedAt = nowIso();
    await persist("set-default");
    return template;
  }

  async function duplicate(id, name) {
    const source = state.templates.find((item) => item.id === id);
    if (!source) throw Object.assign(new Error("Modelo não encontrado."), { statusCode: 404 });
    return createTemplate({ ...source, id: randomUUID(), name: cleanText(name, 160) || `${source.name} - cópia`, isDefault: false, note: `Duplicado de ${source.name}` });
  }

  async function removeTemplate(id) {
    const index = state.templates.findIndex((item) => item.id === id);
    if (index < 0) return false;
    const [removed] = state.templates.splice(index, 1);
    // Histórico é preservado para auditoria/restauração administrativa; o painel comum não apaga versões.
    if (removed.isDefault) {
      const replacement = state.templates.find((item) => item.documentType === removed.documentType);
      if (replacement) replacement.isDefault = true;
    }
    await persist("delete-template");
    return true;
  }

  async function api(method, url, payload = {}) {
    try {
      if (method === "GET") {
        const templateId = url.searchParams.get("templateId");
        if (templateId) return response(200, { template: state.templates.find((item) => item.id === templateId) || null, versions: state.versions.filter((item) => item.templateId === templateId).sort((a, b) => b.version - a.version), local: true });
        return response(200, { templates: [...state.templates].sort((a, b) => a.documentType.localeCompare(b.documentType) || a.name.localeCompare(b.name, "pt-BR")), local: true, storeVersion: STORE_VERSION, migratedLegacyOs: state.migratedLegacyOs });
      }
      if (method === "POST") {
        if (payload.action === "duplicate") return response(201, { template: await duplicate(cleanText(payload.id, 120), payload.name), local: true });
        if (payload.action === "restore") return response(200, { template: await restoreVersion(cleanText(payload.id, 120), payload.version), local: true });
        if (payload.action === "set_default") return response(200, { template: await setDefault(cleanText(payload.id, 120)), local: true });
        if (payload.action === "mark_legacy_migrated") { state.migratedLegacyOs = true; await persist("legacy-os-migrated"); return response(200, { migratedLegacyOs: true, local: true }); }
        return response(201, { template: await createTemplate(payload), local: true });
      }
      if (method === "PATCH") return response(200, { template: await updateTemplate(cleanText(payload.id, 120), payload), local: true });
      if (method === "DELETE") return response(200, { removed: await removeTemplate(cleanText(payload.id, 120)), local: true });
      return response(405, { error: "Método não permitido." });
    } catch (error) {
      return response(Number(error?.statusCode) || 400, { error: error instanceof Error ? error.message : "Falha no armazenamento de modelos." });
    }
  }

  return { initialize, api, get templates() { return state.templates; }, get versions() { return state.versions; } };
}
