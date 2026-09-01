import { and, desc, eq } from "drizzle-orm";
import { auditLogs, integrationConnections, syncChangeLog } from "../../../db/schema";
import { ApiError, apiErrorResponse, ensureDefaultOrganization, resolveRequestIdentity } from "../../lib/sync-auth";

const CONNECTORS = new Set([
  "nfse_national",
  "nfe_sefaz",
  "nfe_distribution",
  "cte_received",
  "mdfe_received",
  "banrisul",
  "btg",
  "certificate_partner",
  "system_policies",
  "__company_profile",
]);
const INTERNAL_CONNECTORS = new Set(["system_policies", "__company_profile"]);
const ENVIRONMENTS = new Set(["homologation", "production", "global"]);

const REQUIREMENTS: Record<string, { credential?: boolean; primary?: boolean; secondary?: boolean }> = {
  nfse_national: { credential: true, primary: true, secondary: true },
  nfe_sefaz: { credential: true, primary: true, secondary: true },
  nfe_distribution: { credential: true, primary: true },
  cte_received: { credential: true, primary: true },
  mdfe_received: { credential: true, primary: true },
  banrisul: { credential: true, primary: true, secondary: true },
  btg: { credential: true, primary: true, secondary: true },
  certificate_partner: { credential: true, primary: true },
};

type SavePayload = {
  action?: "save" | "validate";
  connector?: string;
  environment?: string;
  credentialReference?: string;
  configuration?: Record<string, unknown>;
};

function cleanText(value: unknown, maxLength = 500) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanConfiguration(input: Record<string, unknown> | undefined) {
  const output: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(input || {})) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,39}$/.test(key)) continue;
    if (typeof value === "boolean") output[key] = value;
    else if (typeof value === "number" && Number.isFinite(value)) output[key] = value;
    else if (typeof value === "string") output[key] = value.trim().slice(0, 1000);
  }
  return output;
}

function parseConfiguration(value: string | null) {
  try { return value ? JSON.parse(value) : {}; }
  catch { return {}; }
}

function validateLocalConfiguration(connector: string, credentialReference: string | null, configuration: Record<string, unknown>) {
  if (INTERNAL_CONNECTORS.has(connector)) return [];
  const required = REQUIREMENTS[connector] || {};
  const missing: string[] = [];
  if (required.credential && !credentialReference?.trim()) missing.push("referência da credencial/certificado");
  if (required.primary && !cleanText(configuration.primaryReference, 1000)) missing.push("identificação principal");
  if (required.secondary && !cleanText(configuration.secondaryReference, 1000)) missing.push("identificação secundária");
  const webhookUrl = cleanText(configuration.webhookUrl, 1000);
  if (webhookUrl && !/^https:\/\//i.test(webhookUrl)) missing.push("webhook HTTPS válido");
  return missing;
}

export async function GET(request: Request) {
  try {
    const identity = await resolveRequestIdentity(request);
    const db = await ensureDefaultOrganization();
    const rows = await db.select().from(integrationConnections)
      .where(eq(integrationConnections.organizationId, identity.organizationId))
      .orderBy(desc(integrationConnections.updatedAt));
    const connections = rows.map((row) => ({
      ...row,
      credentialReference: row.credentialReference || "",
      configuration: parseConfiguration(row.configurationJson),
      configurationJson: undefined,
    }));
    const operational = connections.filter((row) => !INTERNAL_CONNECTORS.has(row.connector));
    const fiscal = operational.find((row) => row.connector.startsWith("nf") || row.connector.endsWith("received"));
    const lastCheck = operational.map((row) => row.lastHealthCheckAt).filter(Boolean).sort().at(-1) || null;
    return Response.json({
      connections,
      coreModulesIndependent: true,
      integrationPolicy: {
        serviceOrders: "optional",
        customers: "optional",
        catalog: "optional",
        inventory: "optional",
        purchases: "optional",
        sales: "optional",
        financeManual: "optional",
        nfeDrafts: "optional",
        nfeTransmission: "required",
        bankRegistration: "required",
        externalDocumentDistribution: "required",
      },
      summary: {
        active: operational.filter((row) => row.status === "active").length,
        configured: operational.filter((row) => row.status !== "not_configured").length,
        fiscalEnvironment: fiscal?.environment || null,
        lastCheck,
      },
    });
  } catch (error) {
    return apiErrorResponse(error, "Não foi possível consultar as integrações.");
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as SavePayload;
    const connector = cleanText(payload.connector, 60);
    const environment = cleanText(payload.environment, 30) || "homologation";
    if (!CONNECTORS.has(connector)) throw new ApiError("Conector inválido.", 400);
    if (!ENVIRONMENTS.has(environment)) throw new ApiError("Ambiente inválido.", 400);
    if (INTERNAL_CONNECTORS.has(connector) && environment !== "global") throw new ApiError("Configurações internas devem usar o escopo global.", 400);
    if (!INTERNAL_CONNECTORS.has(connector) && environment === "global") throw new ApiError("Integrações externas devem usar homologação ou produção.", 400);

    const identity = await resolveRequestIdentity(request);
    const db = await ensureDefaultOrganization();
    const [existing] = await db.select().from(integrationConnections).where(and(
      eq(integrationConnections.organizationId, identity.organizationId),
      eq(integrationConnections.connector, connector),
      eq(integrationConnections.environment, environment),
    )).limit(1);

    if (payload.action === "validate") {
      if (!existing) throw new ApiError("Salve a configuração antes de verificá-la.", 409);
      const checkedAt = new Date().toISOString();
      const configuration = parseConfiguration(existing.configurationJson);
      const missing = validateLocalConfiguration(connector, existing.credentialReference, configuration);
      const isInternal = INTERNAL_CONNECTORS.has(connector);
      const nextStatus = missing.length ? "validation_failed" : isInternal ? "configuration_saved" : "external_validation_required";
      const lastError = missing.length
        ? `Complete os seguintes campos: ${missing.join(", ")}.`
        : isInternal
          ? null
          : "A configuração local está completa, mas a integração só pode ficar ativa após uma chamada autenticada real pelo aplicativo desktop.";
      await db.batch([
        db.update(integrationConnections).set({ status: nextStatus, lastHealthCheckAt: checkedAt, lastError, updatedAt: checkedAt }).where(eq(integrationConnections.id, existing.id)),
        db.insert(auditLogs).values({
          id: crypto.randomUUID(), organizationId: identity.organizationId, actorEmail: identity.actorEmail,
          action: "integration.configuration_validated", entityType: "integration_connection", entityId: existing.id,
          beforeJson: JSON.stringify({ status: existing.status }), afterJson: JSON.stringify({ status: nextStatus, lastError, source: identity.source }),
          correlationId: request.headers.get("cf-ray"),
        }),
      ]);
      return Response.json({
        status: nextStatus,
        lastError,
        checkedAt,
        externalRequestPerformed: false,
        externalValidationPending: !missing.length && !isInternal,
        coreModulesIndependent: true,
      });
    }

    const configuration = cleanConfiguration(payload.configuration);
    const credentialReference = cleanText(payload.credentialReference, 200) || null;
    const savedAt = new Date().toISOString();
    const id = existing?.id || crypto.randomUUID();
    const hasUsefulConfiguration = Boolean(credentialReference || Object.values(configuration).some((value) => String(value).trim()));
    const status = INTERNAL_CONNECTORS.has(connector) ? "configuration_saved" : hasUsefulConfiguration ? "configuration_saved" : "configuration_pending";
    const values = {
      id,
      organizationId: identity.organizationId,
      connector,
      environment,
      status,
      credentialReference,
      configurationJson: JSON.stringify(configuration),
      lastError: null,
      updatedAt: savedAt,
    };
    const publicSnapshot = { ...values, credentialReference: credentialReference ? "configured" : null, configuration };
    await db.batch([
      existing
        ? db.update(integrationConnections).set(values).where(eq(integrationConnections.id, existing.id))
        : db.insert(integrationConnections).values(values),
      db.insert(auditLogs).values({
        id: crypto.randomUUID(), organizationId: identity.organizationId, actorEmail: identity.actorEmail,
        action: "integration.configuration_saved", entityType: "integration_connection", entityId: id,
        beforeJson: existing ? JSON.stringify({ connector: existing.connector, environment: existing.environment, status: existing.status }) : null,
        afterJson: JSON.stringify({ ...publicSnapshot, source: identity.source }), correlationId: request.headers.get("cf-ray"),
      }),
      db.insert(syncChangeLog).values({
        organizationId: identity.organizationId, deviceId: identity.deviceId,
        entityType: "integration_connection", entityId: id, action: "upsert", payloadJson: JSON.stringify(publicSnapshot),
      }),
    ]);
    return Response.json({ connection: { ...values, configuration, configurationJson: undefined }, coreModulesIndependent: true }, { status: existing ? 200 : 201 });
  } catch (error) {
    return apiErrorResponse(error, "Não foi possível salvar a integração.");
  }
}

export async function DELETE(request: Request) {
  try {
    const payload = await request.json() as { connector?: string; environment?: string };
    const connector = cleanText(payload.connector, 60);
    const environment = cleanText(payload.environment, 30) || "homologation";
    if (!CONNECTORS.has(connector) || !ENVIRONMENTS.has(environment)) throw new ApiError("Configuração inválida.", 400);
    const identity = await resolveRequestIdentity(request);
    const db = await ensureDefaultOrganization();
    const [existing] = await db.select().from(integrationConnections).where(and(
      eq(integrationConnections.organizationId, identity.organizationId),
      eq(integrationConnections.connector, connector),
      eq(integrationConnections.environment, environment),
    )).limit(1);
    if (!existing) return Response.json({ removed: false, coreModulesIndependent: true });
    await db.batch([
      db.delete(integrationConnections).where(eq(integrationConnections.id, existing.id)),
      db.insert(auditLogs).values({
        id: crypto.randomUUID(), organizationId: identity.organizationId, actorEmail: identity.actorEmail,
        action: "integration.configuration_removed", entityType: "integration_connection", entityId: existing.id,
        beforeJson: JSON.stringify({ connector, environment, status: existing.status, source: identity.source }), correlationId: request.headers.get("cf-ray"),
      }),
      db.insert(syncChangeLog).values({
        organizationId: identity.organizationId, deviceId: identity.deviceId,
        entityType: "integration_connection", entityId: existing.id, action: "delete", payloadJson: JSON.stringify({ connector, environment }),
      }),
    ]);
    return Response.json({ removed: true, coreModulesIndependent: true });
  } catch (error) {
    return apiErrorResponse(error, "Não foi possível remover a configuração.");
  }
}
