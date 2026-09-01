import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildNfeXml, validateCnpj, validateNfeDraft } from "./nfe-xml.mjs";
import { signNfeXml } from "./nfe-signature.mjs";
import { authorizeNfe, consultAuthorizationReceipt, consultNfeProtocol } from "./nfe-authorizer.mjs";

const text = (value) => String(value ?? "").trim();
const digits = (value) => String(value ?? "").replace(/\D/g, "");
const nowIso = () => new Date().toISOString();

const RS_ENDPOINTS = Object.freeze({
  homologation: Object.freeze({
    authorizationServiceUrl: "https://nfe-homologacao.sefazrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
    returnAuthorizationServiceUrl: "https://nfe-homologacao.sefazrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
    consultationServiceUrl: "https://nfe-homologacao.sefazrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx",
    statusServiceUrl: "https://nfe-homologacao.sefazrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx",
  }),
  production: Object.freeze({
    authorizationServiceUrl: "https://nfe.sefazrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
    returnAuthorizationServiceUrl: "https://nfe.sefazrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
    consultationServiceUrl: "https://nfe.sefazrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx",
    statusServiceUrl: "https://nfe.sefazrs.rs.gov.br/ws/NfeStatusServico/NFeStatusServico4.asmx",
  }),
});

function jsonResponse(status, payload) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { "content-type": "application/json", "x-seven-local": "true" },
    body: JSON.stringify(payload),
  };
}

function parseCore(result) {
  try { return JSON.parse(result?.body || "{}"); }
  catch { return {}; }
}

function publicError(error, fallback = "Falha na operação fiscal.") {
  return error instanceof Error ? error.message : fallback;
}

function stripDeclaration(value) {
  return String(value || "").replace(/^\s*<\?xml[^>]*\?>\s*/i, "").trim();
}

function resolveEndpoints(company, environment, configuration) {
  const defaults = String(company?.state || "").toUpperCase() === "RS" ? RS_ENDPOINTS[environment] : {};
  return { ...defaults, ...(configuration || {}), environment };
}

export function createNfeService({ dataDir, core, certificateVault, secretVault, fiscalDocumentStore, sequenceStore, appVersion = "1.0.0" }) {
  const statePath = path.join(dataDir, "fiscal-documents", "nfe-draft-extensions.json");
  let operationChain = Promise.resolve();

  async function readState() {
    try {
      const parsed = JSON.parse(await readFile(statePath, "utf8"));
      return parsed && typeof parsed === "object" ? { drafts: {}, transmissions: {}, ...parsed } : { drafts: {}, transmissions: {} };
    } catch { return { drafts: {}, transmissions: {} }; }
  }

  async function writeState(state) {
    await mkdir(path.dirname(statePath), { recursive: true });
    const temp = `${statePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temp, JSON.stringify(state, null, 2), { encoding: "utf8", mode: 0o600 });
    await rename(temp, statePath);
  }

  function serialized(operation) {
    const run = operationChain.then(operation, operation);
    operationChain = run.then(() => undefined, () => undefined);
    return run;
  }

  async function mutateState(mutator) {
    return serialized(async () => {
      const state = await readState();
      const result = await mutator(state);
      await writeState(state);
      return result;
    });
  }

  async function getConnections() {
    const result = await core.apiRequest("/api/integrations", { method: "GET" });
    if (!result.ok) throw new Error(parseCore(result).error || "Não foi possível carregar as integrações fiscais.");
    const data = parseCore(result);
    return Array.isArray(data.connections) ? data.connections : [];
  }

  async function getCompany(connections = null) {
    const rows = connections || await getConnections();
    return rows.find((item) => item.connector === "__company_profile")?.configuration || null;
  }

  function mergeDraft(base, extension, transmission) {
    return {
      ...base,
      ...(extension || {}),
      id: base.id,
      items: Array.isArray(extension?.items) ? extension.items : (Array.isArray(base.items) ? base.items : []),
      transmission: transmission || null,
      transmissionStatus: transmission?.status || null,
      accessKey: transmission?.accessKey || null,
      protocol: transmission?.protocol || null,
      nfeNumber: transmission?.number || null,
      nfeSeries: transmission?.series || null,
    };
  }

  async function listDrafts() {
    await operationChain;
    const coreResult = await core.apiRequest("/api/nfe-drafts", { method: "GET" });
    if (!coreResult.ok) return coreResult;
    const data = parseCore(coreResult);
    const state = await readState();
    const drafts = (data.drafts || []).map((draft) => mergeDraft(draft, state.drafts[draft.id], state.transmissions[draft.id]));
    return jsonResponse(200, { ...data, drafts, issuedDocuments: await fiscalDocumentStore.listIssued(), local: true });
  }

  async function saveDraft(payload) {
    const corePayload = { ...payload };
    delete corePayload.action;
    const result = await core.apiRequest("/api/nfe-drafts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corePayload),
    });
    if (!result.ok) return result;
    const data = parseCore(result);
    const draftId = data.draft?.id;
    if (!draftId) return jsonResponse(500, { error: "O núcleo local não retornou o identificador do rascunho." });

    const extension = await mutateState((state) => {
      state.drafts[draftId] = {
        ...(state.drafts[draftId] || {}),
        ...corePayload,
        id: draftId,
        environment: payload.environment === "production" ? "production" : "homologation",
        items: Array.isArray(payload.items) ? payload.items : [],
        savedAt: nowIso(),
      };
      return state.drafts[draftId];
    });
    const state = await readState();
    const draft = mergeDraft(data.draft, extension, state.transmissions[draftId]);
    return jsonResponse(result.status || 201, { ...data, draft, local: true });
  }

  async function loadDraft(draftId) {
    const id = text(draftId);
    if (!id) throw new Error("Selecione um rascunho de NF-e para transmitir.");
    const result = await listDrafts();
    const data = parseCore(result);
    const draft = (data.drafts || []).find((item) => item.id === id);
    if (!draft) throw new Error("Rascunho de NF-e não encontrado neste computador.");
    return draft;
  }

  async function fiscalContext(draft) {
    const connections = await getConnections();
    const company = await getCompany(connections);
    if (!company || !validateCnpj(company.taxId)) throw new Error("Cadastre a empresa com CNPJ válido antes de emitir NF-e.");
    const environment = draft.environment === "production" ? "production" : "homologation";
    const connection = connections.find((item) => item.connector === "nfe_sefaz" && item.environment === environment);
    if (!connection) throw new Error(`Configure NF-e / NFC-e no ambiente de ${environment === "production" ? "produção" : "homologação"}.`);
    const configuration = resolveEndpoints(company, environment, connection.configuration);
    const localSecrets = await secretVault.get("nfe_sefaz");
    const certificateId = text(localSecrets.certificateId);
    if (!certificateId) throw new Error("Vincule um certificado A1 à integração NF-e neste computador.");
    const certificateValidation = await certificateVault.validate(certificateId);
    if (!certificateValidation.valid) throw new Error(`Certificado A1 inválido: ${certificateValidation.error || "não foi possível abrir o PFX/P12"}.`);
    const certificate = await certificateVault.loadSecret(certificateId);

    const blockers = validateNfeDraft({ draft, company });
    if (blockers.length) {
      const error = new Error("A NF-e possui pendências fiscais e não pode ser transmitida.");
      error.blockers = blockers;
      throw error;
    }

    const endpointBlockers = [];
    if (!text(configuration.authorizationServiceUrl)) endpointBlockers.push("Informe a URL NFeAutorizacao4 para a UF/autorizador.");
    if (!text(configuration.returnAuthorizationServiceUrl)) endpointBlockers.push("Informe a URL NFeRetAutorizacao4 para a UF/autorizador.");
    if (!text(configuration.consultationServiceUrl)) endpointBlockers.push("Informe a URL NFeConsulta4 para a UF/autorizador.");
    const series = Number(digits(company.nfeSeries || configuration.nfeSeries || ""));
    const startingNumber = Number(digits(configuration.nextNfeNumber || company.nfeNextNumber || ""));
    if (!Number.isInteger(series) || series < 0 || series > 999) endpointBlockers.push("Configure uma série NF-e válida entre 0 e 999.");
    if (!Number.isInteger(startingNumber) || startingNumber < 1 || startingNumber > 999999999) endpointBlockers.push("Configure o próximo número de NF-e antes de transmitir; o ERP não presume que a numeração começa em 1.");
    if (endpointBlockers.length) {
      const error = new Error("Configuração fiscal incompleta para autorização NF-e.");
      error.blockers = endpointBlockers;
      throw error;
    }
    return { company, environment, connection, configuration, certificate, series, startingNumber };
  }

  async function recordTransmission(draftId, patch) {
    return mutateState((state) => {
      const current = state.transmissions[draftId] || {};
      state.transmissions[draftId] = { ...current, ...patch, draftId, updatedAt: nowIso() };
      return { ...state.transmissions[draftId] };
    });
  }

  async function persistAuthorizedFromProtocol({ draft, transmission, parsed, context }) {
    if (!parsed.authorized || !parsed.protocolXml) return null;
    const accessKey = parsed.accessKey || transmission.accessKey;
    const signedXml = await fiscalDocumentStore.readIssued(accessKey, "signed");
    const nfeProc = `<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">${stripDeclaration(signedXml)}${parsed.protocolXml}</nfeProc>`;
    await fiscalDocumentStore.saveIssued({
      accessKey,
      stage: "authorized",
      xml: nfeProc,
      metadata: {
        draftId: draft.id,
        environment: context.environment,
        number: transmission.number,
        series: transmission.series,
        issuedAt: parsed.receivedAt || nowIso(),
        status: "authorized",
        protocol: parsed.protocol,
        cStat: parsed.protocolStatus,
        xMotivo: parsed.protocolReason,
        recipientName: draft.recipientName,
        recipientTaxId: draft.recipientTaxId,
        totalCents: draft.totalCents || null,
      },
    });
    await sequenceStore.mark({ draftId: draft.id, environment: context.environment, series: transmission.series, status: "authorized", accessKey, protocol: parsed.protocol });
    return nfeProc;
  }

  async function transmit(draftId) {
    const draft = await loadDraft(draftId);
    if (draft.transmission?.status === "authorized") {
      return jsonResponse(200, { ok: true, duplicate: true, draft, transmission: draft.transmission, message: "Esta NF-e já possui protocolo de autorização salvo localmente." });
    }

    let context;
    try { context = await fiscalContext(draft); }
    catch (error) {
      return jsonResponse(422, { error: publicError(error), blockers: error?.blockers || [], externalRequestPerformed: false });
    }

    const reservation = await sequenceStore.reserve({ draftId: draft.id, environment: context.environment, series: context.series, startingNumber: context.startingNumber });

    let prepared;
    try {
      const unsigned = buildNfeXml({
        draft: { ...draft, environment: context.environment },
        company: context.company,
        number: reservation.number,
        series: reservation.series,
        numericCode: reservation.numericCode,
        issuedAt: new Date(reservation.issuedAt),
        appVersion,
      });
      prepared = { ...unsigned, ...signNfeXml({ xml: unsigned.xml, pfx: context.certificate.pfx, passphrase: context.certificate.passphrase }) };
    } catch (error) {
      await sequenceStore.mark({ draftId: draft.id, environment: context.environment, series: reservation.series, status: "preparation_failed" });
      return jsonResponse(422, { error: publicError(error, "Falha ao gerar ou assinar NF-e."), blockers: error?.blockers || [], externalRequestPerformed: false });
    }

    await fiscalDocumentStore.saveIssued({
      accessKey: prepared.accessKey,
      stage: "signed",
      xml: prepared.signedXml,
      metadata: {
        draftId: draft.id,
        environment: context.environment,
        number: reservation.number,
        series: reservation.series,
        issuedAt: reservation.issuedAt,
        status: "signed",
        recipientName: draft.recipientName,
        recipientTaxId: draft.recipientTaxId,
        totalCents: prepared.totals.totalCents,
      },
    });
    await sequenceStore.mark({ draftId: draft.id, environment: context.environment, series: reservation.series, status: "signed", accessKey: prepared.accessKey });
    await recordTransmission(draft.id, {
      status: "signed",
      environment: context.environment,
      accessKey: prepared.accessKey,
      number: reservation.number,
      series: reservation.series,
      numericCode: reservation.numericCode,
      issuedAt: reservation.issuedAt,
      signedAt: nowIso(),
      totalCents: prepared.totals.totalCents,
      externalRequestPerformed: false,
    });

    let authorization;
    try {
      authorization = await authorizeNfe({
        signedXml: prepared.signedXml,
        batchId: Date.now(),
        environment: context.environment,
        authorizationUrl: context.configuration.authorizationServiceUrl,
        returnAuthorizationUrl: context.configuration.returnAuthorizationServiceUrl,
        pfx: context.certificate.pfx,
        passphrase: context.certificate.passphrase,
      });
    } catch (error) {
      const transmission = await recordTransmission(draft.id, { status: "external_error", accessKey: prepared.accessKey, error: publicError(error), externalRequestPerformed: true });
      await sequenceStore.mark({ draftId: draft.id, environment: context.environment, series: reservation.series, status: "external_error", accessKey: prepared.accessKey });
      return jsonResponse(502, { error: transmission.error, transmission, externalRequestPerformed: true });
    }

    const transmission = await recordTransmission(draft.id, {
      status: authorization.status,
      accessKey: prepared.accessKey,
      number: reservation.number,
      series: reservation.series,
      protocol: authorization.protocol || null,
      receipt: authorization.receipt || null,
      cStat: authorization.cStat || null,
      xMotivo: authorization.xMotivo || null,
      endpoint: authorization.endpoint || null,
      httpStatus: authorization.httpStatus || null,
      externalRequestPerformed: true,
      authorizedAt: authorization.ok ? authorization.receivedAt || nowIso() : null,
    });

    if (authorization.ok && authorization.nfeProc) {
      await fiscalDocumentStore.saveIssued({
        accessKey: prepared.accessKey,
        stage: "authorized",
        xml: authorization.nfeProc,
        metadata: {
          draftId: draft.id,
          environment: context.environment,
          number: reservation.number,
          series: reservation.series,
          issuedAt: transmission.authorizedAt,
          status: "authorized",
          protocol: authorization.protocol,
          cStat: authorization.cStat,
          xMotivo: authorization.xMotivo,
          recipientName: draft.recipientName,
          recipientTaxId: draft.recipientTaxId,
          totalCents: prepared.totals.totalCents,
        },
      });
      await sequenceStore.mark({ draftId: draft.id, environment: context.environment, series: reservation.series, status: "authorized", accessKey: prepared.accessKey, protocol: authorization.protocol });
      return jsonResponse(200, { ok: true, status: "authorized", transmission, accessKey: prepared.accessKey, protocol: authorization.protocol, message: authorization.xMotivo || "NF-e autorizada pela SEFAZ." });
    }

    await sequenceStore.mark({ draftId: draft.id, environment: context.environment, series: reservation.series, status: authorization.status, accessKey: prepared.accessKey, protocol: authorization.protocol });
    const statusCode = authorization.status === "processing" ? 202 : 422;
    return jsonResponse(statusCode, { ok: false, status: authorization.status, transmission, error: authorization.xMotivo || "NF-e não foi autorizada.", externalRequestPerformed: true });
  }

  async function consultReceipt(draftId) {
    const draft = await loadDraft(draftId);
    const transmission = draft.transmission;
    if (!transmission?.receipt) return jsonResponse(422, { error: "Este rascunho não possui recibo pendente da SEFAZ." });
    let context;
    try { context = await fiscalContext(draft); }
    catch (error) { return jsonResponse(422, { error: publicError(error), blockers: error?.blockers || [] }); }
    const checked = await consultAuthorizationReceipt({ receipt: transmission.receipt, environment: context.environment, returnAuthorizationUrl: context.configuration.returnAuthorizationServiceUrl, pfx: context.certificate.pfx, passphrase: context.certificate.passphrase });
    const parsed = checked.parsed;
    const next = await recordTransmission(draft.id, {
      status: parsed.authorized ? "authorized" : (parsed.protocolStatus ? "rejected" : "processing"),
      cStat: parsed.protocolStatus || parsed.cStat || null,
      xMotivo: parsed.protocolReason || parsed.xMotivo || null,
      protocol: parsed.protocol || null,
      accessKey: parsed.accessKey || transmission.accessKey,
      authorizedAt: parsed.authorized ? parsed.receivedAt || nowIso() : null,
      externalRequestPerformed: true,
      lastReceiptCheckAt: nowIso(),
    });
    if (parsed.authorized) await persistAuthorizedFromProtocol({ draft, transmission: next, parsed, context });
    return jsonResponse(parsed.authorized ? 200 : 202, { ok: parsed.authorized, transmission: next });
  }

  async function consultProtocol(draftId) {
    const draft = await loadDraft(draftId);
    if (!draft.transmission?.accessKey) return jsonResponse(422, { error: "Este rascunho ainda não possui chave de acesso reservada/transmitida." });
    let context;
    try { context = await fiscalContext(draft); }
    catch (error) { return jsonResponse(422, { error: publicError(error), blockers: error?.blockers || [] }); }
    const result = await consultNfeProtocol({ accessKey: draft.transmission.accessKey, environment: context.environment, consultationUrl: context.configuration.consultationServiceUrl, pfx: context.certificate.pfx, passphrase: context.certificate.passphrase });
    const transmission = await recordTransmission(draft.id, {
      status: result.status,
      cStat: result.cStat,
      xMotivo: result.xMotivo,
      protocol: result.protocol || draft.transmission.protocol || null,
      externalRequestPerformed: true,
      lastProtocolCheckAt: result.checkedAt,
    });
    return jsonResponse(200, { ...result, transmission });
  }

  async function api(method, payload = {}) {
    if (method === "GET") return listDrafts();
    if (method !== "POST") return jsonResponse(405, { error: "Método não permitido para NF-e." });
    if (payload.action === "transmit") return transmit(payload.draftId);
    if (payload.action === "consult_receipt") return consultReceipt(payload.draftId);
    if (payload.action === "consult_protocol") return consultProtocol(payload.draftId);
    return saveDraft(payload);
  }

  return { api, transmit, consultReceipt, consultProtocol, listDrafts };
}

export { RS_ENDPOINTS };
