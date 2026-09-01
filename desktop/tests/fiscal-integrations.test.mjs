import test from "node:test";
import assert from "node:assert/strict";
import { NFSE_BASE_URLS, UF_CODES, buildNfeStatusEnvelope } from "../src/fiscal-integrations.mjs";

test("NF-e status envelope uses production environment and UF code", () => {
  const xml = buildNfeStatusEnvelope({ environment: "production", uf: "RS" });
  assert.match(xml, /<tpAmb>1<\/tpAmb>/);
  assert.match(xml, /<cUF>43<\/cUF>/);
  assert.match(xml, /<xServ>STATUS<\/xServ>/);
  assert.match(xml, /versao="4\.00"/);
});

test("NF-e status envelope uses homologation environment", () => {
  const xml = buildNfeStatusEnvelope({ environment: "homologation", uf: "SP" });
  assert.match(xml, /<tpAmb>2<\/tpAmb>/);
  assert.match(xml, /<cUF>35<\/cUF>/);
});

test("NF-e status envelope rejects unknown UF", () => {
  assert.throws(() => buildNfeStatusEnvelope({ environment: "homologation", uf: "XX" }), /UF inválida/);
});

test("official NFS-e bases are HTTPS and separated by environment", () => {
  assert.equal(new URL(NFSE_BASE_URLS.production).protocol, "https:");
  assert.equal(new URL(NFSE_BASE_URLS.homologation).protocol, "https:");
  assert.notEqual(NFSE_BASE_URLS.production, NFSE_BASE_URLS.homologation);
  assert.equal(UF_CODES.RS, "43");
});
