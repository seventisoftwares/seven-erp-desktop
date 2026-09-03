import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createNfeSequenceStore } from "../src/nfe-sequence-store.mjs";
import { RS_ENDPOINTS } from "../src/nfe-service.mjs";

async function tempStore(prefix, fn) { const dir = await mkdtemp(path.join(os.tmpdir(), prefix)); try { await fn(createNfeSequenceStore({ dataDir: dir })); } finally { await rm(dir, { recursive: true, force: true }); } }

test("NF-e reservations are atomic under concurrent requests", async () => tempStore("seven-nfe-seq-", async (store) => {
  const reservations = await Promise.all(Array.from({ length: 20 }, (_, index) => store.reserve({ draftId: `draft-${index + 1}`, environment: "homologation", series: 1, startingNumber: 500, issuerTaxId: "12345678000195" })));
  const numbers = reservations.map((item) => item.number); assert.equal(new Set(numbers).size, 20); assert.deepEqual([...numbers].sort((a, b) => a - b), Array.from({ length: 20 }, (_, index) => 500 + index));
}));

test("same draft keeps number, cNF and issue instant across retries", async () => tempStore("seven-nfe-retry-", async (store) => {
  const first = await store.reserve({ draftId: "same-draft", environment: "production", series: 2, startingNumber: 100, issuerTaxId: "12345678000195" });
  const second = await store.reserve({ draftId: "same-draft", environment: "production", series: 2, startingNumber: 999, issuerTaxId: "12345678000195" });
  assert.equal(second.number, first.number); assert.equal(second.numericCode, first.numericCode); assert.equal(second.issuedAt, first.issuedAt);
}));

test("matriz e filial possuem sequências NF-e independentes mesmo usando a mesma série", async () => tempStore("seven-nfe-branches-", async (store) => {
  const matrix1 = await store.reserve({ draftId: "m1", issuerTaxId: "12345678000195", environment: "production", series: 1, startingNumber: 100 });
  const matrix2 = await store.reserve({ draftId: "m2", issuerTaxId: "12345678000195", environment: "production", series: 1, startingNumber: 100 });
  const branch1 = await store.reserve({ draftId: "f1", issuerTaxId: "11222333000181", environment: "production", series: 1, startingNumber: 20 });
  const branch2 = await store.reserve({ draftId: "f2", issuerTaxId: "11222333000181", environment: "production", series: 1, startingNumber: 20 });
  assert.deepEqual([matrix1.number, matrix2.number], [100, 101]); assert.deepEqual([branch1.number, branch2.number], [20, 21]);
  const state = await store.status(); assert.equal(state.sequences["12345678000195:production:1"].nextNumber, 102); assert.equal(state.sequences["11222333000181:production:1"].nextNumber, 22);
}));

test("Rio Grande do Sul defaults expose separate HTTPS NF-e 4.00 endpoints", () => {
  for (const environment of ["homologation", "production"]) { const endpoints = RS_ENDPOINTS[environment]; assert.equal(new URL(endpoints.authorizationServiceUrl).protocol, "https:"); assert.equal(new URL(endpoints.returnAuthorizationServiceUrl).protocol, "https:"); assert.equal(new URL(endpoints.consultationServiceUrl).protocol, "https:"); assert.notEqual(endpoints.authorizationServiceUrl, endpoints.returnAuthorizationServiceUrl); assert.notEqual(endpoints.authorizationServiceUrl, endpoints.consultationServiceUrl); assert.match(endpoints.authorizationServiceUrl, /NfeAutorizacao4\.asmx/i); assert.match(endpoints.returnAuthorizationServiceUrl, /NfeRetAutorizacao4\.asmx/i); assert.match(endpoints.consultationServiceUrl, /NfeConsulta4\.asmx/i); }
});
