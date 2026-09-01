import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { buildAccessKey, buildNfeXml, calculateAccessKeyDv, formatNfeDateTime, validateCnpj, validateNfeDraft } from "../src/nfe-xml.mjs";
import { signNfeXml } from "../src/nfe-signature.mjs";
import { buildConsultProtocolXml, parseAuthorizationResponse } from "../src/nfe-authorizer.mjs";

const require = createRequire(import.meta.url);
const forge = require("node-forge");
const { SignedXml } = require("xml-crypto");
const xpath = require("xpath");
const { DOMParser } = require("@xmldom/xmldom");

const company = {
  legalName: "EMPRESA TESTE LTDA",
  tradeName: "EMPRESA TESTE",
  taxId: "12345678000195",
  stateRegistration: "1234567890",
  taxRegime: "simples_nacional",
  postalCode: "90000000",
  street: "Rua de Teste",
  number: "100",
  district: "Centro",
  city: "Porto Alegre",
  cityCode: "4314902",
  state: "RS",
  phone: "51999999999",
};

const baseDraft = {
  id: "draft-1",
  environment: "homologation",
  natureOperation: "Venda de mercadoria",
  purpose: "normal",
  finalConsumer: true,
  presenceIndicator: "in_person",
  freightMode: "no_freight",
  recipientName: "CLIENTE TESTE",
  recipientTaxId: "52998224725",
  recipientIeIndicator: "9",
  recipientStateRegistration: "",
  recipientStreet: "Rua Cliente",
  recipientNumber: "200",
  recipientDistrict: "Centro",
  recipientCity: "Porto Alegre",
  recipientCityCode: "4314902",
  recipientState: "RS",
  recipientPostalCode: "90000001",
  recipientPhone: "51988888888",
  recipientEmail: "cliente@example.com",
  paymentMethod: "01",
  freight: 10,
  discount: 5,
  other: 2,
  items: [
    { code: "P001", description: "Produto 1", ncm: "84713012", cfop: "5102", unit: "UN", quantity: 1, unitPrice: 100, gtin: "SEM GTIN", origin: "0", csosn: "102", pisCst: "04", cofinsCst: "04" },
    { code: "P002", description: "Produto 2", ncm: "84713012", cfop: "5102", unit: "UN", quantity: 2, unitPrice: 50, gtin: "SEM GTIN", origin: "0", csosn: "102", pisCst: "04", cofinsCst: "04" },
  ],
};

test("CNPJ validator accepts classic and alphanumeric formats with valid DVs", () => {
  assert.equal(validateCnpj("12.345.678/0001-95"), true);
  assert.equal(validateCnpj("12ABC34501DE35"), true);
  assert.equal(validateCnpj("12ABC34501DE00"), false);
  assert.equal(validateCnpj("00.000.000/0000-00"), false);
});

test("access key is 44 positions and DV matches its 43-position base", () => {
  const result = buildAccessKey({ uf: "RS", issuedAt: new Date(2026, 8, 1, 10, 20, 30), cnpj: company.taxId, series: 1, number: 123, numericCode: "12345678" });
  assert.equal(result.accessKey.length, 44);
  assert.match(result.accessKey, /^[A-Z0-9]{44}$/);
  assert.equal(Number(result.accessKey.at(-1)), calculateAccessKeyDv(result.accessKey.slice(0, -1)));
});

test("NF-e datetime preserves an explicit timezone offset instead of relabeling UTC", () => {
  const value = formatNfeDateTime(new Date("2026-09-01T10:00:00-03:00"));
  assert.match(value, /^2026-09-01T\d{2}:00:00[+-]\d{2}:\d{2}$/);
  assert.equal(new Date(value).toISOString(), "2026-09-01T13:00:00.000Z");
});

test("NF-e XML allocates freight/discount/other at item level and keeps totals consistent", () => {
  const result = buildNfeXml({ draft: baseDraft, company, number: 123, series: 1, numericCode: "12345678", issuedAt: new Date(2026, 8, 1, 10, 20, 30), appVersion: "1.0.0-test" });
  assert.match(result.xml, /<infNFe Id="NFe[A-Z0-9]{44}" versao="4\.00">/);
  assert.match(result.xml, /<vFrete>5\.00<\/vFrete>/);
  assert.match(result.xml, /<vDesc>2\.50<\/vDesc>/);
  assert.match(result.xml, /<vOutro>1\.00<\/vOutro>/);
  assert.match(result.xml, /<vNF>207\.00<\/vNF>/);
  assert.equal(result.totals.productCents, 20000);
  assert.equal(result.totals.traditionalTotalCents, 20700);
});

test("2026 normal-regime XML carries IBS/CBS totals without adding them to legacy vNF", () => {
  const normalCompany = { ...company, taxRegime: "lucro_presumido" };
  const draft = {
    ...baseDraft,
    freight: 0, discount: 0, other: 0,
    items: [{
      code: "P100", description: "Produto tributado", ncm: "84713012", cfop: "5102", unit: "UN", quantity: 1, unitPrice: 100,
      gtin: "SEM GTIN", origin: "0", cst: "00", icmsBase: 100, icmsRate: 18,
      pisCst: "01", pisBase: 100, pisRate: 0,
      cofinsCst: "01", cofinsBase: 100, cofinsRate: 0,
      ibsCbsCst: "000", cClassTrib: "000001", ibsCbsBase: 100, ibsUfRate: 0.1, ibsMunRate: 0, cbsRate: 0.9,
    }],
  };
  const result = buildNfeXml({ draft, company: normalCompany, number: 1, series: 1, numericCode: "87654321", issuedAt: new Date(2026, 8, 1, 10, 0, 0) });
  assert.match(result.xml, /<IBSCBS>/);
  assert.match(result.xml, /<IBSCBSTot>/);
  assert.match(result.xml, /<vIBS>0\.10<\/vIBS>/);
  assert.match(result.xml, /<vCBS>0\.90<\/vCBS>/);
  assert.match(result.xml, /<vItem>100\.00<\/vItem>/);
  assert.match(result.xml, /<vNF>100\.00<\/vNF>/);
  assert.doesNotMatch(result.xml, /<vNFTot>/);
});

test("draft validation fails closed when recipient IE indicator or fiscal data is missing", () => {
  const invalid = { ...baseDraft, recipientIeIndicator: "", paymentMethod: "" };
  const blockers = validateNfeDraft({ draft: invalid, company });
  assert.ok(blockers.some((item) => item.includes("indicador de Inscrição Estadual")));
  assert.ok(blockers.some((item) => item.includes("meio de pagamento")));
});

function makePfx(passphrase) {
  const keys = forge.pki.rsa.generateKeyPair({ bits: 1024, e: 0x10001 });
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(Date.now() - 86400000);
  cert.validity.notAfter = new Date(Date.now() + 86400000 * 365);
  const attrs = [{ name: "commonName", value: "Seven ERP Test Certificate" }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], passphrase, { algorithm: "3des" });
  const pfx = Buffer.from(forge.asn1.toDer(p12).getBytes(), "binary");
  return { pfx, certificatePem: forge.pki.certificateToPem(cert) };
}

test("XMLDSig signs infNFe with the PFX private key and the signature verifies", () => {
  const passphrase = "seven-test";
  const { pfx, certificatePem } = makePfx(passphrase);
  const unsigned = buildNfeXml({ draft: { ...baseDraft, freight: 0, discount: 0, other: 0 }, company, number: 7, series: 1, numericCode: "12345670", issuedAt: new Date(2026, 8, 1, 10, 0, 0) });
  const signed = signNfeXml({ xml: unsigned.xml, pfx, passphrase });
  assert.match(signed.signedXml, /<Signature[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/09\/xmldsig#"/);
  assert.match(signed.signedXml, /<Reference URI="#NFe[A-Z0-9]{44}">/);
  assert.match(signed.signedXml, /<X509Certificate>[^<]+<\/X509Certificate>/);

  const document = new DOMParser().parseFromString(signed.signedXml);
  const signatureNode = xpath.select("//*[local-name(.)='Signature']", document)[0];
  assert.ok(signatureNode, "Signature element should exist in the signed XML");
  const verifier = new SignedXml({ publicCert: certificatePem });
  verifier.loadSignature(signatureNode);
  assert.equal(verifier.checkSignature(signed.signedXml), true);
});

test("authorization response only becomes authorized with cStat 100 and protocol", () => {
  const key = buildAccessKey({ uf: "RS", issuedAt: new Date(2026, 8, 1), cnpj: company.taxId, series: 1, number: 9, numericCode: "99999999" }).accessKey;
  const parsed = parseAuthorizationResponse(`<retEnviNFe><cStat>104</cStat><xMotivo>Lote processado</xMotivo><protNFe><infProt><tpAmb>2</tpAmb><verAplic>TESTE</verAplic><chNFe>${key}</chNFe><dhRecbto>2026-09-01T10:00:00-03:00</dhRecbto><nProt>143260000000001</nProt><digVal>abc</digVal><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe></retEnviNFe>`);
  assert.equal(parsed.authorized, true);
  assert.equal(parsed.protocol, "143260000000001");
  assert.equal(parsed.accessKey, key);
  assert.match(buildConsultProtocolXml({ accessKey: key, environment: "homologation" }), /<tpAmb>2<\/tpAmb>/);
});