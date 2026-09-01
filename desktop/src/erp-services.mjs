import { net } from "electron";
import { requestDfeDistribution, validateFiscalIntegration } from "./fiscal-integrations.mjs";

const digits = (value) => String(value || "").replace(/\D/g, "");
const text = (value) => String(value || "").trim();

function validCnpj(value) {
  const cnpj = digits(value);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calc = (base, weights) => {
    const sum = base.split("").reduce((total, digit, index) => total + Number(digit) * weights[index], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  const d1 = calc(cnpj.slice(0, 12), [5,4,3,2,9,8,7,6,5,4,3,2]);
  const d2 = calc(cnpj.slice(0, 12) + d1, [6,5,4,3,2,9,8,7,6,5,4,3,2]);
  return cnpj === cnpj.slice(0, 12) + String(d1) + String(d2);
}

export function createErpServices({ core, certificateVault, secretVault, fiscalDocumentStore }) {
  async function getConnections() {
    const raw = await core.apiRequest("/api/integrations", { method: "GET" });
    const data = JSON.parse(raw.body || "{}");
    return Array.isArray(data.connections) ? data.connections : [];
  }

  async function getCompany() {
    const row = (await getConnections()).find((item) => item.connector === "__company_profile");
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
    if (!validCnpj(company.taxId)) return { status: 400, ok: false, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "Informe um CNPJ válido." }) };
    if (!/^[A-Z]{2}$/.test(company.state)) return { status: 400, ok: false, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "UF deve conter 2 letras." }) };
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
    if (!validCnpj(cnpj)) blockers.push("Cadastre um CNPJ válido para o estabelecimento.");
    if (!config.certificateId) blockers.push("Importe e selecione um certificado digital A1 (.PFX/.P12).");
    if (connector === "nfe_sefaz") {
      if (!text(config.stateRegistration || company?.stateRegistration)) blockers.push("Informe a Inscrição Estadual.");
      if (!/^[A-Z]{2}$/.test(text(config.uf || company?.state).toUpperCase())) blockers.push("Informe a UF do estabelecimento.");
      if (!text(config.statusServiceUrl || config.apiBaseUrl)) blockers.push("Informe a URL HTTPS do serviço NFeStatusServico4 da SEFAZ/autorizador da UF.");
      if (config.enableNfce && !text(config.cscId)) blockers.push("Para NFC-e, informe o ID do CSC fornecido pela SEFAZ.");
    }
    if (connector === "nfse_national") {
      if (!text(config.municipalRegistration || company?.municipalRegistration)) blockers.push("Informe a Inscrição Municipal.");
      if (digits(config.cityCode || company?.cityCode).length !== 7) blockers.push("Informe o código IBGE do município com 7 dígitos.");
    }
    if (connector === "nfe_distribution") {
      if (!/^[A-Z]{2}$/.test(text(config.uf || company?.state).toUpperCase())) blockers.push("Informe a UF do estabelecimento para consultar o Ambiente Nacional.");
    }
    return blockers;
  }

  async function testFiscal(connector, config) {
    const company = await getCompany();
    const blockers = fiscalRequirements(connector, config, company);
    if (connector === "nfe_sefaz" && config.enableNfce) {
      const fiscalSecrets = await secretVault.get("nfe_sefaz");
      if (!text(fiscalSecrets.cscToken)) blockers.push("Para NFC-e, informe o CSC/Token e salve-o no cofre seguro deste computador.");
    }

    if (config.certificateId) {
      const certificateValidation = await certificateVault.validate(config.certificateId);
      if (!certificateValidation.valid) blockers.push(`Certificado A1 inválido neste computador: ${certificateValidation.error || "falha ao abrir PKCS#12"}`);
    }

    if (blockers.length) {
      return { ok: false, status: "validation_failed", blockers, message: "Há pendências que impedem a conexão fiscal externa.", externalRequestPerformed: false, checkedAt: new Date().toISOString() };
    }

    const certificate = await certificateVault.loadSecret(config.certificateId);
    return validateFiscalIntegration({ connector, environment: config.environment === "production" ? "production" : "homologation", configuration: config, company, certificate });
  }

  async function syncDfe(payload = {}) {
    const environment = payload.environment === "production" ? "production" : "homologation";
    const company = await getCompany();
    if (!company || !validCnpj(company.taxId)) throw new Error("Cadastre a empresa com CNPJ válido antes de sincronizar DF-e.");

    const connection = (await getConnections()).find((item) => item.connector === "nfe_distribution" && item.environment === environment);
    if (!connection) throw new Error(`Configure a integração Distribuição / Manifestação NF-e no ambiente de ${environment === "production" ? "produção" : "homologação"}.`);
    const configuration = { ...(connection.configuration || {}), environment };
    const localSecret = await secretVault.get("nfe_distribution");
    const certificateId = text(localSecret.certificateId);
    if (!certificateId) throw new Error("Vincule um certificado A1 a Distribuição / Manifestação NF-e neste computador.");
    const certificateValidation = await certificateVault.validate(certificateId);
    if (!certificateValidation.valid) throw new Error(`O certificado A1 vinculado não pôde ser aberto: ${certificateValidation.error || "certificado inválido"}.`);
    const certificate = await certificateVault.loadSecret(certificateId);

    const now = Date.now();
    const nextAllowedAt = configuration.nextAllowedAt ? Date.parse(configuration.nextAllowedAt) : 0;
    if (nextAllowedAt && nextAllowedAt > now && !payload.force) {
      const minutes = Math.max(1, Math.ceil((nextAllowedAt - now) / 60000));
      const error = new Error(`O Ambiente Nacional exige aguardar mais ${minutes} minuto(s) antes da próxima consulta deste CNPJ.`);
      error.code = "DFE_COOLDOWN";
      error.nextAllowedAt = configuration.nextAllowedAt;
      throw error;
    }

    let cursor = digits(configuration.lastNsu || "0").slice(-15).padStart(15, "0");
    let maxNsu = digits(configuration.maxNsu || cursor).slice(-15).padStart(15, "0");
    let finalResult = null;
    let batches = 0;
    const imported = [];
    const seen = new Set();
    const maxBatches = Math.min(20, Math.max(1, Number(payload.maxBatches) || 6));

    while (batches < maxBatches) {
      const result = await requestDfeDistribution({ environment, configuration, company, certificate, lastNsu: cursor });
      finalResult = result;
      batches += 1;
      if (!result.ok) break;

      for (const doc of result.documents || []) {
        if (seen.has(doc.accessKey)) continue;
        seen.add(doc.accessKey);
        const stored = await fiscalDocumentStore.saveReceived({
          accessKey: doc.accessKey,
          xml: doc.xml,
          metadata: {
            nsu: doc.nsu,
            schema: doc.schema,
            model: doc.model,
            issuerTaxId: doc.issuerTaxId,
            issuerName: doc.issuerName,
            issueDate: doc.issueDate,
            totalCents: doc.totalCents,
            environment,
            source: "nfe_distribution",
            manifestationStatus: "not_manifested",
          },
        });
        imported.push(stored);
      }

      cursor = digits(result.ultNSU || cursor).slice(-15).padStart(15, "0");
      maxNsu = digits(result.maxNSU || maxNsu).slice(-15).padStart(15, "0");
      if (result.cStat === "137" || cursor === maxNsu) break;
    }

    const checkedAt = finalResult?.checkedAt || new Date().toISOString();
    const cooldownRequired = finalResult?.cStat === "137" || finalResult?.cStat === "656";
    const updatedConfiguration = {
      ...configuration,
      lastNsu: cursor,
      maxNsu,
      lastDistributionStatus: finalResult?.cStat || null,
      lastDistributionMessage: finalResult?.xMotivo || finalResult?.message || null,
      lastDistributionAt: checkedAt,
      nextAllowedAt: cooldownRequired ? new Date(Date.parse(checkedAt) + 3600000).toISOString() : null,
    };
    await core.apiRequest("/api/integrations", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "save", connector: "nfe_distribution", environment, credentialReference: connection.credentialReference || "per-device-a1", configuration: updatedConfiguration }),
    });

    if (!finalResult?.ok) {
      const error = new Error(finalResult?.message || "A consulta DF-e foi rejeitada pelo Ambiente Nacional.");
      error.code = finalResult?.status || "DFE_EXTERNAL_ERROR";
      error.cStat = finalResult?.cStat || null;
      error.nextAllowedAt = updatedConfiguration.nextAllowedAt;
      throw error;
    }

    return {
      ok: true,
      environment,
      cStat: finalResult.cStat,
      message: finalResult.message,
      lastNsu: cursor,
      maxNsu,
      batches,
      importedCount: imported.length,
      imported,
      moreAvailable: cursor !== maxNsu && finalResult.cStat !== "137",
      nextAllowedAt: updatedConfiguration.nextAllowedAt,
      externalRequestPerformed: true,
      checkedAt,
    };
  }

  async function listReceivedDfe() {
    return { documents: await fiscalDocumentStore.listReceived(), localXmlStorage: true };
  }

  async function testBanrisul(config) {
    const secrets = await secretVault.get("banrisul");
    const blockers = [];
    if (!text(secrets.clientId)) blockers.push("Informe o Client ID do aplicativo Banrisul.");
    if (!text(secrets.clientSecret)) blockers.push("Informe o Client Secret do aplicativo Banrisul.");
    if (!text(config.beneficiaryCode)) blockers.push("Informe o código de beneficiário/convênio de cobrança.");
    const tokenUrl = text(config.oauthUrl);
    if (!tokenUrl) blockers.push("Informe o endpoint OAuth2 indicado na documentação/ambiente da API Cobrança.");
    if (blockers.length) return { ok: false, status: "validation_failed", blockers, message: "Credenciais bancárias incompletas.", externalRequestPerformed: false };

    const authMethod = config.oauthAuthMethod === "body" ? "body" : "basic";
    const body = new URLSearchParams({ grant_type: "client_credentials" });
    const headers = { "content-type": "application/x-www-form-urlencoded", accept: "application/json" };
    if (authMethod === "body") { body.set("client_id", secrets.clientId); body.set("client_secret", secrets.clientSecret); }
    else headers.authorization = `Basic ${Buffer.from(`${secrets.clientId}:${secrets.clientSecret}`).toString("base64")}`;
    if (text(config.scopes)) body.set("scope", text(config.scopes));

    try {
      const response = await net.fetch(tokenUrl, { method: "POST", headers, body: body.toString() });
      const responseText = await response.text();
      let data = {}; try { data = JSON.parse(responseText); } catch {}
      if (!response.ok || !data.access_token) return { ok: false, status: "external_auth_failed", blockers: [`OAuth2 retornou HTTP ${response.status}.`], message: data.error_description || data.error || "O Banrisul não retornou um access_token.", externalRequestPerformed: true, checkedAt: new Date().toISOString() };
      return { ok: true, status: "active", blockers: [], message: "Autenticação OAuth2 Banrisul concluída e um Bearer Token foi obtido com sucesso.", externalRequestPerformed: true, checkedAt: new Date().toISOString(), expiresIn: data.expires_in || null };
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
    if (!text(config.scopes).includes("openid")) blockers.push("Inclua o escopo openid no fluxo de Authorization Code para Banking.");
    return { ok: false, status: blockers.length ? "validation_failed" : "implementation_required", blockers: blockers.length ? blockers : ["O fluxo OAuth Authorization Code/PKCE e callback do BTG ainda precisa ser implementado no desktop."], message: blockers.length ? "Configuração BTG incompleta." : "Configuração conferida, mas o ERP não marcará BTG como ativo sem concluir uma autorização real no provedor.", externalRequestPerformed: false, checkedAt: new Date().toISOString() };
  }

  async function testIntegration(payload = {}) {
    const connector = text(payload.connector);
    const config = payload.configuration && typeof payload.configuration === "object" ? { ...payload.configuration, environment: payload.environment || payload.configuration.environment } : {};
    if (["nfe_sefaz", "nfse_national", "nfe_distribution", "cte_received", "mdfe_received"].includes(connector)) return testFiscal(connector, config);
    if (connector === "banrisul") return testBanrisul(config);
    if (connector === "btg") return testBtg(config);
    if (connector === "certificate_partner") {
      const blockers = [];
      if (!text(config.partnerCode)) blockers.push("Informe o código do parceiro/AR.");
      if (!text(config.apiBaseUrl)) blockers.push("Informe a URL da API fornecida pelo parceiro.");
      return { ok: false, status: blockers.length ? "validation_failed" : "implementation_required", blockers: blockers.length ? blockers : ["A operação real depende do contrato e da autenticação definida pela API do parceiro de certificados."], message: blockers.length ? "Dados do parceiro incompletos." : "Configuração salva, mas não será marcada como ativa sem uma chamada autenticada real ao parceiro.", externalRequestPerformed: false, checkedAt: new Date().toISOString() };
    }
    return { ok: false, status: "validation_failed", blockers: ["Integração desconhecida."], message: "Conector inválido.", externalRequestPerformed: false };
  }

  return { companyApi, getCompany, listReceivedDfe, syncDfe, testIntegration };
}
