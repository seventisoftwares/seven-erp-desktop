import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  buildCancellationEventXml,
  buildInutilizacaoXml,
  parseCancellationResponse,
  parseInutilizacaoResponse,
} from "../src/nfe-events.mjs";
import { signNfeEventXml, signNfeInutilizacaoXml } from "../src/nfe-signature.mjs";

const require = createRequire(import.meta.url);
const forge = require("node-forge");
const { SignedXml } = require("xml-crypto");
const xpath = require("xpath");
const { DOMParser } = require("@xmldom/xmldom");

const COMPANY_CNPJ = "12345678000195";
const ACCESS_KEY = "43260912345678000195550010000001231000001234";
const PROTOCOL = "143260000000001";

function makePfx(passphrase) {
  const keys = forge.pki.rsa.generateKeyPair({ bits: 1024, e: 0x10001 });
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "02";
  cert.validity.notBefore = new Date(Date.now() - 86400000);
  cert.validity.notAfter = new Date(Date.now() + 86400000 * 365);
  const attrs = [{ name: "commonName", value: "Seven ERP Fiscal Event Test" }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], passphrase, { algorithm: "3des" });
  return {
    pfx: Buffer.from(forge.asn1.toDer(p12).getBytes(), "binary"),
    certificatePem: forge.pki.certificateToPem(cert),
  };
}

function verifySignedXml(signedXml, certificatePem, elementName) {
  const document = new DOMParser().parseFromString(signedXml);
  const signatureNode = xpath.select("//*[local-name(.)='Signature']", document)[0];
  assert.ok(signatureNode, "Signature element should exist");
  const verifier = new SignedXml({ publicCert: certificatePem });
  verifier.loadSignature(signatureNode);
  assert.equal(verifier.checkSignature(signedXml), true);
  const target = xpath.select(`//*[local-name(.)='${elementName}']`, document)[0];
  assert.ok(target, `${elementName} should exist`);
}

test("cancellation event uses official type 110111, sequence and 15-char justification", () => {
  const built = buildCancellationEventXml({
    accessKey: ACCESS_KEY,
    protocol: PROTOCOL,
    companyTaxId: COMPANY_CNPJ,
    environment: "homologation",
    justification: "Cancelamento solicitado por erro operacional confirmado.",
    occurredAt: new Date("2026-09-01T13:30:00-03:00"),
  });
  assert.equal(built.eventId, `ID110111${ACCESS_KEY}01`);
  assert.match(built.xml, /<tpEvento>110111<\/tpEvento>/);
  assert.match(built.xml, /<nSeqEvento>1<\/nSeqEvento>/);
  assert.match(built.xml, new RegExp(`<nProt>${PROTOCOL}<\\/nProt>`));
  assert.match(built.xml, /<descEvento>Cancelamento<\/descEvento>/);
  assert.match(built.xml, /<tpAmb>2<\/tpAmb>/);
});

test("cancellation event rejects short justification and invalid protocol", () => {
  assert.throws(() => buildCancellationEventXml({ accessKey: ACCESS_KEY, protocol: PROTOCOL, companyTaxId: COMPANY_CNPJ, justification: "muito curta" }), /15 e 255/);
  assert.throws(() => buildCancellationEventXml({ accessKey: ACCESS_KEY, protocol: "123", companyTaxId: COMPANY_CNPJ, justification: "Justificativa válida para teste fiscal." }), /Protocolo de autorização inválido/);
});

test("cancellation infEvento is signed with XMLDSig and verifies", () => {
  const passphrase = "event-test";
  const { pfx, certificatePem } = makePfx(passphrase);
  const built = buildCancellationEventXml({ accessKey: ACCESS_KEY, protocol: PROTOCOL, companyTaxId: COMPANY_CNPJ, justification: "Cancelamento solicitado após conferência do documento fiscal." });
  const signed = signNfeEventXml({ xml: built.xml, pfx, passphrase });
  assert.match(signed.signedXml, new RegExp(`<Reference URI="#${built.eventId}">`));
  verifySignedXml(signed.signedXml, certificatePem, "infEvento");
});

test("cancellation response only accepts linked or late-linked cancellation statuses", () => {
  const accepted = parseCancellationResponse(`<retEnvEvento><cStat>128</cStat><xMotivo>Lote de Evento Processado</xMotivo><retEvento versao="1.00"><infEvento><tpAmb>2</tpAmb><cStat>135</cStat><xMotivo>Evento registrado e vinculado a NF-e</xMotivo><chNFe>${ACCESS_KEY}</chNFe><tpEvento>110111</tpEvento><dhRegEvento>2026-09-01T13:31:00-03:00</dhRegEvento><nProt>143260000000099</nProt></infEvento></retEvento></retEnvEvento>`);
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.late, false);
  assert.equal(accepted.eventCStat, "135");
  const late = parseCancellationResponse(`<retEnvEvento><cStat>128</cStat><retEvento><infEvento><cStat>155</cStat><xMotivo>Cancelamento homologado fora de prazo</xMotivo><chNFe>${ACCESS_KEY}</chNFe><nProt>143260000000100</nProt></infEvento></retEvento></retEnvEvento>`);
  assert.equal(late.accepted, true);
  assert.equal(late.late, true);
  const unlinked = parseCancellationResponse(`<retEnvEvento><cStat>128</cStat><retEvento><infEvento><cStat>136</cStat><xMotivo>Evento registrado mas não vinculado</xMotivo><chNFe>${ACCESS_KEY}</chNFe><nProt>143260000000101</nProt></infEvento></retEvento></retEnvEvento>`);
  assert.equal(unlinked.accepted, false);
});

test("inutilization XML 4.00 builds the official numeric Id and limits range", () => {
  const built = buildInutilizacaoXml({
    ufCode: "43",
    year: 2026,
    companyTaxId: COMPANY_CNPJ,
    series: 1,
    startNumber: 101,
    endNumber: 109,
    environment: "homologation",
    justification: "Quebra de sequência causada por falha técnica no emissor.",
  });
  assert.match(built.id, /^ID\d{41}$/);
  assert.equal(built.id, "ID43261234567800019555001000000101000000109");
  assert.match(built.xml, /<inutNFe[^>]+versao="4\.00">/);
  assert.match(built.xml, /<xServ>INUTILIZAR<\/xServ>/);
  assert.match(built.xml, /<nNFIni>101<\/nNFIni><nNFFin>109<\/nNFFin>/);
  assert.throws(() => buildInutilizacaoXml({ ufCode: "43", year: 2026, companyTaxId: COMPANY_CNPJ, series: 1, startNumber: 1, endNumber: 10001, justification: "Faixa muito grande para pedido de inutilização fiscal." }), /10\.000/);
});

test("inutilization infInut is signed and verifies", () => {
  const passphrase = "inut-test";
  const { pfx, certificatePem } = makePfx(passphrase);
  const built = buildInutilizacaoXml({ ufCode: "43", year: 2026, companyTaxId: COMPANY_CNPJ, series: 1, startNumber: 201, endNumber: 205, justification: "Números não utilizados por interrupção técnica comprovada." });
  const signed = signNfeInutilizacaoXml({ xml: built.xml, pfx, passphrase });
  assert.match(signed.signedXml, new RegExp(`<Reference URI="#${built.id}">`));
  verifySignedXml(signed.signedXml, certificatePem, "infInut");
});

test("inutilization succeeds only with cStat 102 and protocol", () => {
  const parsed = parseInutilizacaoResponse(`<retInutNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><infInut><tpAmb>2</tpAmb><verAplic>RS_TEST</verAplic><cStat>102</cStat><xMotivo>Inutilizacao de numero homologado</xMotivo><cUF>43</cUF><ano>26</ano><CNPJ>${COMPANY_CNPJ}</CNPJ><mod>55</mod><serie>1</serie><nNFIni>101</nNFIni><nNFFin>109</nNFFin><dhRecbto>2026-09-01T13:40:00-03:00</dhRecbto><nProt>143260000000200</nProt></infInut></retInutNFe>`);
  assert.equal(parsed.accepted, true);
  assert.equal(parsed.cStat, "102");
  assert.equal(parsed.protocol, "143260000000200");
});
