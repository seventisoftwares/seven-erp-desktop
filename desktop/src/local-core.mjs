import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const STATE_VERSION = 2;
const MAX_CHANGES = 10000;
const MAX_APPLIED = 20000;

const nowIso = () => new Date().toISOString();
const text = (value, max = 1000) => typeof value === "string" ? value.trim().slice(0, max) : "";
const moneyToCents = (value) => Math.max(0, Math.round((Number(value) || 0) * 100));
const jsonBody = (body) => { try { return body ? JSON.parse(body) : {}; } catch { return {}; } };

function initialState() {
  return {
    version: STATE_VERSION,
    customers: [],
    serviceOrders: [],
    integrations: [],
    nfeDrafts: [],
    receivedFiscalDocuments: [],
    manifestations: [],
    financialEntries: [],
    catalogItems: [],
    peers: [],
    changes: [],
    appliedChangeIds: [],
  };
}

function response(status, payload, extraHeaders = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { "content-type": "application/json", "x-seven-local": "true", ...extraHeaders },
    body: JSON.stringify(payload),
  };
}

export function createLocalCore({ dataDir, deviceId, deviceName, getWorkspace }) {
  const statePath = path.join(dataDir, "seven-local-data.json");
  let state = initialState();
  let saveChain = Promise.resolve();

  async function initialize() {
    await mkdir(dataDir, { recursive: true });
    try {
      const parsed = JSON.parse(await readFile(statePath, "utf8"));
      state = { ...initialState(), ...parsed, version: STATE_VERSION };
    } catch {
      state = initialState();
      await persist();
    }
  }

  async function persist() {
    saveChain = saveChain.then(async () => {
      await mkdir(dataDir, { recursive: true });
      const tmp = `${statePath}.tmp`;
      await writeFile(tmp, JSON.stringify(state, null, 2), { encoding: "utf8", mode: 0o600 });
      await rename(tmp, statePath);
    });
    return saveChain;
  }

  function tableFor(name) {
    if (!Object.prototype.hasOwnProperty.call(state, name) || !Array.isArray(state[name])) throw new Error(`Tabela local inválida: ${name}`);
    return state[name];
  }

  async function appendChange(table, recordId, action, payload, updatedAt = nowIso()) {
    const workspace = await getWorkspace();
    if (!workspace?.id) return;
    const change = {
      id: randomUUID(), workspaceId: workspace.id, originDeviceId: deviceId,
      table, recordId, action, payload, updatedAt,
    };
    state.changes.push(change);
    state.changes = state.changes.slice(-MAX_CHANGES);
    state.appliedChangeIds.push(change.id);
    state.appliedChangeIds = state.appliedChangeIds.slice(-MAX_APPLIED);
  }

  async function upsert(table, record, { sync = true } = {}) {
    const rows = tableFor(table);
    const index = rows.findIndex((item) => item.id === record.id);
    const next = { ...(index >= 0 ? rows[index] : {}), ...record, updatedAt: record.updatedAt || nowIso() };
    if (index >= 0) rows[index] = next; else rows.push(next);
    if (sync) await appendChange(table, next.id, "upsert", next, next.updatedAt);
    await persist();
    return next;
  }

  async function remove(table, id, { sync = true } = {}) {
    const rows = tableFor(table);
    const index = rows.findIndex((item) => item.id === id);
    if (index < 0) return false;
    rows.splice(index, 1);
    if (sync) await appendChange(table, id, "delete", null, nowIso());
    await persist();
    return true;
  }

  function joinOrder(order) {
    const customer = state.customers.find((item) => item.id === order.partyId);
    return {
      ...order,
      customerName: customer?.legalName || null,
      customerTradeName: customer?.tradeName || null,
      customerTaxId: customer?.taxId || null,
      customerPhone: customer?.phone || null,
      customerEmail: customer?.email || null,
    };
  }

  async function customersApi(method, payload) {
    if (method === "GET") return response(200, { customers: [...state.customers].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))) });
    if (method !== "POST") return response(405, { error: "Método não permitido" });
    const legalName = text(payload.legalName, 180);
    if (!legalName) return response(400, { error: "Razão social ou nome é obrigatório" });
    const customer = {
      id: randomUUID(), kind: "customer", personType: payload.personType === "individual" ? "individual" : "legal",
      legalName, tradeName: text(payload.tradeName, 180) || null, taxId: text(payload.taxId, 30).toUpperCase() || null,
      email: text(payload.email, 200).toLowerCase() || null, phone: text(payload.phone, 40) || null,
      city: text(payload.city, 120) || null, state: text(payload.state, 2).toUpperCase() || "RS", status: "active",
      createdAt: nowIso(), updatedAt: nowIso(),
    };
    await upsert("customers", customer);
    return response(201, { customer, synced: true, local: true, operationId: payload.operationId || randomUUID() });
  }

  async function serviceOrdersApi(method, payload) {
    if (method === "GET") {
      const orders = [...state.serviceOrders].sort((a, b) => Number(b.number) - Number(a.number)).map(joinOrder);
      return response(200, { orders, local: true });
    }
    if (method === "POST") {
      const partyId = text(payload.partyId, 100);
      const customer = state.customers.find((item) => item.id === partyId);
      if (!customer) return response(400, { error: "Selecione um cliente válido." });
      const reportedIssue = text(payload.reportedIssue, 4000);
      if (!reportedIssue) return response(400, { error: "Informe o defeito relatado ou serviço solicitado." });
      const number = state.serviceOrders.reduce((max, item) => Math.max(max, Number(item.number) || 0), 0) + 1;
      const laborCents = moneyToCents(payload.labor);
      const partsCents = moneyToCents(payload.parts);
      const order = {
        id: randomUUID(), partyId, number, status: "open",
        priority: ["low", "normal", "high", "urgent"].includes(payload.priority) ? payload.priority : "normal",
        equipmentType: text(payload.equipmentType, 120) || null, equipmentBrand: text(payload.equipmentBrand, 120) || null,
        equipmentModel: text(payload.equipmentModel, 120) || null, serialNumber: text(payload.serialNumber, 160) || null,
        reportedIssue, diagnosis: text(payload.diagnosis, 4000) || null, solution: null,
        technicianEmail: text(payload.technicianEmail, 200).toLowerCase() || null,
        laborCents, partsCents, totalCents: laborCents + partsCents,
        openedAt: nowIso(), closedAt: null, createdAt: nowIso(), updatedAt: nowIso(),
      };
      await upsert("serviceOrders", order);
      return response(201, { order: joinOrder(order), local: true, synced: true });
    }
    if (method === "PATCH") {
      const id = text(payload.id, 100);
      const current = state.serviceOrders.find((item) => item.id === id);
      if (!current) return response(404, { error: "Ordem de serviço não encontrada." });
      const status = text(payload.status, 40) || current.status;
      const laborCents = payload.labor === undefined ? current.laborCents : moneyToCents(payload.labor);
      const partsCents = payload.parts === undefined ? current.partsCents : moneyToCents(payload.parts);
      const closed = ["finished", "delivered", "cancelled"].includes(status);
      const order = {
        ...current, status,
        priority: text(payload.priority, 20) || current.priority,
        diagnosis: payload.diagnosis === undefined ? current.diagnosis : text(payload.diagnosis, 4000) || null,
        solution: payload.solution === undefined ? current.solution : text(payload.solution, 4000) || null,
        technicianEmail: payload.technicianEmail === undefined ? current.technicianEmail : text(payload.technicianEmail, 200).toLowerCase() || null,
        laborCents, partsCents, totalCents: laborCents + partsCents,
        closedAt: closed ? (current.closedAt || nowIso()) : null, updatedAt: nowIso(),
      };
      await upsert("serviceOrders", order);
      return response(200, { order: joinOrder(order), local: true, synced: true });
    }
    return response(405, { error: "Método não permitido" });
  }

  async function integrationsApi(method, payload) {
    if (method === "GET") return response(200, { connections: [...state.integrations].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))), local: true });
    if (method === "POST") {
      const connector = text(payload.connector, 60);
      const environment = text(payload.environment, 30) || "homologation";
      if (!connector) return response(400, { error: "Conector inválido." });
      const existing = state.integrations.find((item) => item.connector === connector && item.environment === environment);
      if (payload.action === "validate") {
        if (!existing) return response(409, { error: "Salve a configuração antes de verificar." });
        const checkedAt = nowIso();
        const credentialReady = Boolean(text(existing.credentialReference, 300));
        const next = { ...existing, status: credentialReady ? "ready_for_activation" : "validation_failed", lastHealthCheckAt: checkedAt, lastError: credentialReady ? null : "Informe a referência da credencial/certificado.", updatedAt: checkedAt };
        await upsert("integrations", next);
        return response(200, { status: next.status, lastError: next.lastError, checkedAt, externalRequestPerformed: false, local: true });
      }
      const credentialReference = text(payload.credentialReference, 300) || null;
      const connection = {
        id: existing?.id || randomUUID(), connector, environment,
        status: credentialReference ? "configuration_saved" : "configuration_pending",
        credentialReference,
        configuration: payload.configuration && typeof payload.configuration === "object" ? payload.configuration : {},
        lastHealthCheckAt: existing?.lastHealthCheckAt || null, lastError: null,
        createdAt: existing?.createdAt || nowIso(), updatedAt: nowIso(),
      };
      await upsert("integrations", connection);
      return response(existing ? 200 : 201, { connection, local: true });
    }
    if (method === "DELETE") {
      const connector = text(payload.connector, 60);
      const environment = text(payload.environment, 30) || "homologation";
      const existing = state.integrations.find((item) => item.connector === connector && item.environment === environment);
      if (!existing) return response(200, { removed: false, local: true });
      await remove("integrations", existing.id);
      return response(200, { removed: true, local: true });
    }
    return response(405, { error: "Método não permitido" });
  }

  async function nfeApi(method, payload) {
    const readiness = {
      transmissionEnabled: false,
      environment: "homologation",
      blockers: ["A transmissão para a SEFAZ é uma operação externa e exige certificado/credenciamento configurado."],
      localFirst: true,
    };
    if (method === "GET") return response(200, { drafts: [...state.nfeDrafts].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))), readiness });
    if (method !== "POST") return response(405, { error: "Método não permitido" });
    if (payload.action === "transmit") return response(422, { error: "O rascunho está salvo localmente. Para transmitir à SEFAZ, configure a integração fiscal externa.", readiness });
    const items = Array.isArray(payload.items) ? payload.items.slice(0, 100) : [];
    const productsTotalCents = items.reduce((sum, item) => sum + Math.round((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0) * 100), 0);
    const freightCents = moneyToCents(payload.freight), discountCents = moneyToCents(payload.discount), otherCents = moneyToCents(payload.other);
    const draft = {
      id: randomUUID(), natureOperation: text(payload.natureOperation, 160) || "Não informada", purpose: text(payload.purpose, 40) || "normal",
      finalConsumer: Boolean(payload.finalConsumer), presenceIndicator: text(payload.presenceIndicator, 60) || "not_applicable",
      freightMode: text(payload.freightMode, 60) || "no_freight", environment: "homologation",
      recipientName: text(payload.recipientName, 180) || "Não informado", recipientTaxId: text(payload.recipientTaxId, 30).replace(/[^A-Za-z0-9]/g, ""),
      recipientStateRegistration: text(payload.recipientStateRegistration, 40) || null, recipientEmail: text(payload.recipientEmail, 200).toLowerCase() || null,
      recipientState: text(payload.recipientState, 2).toUpperCase() || "RS", recipientCityCode: text(payload.recipientCityCode, 20).replace(/\D/g, "") || null,
      productsTotalCents, freightCents, discountCents, otherCents, totalCents: Math.max(0, productsTotalCents + freightCents + otherCents - discountCents),
      notes: text(payload.notes, 4000) || null,
      validationStatus: "ready_for_fiscal_review", validationJson: JSON.stringify({ errors: [], readinessBlockers: readiness.blockers }),
      idempotencyKey: text(payload.idempotencyKey, 160) || randomUUID(), items,
      createdAt: nowIso(), updatedAt: nowIso(),
    };
    await upsert("nfeDrafts", draft);
    return response(201, { draft, validationErrors: [], readiness, local: true });
  }

  async function manifestationsApi(method, payload) {
    if (method === "GET") return response(200, { documents: state.receivedFiscalDocuments, events: state.manifestations, transmissionEnabled: false, local: true });
    if (method !== "POST") return response(405, { error: "Método não permitido" });
    const doc = payload.document || {};
    const accessKey = text(doc.accessKey, 60).replace(/\D/g, "");
    if (!/^\d{44}$/.test(accessKey)) return response(400, { error: "A chave de acesso da NF-e deve conter 44 dígitos" });
    let document = state.receivedFiscalDocuments.find((item) => item.accessKey === accessKey);
    if (!document) {
      document = { id: randomUUID(), accessKey, issuerName: text(doc.issuerName, 180) || "Emitente", issuerTaxId: text(doc.issuerTaxId, 30) || null, issueDate: doc.issueDate || null, totalCents: Number(doc.totalCents) || 0, manifestationStatus: "not_manifested", createdAt: nowIso(), updatedAt: nowIso() };
      await upsert("receivedFiscalDocuments", document);
    }
    const manifestation = { id: randomUUID(), receivedDocumentId: document.id, eventType: text(payload.eventType, 60), justification: text(payload.justification, 255) || null, status: "draft", environment: "homologation", idempotencyKey: text(payload.idempotencyKey, 160) || randomUUID(), createdAt: nowIso(), updatedAt: nowIso() };
    await upsert("manifestations", manifestation);
    return response(201, { manifestation, transmissionEnabled: false, local: true });
  }

  function dashboardApi() {
    const openOrders = state.serviceOrders.filter((item) => !["finished", "delivered", "cancelled"].includes(item.status));
    return response(200, {
      metrics: { revenueCents: 0, receivableCents: 0, openServiceOrders: openOrders.length, customers: state.customers.filter((item) => item.status !== "inactive").length },
      attention: { overdueEntries: 0, lowStockItems: state.catalogItems.filter((item) => Number(item.minimumStockMilli) > 0 && Number(item.stockQuantityMilli) < Number(item.minimumStockMilli)).length, expiringCertificates: 0 },
      recentServiceOrders: [...state.serviceOrders].sort((a, b) => String(b.openedAt).localeCompare(String(a.openedAt))).slice(0, 5).map((order) => { const joined = joinOrder(order); return { id: order.id, number: order.number, customer: joined.customerTradeName || joined.customerName || "Cliente", equipment: [order.equipmentType, order.equipmentBrand, order.equipmentModel].filter(Boolean).join(" · "), totalCents: order.totalCents, status: order.status, openedAt: order.openedAt }; }),
      upcomingEntries: [], local: true,
    });
  }

  async function apiRequest(apiPath, options = {}) {
    if (typeof apiPath !== "string" || !apiPath.startsWith("/api/") || apiPath.includes("..")) return response(400, { error: "Rota local inválida." });
    const url = new URL(apiPath, "http://seven.local");
    const method = String(options.method || "GET").toUpperCase();
    const payload = jsonBody(options.body);
    if (url.pathname === "/api/customers") return customersApi(method, payload);
    if (url.pathname === "/api/service-orders") return serviceOrdersApi(method, payload);
    if (url.pathname === "/api/integrations") return integrationsApi(method, payload);
    if (url.pathname === "/api/nfe-drafts") return nfeApi(method, payload);
    if (url.pathname === "/api/recipient-manifestations") return manifestationsApi(method, payload);
    if (url.pathname === "/api/dashboard") return dashboardApi();
    return response(501, { error: "Este módulo ainda não possui persistência local dedicada nesta versão.", local: true, path: url.pathname });
  }

  function getPeers() { return [...state.peers]; }

  async function upsertPeer(peer) {
    const existing = state.peers.find((item) => item.id === peer.id);
    const next = { ...(existing || {}), ...peer, updatedAt: nowIso() };
    if (existing) Object.assign(existing, next); else state.peers.push(next);
    await persist();
    return next;
  }

  async function removePeer(peerId) {
    const index = state.peers.findIndex((item) => item.id === peerId);
    if (index >= 0) state.peers.splice(index, 1);
    await persist();
  }

  function exportSnapshot() {
    return {
      version: STATE_VERSION,
      customers: state.customers, serviceOrders: state.serviceOrders, integrations: state.integrations,
      nfeDrafts: state.nfeDrafts, receivedFiscalDocuments: state.receivedFiscalDocuments, manifestations: state.manifestations,
      financialEntries: state.financialEntries, catalogItems: state.catalogItems,
    };
  }

  async function importSnapshot(snapshot) {
    for (const table of ["customers", "serviceOrders", "integrations", "nfeDrafts", "receivedFiscalDocuments", "manifestations", "financialEntries", "catalogItems"]) {
      const incoming = Array.isArray(snapshot?.[table]) ? snapshot[table] : [];
      for (const record of incoming) {
        if (!record?.id) continue;
        const rows = tableFor(table);
        const existing = rows.find((item) => item.id === record.id);
        if (!existing || String(record.updatedAt || record.createdAt || "") >= String(existing.updatedAt || existing.createdAt || "")) {
          if (existing) Object.assign(existing, record); else rows.push(record);
        }
      }
    }
    await persist();
  }

  function exportChanges() { return state.changes.slice(-MAX_CHANGES); }

  async function applyChanges(changes) {
    const workspace = await getWorkspace();
    let applied = 0;
    for (const change of Array.isArray(changes) ? changes : []) {
      if (!change?.id || !change.table || !change.recordId) continue;
      if (workspace?.id && change.workspaceId && change.workspaceId !== workspace.id) continue;
      if (state.appliedChangeIds.includes(change.id)) continue;
      let rows;
      try { rows = tableFor(change.table); } catch { continue; }
      const index = rows.findIndex((item) => item.id === change.recordId);
      if (change.action === "delete") {
        if (index >= 0) rows.splice(index, 1);
      } else if (change.payload && typeof change.payload === "object") {
        const current = index >= 0 ? rows[index] : null;
        if (!current || String(change.updatedAt || "") >= String(current.updatedAt || "")) {
          if (index >= 0) rows[index] = { ...current, ...change.payload }; else rows.push(change.payload);
        }
      }
      state.appliedChangeIds.push(change.id);
      state.changes.push(change);
      applied += 1;
    }
    state.appliedChangeIds = state.appliedChangeIds.slice(-MAX_APPLIED);
    state.changes = state.changes.slice(-MAX_CHANGES);
    if (applied) await persist();
    return applied;
  }

  return { initialize, apiRequest, getPeers, upsertPeer, removePeer, exportSnapshot, importSnapshot, exportChanges, applyChanges, persist };
}
