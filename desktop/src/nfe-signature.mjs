import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const forge = require("node-forge");
const { SignedXml } = require("xml-crypto");

const XMLDSIG = Object.freeze({
  c14n: "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
  enveloped: "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
  digestSha1: "http://www.w3.org/2000/09/xmldsig#sha1",
  rsaSha1: "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
});

function bagArray(p12, oid) {
  const result = p12.getBags({ bagType: oid });
  return Array.isArray(result?.[oid]) ? result[oid] : [];
}

function sameRsaKey(privateKey, certificate) {
  try {
    return Boolean(privateKey?.n && certificate?.publicKey?.n && privateKey.n.compareTo(certificate.publicKey.n) === 0);
  } catch { return false; }
}

export function extractSigningMaterialFromPfx({ pfx, passphrase = "" }) {
  if (!Buffer.isBuffer(pfx) || !pfx.length) throw new Error("PFX/P12 vazio.");
  let p12;
  try {
    const der = forge.util.createBuffer(pfx.toString("binary"), "binary");
    const asn1 = forge.asn1.fromDer(der);
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, String(passphrase || ""));
  } catch (error) {
    throw new Error(`Não foi possível abrir o PKCS#12 para assinatura: ${error instanceof Error ? error.message : "senha ou arquivo inválido"}.`);
  }

  const keyBags = [
    ...bagArray(p12, forge.pki.oids.pkcs8ShroudedKeyBag),
    ...bagArray(p12, forge.pki.oids.keyBag),
  ].filter((bag) => bag?.key);
  if (!keyBags.length) throw new Error("O certificado A1 não contém uma chave privada utilizável.");
  const privateKey = keyBags[0].key;

  const certBags = bagArray(p12, forge.pki.oids.certBag).filter((bag) => bag?.cert);
  if (!certBags.length) throw new Error("O PKCS#12 não contém certificado X.509.");
  const matching = certBags.find((bag) => sameRsaKey(privateKey, bag.cert)) || certBags[0];
  const certificate = matching.cert;

  const privateKeyPem = forge.pki.privateKeyToPem(privateKey);
  const certificatePem = forge.pki.certificateToPem(certificate);
  const certificateBase64 = certificatePem
    .replace(/-----BEGIN CERTIFICATE-----/g, "")
    .replace(/-----END CERTIFICATE-----/g, "")
    .replace(/\s+/g, "");
  if (!certificateBase64) throw new Error("Não foi possível serializar o certificado X.509 do A1.");

  return {
    privateKeyPem,
    certificatePem,
    certificateBase64,
    serialNumber: certificate.serialNumber || null,
    subject: certificate.subject?.attributes?.map((attribute) => `${attribute.shortName || attribute.name}=${attribute.value}`).join(", ") || null,
  };
}

export function signNfeXml({ xml, pfx, passphrase = "" }) {
  const source = String(xml || "").trim();
  if (!/<infNFe\b[^>]*\bId=["']NFe[A-Z0-9]{44}["']/i.test(source)) throw new Error("XML NF-e sem infNFe/Id válido para assinatura.");
  if (/<(?:\w+:)?Signature\b/i.test(source)) throw new Error("O XML informado já contém assinatura digital.");

  const material = extractSigningMaterialFromPfx({ pfx, passphrase });
  const signer = new SignedXml({
    privateKey: material.privateKeyPem,
    publicCert: material.certificatePem,
    idAttribute: "Id",
    canonicalizationAlgorithm: XMLDSIG.c14n,
    signatureAlgorithm: XMLDSIG.rsaSha1,
    getKeyInfoContent: () => `<X509Data><X509Certificate>${material.certificateBase64}</X509Certificate></X509Data>`,
  });
  signer.addReference({
    xpath: "//*[local-name(.)='infNFe']",
    transforms: [XMLDSIG.enveloped, XMLDSIG.c14n],
    digestAlgorithm: XMLDSIG.digestSha1,
  });
  signer.computeSignature(source, {
    location: { reference: "//*[local-name(.)='infNFe']", action: "after" },
  });
  const signedXml = signer.getSignedXml();
  if (!/<Signature\b[^>]*xmlns=["']http:\/\/www\.w3\.org\/2000\/09\/xmldsig#["']/i.test(signedXml)) throw new Error("A biblioteca de assinatura não produziu o elemento Signature esperado.");
  if (!/<X509Certificate>[^<]+<\/X509Certificate>/i.test(signedXml)) throw new Error("A assinatura não contém o certificado X.509 exigido.");
  return { signedXml, certificate: { serialNumber: material.serialNumber, subject: material.subject } };
}

export { XMLDSIG };
