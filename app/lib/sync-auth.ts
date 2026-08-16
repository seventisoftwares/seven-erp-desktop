import { and, eq } from "drizzle-orm";
import { getDb } from "../../db";
import { organizationMembers, organizations, syncDevices } from "../../db/schema";

export const DEFAULT_ORGANIZATION_ID = "seven-ti";

export class ApiError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export type RequestIdentity = {
  organizationId: string;
  actorEmail: string | null;
  deviceId: string | null;
  deviceName: string | null;
  source: "desktop" | "web" | "preview";
};

export async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function randomToken(byteLength = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function ensureDefaultOrganization() {
  const db = await getDb();
  await db.insert(organizations).values({
    id: DEFAULT_ORGANIZATION_ID,
    legalName: "Seven TI Tecnologia & Serviços LTDA",
    tradeName: "Seven TI",
    taxId: null,
    taxRegime: null,
    cityCode: null,
    state: null,
  }).onConflictDoNothing();
  return db;
}

async function configuredOwnerEmail() {
  try {
    const { env } = await import("cloudflare:workers");
    const value = (env as unknown as Record<string, unknown>).ERP_OWNER_EMAIL;
    return typeof value === "string" ? value.trim().toLowerCase() : "";
  } catch {
    return "";
  }
}

export async function resolveRequestIdentity(request: Request): Promise<RequestIdentity> {
  const db = await ensureDefaultOrganization();
  const authorization = request.headers.get("authorization");
  if (authorization) {
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) throw new ApiError("Credencial do dispositivo inválida.", 401);
    const tokenHash = await sha256(match[1]);
    const [device] = await db.select().from(syncDevices)
      .where(and(eq(syncDevices.tokenHash, tokenHash), eq(syncDevices.status, "active"))).limit(1);
    if (!device) throw new ApiError("Dispositivo não autorizado ou revogado.", 401);
    await db.update(syncDevices).set({ lastSeenAt: new Date().toISOString(), updatedAt: new Date().toISOString() }).where(eq(syncDevices.id, device.id));
    return { organizationId: device.organizationId, actorEmail: null, deviceId: device.id, deviceName: device.name, source: "desktop" };
  }

  const email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase() || "";
  if (email) {
    const ownerEmail = await configuredOwnerEmail();
    const [member] = await db.select({ id: organizationMembers.id }).from(organizationMembers)
      .where(and(
        eq(organizationMembers.organizationId, DEFAULT_ORGANIZATION_ID),
        eq(organizationMembers.email, email),
        eq(organizationMembers.status, "active"),
      )).limit(1);
    if (ownerEmail && email !== ownerEmail && !member) throw new ApiError("Seu usuário não pertence a esta empresa.", 403);
    return { organizationId: DEFAULT_ORGANIZATION_ID, actorEmail: email, deviceId: null, deviceName: null, source: "web" };
  }

  const hostname = new URL(request.url).hostname;
  if (hostname === "terminal.local" || hostname === "localhost") {
    return { organizationId: DEFAULT_ORGANIZATION_ID, actorEmail: "preview@seven.local", deviceId: null, deviceName: "Prévia local", source: "preview" };
  }
  throw new ApiError("Autenticação necessária.", 401);
}

export function apiErrorResponse(error: unknown, fallback: string) {
  if (error instanceof ApiError) return Response.json({ error: error.message }, { status: error.status });
  const message = error instanceof Error ? error.message : fallback;
  return Response.json({ error: message }, { status: 500 });
}
