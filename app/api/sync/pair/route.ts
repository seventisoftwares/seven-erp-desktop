import { and, eq, gt, isNull } from "drizzle-orm";
import { devicePairingCodes, syncDevices } from "../../../../db/schema";
import { apiErrorResponse, ensureDefaultOrganization, randomToken, sha256 } from "../../../lib/sync-auth";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { code?: string; deviceName?: string; platform?: string; installationId?: string; appVersion?: string };
    const code = payload.code?.toUpperCase().replace(/[^A-Z0-9]/g, "") || "";
    const deviceName = payload.deviceName?.trim().slice(0, 80) || "Computador sem nome";
    const platform = payload.platform?.trim().slice(0, 30) || "unknown";
    const installationId = payload.installationId?.trim().slice(0, 120) || "";
    if (code.length !== 8 || !installationId) return Response.json({ error: "Código ou identificação do computador inválidos." }, { status: 400 });

    const db = await ensureDefaultOrganization();
    const now = new Date().toISOString();
    const [pairing] = await db.select().from(devicePairingCodes).where(and(
      eq(devicePairingCodes.codeHash, await sha256(code)),
      isNull(devicePairingCodes.usedAt),
      gt(devicePairingCodes.expiresAt, now),
    )).limit(1);
    if (!pairing) return Response.json({ error: "Código expirado, já utilizado ou inválido." }, { status: 401 });

    const token = randomToken(32);
    const tokenHash = await sha256(token);
    const proposedDeviceId = crypto.randomUUID();
    await db.insert(syncDevices).values({
      id: proposedDeviceId,
      organizationId: pairing.organizationId,
      name: deviceName,
      platform,
      installationId,
      tokenHash,
      appVersion: payload.appVersion?.trim().slice(0, 30) || null,
      lastSeenAt: now,
    }).onConflictDoUpdate({
      target: [syncDevices.organizationId, syncDevices.installationId],
      set: { name: deviceName, platform, tokenHash, appVersion: payload.appVersion?.trim().slice(0, 30) || null, status: "active", lastSeenAt: now, updatedAt: now },
    });
    await db.update(devicePairingCodes).set({ usedAt: now }).where(eq(devicePairingCodes.id, pairing.id));
    const [device] = await db.select().from(syncDevices).where(and(eq(syncDevices.organizationId, pairing.organizationId), eq(syncDevices.installationId, installationId))).limit(1);
    if (!device) throw new Error("O dispositivo foi criado, mas não pôde ser recuperado.");

    return Response.json({
      token,
      device: { id: device.id, name: device.name, platform: device.platform, organizationId: device.organizationId },
      sync: { cursor: device.lastSyncCursor, intervalSeconds: 30 },
    }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "Não foi possível autorizar este computador.");
  }
}
