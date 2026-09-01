import { gunzipSync } from "node:zlib";
import { requestMtls } from "./fiscal-http.mjs";

const UF_CODES = Object.freeze({
  AC: "12", AL: "27", AP: "16", AM: "13", BA: "29", CE: "23", DF: "53",
  ES: "32", GO: "52", MA: "21", MT: "51", MS: "50", MG: "31", PA: "15",
  PB: "25", PR: "41", PE: "26", PI: "22", RJ: "33", RN: "24", RS: "43",
  RO: "11", RR: "14", SC: "42", SP: "35", SE: "28", TO: "17",
});

const NFSE_BASE_URLS = Object.freeze({
  homologation: "https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional",
  production: "https://sefin.nfse.gov.br/SefinNacional",
});

const DFE_DISTRIBUTION_URLS = Object.freeze({
  homologation: "https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
  production: "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
});

const text = (value) => String(value ?? "").trim();
const digits = (value) => String(value ?? "").replace(/\D/g, "");
const alphaNum = (value) => String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

function safeExcerpt(value, maxLength = 450) {
  return text(value).replace(/\s+/g, " ").slice(0, maxLength);
}

function externalFailure(error, endpoint) {
  return {
    ok: false,
    status: "external_unreachable",
    blockers: ["Não foi possível completar a conexão HTTPS/mTLS com o autorizador."],
    message: error instanceof Error ? error.message : "Falha de conexão externa.",
    endpoint,
    externalRequestPerformed: true,
    checkedAt: new Date().toISOString(),
  };
}

function requireHttps(value, label) {
  const raw = text(value);
  if (!raw) throw new Error(`${label} não foi informado.`);
  let url;
  try { url = new URL(raw); }
  catch { throw new Error(`${label} é inválido.`); }
  if (url.protocol !== "https:") throw new Error(`${label} deve utilizar HTTPS.`);
  return url.toString().replace(/\/$/, "");
}

function extractXmlTag(source, tag) {
  const match = String(source || "").match(new RegExp(`<(?:\\w+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`, "i"));
  return match ? match[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "";
}

function buildNfeStatusEnvelope({ environment, uf }) {
  const cUF = UF_CODES[text(uf).toUpperCase()];
  if (!cUF) throw new Error("UF inválida para consulta de status da NF-e.");
  const tpAmb = environment === "production" ? "1" : "2";
  return `<?xml version="1.0" encoding="utf-8"?>\n` +
    `<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">` +
    `<soap12:Header><nfeCabecMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4"><cUF>${cUF}</cUF><versaoDados>4.00</versaoDados></nfeCabecMsg></soap12:Header>` +
    `<soap12:Body><nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4"><consStatServ xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><tpAmb>${tpAmb}</tpAmb><cUF>${cUF}</cUF><xServ>STATUS</xServ></consStatServ></nfeDadosMsg></soap12:Body>` +
    `</soap12:Envelope>`;
}

function buildDfeDistributionEnvelope({ environment, uf, cnpj, lastNsu = "0" }) {
  const cUFAutor = UF_CODES[text(uf).toUpperCase()];
  if (!cUFAutor) throw new Error("UF inválida para distribuição DF-e.");
  const cleanCnpj = alphaNum(cnpj);
  if (!/^[A-Z0-9]{12}\d{2}$/.test(cleanCnpj)) throw new Error("CNPJ inválido para distribuição DF-e.");
  const tpAmb = environment === "production" ? "1" : "2";
  const ultNSU = digits(lastNsu).slice(-15).padStart(15, "0");
  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
    `<soap:Body><nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">` +
    `<nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">` +
    `<distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01"><tpAmb>${tpAmb}</tpAmb><cUFAutor>${cUFAutor}</cUFAutor><CNPJ>${cleanCnpj}</CNPJ><distNSU><ultNSU>${ultNSU}</ultNSU></distNSU></distDFeInt>` +
    `</nfeDadosMsg></nfeDistDFeInteresse></soap:Body></soap:Envelope>`;
}

function parseDocZipNodes(source) {
  const packages = [];
  const matcher = /<(?:\w+:)?docZip\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?docZip>/gi;
  let match;
  while ((match = matcher.exec(String(source || ""))) !== null) {
    const attrs = match[1] || "";
    const nsu = (attrs.match(/\bNSU\s*=\s*["']([^"']+)["']/i) || [])[1] || "";
    const schema = (attrs.match(/\bschema\s*=\s*["']([^"']+)["']/i) || [])[1] || "";
    const encoded = String(match[2] || "").replace(/\s+/g, "");
    try {
      const raw = Buffer.from(encoded, "base64");
      const documentXml = gunzipSync(raw).toString("utf8");
      packages.push({ nsu, schema, documentXml, compressedBase64: encoded });
    } catch (error) {
      packages.push({ nsu, schema, documentXml: "", compressedBase64: encoded, decodeError: error instanceof Error ? error.message : "Falha ao descompactar docZip." });
    }
  }
  return packages;
}

function centsFromDecimal(value) {
  const normalized = text(value).replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? Math.max(0, Math.round(number * 100)) : 0;
}

function parseDistributedNfePackage(pkg) {
  if (!pkg?.documentXml) return null;
  const documentXml = pkg.documentXml;
  const rawKey = extractXmlTag(documentXml, "chNFe") || ((documentXml.match(/\bId=["']NFe([A-Z0-9]{44})["']/i) || [])[1] || "");
  const accessKey = alphaNum(rawKey);
  if (!/^[A-Z0-9]{44}$/.test(accessKey)) return null;
  const cnpj = alphaNum(extractXmlTag(documentXml, "CNPJ"));
  const cpf = digits(extractXmlTag(documentXml, "CPF"));
  const issuerTaxId = cnpj || cpf || null;
  const issuerName = extractXmlTag(documentXml, "xNome") || "Emitente não informado";
  const issueDate = extractXmlTag(documentXml, "dhEmi") || extractXmlTag(documentXml, "dEmi") || null;
  const totalCents = centsFromDecimal(extractXmlTag(documentXml, "vNF"));
  const model = accessKey.slice(20, 22) || extractXmlTag(documentXml, "mod") || "55";
  return { accessKey, nsu: text(pkg.nsu) || null, schema: text(pkg.schema) || null, model, issuerTaxId, issuerName, issueDate, totalCents, xml: documentXml };
}

async function validateNfeStatus({ environment, configuration, company, certificate }) {
  const endpoint = requireHttps(configuration.statusServiceUrl || configuration.apiBaseUrl, "URL do serviço NFeStatusServico4");
  const uf = text(configuration.uf || company?.state).toUpperCase();
  const body = buildNfeStatusEnvelope({ environment, uf });
  try {
    const response = await requestMtls({
      url: endpoint,
      method: "POST",
      pfx: certificate.pfx,
      passphrase: certificate.passphrase,
      headers: { accept: "application/soap+xml, application/xml, text/xml", "content-type": "application/soap+xml; charset=utf-8", "user-agent": "Seven-AutoERP/production" },
      body,
    });
    const cStat = extractXmlTag(response.rawBody, "cStat");
    const xMotivo = extractXmlTag(response.rawBody, "xMotivo");
    if (cStat) {
      return { ok: true, status: "active", blockers: [], message: `SEFAZ respondeu à consulta real de status (cStat ${cStat})${xMotivo ? `: ${xMotivo}` : "."}`, endpoint, httpStatus: response.status, cStat, xMotivo, externalRequestPerformed: true, checkedAt: new Date().toISOString() };
    }
    return { ok: false, status: response.status === 401 || response.status === 403 ? "external_auth_failed" : "external_response_invalid", blockers: [`O endpoint respondeu HTTP ${response.status}, mas não retornou cStat da SEFAZ.`], message: safeExcerpt(response.rawBody) || response.statusMessage || "Resposta sem conteúdo reconhecível.", endpoint, httpStatus: response.status, externalRequestPerformed: true, checkedAt: new Date().toISOString() };
  } catch (error) { return externalFailure(error, endpoint); }
}

async function validateNfseNational({ environment, configuration, certificate }) {
  const baseUrl = requireHttps(configuration.apiBaseUrl || NFSE_BASE_URLS[environment] || NFSE_BASE_URLS.homologation, "Base URL da SEFIN Nacional");
  const diagnosticDpsId = `DPS${"0".repeat(42)}`;
  const endpoint = `${baseUrl}/dps/${diagnosticDpsId}`;
  try {
    const response = await requestMtls({ url: endpoint, method: "GET", pfx: certificate.pfx, passphrase: certificate.passphrase, headers: { accept: "application/json, application/xml, text/plain", "user-agent": "Seven-AutoERP/production" } });
    if (response.status === 401 || response.status === 403) return { ok: false, status: "external_auth_failed", blockers: [`A SEFIN Nacional recusou a autenticação do certificado (HTTP ${response.status}).`], message: safeExcerpt(response.rawBody) || "Certificado/credenciamento recusado pelo serviço externo.", endpoint, httpStatus: response.status, externalRequestPerformed: true, checkedAt: new Date().toISOString() };
    if (response.status >= 500 || response.status === 0) return { ok: false, status: "external_unreachable", blockers: [`A SEFIN Nacional respondeu HTTP ${response.status || "sem status"}.`], message: safeExcerpt(response.rawBody) || response.statusMessage || "Serviço externo indisponível.", endpoint, httpStatus: response.status, externalRequestPerformed: true, checkedAt: new Date().toISOString() };
    return { ok: true, status: "external_connected", blockers: [], message: `SEFIN Nacional respondeu à consulta real de diagnóstico sem gravação (HTTP ${response.status}). A emissão só será marcada como autorizada após o POST oficial de DPS retornar a NFS-e.`, endpoint, httpStatus: response.status, externalRequestPerformed: true, checkedAt: new Date().toISOString() };
  } catch (error) { return externalFailure(error, endpoint); }
}

async function requestDfeDistribution({ environment, configuration = {}, company, certificate, lastNsu = "0" }) {
  const endpoint = requireHttps(configuration.apiBaseUrl || DFE_DISTRIBUTION_URLS[environment] || DFE_DISTRIBUTION_URLS.homologation, "URL do NFeDistribuicaoDFe");
  const body = buildDfeDistributionEnvelope({ environment, uf: configuration.uf || company?.state, cnpj: configuration.cnpj || company?.taxId, lastNsu });
  try {
    const response = await requestMtls({
      url: endpoint,
      method: "POST",
      pfx: certificate.pfx,
      passphrase: certificate.passphrase,
      headers: { accept: "text/xml, application/xml", "content-type": "text/xml; charset=utf-8", soapaction: "http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse", "user-agent": "Seven-AutoERP/production" },
      body,
    });
    const cStat = extractXmlTag(response.rawBody, "cStat");
    const xMotivo = extractXmlTag(response.rawBody, "xMotivo");
    const ultNSU = extractXmlTag(response.rawBody, "ultNSU") || digits(lastNsu).padStart(15, "0");
    const maxNSU = extractXmlTag(response.rawBody, "maxNSU") || ultNSU;
    const packages = parseDocZipNodes(response.rawBody);
    const documents = packages.map(parseDistributedNfePackage).filter(Boolean);
    const success = ["137", "138"].includes(cStat);
    return {
      ok: success,
      status: success ? (cStat === "138" ? "documents_received" : "no_documents") : (cStat === "656" ? "rate_limited" : "external_rejected"),
      blockers: success ? [] : [`Ambiente Nacional retornou cStat ${cStat || "não informado"}${xMotivo ? `: ${xMotivo}` : ""}.`],
      message: xMotivo || (success ? "Distribuição DF-e consultada com sucesso." : safeExcerpt(response.rawBody)),
      endpoint, httpStatus: response.status, cStat, xMotivo, ultNSU, maxNSU, packages, documents,
      retryAfterSeconds: cStat === "137" || cStat === "656" ? 3600 : 0,
      externalRequestPerformed: true,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) { return externalFailure(error, endpoint); }
}

export async function validateFiscalIntegration({ connector, environment = "homologation", configuration = {}, company = null, certificate }) {
  if (!certificate?.pfx) return { ok: false, status: "certificate_required", blockers: ["Certificado A1 não foi carregado do cofre local."], message: "Não é possível iniciar uma integração fiscal real sem o A1.", externalRequestPerformed: false, checkedAt: new Date().toISOString() };
  if (connector === "nfe_sefaz") return validateNfeStatus({ environment, configuration, company, certificate });
  if (connector === "nfse_national") return validateNfseNational({ environment, configuration, company, certificate });
  if (connector === "nfe_distribution") {
    return { ok: false, status: "ready_for_external_sync", blockers: ["Use 'Sincronizar DF-e' para consultar o Ambiente Nacional. O botão de teste não consome NSU para evitar bloqueio por uso indevido."], message: "Configuração pronta para sincronização real de DF-e, sem consulta automática no teste.", externalRequestPerformed: false, checkedAt: new Date().toISOString() };
  }
  return { ok: false, status: "implementation_required", blockers: [`O conector ${connector} ainda não possui operação externa implementada nesta etapa.`], message: "O ERP não marcará esta integração como ativa até existir uma chamada oficial real para o serviço correspondente.", externalRequestPerformed: false, checkedAt: new Date().toISOString() };
}

export { DFE_DISTRIBUTION_URLS, NFSE_BASE_URLS, UF_CODES, buildDfeDistributionEnvelope, buildNfeStatusEnvelope, parseDistributedNfePackage, requestDfeDistribution };
