import { setTimeout as delay } from "node:timers/promises";
import { requestMtls } from "./fiscal-http.mjs";

const clean = (value) => String(value ?? "").trim();
const alphaNum = (value) => clean(value).toUpperCase().replace(/[^A-Z0-9]/g, "");

function requireHttps(value, label) {
  const raw = clean(value);
  if (!raw) throw new Error(`${label} não foi informado.`);
  let parsed;
  try { parsed = new URL(raw); } catch { throw new Error(`${label} é inválido.`); }
  if (parsed.protocol !== "https:") throw new Error(`${label} deve utilizar HTTPS.`);
  return parsed.toString().replace(/\/$/, "");
}

function extractTag(source, tag) {
  const match = String(source || "").match(new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`, "i"));
  return match ? match[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "";
}

function extractElement(source, tag) {
  const match = String(source || "").match(new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>[\\s\\S]*?<\\/(?:\\w+:)?${tag}>`, "i"));
  return match ? match[0].replace(/<(\/?)\w+:/g, "<$1") : "";
}

function stripDeclaration(value) {
  return String(value || "").replace(/^\s*<\?xml[^>]*\?>\s*/i, "").trim();
}

function soapEnvelope({ service, operation, payload }) {
  const namespace = `http://www.portalfiscal.inf.br/nfe/wsdl/${service}`;
  return `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">` +
    `<soap12:Body><${operation} xmlns="${namespace}"><nfeDadosMsg>${stripDeclaration(payload)}</nfeDadosMsg></${operation}></soap12:Body></soap12:Envelope>`;
}

async function postSoap({ url, service, operation, payload, pfx, passphrase }) {
  const endpoint = requireHttps(url, `Endpoint ${service}`);
  const action = `http://www.portalfiscal.inf.br/nfe/wsdl/${service}/${operation}`;
  const response = await requestMtls({
    url: endpoint,
    method: "POST",
    pfx,
    passphrase,
    headers: {
      accept: "application/soap+xml, application/xml, text/xml",
      "content-type": `application/soap+xml; charset=utf-8; action="${action}"`,
      soapaction: action,
      "user-agent": "Seven-AutoERP/production",
    },
    body: soapEnvelope({ service, operation, payload }),
  });
  return { ...response, endpoint };
}

export function parseAuthorizationResponse(rawBody) {
  const body = String(rawBody || "");
  const outerCStat = extractTag(body, "cStat");
  const outerReason = extractTag(body, "xMotivo");
  const receipt = extractTag(body, "nRec");
  const protocolXml = extractElement(body, "protNFe");
  const protocolStatus = protocolXml ? extractTag(protocolXml, "cStat") : "";
  const protocolReason = protocolXml ? extractTag(protocolXml, "xMotivo") : "";
  const protocol = protocolXml ? extractTag(protocolXml, "nProt") : "";
  const accessKey = protocolXml ? alphaNum(extractTag(protocolXml, "chNFe")) : "";
  const receivedAt = protocolXml ? extractTag(protocolXml, "dhRecbto") : "";
  return {
    cStat: outerCStat,
    xMotivo: outerReason,
    receipt,
    protocolXml,
    protocolStatus,
    protocolReason,
    protocol,
    accessKey,
    receivedAt,
    authorized: protocolStatus === "100" && Boolean(protocol) && /^[A-Z0-9]{44}$/.test(accessKey),
  };
}

function authorizationResult({ parsed, response, signedXml, stage }) {
  if (parsed.authorized) {
    const nfeProc = `<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">${stripDeclaration(signedXml)}${parsed.protocolXml}</nfeProc>`;
    return {
      ok: true,
      status: "authorized",
      cStat: parsed.protocolStatus,
      xMotivo: parsed.protocolReason,
      protocol: parsed.protocol,
      accessKey: parsed.accessKey,
      receivedAt: parsed.receivedAt,
      receipt: parsed.receipt || null,
      nfeProc,
      rawResponse: response.rawBody,
      httpStatus: response.status,
      endpoint: response.endpoint,
      stage,
      externalRequestPerformed: true,
      checkedAt: new Date().toISOString(),
    };
  }
  return {
    ok: false,
    status: parsed.protocolStatus ? "rejected" : "processing",
    cStat: parsed.protocolStatus || parsed.cStat || null,
    xMotivo: parsed.protocolReason || parsed.xMotivo || "Resposta da SEFAZ sem protocolo de autorização.",
    protocol: parsed.protocol || null,
    accessKey: parsed.accessKey || null,
    receipt: parsed.receipt || null,
    rawResponse: response.rawBody,
    httpStatus: response.status,
    endpoint: response.endpoint,
    stage,
    externalRequestPerformed: true,
    checkedAt: new Date().toISOString(),
  };
}

export async function consultAuthorizationReceipt({ receipt, environment, returnAuthorizationUrl, pfx, passphrase }) {
  const tpAmb = environment === "production" ? "1" : "2";
  const nRec = String(receipt || "").replace(/\D/g, "");
  if (!nRec) throw new Error("Número do recibo da SEFAZ não foi informado.");
  const payload = `<consReciNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><tpAmb>${tpAmb}</tpAmb><nRec>${nRec}</nRec></consReciNFe>`;
  const response = await postSoap({ url: returnAuthorizationUrl, service: "NFeRetAutorizacao4", operation: "nfeRetAutorizacaoLote", payload, pfx, passphrase });
  return { response, parsed: parseAuthorizationResponse(response.rawBody) };
}

export async function authorizeNfe({ signedXml, batchId, environment = "homologation", authorizationUrl, returnAuthorizationUrl, pfx, passphrase, maxReceiptChecks = 4 }) {
  const lote = String(batchId || "").replace(/\D/g, "").slice(-15).padStart(15, "0");
  if (!lote || /^0+$/.test(lote)) throw new Error("Identificador de lote NF-e inválido.");
  const payload = `<enviNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><idLote>${lote}</idLote><indSinc>1</indSinc>${stripDeclaration(signedXml)}</enviNFe>`;
  const response = await postSoap({ url: authorizationUrl, service: "NFeAutorizacao4", operation: "nfeAutorizacaoLote", payload, pfx, passphrase });
  let parsed = parseAuthorizationResponse(response.rawBody);
  let result = authorizationResult({ parsed, response, signedXml, stage: "authorization" });
  if (result.ok || result.status === "rejected") return result;

  const receipt = parsed.receipt;
  if (!receipt) return { ...result, status: "external_response_invalid", xMotivo: parsed.xMotivo || "SEFAZ não retornou protocolo nem recibo para consulta." };

  for (let attempt = 1; attempt <= Math.max(1, Number(maxReceiptChecks) || 1); attempt += 1) {
    await delay(attempt === 1 ? 350 : 900);
    const checked = await consultAuthorizationReceipt({ receipt, environment, returnAuthorizationUrl, pfx, passphrase });
    parsed = checked.parsed;
    result = authorizationResult({ parsed, response: checked.response, signedXml, stage: "receipt" });
    if (result.ok || result.status === "rejected") return result;
    if (!["105", "106"].includes(parsed.cStat) && !parsed.receipt) break;
  }
  return { ...result, status: "processing", receipt, xMotivo: result.xMotivo || "Lote permanece em processamento; consulte o recibo novamente." };
}

export function buildConsultProtocolXml({ accessKey, environment = "homologation" }) {
  const key = alphaNum(accessKey);
  if (!/^[A-Z0-9]{44}$/.test(key)) throw new Error("Chave de acesso inválida para consulta de protocolo.");
  return `<consSitNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><tpAmb>${environment === "production" ? "1" : "2"}</tpAmb><xServ>CONSULTAR</xServ><chNFe>${key}</chNFe></consSitNFe>`;
}

export async function consultNfeProtocol({ accessKey, environment = "homologation", consultationUrl, pfx, passphrase }) {
  const payload = buildConsultProtocolXml({ accessKey, environment });
  const response = await postSoap({ url: consultationUrl, service: "NFeConsulta4", operation: "nfeConsultaNF", payload, pfx, passphrase });
  const parsed = parseAuthorizationResponse(response.rawBody);
  return {
    ok: parsed.cStat === "100" || parsed.protocolStatus === "100",
    status: parsed.cStat === "100" || parsed.protocolStatus === "100" ? "authorized" : "consulted",
    cStat: parsed.protocolStatus || parsed.cStat || null,
    xMotivo: parsed.protocolReason || parsed.xMotivo || null,
    protocol: parsed.protocol || null,
    accessKey: parsed.accessKey || alphaNum(accessKey),
    rawResponse: response.rawBody,
    endpoint: response.endpoint,
    httpStatus: response.status,
    externalRequestPerformed: true,
    checkedAt: new Date().toISOString(),
  };
}
