import { net } from "electron";

const digits = (value) => String(value || "").replace(/\D/g, "");
const text = (value) => String(value || "").trim();

export function createErpServices({ core, certificateVault, secretVault }) {
  async function getCompany() {
    const raw = await core.apiRequest("/api/integrations", { method: "GET" });
    const data = JSON.parse(raw.body || "{}");
    const row = (data.connections || []).find((item) => item.connector === "__company_profile");
    return row?.configuration || null;
  }

  async function companyApi(method, payload = {}) {
    if (method === "GET") return { status: 200, ok: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ company: await getCompany(), local: true }) };
    if (method !== "POST") return { status: 405, ok: false, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Método não permitido" }) };
    const company = {
      legalName: text(payload.legalName), tradeName: text(payload.tradeName), taxId: digits(payload.taxId),
      stateRegistration: text(payload.stateRegistration), municipalRegistration: text(payload.municipalRegistration),
      taxRegime: text(payload.taxRegime), cnae: text(payload.cnae), postalCode: digits(payload.postalCode), street: text(payload.street),
      number: text(payload.number), complement: text(payload.complement), district: text(payload.district), city: text(payload.city),
      cityCode: digits(payload.cityCode), state: text(payload.state).toUpperCase(), email: text(payload.email).toLowerCase(), phone: text(payload.phone),
      website: text(payload.website), nfeSeries: text(payload.nfeSeries) || "1", nfceSeries: text(payload.nfceSeries) || "1",
      invoiceEmail: text(payload.invoiceEmail).toLowerCase(), notes: text(payload.notes), updatedAt: new Date().toISOString(),
    };
    if (!company.legalName) return { status: 400, ok: false, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Razão social é obrigatória." }) };
    if (company.taxId.length !== 14) return { status: 400, ok: false, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "CNPJ deve ter 14 dígitos." }) };
    if (company.cityCode && company.cityCode.length !== 7) return { status: 400, ok: false, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Código IBGE deve ter 7 dígitos." }) };
    const result = await core.apiRequest("/api/integrations", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "save", connector: "__company_profile", environment: "global", credentialReference: "company-profile", configuration: company }),
    });
    if (!result.ok) return result;
    return { status: 200, ok: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ company, local: true }) };
  }

  function fiscalRequirements(connector, config, company) {
    const blockers = [];
    const cnpj = digits(config.cnpj || company?.taxId);
    if (cnpj.length !== 14) blockers.push("Cadastre o CNPJ da empresa com 14 dígitos.");
    if (!config.certificateId) blockers.push("Importe e selecione um certificado digital A1 (.PFX/.P12).");
    if (connector === "nfe_sefaz") {
      if (!text(config.stateRegistration || company?.stateRegistration)) blockers.push("Informe a Inscrição Estadual.");
      if (!text(config.uf || company?.state)) blockers.push("Informe a UF do estabelecimento.");
      if (config.enableNfce && (!text(config.cscId) || !text(config.cscToken))) blockers.push("Para NFC-e, informe ID do CSC e CSC/Token fornecido pela SEFAZ.");
    }
    if (connector === "nfse_national") {
      if (!text(config.municipalRegistration || company?.municipalRegistration)) blockers.push("Informe a Inscrição Municipal.");
      if (digits(config.cityCode || company?.cityCode).length !== 7) blockers.push("Informe o código IBGE do município com 7 dígitos.");
    }
    return blockers;
  }

  async function testFiscal(connector, config) {
    const company = await getCompany();
    const blockers = fiscalRequirements(connector, config, company);
    if (config.certificateId) {
      const certificate = await certificateVault.validate(config.certificateId);
      if (!certificate.valid) blockers.push(`Certificado A1 inválido neste computador: ${certificate.error || "falha ao abrir PKCS#12"}`);
    }
    return {
      ok: blockers.length === 0,
      status: blockers.length ? "validation_failed" : "certificate_validated",
      blockers,
      message: blockers.length ? "Há pendências na configuração fiscal." : "Certificado A1 aberto com sucesso e cadastro fiscal mínimo conferido. A transmissão oficial deve ser homologada no autorizador competente.",
      externalRequestPerformed: false,
      checkedAt: new Date().toISOString(),
    };
  }

  async function testBanrisul(config) {
    const secrets = await secretVault.get("banrisul");
    const blockers = [];
    if (!text(secrets.clientId)) blockers.push("Informe o Client ID do aplicativo Banrisul.");
    if (!text(secrets.clientSecret)) blockers.push("Informe o Client Secret do aplicativo Banrisul.");
    if (!text(config.beneficiaryCode)) blockers.push("Informe o código de beneficiário/convênio de cobrança.");
    if (blockers.length) return { ok: false, status: "validation_failed", blockers, message: "Credenciais bancárias incompletas.", externalRequestPerformed: false };
    const tokenUrl = text(config.oauthUrl);
    if (!tokenUrl) return { ok: false, status: "validation_failed", blockers: ["Informe o endpoint OAuth2 fornecido pelo Banrisul para esta API/ambiente."], message: "Endpoint OAuth2 ausente.", externalRequestPerformed: false };
    const body = new URLSearchParams({ grant_type: "client_credentials", client_id: secrets.clientId, client_secret: secrets.clientSecret });
    try {
      const response = await net.fetch(tokenUrl, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body: body.toString() });
      const responseText = await response.text();
      let data = {}; try { data = JSON.parse(responseText); } catch {}
      if (!response.ok || !data.access_token) return { ok: false, status: "external_auth_failed", blockers: [`OAuth2 retornou HTTP ${response.status}.`], message: data.error_description || data.error || "O Banrisul não retornou um access_token.", externalRequestPerformed: true, checkedAt: new Date().toISOString() };
      return { ok: true, status: "active", blockers: [], message: "Autenticação OAuth2 Banrisul concluída com access_token válido.", externalRequestPerformed: true, checkedAt: new Date().toISOString(), expiresIn: data.expires_in || null };
    } catch (error) {
      return { ok: false, status: "external_unreachable", blockers: ["Não foi possível alcançar o endpoint OAuth2."], message: error instanceof Error ? error.message : "Falha de conexão.", externalRequestPerformed: true, checkedAt: new Date().toISOString() };
    }
  }

  async function testBtg(config) {
    const secrets = await secretVault.get("btg");
    const blockers = [];
    if (!text(secrets.clientId)) blockers.push("Informe o Client ID do aplicativo BTG.");
    if (!text(secrets.clientSecret)) blockers.push("Informe o Client Secret do aplicativo BTG confidencial.");
    if (!text(config.redirectUri)) blockers.push("Informe a Redirect URI cadastrada no Developer Console.");
    if (!text(config.accountId)) blockers.push("Informe o Account ID/identificador da conta beneficiária.");
    return {
      ok: blockers.length === 0,
      status: blockers.length ? "validation_failed" : "authorization_required",
      blockers,
      message: blockers.length ? "Configuração BTG incompleta." : "Aplicativo configurado. Para APIs bancárias, o próximo passo é concluir o fluxo OAuth Authorization Code e consentimento da conta; o ERP não marcará a integração como ativa antes disso.",
      externalRequestPerformed: false,
      checkedAt: new Date().toISOString(),
    };
  }

  async function testIntegration(payload = {}) {
    const connector = text(payload.connector);
    const config = payload.configuration && typeof payload.configuration === "object" ? payload.configuration : {};
    if (["nfe_sefaz", "nfse_national", "nfe_distribution", "cte_received", "mdfe_received"].includes(connector)) return testFiscal(connector, config);
    if (connector === "banrisul") return testBanrisul(config);
    if (connector === "btg") return testBtg(config);
    if (connector === "certificate_partner") {
      const blockers = [];
      if (!text(config.partnerCode)) blockers.push("Informe o código do parceiro/AR.");
      if (!text(config.apiBaseUrl)) blockers.push("Informe a URL da API fornecida pelo parceiro.");
      return { ok: blockers.length === 0, status: blockers.length ? "validation_failed" : "provider_configured", blockers, message: blockers.length ? "Dados do parceiro incompletos." : "Configuração do parceiro salva. A ativação depende da documentação e das credenciais da API contratada.", externalRequestPerformed: false, checkedAt: new Date().toISOString() };
    }
    return { ok: false, status: "validation_failed", blockers: ["Integração desconhecida."], message: "Conector inválido.", externalRequestPerformed: false };
  }

  return { companyApi, getCompany, testIntegration };
}
