import { and, desc, eq } from "drizzle-orm";
import {
  auditLogs,
  organizationSubscriptions,
  receivedFiscalDocuments,
  recipientManifestations,
  syncChangeLog,
} from "../../../db/schema";
import { apiErrorResponse, ensureDefaultOrganization, resolveRequestIdentity } from "../../lib/sync-auth";
const EVENT_CODES = {
  science: "210210",
  confirmation: "210200",
  unknown: "210220",
  operation_not_performed: "210240",
} as const;

type ManifestEventType = keyof typeof EVENT_CODES;

async function ensureOrganization(organizationId: string) {
  const db = await ensureDefaultOrganization();
  await db.insert(organizationSubscriptions).values({
    id: `subscription-${organizationId}`,
    organizationId,
    deploymentMode: "internal_and_saas",
    planCode: "seven_internal",
    status: "active",
  }).onConflictDoNothing();
  return db;
}

export async function GET(request: Request) {
  try {
    const identity = await resolveRequestIdentity(request);
    const db = await ensureOrganization(identity.organizationId);
    const documents = await db.select().from(receivedFiscalDocuments)
      .where(eq(receivedFiscalDocuments.organizationId, identity.organizationId))
      .orderBy(desc(receivedFiscalDocuments.issueDate)).limit(100);
    const events = await db.select().from(recipientManifestations)
      .where(eq(recipientManifestations.organizationId, identity.organizationId))
      .orderBy(desc(recipientManifestations.createdAt)).limit(200);
    return Response.json({ documents, events, transmissionEnabled: false });
  } catch (error) {
    return apiErrorResponse(error, "Não foi possível consultar as manifestações");
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as {
      eventType?: ManifestEventType;
      justification?: string;
      idempotencyKey?: string;
      document?: {
        accessKey?: string;
        nsu?: string;
        issuerName?: string;
        issuerTaxId?: string;
        issueDate?: string;
        totalCents?: number;
      };
    };

    const eventType = payload.eventType;
    if (!eventType || !(eventType in EVENT_CODES)) {
      return Response.json({ error: "Evento de manifestação inválido" }, { status: 400 });
    }

    const accessKey = payload.document?.accessKey?.replace(/\D/g, "") || "";
    if (!/^\d{44}$/.test(accessKey)) {
      return Response.json({ error: "A chave de acesso da NF-e deve conter 44 dígitos" }, { status: 400 });
    }

    const issuerName = payload.document?.issuerName?.trim();
    if (!issuerName) return Response.json({ error: "Emitente da NF-e é obrigatório" }, { status: 400 });

    const justification = payload.justification?.trim() || null;
    if (eventType === "operation_not_performed" && (!justification || justification.length < 15 || justification.length > 255)) {
      return Response.json({ error: "A justificativa deve conter entre 15 e 255 caracteres" }, { status: 400 });
    }

    const identity = await resolveRequestIdentity(request);
    const db = await ensureOrganization(identity.organizationId);
    const requestedIdempotencyKey = payload.idempotencyKey?.trim() || request.headers.get("x-seven-operation-id")?.trim();
    const idempotencyKey = requestedIdempotencyKey && requestedIdempotencyKey.length <= 160
      ? requestedIdempotencyKey
      : crypto.randomUUID();

    const [duplicate] = await db.select().from(recipientManifestations)
      .where(and(
        eq(recipientManifestations.organizationId, identity.organizationId),
        eq(recipientManifestations.idempotencyKey, idempotencyKey),
      )).limit(1);
    if (duplicate) return Response.json({ manifestation: duplicate, transmissionEnabled: false });

    const [existingDocument] = await db.select({ id: receivedFiscalDocuments.id }).from(receivedFiscalDocuments)
      .where(and(
        eq(receivedFiscalDocuments.organizationId, identity.organizationId),
        eq(receivedFiscalDocuments.accessKey, accessKey),
      )).limit(1);

    const documentId = existingDocument?.id || crypto.randomUUID();
    if (!existingDocument) {
      await db.insert(receivedFiscalDocuments).values({
        id: documentId,
        organizationId: identity.organizationId,
        source: "manual_import",
        model: "55",
        nsu: payload.document?.nsu?.trim() || null,
        accessKey,
        issuerName,
        issuerTaxId: payload.document?.issuerTaxId?.trim() || null,
        issueDate: payload.document?.issueDate || null,
        totalCents: Math.max(0, Math.round(Number(payload.document?.totalCents) || 0)),
        manifestationStatus: "not_manifested",
        distributionResponseJson: JSON.stringify({ importedManually: true, transmissionEnabled: false }),
      });
    }

    const previousEvents = await db.select({ id: recipientManifestations.id }).from(recipientManifestations)
      .where(and(
        eq(recipientManifestations.receivedDocumentId, documentId),
        eq(recipientManifestations.eventCode, EVENT_CODES[eventType]),
      ));
    const manifestationId = crypto.randomUUID();
    const manifestation = {
      id: manifestationId,
      organizationId: identity.organizationId,
      receivedDocumentId: documentId,
      eventType,
      eventCode: EVENT_CODES[eventType],
      sequence: previousEvents.length + 1,
      justification,
      environment: "homologation",
      status: "draft",
      idempotencyKey,
      createdBy: identity.actorEmail || `device:${identity.deviceId}`,
    };

    await db.batch([
      db.insert(recipientManifestations).values(manifestation),
      db.update(receivedFiscalDocuments).set({
        manifestationStatus: "draft",
        latestEventCode: EVENT_CODES[eventType],
        updatedAt: new Date().toISOString(),
      }).where(eq(receivedFiscalDocuments.id, documentId)),
      db.insert(auditLogs).values({
        id: crypto.randomUUID(),
        organizationId: identity.organizationId,
        actorEmail: identity.actorEmail,
        action: "recipient_manifestation.draft_created",
        entityType: "recipient_manifestation",
        entityId: manifestationId,
        afterJson: JSON.stringify({ ...manifestation, transmissionEnabled: false }),
        correlationId: request.headers.get("cf-ray"),
      }),
      db.insert(syncChangeLog).values({
        organizationId: identity.organizationId,
        deviceId: identity.deviceId,
        entityType: "recipient_manifestation",
        entityId: manifestationId,
        action: "upsert",
        payloadJson: JSON.stringify(manifestation),
      }),
    ]);

    return Response.json({ manifestation, transmissionEnabled: false }, { status: 201 });
  } catch (error) {
    console.error("recipient_manifestation.draft_failed", error);
    return apiErrorResponse(error, "Não foi possível salvar o rascunho fiscal. Tente novamente.");
  }
}
