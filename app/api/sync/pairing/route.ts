import { and, desc, eq } from "drizzle-orm";
import { auditLogs, devicePairingCodes, syncDevices } from "../../../../db/schema";
import { ApiError, apiErrorResponse, randomToken, resolveRequestIdentity, sha256 } from "../../../lib/sync-auth";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function createPairingCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
}

export async function GET(request: Request) {
  try {
    const identity = await resolveRequestIdentity(request);
    if (identity.source === "desktop") throw new ApiError("Somente administradores podem consultar dispositivos.", 403);
    const { getDb } = await import("../../../../db");
    const db = await getDb();
    const devices = await db.select({
      id: syncDevices.id,
      name: syncDevices.name,
      platform: syncDevices.platform,
      appVersion: syncDevices.appVersion,
      status: syncDevices.status,
      lastSeenAt: syncDevices.lastSeenAt,
      lastSyncCursor: syncDevices.lastSyncCursor,
      createdAt: syncDevices.createdAt,
    }).from(syncDevices).where(eq(syncDevices.organizationId, identity.organizationId)).orderBy(desc(syncDevices.createdAt));
    return Response.json({ devices });
  } catch (error) {
    return apiErrorResponse(error, "Não foi possível consultar os dispositivos.");
  }
}

export async function DELETE(request: Request) {
  try {
    const identity = await resolveRequestIdentity(request);
    if (identity.source === "desktop") throw new ApiError("Revogue dispositivos pelo painel administrativo web.", 403);
    const payload = await request.json() as { deviceId?: string };
    if (!payload.deviceId) throw new ApiError("Dispositivo não informado.", 400);
    const { getDb } = await import("../../../../db");
    const db = await getDb();
    const updatedAt = new Date().toISOString();
    await db.update(syncDevices).set({ status: "revoked", updatedAt }).where(and(
      eq(syncDevices.id, payload.deviceId),
      eq(syncDevices.organizationId, identity.organizationId),
    ));
    await db.insert(auditLogs).values({
      id: crypto.randomUUID(), organizationId: identity.organizationId, actorEmail: identity.actorEmail,
      action: "sync.device.revoked", entityType: "sync_device", entityId: payload.deviceId,
      afterJson: JSON.stringify({ status: "revoked", updatedAt }), correlationId: request.headers.get("cf-ray"),
    });
    return Response.json({ revoked: true, deviceId: payload.deviceId });
  } catch (error) {
    return apiErrorResponse(error, "Não foi possível revogar o dispositivo.");
  }
}

export async function POST(request: Request) {
  try {
    const identity = await resolveRequestIdentity(request);
    if (identity.source === "desktop") return Response.json({ error: "Gere códigos pelo painel administrativo web." }, { status: 403 });
    const { getDb } = await import("../../../../db");
    const db = await getDb();
    const code = createPairingCode();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
    const pairingId = crypto.randomUUID();
    await db.batch([
      db.insert(devicePairingCodes).values({
        id: pairingId,
        organizationId: identity.organizationId,
        codeHash: await sha256(code),
        expiresAt,
        createdBy: identity.actorEmail,
      }),
      db.insert(auditLogs).values({
        id: crypto.randomUUID(),
        organizationId: identity.organizationId,
        actorEmail: identity.actorEmail,
        action: "sync.pairing_code.created",
        entityType: "device_pairing_code",
        entityId: pairingId,
        afterJson: JSON.stringify({ expiresAt }),
        correlationId: request.headers.get("cf-ray") || randomToken(8),
      }),
    ]);
    return Response.json({ code, expiresAt, validForSeconds: 900 }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "Não foi possível gerar o código de pareamento.");
  }
}
