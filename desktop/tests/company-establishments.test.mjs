import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createCompanyEstablishmentStore } from "../src/company-establishment-store.mjs";

const MATRIX = {
  legalName: "SEVEN MATRIZ TESTE LTDA", tradeName: "SEVEN MATRIZ", taxId: "12345678000195",
  stateRegistration: "1234567890", municipalRegistration: "12345", taxRegime: "simples_nacional",
  postalCode: "95700000", street: "Rua Matriz", number: "100", district: "Centro", city: "Bento Gonçalves",
  cityCode: "4302105", state: "RS", email: "matriz@example.com", phone: "5430000000", nfeSeries: "1", nfeNextNumber: "100", nfceSeries: "1",
};
const BRANCH = {
  code: "FILIAL-01", legalName: "SEVEN FILIAL TESTE LTDA", tradeName: "SEVEN FILIAL", taxId: "11222333000181",
  stateRegistration: "9876543210", municipalRegistration: "54321", taxRegime: "simples_nacional",
  postalCode: "90000000", street: "Rua Filial", number: "200", district: "Centro", city: "Porto Alegre",
  cityCode: "4314902", state: "RS", email: "filial@example.com", phone: "5130000000", nfeSeries: "2", nfeNextNumber: "50", nfceSeries: "2", status: "active",
};
const parse = (result) => JSON.parse(result.body || "{}");

async function withStore(fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "seven-establishments-"));
  try { await fn(createCompanyEstablishmentStore({ dataDir: dir })); }
  finally { await rm(dir, { recursive: true, force: true }); }
}

test("empresa e filiais preserva matriz e alterna estabelecimento ativo", async () => withStore(async (store) => {
  let result = await store.api("POST", { action: "capture_matrix", matrix: MATRIX }, MATRIX);
  assert.equal(result.status, 200);
  assert.equal(parse(result).matrixSnapshot.taxId, MATRIX.taxId);

  result = await store.api("POST", { action: "save_branch", branch: BRANCH }, MATRIX);
  assert.equal(result.status, 201);
  const saved = parse(result).branch;
  assert.ok(saved.id);
  assert.equal(saved.nfeSeries, "2");

  result = await store.api("POST", { action: "set_active", id: saved.id }, MATRIX);
  assert.equal(result.status, 200);
  assert.equal(parse(result).activeEstablishment.taxId, BRANCH.taxId);
  assert.equal(parse(result).activeEstablishment.establishmentType, "branch");

  const resolvedBranch = await store.resolve(MATRIX);
  assert.equal(resolvedBranch.tradeName, BRANCH.tradeName);
  assert.equal(resolvedBranch.matrixTaxId, MATRIX.taxId);

  result = await store.api("POST", { action: "delete_branch", id: saved.id }, MATRIX);
  assert.equal(result.status, 409);

  result = await store.api("POST", { action: "set_active", id: "matrix" }, MATRIX);
  assert.equal(result.status, 200);
  assert.equal(parse(result).activeEstablishment.taxId, MATRIX.taxId);
  assert.equal(parse(result).activeEstablishment.establishmentType, "matrix");

  result = await store.api("POST", { action: "delete_branch", id: saved.id }, MATRIX);
  assert.equal(result.status, 200);
  assert.equal(parse(result).branches.length, 0);
}));

test("empresa e filiais bloqueia CNPJ repetido e código de filial repetido", async () => withStore(async (store) => {
  await store.api("POST", { action: "capture_matrix", matrix: MATRIX }, MATRIX);
  let result = await store.api("POST", { action: "save_branch", branch: BRANCH }, MATRIX);
  assert.equal(result.status, 201);

  result = await store.api("POST", { action: "save_branch", branch: { ...BRANCH, id: "", code: "FILIAL-02" } }, MATRIX);
  assert.equal(result.status, 422);
  assert.match(parse(result).error, /CNPJ/i);

  result = await store.api("POST", { action: "save_branch", branch: { ...BRANCH, id: "", taxId: "19131243000197", code: "FILIAL-01" } }, MATRIX);
  assert.equal(result.status, 422);
  assert.match(parse(result).error, /código/i);

  result = await store.api("POST", { action: "save_branch", branch: { ...BRANCH, id: "", taxId: MATRIX.taxId, code: "FILIAL-MATRIZ" } }, MATRIX);
  assert.equal(result.status, 422);
  assert.match(parse(result).error, /matriz/i);
}));
