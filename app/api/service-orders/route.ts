import { and, desc, eq } from "drizzle-orm";
import { auditLogs, parties, serviceOrders, syncChangeLog, syncOperations } from "../../../db/schema";
import { ApiError, apiErrorResponse, ensureDefaultOrganization, resolveRequestIdentity, sha256 } from "../../lib/sync-auth";

const moneyToCents = (value: unknown) => Math.max(0, Math.round((Number(value) || 0) * 100));
const cleanText = (value: unknown, maxLength = 1000) => typeof value === "string" ? value.trim().slice(0, maxLength) : "";

const allowedStatuses = new Set(["open", "diagnosis", "waiting_approval", "approved", "in_progress", "finished", "delivered", "cancelled"]);
const allowedPriorities = new Set(["low", "normal", "high", "urgent"]);

export async function GET(request: Request) {
  try {
    const identity = await resolveRequestIdentity(request);
    const db = await ensureDefaultOrganization();
    const rows = await db.select({
      id: serviceOrders.id,
      organizationId: serviceOrders.organizationId,
      partyId: serviceOrders.partyId,
      number: serviceOrders.number,
      status: serviceOrders.status,
      priority: serviceOrders.priority,
      equipmentType: serviceOrders.equipmentType,
      equipmentBrand: serviceOrders.equipmentBrand,
      equipmentModel: serviceOrders.equipmentModel,
      serialNumber: serviceOrders.serialNumber,
      reportedIssue: serviceOrders.reportedIssue,
      diagnosis: serviceOrders.diagnosis,
      solution: serviceOrders.solution,
      technicianEmail: serviceOrders.technicianEmail,
      laborCents: serviceOrders.laborCents,
      partsCents: serviceOrders.partsCents,
      totalCents: serviceOrders.totalCents,
      openedAt: serviceOrders.openedAt,
      closedAt: serviceOrders.closedAt,
      createdAt: serviceOrders.createdAt,
      updatedAt: serviceOrders.updatedAt,
      customerName: parties.legalName,
      customerTradeName: parties.tradeName,
      customerTaxId: parties.taxId,
      customerPhone: parties.phone,
      customerEmail: parties.email,
    }).from(serviceOrders)
      .leftJoin(parties, eq(serviceOrders.partyId, parties.id))
      .where(eq(serviceOrders.organizationId, identity.organizationId))
      .orderBy(desc(serviceOrders.number))
      .limit(250);

    return Response.json({ orders: rows, integrationRequired: false });
  } catch (error) {
    return apiErrorResponse(error, "Não foi possível consultar as ordens de serviço");
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const partyId = cleanText(payload.partyId, 100);
    const reportedIssue = cleanText(payload.reportedIssue, 4000);
    if (!partyId) throw new ApiError("Selecione o cliente da ordem de serviço.", 400);
    if (!reportedIssue) throw new ApiError("Descreva o defeito ou serviço solicitado.", 400);

    const identity = await resolveRequestIdentity(request);
    const db = await ensureDefaultOrganization();
    const [customer] = await db.select({ id: parties.id }).from(parties).where(and(
      eq(parties.id, partyId),
      eq(parties.organizationId, identity.organizationId),
      eq(parties.kind, "customer"),
    )).limit(1);
    if (!customer) throw new ApiError("Cliente não encontrado nesta empresa.", 404);

    const operationId = request.headers.get("x-seven-operation-id")?.trim() || cleanText(payload.operationId, 100) || crypto.randomUUID();
    const [duplicate] = await db.select({ resultJson: syncOperations.resultJson }).from(syncOperations).where(and(
      eq(syncOperations.organizationId, identity.organizationId),
      eq(syncOperations.operationId, operationId),
    )).limit(1);
    if (duplicate?.resultJson) return Response.json(JSON.parse(duplicate.resultJson));

    const [lastOrder] = await db.select({ number: serviceOrders.number }).from(serviceOrders)
      .where(eq(serviceOrders.organizationId, identity.organizationId))
      .orderBy(desc(serviceOrders.number)).limit(1);
    const number = (lastOrder?.number || 0) + 1;
    const id = crypto.randomUUID();
    const laborCents = moneyToCents(payload.labor);
    const partsCents = moneyToCents(payload.parts);
    const priority = cleanText(payload.priority, 20);
    const now = new Date().toISOString();
    const order = {
      id,
      organizationId: identity.organizationId,
      partyId,
      number,
      status: "open",
      priority: allowedPriorities.has(priority) ? priority : "normal",
      equipmentType: cleanText(payload.equipmentType, 120) || null,
      equipmentBrand: cleanText(payload.equipmentBrand, 120) || null,
      equipmentModel: cleanText(payload.equipmentModel, 160) || null,
      serialNumber: cleanText(payload.serialNumber, 160) || null,
      reportedIssue,
      diagnosis: cleanText(payload.diagnosis, 4000) || null,
      solution: null,
      technicianEmail: cleanText(payload.technicianEmail, 240).toLowerCase() || identity.actorEmail || null,
      laborCents,
      partsCents,
      totalCents: laborCents + partsCents,
      openedAt: now,
    };
    const result = { order, synced: true, operationId, integrationRequired: false };

    await db.batch([
      db.insert(serviceOrders).values(order),
      db.insert(auditLogs).values({
        id: crypto.randomUUID(), organizationId: identity.organizationId, actorEmail: identity.actorEmail,
        action: "service_order.created", entityType: "service_order", entityId: id,
        afterJson: JSON.stringify(order), correlationId: request.headers.get("cf-ray"),
      }),
      db.insert(syncOperations).values({
        id: crypto.randomUUID(), organizationId: identity.organizationId, deviceId: identity.deviceId,
        operationId, entityType: "service_order", entityId: id, action: "create",
        payloadHash: await sha256(JSON.stringify(payload)), resultJson: JSON.stringify(result),
      }),
      db.insert(syncChangeLog).values({
        organizationId: identity.organizationId, deviceId: identity.deviceId,
        entityType: "service_order", entityId: id, action: "upsert", payloadJson: JSON.stringify(order),
      }),
    ]);

    return Response.json(result, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "Não foi possível criar a ordem de serviço");
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const id = cleanText(payload.id, 100);
    if (!id) throw new ApiError("Ordem de serviço não informada.", 400);
    const identity = await resolveRequestIdentity(request);
    const db = await ensureDefaultOrganization();
    const [existing] = await db.select().from(serviceOrders).where(and(
      eq(serviceOrders.id, id),
      eq(serviceOrders.organizationId, identity.organizationId),
    )).limit(1);
    if (!existing) throw new ApiError("Ordem de serviço não encontrada.", 404);

    const statusInput = cleanText(payload.status, 30);
    const status = allowedStatuses.has(statusInput) ? statusInput : existing.status;
    const priorityInput = cleanText(payload.priority, 20);
    const priority = allowedPriorities.has(priorityInput) ? priorityInput : existing.priority;
    const laborCents = payload.labor === undefined ? existing.laborCents : moneyToCents(payload.labor);
    const partsCents = payload.parts === undefined ? existing.partsCents : moneyToCents(payload.parts);
    const updatedAt = new Date().toISOString();
    const closedAt = ["finished", "delivered", "cancelled"].includes(status) ? existing.closedAt || updatedAt : null;
    const changes = {
      status,
      priority,
      diagnosis: payload.diagnosis === undefined ? existing.diagnosis : cleanText(payload.diagnosis, 4000) || null,
      solution: payload.solution === undefined ? existing.solution : cleanText(payload.solution, 4000) || null,
      technicianEmail: payload.technicianEmail === undefined ? existing.technicianEmail : cleanText(payload.technicianEmail, 240).toLowerCase() || null,
      laborCents,
      partsCents,
      totalCents: laborCents + partsCents,
      closedAt,
      updatedAt,
    };
    const snapshot = { ...existing, ...changes };

    await db.batch([
      db.update(serviceOrders).set(changes).where(eq(serviceOrders.id, id)),
      db.insert(auditLogs).values({
        id: crypto.randomUUID(), organizationId: identity.organizationId, actorEmail: identity.actorEmail,
        action: "service_order.updated", entityType: "service_order", entityId: id,
        beforeJson: JSON.stringify(existing), afterJson: JSON.stringify(snapshot), correlationId: request.headers.get("cf-ray"),
      }),
      db.insert(syncChangeLog).values({
        organizationId: identity.organizationId, deviceId: identity.deviceId,
        entityType: "service_order", entityId: id, action: "upsert", payloadJson: JSON.stringify(snapshot),
      }),
    ]);

    return Response.json({ order: snapshot, integrationRequired: false });
  } catch (error) {
    return apiErrorResponse(error, "Não foi possível atualizar a ordem de serviço");
  }
}
