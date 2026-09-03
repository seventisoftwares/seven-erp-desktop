import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { normalizeCnpj, validateCnpj } from "./nfe-xml.mjs";

const text = (value) => String(value ?? "").trim();
const digits = (value) => String(value ?? "").replace(/\D/g, "");
const now = () => new Date().toISOString();
const jsonResponse = (status, payload) => ({ status, ok: status >= 200 && status < 300, headers: { "content-type": "application/json", "x-seven-local": "true" }, body: JSON.stringify(payload) });

export function createCompanyEstablishmentStore({ dataDir }) {
  const file = path.join(dataDir, "company-establishments.json");

  async function readState() {
    try {
      const parsed = JSON.parse(await readFile(file, "utf8"));
      return { version: 1, activeId: "matrix", branches: [], ...parsed, branches: Array.isArray(parsed?.branches) ? parsed.branches : [] };
    } catch {
      return { version: 1, activeId: "matrix", branches: [], updatedAt: null };
    }
  }

  async function writeState(state) {
    await mkdir(path.dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temp, JSON.stringify({ ...state, updatedAt: now() }, null, 2), { encoding: "utf8", mode: 0o600 });
    await rename(temp, file);
  }

  function normalizeBranch(input = {}, previous = null) {
    return {
      id: text(input.id) || previous?.id || randomUUID(),
      code: text(input.code).slice(0, 20),
      legalName: text(input.legalName),
      tradeName: text(input.tradeName),
      taxId: normalizeCnpj(input.taxId),
      stateRegistration: text(input.stateRegistration),
      municipalRegistration: text(input.municipalRegistration),
      taxRegime: text(input.taxRegime) || "simples_nacional",
      cnae: text(input.cnae),
      postalCode: digits(input.postalCode), street: text(input.street), number: text(input.number), complement: text(input.complement),
      district: text(input.district), city: text(input.city), cityCode: digits(input.cityCode), state: text(input.state).toUpperCase(),
      email: text(input.email).toLowerCase(), phone: text(input.phone), invoiceEmail: text(input.invoiceEmail).toLowerCase(),
      nfeSeries: digits(input.nfeSeries) || "1", nfeNextNumber: digits(input.nfeNextNumber), nfceSeries: digits(input.nfceSeries) || "1",
      status: input.status === "inactive" ? "inactive" : "active",
      notes: text(input.notes), createdAt: previous?.createdAt || now(), updatedAt: now(),
    };
  }

  function validateBranch(branch, state, matrix) {
    const errors = [];
    if (!branch.legalName) errors.push("Razão social da filial é obrigatória.");
    if (!validateCnpj(branch.taxId)) errors.push("Informe um CNPJ válido para a filial.");
    if (!/^[A-Z]{2}$/.test(branch.state)) errors.push("UF da filial deve conter 2 letras.");
    if (branch.cityCode && branch.cityCode.length !== 7) errors.push("Código IBGE da filial deve ter 7 dígitos.");
    if (Number(branch.nfeSeries) > 999) errors.push("Série NF-e da filial deve estar entre 0 e 999.");
    if (branch.nfeNextNumber && (Number(branch.nfeNextNumber) < 1 || Number(branch.nfeNextNumber) > 999999999)) errors.push("Próximo número NF-e da filial deve estar entre 1 e 999999999.");
    const matrixTaxId = normalizeCnpj(matrix?.taxId);
    if (matrixTaxId && branch.taxId === matrixTaxId) errors.push("A filial não pode usar o mesmo CNPJ da matriz.");
    if (state.branches.some((item) => item.id !== branch.id && normalizeCnpj(item.taxId) === branch.taxId)) errors.push("Já existe outra filial com este CNPJ.");
    if (branch.code && state.branches.some((item) => item.id !== branch.id && text(item.code).toUpperCase() === branch.code.toUpperCase())) errors.push("Já existe outra filial com este código interno.");
    return errors;
  }

  async function resolve(matrix = {}) {
    const state = await readState();
    if (!state.activeId || state.activeId === "matrix") return { ...matrix, establishmentId: "matrix", establishmentType: "matrix", matrixTaxId: matrix?.taxId || "" };
    const branch = state.branches.find((item) => item.id === state.activeId && item.status !== "inactive");
    if (!branch) return { ...matrix, establishmentId: "matrix", establishmentType: "matrix", matrixTaxId: matrix?.taxId || "" };
    return {
      ...matrix,
      ...branch,
      establishmentId: branch.id,
      establishmentType: "branch",
      matrixLegalName: matrix?.legalName || "",
      matrixTaxId: matrix?.taxId || "",
      branches: undefined,
    };
  }

  async function api(method, payload = {}, matrix = {}) {
    const state = await readState();
    if (method === "GET") return jsonResponse(200, { activeId: state.activeId || "matrix", branches: state.branches, activeEstablishment: await resolve(matrix), local: true });
    if (method !== "POST") return jsonResponse(405, { error: "Método não permitido." });
    const action = text(payload.action);
    if (action === "save_branch") {
      const previous = state.branches.find((item) => item.id === text(payload.branch?.id)) || null;
      const branch = normalizeBranch(payload.branch || {}, previous);
      const errors = validateBranch(branch, state, matrix);
      if (errors.length) return jsonResponse(422, { error: errors[0], errors });
      const index = state.branches.findIndex((item) => item.id === branch.id);
      if (index >= 0) state.branches[index] = branch; else state.branches.push(branch);
      await writeState(state);
      return jsonResponse(index >= 0 ? 200 : 201, { branch, activeId: state.activeId, branches: state.branches, local: true });
    }
    if (action === "delete_branch") {
      const id = text(payload.id);
      const existing = state.branches.find((item) => item.id === id);
      if (!existing) return jsonResponse(404, { error: "Filial não encontrada." });
      state.branches = state.branches.filter((item) => item.id !== id);
      if (state.activeId === id) state.activeId = "matrix";
      await writeState(state);
      return jsonResponse(200, { deleted: true, id, activeId: state.activeId, branches: state.branches, local: true });
    }
    if (action === "set_active") {
      const id = text(payload.id) || "matrix";
      if (id !== "matrix") {
        const branch = state.branches.find((item) => item.id === id);
        if (!branch) return jsonResponse(404, { error: "Filial não encontrada." });
        if (branch.status === "inactive") return jsonResponse(409, { error: "Ative a filial antes de selecioná-la como estabelecimento fiscal." });
      }
      state.activeId = id;
      await writeState(state);
      return jsonResponse(200, { activeId: id, activeEstablishment: await resolve(matrix), local: true });
    }
    return jsonResponse(400, { error: "Ação de estabelecimento não reconhecida." });
  }

  return { api, resolve, readState };
}
