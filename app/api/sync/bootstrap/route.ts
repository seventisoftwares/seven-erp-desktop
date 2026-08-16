import { and, asc, eq, gt } from "drizzle-orm";
import { getDb } from "../../../../db";
import { integrationConnections, nfeDrafts, parties, syncChangeLog, syncDevices } from "../../../../db/schema";
import { apiErrorResponse, resolveRequestIdentity } from "../../../lib/sync-auth";

export async function GET(request: Request) {
  try {
    const identity = await resolveRequestIdentity(request);
    const db = await getDb();
    const url = new URL(request.url);
    const requestedCursor = Math.max(0, Number.parseInt(url.searchParams.get("cursor") || "0", 10) || 0);
    const changes = await db.select().from(syncChangeLog).where(and(
      eq(syncChangeLog.organizationId, identity.organizationId),
      gt(syncChangeLog.id, requestedCursor),
    )).orderBy(asc(syncChangeLog.id)).limit(500);
    const nextCursor = changes.length ? changes[changes.length - 1].id : requestedCursor;
    const snapshot = requestedCursor === 0 ? {
      customers: await db.select().from(parties).where(and(eq(parties.organizationId, identity.organizationId), eq(parties.kind, "customer"))).limit(1000),
      nfeDrafts: await db.select().from(nfeDrafts).where(eq(nfeDrafts.organizationId, identity.organizationId)).limit(1000),
      integrations: await db.select().from(integrationConnections).where(eq(integrationConnections.organizationId, identity.organizationId)).limit(100),
    } : null;

    if (identity.deviceId) await db.update(syncDevices).set({ lastSyncCursor: nextCursor, lastSeenAt: new Date().toISOString(), updatedAt: new Date().toISOString() }).where(eq(syncDevices.id, identity.deviceId));
    return Response.json({ cursor: nextCursor, hasMore: changes.length === 500, changes, snapshot, serverTime: new Date().toISOString() });
  } catch (error) {
    return apiErrorResponse(error, "Não foi possível sincronizar a base local.");
  }
}
