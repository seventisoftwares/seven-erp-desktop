import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createNfeSequenceStore } from "../src/nfe-sequence-store.mjs";
import { RS_ENDPOINTS } from "../src/nfe-service.mjs";

test("NF-e reservations are atomic under concurrent requests", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "seven-nfe-seq-"));
  try {
    const store = createNfeSequenceStore({ dataDir: dir });
    const reservations = await Promise.all(Array.from({ length: 20 }, (_, index) => store.reserve({
      draftId: `draft-${index + 1}`,
      environment: "homologation",
      series: 1,
      startingNumber: 500,
    })));
    const numbers = reservations.map((item) => item.number);
    assert.equal(new Set(numbers).size, 20);
    assert.deepEqual([...numbers].sort((a, b) => a - b), Array.from({ length: 20 }, (_, index) => 500 + index));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("same draft keeps number, cNF and issue instant across retries", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "seven-nfe-retry-"));
  try {
    const store = createNfeSequenceStore({ dataDir: dir });
    const first = await store.reserve({ draftId: "same-draft", environment: "production", series: 2, startingNumber: 100 });
    const second = await store.reserve({ draftId: "same-draft", environment: "production", series: 2, startingNumber: 999 });
    assert.equal(second.number, first.number);
    assert.equal(second.numericCode, first.numericCode);
    assert.equal(second.issuedAt, first.issuedAt);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Rio Grande do Sul defaults expose separate HTTPS NF-e 4.00 endpoints", () => {
  for (const environment of ["homologation", "production"]) {
    const endpoints = RS_ENDPOINTS[environment];
    assert.equal(new URL(endpoints.authorizationServiceUrl).protocol, "https:");
    assert.equal(new URL(endpoints.returnAuthorizationServiceUrl).protocol, "https:");
    assert.equal(new URL(endpoints.consultationServiceUrl).protocol, "https:");
    assert.notEqual(endpoints.authorizationServiceUrl, endpoints.returnAuthorizationServiceUrl);
    assert.notEqual(endpoints.authorizationServiceUrl, endpoints.consultationServiceUrl);
    assert.match(endpoints.authorizationServiceUrl, /NfeAutorizacao4\.asmx/i);
    assert.match(endpoints.returnAuthorizationServiceUrl, /NfeRetAutorizacao4\.asmx/i);
    assert.match(endpoints.consultationServiceUrl, /NfeConsulta4\.asmx/i);
  }
});
