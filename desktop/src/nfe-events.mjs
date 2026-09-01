import { requestMtls } from "./fiscal-http.mjs";
import { formatNfeDateTime, normalizeCnpj, validateCnpj } from "./nfe-xml.mjs";
import { signNfeEventXml, signNfeInutilizacaoXml } from "./nfe-signature.mjs";

const clean = (value) => String(value ?? "").trim();
const digits = (value) => clean(value).replace(/\D/g, "");
const alphaNum = (value) => clean(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
const xml = (value) => clean(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

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

function validateJustification(value, label = "Justificativa") {
  const justification = clean(value).replace(/\s+/g, " ");
  if (justification.length < 15 || justification.length > 255) throw new Error(`${label} deve conter entre 15 e 255 caracteres.`);
  return justification;
}

export function buildCancellationEventXml({ accessKey, protocol, companyTaxId, environment = "homologation", justification, occurredAt = new Date(), sequence = 1 }) {
  const key = alphaNum(accessKey);
  if (!/^[A-Z0-9]{44}$/.test(key) || !/^\d{2}/.test(key)) throw new Error("Chave de acesso inválida para cancelamento.");
  const nProt = digits(protocol);
  if (!/^\d{15}$/.test(nProt)) throw new Error("Protocolo de autorização inválido para cancelamento.");
  const cnpj = normalizeCnpj(companyTaxId);
  if (!validateCnpj(cnpj)) throw new Error("CNPJ do emitente inválido para cancelamento.");
  const xJust = validateJustification(justification, "Justificativa do cancelamento");
  const nSeq = Number(sequence);
  if (!Number.isInteger(nSeq) || nSeq < 1 || nSeq > 20) throw new Error("Sequência do evento de cancelamento inválida.");
  const seq = String(nSeq).padStart(2, "0");
  const eventId = `ID110111${key}${seq}`;
  const tpAmb = environment === "production" ? "1" : "2";
  const cOrgao = key.slice(0, 2);
  const dhEvento = formatNfeDateTime(occurredAt);
  return {
    eventId,
    xml: `<?xml version="1.0" encoding="UTF-8"?><evento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><infEvento Id="${eventId}"><cOrgao>${cOrgao}</cOrgao><tpAmb>${tpAmb}</tpAmb><CNPJ>${cnpj}</CNPJ><chNFe>${key}</chNFe><dhEvento>${dhEvento}</dhEvento><tpEvento>110111</tpEvento><nSeqEvento>${nSeq}</nSeqEvento><verEvento>1.00</verEvento><detEvento versao="1.00"><descEvento>Cancelamento</descEvento><nProt>${nProt}</nProt><xJust>${xml(xJust)}</xJust></detEvento></infEvento></evento>`,
  };
}

export function parseCancellationResponse(rawBody) {
  const body = String(rawBody || "");
  const outerCStat = extractTag(body, "cStat");
  const outerReason = extractTag(body, "xMotivo");
  const retEventoXml = extractElement(body, "retEvento");
  const infEventoXml = retEventoXml ? extractElement(retEventoXml, "infEvento") : "";
  const eventCStat = infEventoXml ? extractTag(infEventoXml, "cStat") : "";
  const eventReason = infEventoXml ? extractTag(infEventoXml, "xMotivo") : "";
  const protocol = infEventoXml ? extractTag(infEventoXml, "nProt") : "";
  const accessKey = infEventoXml ? alphaNum(extractTag(infEventoXml, "chNFe")) : "";
  const registeredAt = infEventoXml ? extractTag(infEventoXml, "dhRegEvento") : "";
  const accepted = ["135", "155"].includes(eventCStat) && Boolean(protocol) && /^[A-Z0-9]{44}$/.test(accessKey);
  return { outerCStat, outerReason, retEventoXml, infEventoXml, eventCStat, eventReason, protocol, accessKey, registeredAt, accepted, late: eventCStat === "155" };
}

export async function cancelNfe({ accessKey, protocol, companyTaxId, environment = "homologation", justification, eventUrl, pfx, passphrase, batchId = Date.now(), occurredAt = new Date() }) {
  const built = buildCancellationEventXml({ accessKey, protocol, companyTaxId, environment, justification, occurredAt });
  const signed = signNfeEventXml({ xml: built.xml, pfx, passphrase });
  const lote = digits(batchId).slice(-15).padStart(15, "0");
  if (!lote || /^0+$/.test(lote)) throw new Error("Identificador do lote de evento inválido.");
  const payload = `<envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><idLote>${lote}</idLote>${stripDeclaration(signed.signedXml)}</envEvento>`;
  const response = await postSoap({ url: eventUrl, service: "NFeRecepcaoEvento4", operation: "nfeRecepcaoEvento", payload, pfx, passphrase });
  const parsed = parseCancellationResponse(response.rawBody);
  const procEventoNFe = parsed.accepted && parsed.retEventoXml
    ? `<?xml version="1.0" encoding="UTF-8"?><procEventoNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">${stripDeclaration(signed.signedXml)}${parsed.retEventoXml}</procEventoNFe>`
    : null;
  return {
    ok: parsed.accepted,
    status: parsed.accepted ? "cancelled" : "rejected",
    cStat: parsed.eventCStat || parsed.outerCStat || null,
    xMotivo: parsed.eventReason || parsed.outerReason || null,
    protocol: parsed.protocol || null,
    accessKey: parsed.accessKey || alphaNum(accessKey),
    registeredAt: parsed.registeredAt || null,
    late: parsed.late,
    signedEventXml: signed.signedXml,
    procEventoNFe,
    rawResponse: response.rawBody,
    endpoint: response.endpoint,
    httpStatus: response.status,
    externalRequestPerformed: true,
    checkedAt: new Date().toISOString(),
  };
}

export function buildInutilizacaoXml({ ufCode, year, companyTaxId, model = "55", series, startNumber, endNumber, environment = "homologation", justification }) {
  const cUF = digits(ufCode);
  if (!/^\d{2}$/.test(cUF)) throw new Error("Código da UF inválido para inutilização.");
  const ano = digits(year).slice(-2).padStart(2, "0");
  if (!/^\d{2}$/.test(ano)) throw new Error("Ano inválido para inutilização.");
  const cnpj = normalizeCnpj(companyTaxId);
  if (!/^\d{14}$/.test(cnpj) || !validateCnpj(cnpj)) {
    throw new Error("A inutilização está bloqueada para CNPJ alfanumérico até que o schema de inutilização vigente do autorizador seja validado no ERP.");
  }
  const mod = digits(model).padStart(2, "0").slice(-2);
  if (mod !== "55") throw new Error("Esta etapa implementa inutilização apenas para NF-e modelo 55.");
  const serieNumber = Number(digits(series));
  const first = Number(digits(startNumber));
  const last = Number(digits(endNumber));
  if (!Number.isInteger(serieNumber) || serieNumber < 0 || serieNumber > 999) throw new Error("Série NF-e inválida para inutilização.");
  if (!Number.isInteger(first) || first < 1 || first > 999999999) throw new Error("Número inicial inválido para inutilização.");
  if (!Number.isInteger(last) || last < first || last > 999999999) throw new Error("Número final inválido para inutilização.");
  if (last - first + 1 > 10000) throw new Error("A faixa de inutilização não pode ultrapassar 10.000 números.");
  const xJust = validateJustification(justification, "Justificativa da inutilização");
  const serie = String(serieNumber).padStart(3, "0");
  const nNFIni = String(first).padStart(9, "0");
  const nNFFin = String(last).padStart(9, "0");
  const id = `ID${cUF}${ano}${cnpj}${mod}${serie}${nNFIni}${nNFFin}`;
  const tpAmb = environment === "production" ? "1" : "2";
  return {
    id,
    series: serieNumber,
    startNumber: first,
    endNumber: last,
    xml: `<?xml version="1.0" encoding="UTF-8"?><inutNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><infInut Id="${id}"><tpAmb>${tpAmb}</tpAmb><xServ>INUTILIZAR</xServ><cUF>${cUF}</cUF><ano>${ano}</ano><CNPJ>${cnpj}</CNPJ><mod>${mod}</mod><serie>${serieNumber}</serie><nNFIni>${first}</nNFIni><nNFFin>${last}</nNFFin><xJust>${xml(xJust)}</xJust></infInut></inutNFe>`,
  };
}

export function parseInutilizacaoResponse(rawBody) {
  const body = String(rawBody || "");
  const retInutXml = extractElement(body, "retInutNFe") || body;
  const infInutXml = extractElement(retInutXml, "infInut");
  const source = infInutXml || retInutXml;
  const cStat = extractTag(source, "cStat");
  const xMotivo = extractTag(source, "xMotivo");
  const protocol = extractTag(source, "nProt");
  const receivedAt = extractTag(source, "dhRecbto");
  return { retInutXml, infInutXml, cStat, xMotivo, protocol, receivedAt, accepted: cStat === "102" && Boolean(protocol) };
}

export async function inutilizeNfeNumbers({ ufCode, year, companyTaxId, model = "55", series, startNumber, endNumber, environment = "homologation", justification, inutilizationUrl, pfx, passphrase }) {
  const built = buildInutilizacaoXml({ ufCode, year, companyTaxId, model, series, startNumber, endNumber, environment, justification });
  const signed = signNfeInutilizacaoXml({ xml: built.xml, pfx, passphrase });
  const response = await postSoap({ url: inutilizationUrl, service: "NFeInutilizacao4", operation: "nfeInutilizacaoNF", payload: signed.signedXml, pfx, passphrase });
  const parsed = parseInutilizacaoResponse(response.rawBody);
  const procInutNFe = parsed.accepted && parsed.retInutXml
    ? `<?xml version="1.0" encoding="UTF-8"?><procInutNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">${stripDeclaration(signed.signedXml)}${parsed.retInutXml}</procInutNFe>`
    : null;
  return {
    ok: parsed.accepted,
    status: parsed.accepted ? "inutilized" : "rejected",
    cStat: parsed.cStat || null,
    xMotivo: parsed.xMotivo || null,
    protocol: parsed.protocol || null,
    receivedAt: parsed.receivedAt || null,
    series: built.series,
    startNumber: built.startNumber,
    endNumber: built.endNumber,
    signedRequestXml: signed.signedXml,
    procInutNFe,
    rawResponse: response.rawBody,
    endpoint: response.endpoint,
    httpStatus: response.status,
    externalRequestPerformed: true,
    checkedAt: new Date().toISOString(),
  };
}
