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

const text = (value) => String(value ?? "").trim();

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

function extractXmlTag(xml, tag) {
  const match = String(xml || "").match(new RegExp(`<(?:\\w+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`, "i"));
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
      headers: {
        accept: "application/soap+xml, application/xml, text/xml",
        "content-type": "application/soap+xml; charset=utf-8",
        "user-agent": "Seven-AutoERP/production",
      },
      body,
    });
    const cStat = extractXmlTag(response.rawBody, "cStat");
    const xMotivo = extractXmlTag(response.rawBody, "xMotivo");
    const serviceResponded = Boolean(cStat);

    if (serviceResponded) {
      return {
        ok: true,
        status: "active",
        blockers: [],
        message: `SEFAZ respondeu à consulta real de status${cStat ? ` (cStat ${cStat})` : ""}${xMotivo ? `: ${xMotivo}` : "."}`,
        endpoint,
        httpStatus: response.status,
        cStat,
        xMotivo,
        externalRequestPerformed: true,
        checkedAt: new Date().toISOString(),
      };
    }

    return {
      ok: false,
      status: response.status === 401 || response.status === 403 ? "external_auth_failed" : "external_response_invalid",
      blockers: [`O endpoint respondeu HTTP ${response.status}, mas não retornou cStat da SEFAZ.`],
      message: safeExcerpt(response.rawBody) || response.statusMessage || "Resposta sem conteúdo reconhecível.",
      endpoint,
      httpStatus: response.status,
      externalRequestPerformed: true,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    return externalFailure(error, endpoint);
  }
}

async function validateNfseNational({ environment, configuration, certificate }) {
  const baseUrl = requireHttps(configuration.apiBaseUrl || NFSE_BASE_URLS[environment] || NFSE_BASE_URLS.homologation, "Base URL da SEFIN Nacional");
  // Consulta somente leitura. O identificador propositalmente inexistente evita criar qualquer documento.
  // O formato possui o prefixo DPS + 42 dígitos, como exige a rota da API.
  const diagnosticDpsId = `DPS${"0".repeat(42)}`;
  const endpoint = `${baseUrl}/dps/${diagnosticDpsId}`;

  try {
    const response = await requestMtls({
      url: endpoint,
      method: "GET",
      pfx: certificate.pfx,
      passphrase: certificate.passphrase,
      headers: {
        accept: "application/json, application/xml, text/plain",
        "user-agent": "Seven-AutoERP/production",
      },
    });

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        status: "external_auth_failed",
        blockers: [`A SEFIN Nacional recusou a autenticação do certificado (HTTP ${response.status}).`],
        message: safeExcerpt(response.rawBody) || "Certificado/credenciamento recusado pelo serviço externo.",
        endpoint,
        httpStatus: response.status,
        externalRequestPerformed: true,
        checkedAt: new Date().toISOString(),
      };
    }

    if (response.status >= 500 || response.status === 0) {
      return {
        ok: false,
        status: "external_unreachable",
        blockers: [`A SEFIN Nacional respondeu HTTP ${response.status || "sem status"}.`],
        message: safeExcerpt(response.rawBody) || response.statusMessage || "Serviço externo indisponível.",
        endpoint,
        httpStatus: response.status,
        externalRequestPerformed: true,
        checkedAt: new Date().toISOString(),
      };
    }

    return {
      ok: true,
      status: "external_connected",
      blockers: [],
      message: `SEFIN Nacional respondeu à consulta real de diagnóstico sem gravação (HTTP ${response.status}). A emissão só será marcada como autorizada após o POST oficial de DPS retornar a NFS-e.` ,
      endpoint,
      httpStatus: response.status,
      externalRequestPerformed: true,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    return externalFailure(error, endpoint);
  }
}

export async function validateFiscalIntegration({ connector, environment = "homologation", configuration = {}, company = null, certificate }) {
  if (!certificate?.pfx) {
    return {
      ok: false,
      status: "certificate_required",
      blockers: ["Certificado A1 não foi carregado do cofre local."],
      message: "Não é possível iniciar uma integração fiscal real sem o A1.",
      externalRequestPerformed: false,
      checkedAt: new Date().toISOString(),
    };
  }

  if (connector === "nfe_sefaz") return validateNfeStatus({ environment, configuration, company, certificate });
  if (connector === "nfse_national") return validateNfseNational({ environment, configuration, company, certificate });

  return {
    ok: false,
    status: "implementation_required",
    blockers: [`O conector ${connector} ainda não possui operação externa implementada nesta etapa.`],
    message: "O ERP não marcará esta integração como ativa até existir uma chamada oficial real para o serviço correspondente.",
    externalRequestPerformed: false,
    checkedAt: new Date().toISOString(),
  };
}

export { NFSE_BASE_URLS, UF_CODES, buildNfeStatusEnvelope };
