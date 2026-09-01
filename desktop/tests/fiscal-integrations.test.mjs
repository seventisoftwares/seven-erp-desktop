import test from "node:test";
import assert from "node:assert/strict";
import { DFE_DISTRIBUTION_URLS, NFSE_BASE_URLS, UF_CODES, buildDfeDistributionEnvelope, buildNfeStatusEnvelope, parseDistributedNfePackage } from "../src/fiscal-integrations.mjs";

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

test("DFe distribution envelope follows distNSU 1.01 and pads cursor", () => {
  const xml = buildDfeDistributionEnvelope({ environment: "production", uf: "RS", cnpj: "12.345.678/0001-90", lastNsu: "123" });
  assert.match(xml, /versao="1\.01"/);
  assert.match(xml, /<tpAmb>1<\/tpAmb>/);
  assert.match(xml, /<cUFAutor>43<\/cUFAutor>/);
  assert.match(xml, /<CNPJ>12345678000190<\/CNPJ>/);
  assert.match(xml, /<ultNSU>000000000000123<\/ultNSU>/);
});

test("DFe distribution envelope preserves alphanumeric CNPJ positions", () => {
  const xml = buildDfeDistributionEnvelope({ environment: "homologation", uf: "RS", cnpj: "12ABC34501DE35", lastNsu: "0" });
  assert.match(xml, /<CNPJ>12ABC34501DE35<\/CNPJ>/);
  assert.match(xml, /<tpAmb>2<\/tpAmb>/);
});

test("distributed NF-e metadata is extracted from real XML shape", () => {
  const accessKey = "43260912345678000190550010000001231000001234";
  const parsed = parseDistributedNfePackage({ nsu: "000000000000999", schema: "procNFe_v4.00.xsd", documentXml: `<nfeProc><NFe><infNFe Id="NFe${accessKey}"><ide><mod>55</mod><dhEmi>2026-09-01T10:00:00-03:00</dhEmi></ide><emit><CNPJ>12345678000190</CNPJ><xNome>EMPRESA TESTE</xNome></emit><total><ICMSTot><vNF>123.45</vNF></ICMSTot></total></infNFe></NFe></nfeProc>` });
  assert.equal(parsed.accessKey, accessKey);
  assert.equal(parsed.nsu, "000000000000999");
  assert.equal(parsed.issuerName, "EMPRESA TESTE");
  assert.equal(parsed.totalCents, 12345);
});

test("distributed parser preserves alphanumeric NF-e key and issuer CNPJ", () => {
  const accessKey = "43260912ABC34501DE35550010000001231000001234";
  const parsed = parseDistributedNfePackage({ nsu: "000000000001000", schema: "procNFe_v4.00.xsd", documentXml: `<nfeProc><NFe><infNFe Id="NFe${accessKey}"><ide><mod>55</mod><dhEmi>2026-09-01T10:00:00-03:00</dhEmi></ide><emit><CNPJ>12ABC34501DE35</CNPJ><xNome>EMITENTE ALFANUMERICO</xNome></emit><total><ICMSTot><vNF>10.00</vNF></ICMSTot></total></infNFe></NFe></nfeProc>` });
  assert.equal(parsed.accessKey, accessKey);
  assert.equal(parsed.issuerTaxId, "12ABC34501DE35");
  assert.equal(parsed.totalCents, 1000);
});

test("official fiscal bases are HTTPS and separated by environment", () => {
  assert.equal(new URL(NFSE_BASE_URLS.production).protocol, "https:");
  assert.equal(new URL(NFSE_BASE_URLS.homologation).protocol, "https:");
  assert.notEqual(NFSE_BASE_URLS.production, NFSE_BASE_URLS.homologation);
  assert.equal(new URL(DFE_DISTRIBUTION_URLS.production).protocol, "https:");
  assert.equal(new URL(DFE_DISTRIBUTION_URLS.homologation).protocol, "https:");
  assert.notEqual(DFE_DISTRIBUTION_URLS.production, DFE_DISTRIBUTION_URLS.homologation);
  assert.equal(UF_CODES.RS, "43");
});
