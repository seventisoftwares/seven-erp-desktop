import { apiErrorResponse, resolveRequestIdentity } from "../../../lib/sync-auth";

export async function GET(request: Request) {
  try {
    const identity = await resolveRequestIdentity(request);
    return Response.json({
      online: true,
      organizationId: identity.organizationId,
      deviceId: identity.deviceId,
      deviceName: identity.deviceName,
      source: identity.source,
      serverTime: new Date().toISOString(),
      apiVersion: "2026-08-16",
    });
  } catch (error) {
    return apiErrorResponse(error, "Não foi possível validar a conexão.");
  }
}
