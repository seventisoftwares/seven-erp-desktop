import { and, desc, eq } from "drizzle-orm";
import { auditLogs, parties, syncChangeLog, syncOperations } from "../../../db/schema";
import { apiErrorResponse, ensureDefaultOrganization, resolveRequestIdentity, sha256 } from "../../lib/sync-auth";

export async function GET(request: Request) {
  try {
    const identity = await resolveRequestIdentity(request);
    const db = await ensureDefaultOrganization();
    const customers = await db.select().from(parties)
      .where(and(eq(parties.organizationId, identity.organizationId), eq(parties.kind, "customer")))
      .orderBy(desc(parties.createdAt)).limit(100);
    return Response.json({ customers });
  } catch (error) {
    return apiErrorResponse(error, "Não foi possível consultar clientes");
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as {
      legalName?: string; tradeName?: string; taxId?: string; personType?: string;
      email?: string; phone?: string; city?: string; state?: string; operationId?: string;
    };
    const legalName = payload.legalName?.trim();
    if (!legalName) return Response.json({ error: "Razão social ou nome é obrigatório" }, { status: 400 });

    const identity = await resolveRequestIdentity(request);
    const db = await ensureDefaultOrganization();
    const operationId = request.headers.get("x-seven-operation-id")?.trim() || payload.operationId?.trim() || crypto.randomUUID();
    const [duplicate] = await db.select({ resultJson: syncOperations.resultJson }).from(syncOperations)
      .where(and(eq(syncOperations.organizationId, identity.organizationId), eq(syncOperations.operationId, operationId))).limit(1);
    if (duplicate?.resultJson) return Response.json(JSON.parse(duplicate.resultJson));
    const id = crypto.randomUUID();
    const customer = {
      id,
      organizationId: identity.organizationId,
      kind: "customer",
      personType: payload.personType === "individual" ? "individual" : "legal",
      legalName,
      tradeName: payload.tradeName?.trim() || null,
      taxId: payload.taxId?.trim().toUpperCase() || null,
      email: payload.email?.trim().toLowerCase() || null,
      phone: payload.phone?.trim() || null,
      city: payload.city?.trim() || null,
      state: payload.state?.trim().toUpperCase() || "RS",
    };
    const result = { customer, synced: true, operationId };
    await db.batch([
      db.insert(parties).values(customer),
      db.insert(auditLogs).values({
        id: crypto.randomUUID(), organizationId: identity.organizationId,
        actorEmail: identity.actorEmail,
        action: "customer.created", entityType: "party", entityId: id,
        afterJson: JSON.stringify(customer), correlationId: request.headers.get("cf-ray"),
      }),
      db.insert(syncOperations).values({
        id: crypto.randomUUID(), organizationId: identity.organizationId, deviceId: identity.deviceId,
        operationId, entityType: "customer", entityId: id, action: "create",
        payloadHash: await sha256(JSON.stringify(payload)), resultJson: JSON.stringify(result),
      }),
      db.insert(syncChangeLog).values({
        organizationId: identity.organizationId, deviceId: identity.deviceId,
        entityType: "customer", entityId: id, action: "upsert", payloadJson: JSON.stringify(customer),
      }),
    ]);
    return Response.json(result, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "Não foi possível criar o cliente");
  }
}
