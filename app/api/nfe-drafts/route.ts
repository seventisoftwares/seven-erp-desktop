import { and, desc, eq, inArray } from "drizzle-orm";
import {
  auditLogs,
  fiscalEstablishments,
  nfeDraftItems,
  nfeDrafts,
  syncChangeLog,
} from "../../../db/schema";
import { apiErrorResponse, ensureDefaultOrganization, resolveRequestIdentity } from "../../lib/sync-auth";

type DraftItemInput = {
  description?: string;
  ncm?: string;
  cest?: string;
  cfop?: string;
  unit?: string;
  quantity?: number;
  unitPrice?: number;
  origin?: string;
  cst?: string;
  csosn?: string;
};

type DraftInput = {
  action?: "save" | "transmit";
  natureOperation?: string;
  purpose?: string;
  finalConsumer?: boolean;
  presenceIndicator?: string;
  freightMode?: string;
  recipientName?: string;
  recipientTaxId?: string;
  recipientStateRegistration?: string;
  recipientEmail?: string;
  recipientState?: string;
  recipientCityCode?: string;
  freight?: number;
  discount?: number;
  other?: number;
  notes?: string;
  items?: DraftItemInput[];
  idempotencyKey?: string;
};

const onlyDigits = (value: string) => value.replace(/\D/g, "");
const normalizeTaxId = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");
const moneyToCents = (value: unknown) => Math.max(0, Math.round((Number(value) || 0) * 100));

function validateDraft(payload: DraftInput) {
  const errors: string[] = [];
  const taxId = normalizeTaxId(payload.recipientTaxId || "");
  const items = Array.isArray(payload.items) ? payload.items : [];

  if (!payload.natureOperation?.trim()) errors.push("Informe a natureza da operação.");
  if (!payload.recipientName?.trim()) errors.push("Informe o destinatário.");
  if (!taxId) errors.push("Informe o CPF ou CNPJ do destinatário.");
  else if (!(onlyDigits(taxId).length === 11 && taxId.length === 11) && taxId.length !== 14) errors.push("CPF/CNPJ deve ter 11 dígitos ou 14 caracteres no padrão do CNPJ.");
  if (payload.recipientCityCode && !/^\d{7}$/.test(payload.recipientCityCode)) errors.push("Código IBGE do município deve ter 7 dígitos.");
  if (!items.length) errors.push("Inclua ao menos um item na NF-e.");

  items.forEach((item, index) => {
    const label = `Item ${index + 1}`;
    if (!item.description?.trim()) errors.push(`${label}: informe a descrição.`);
    if (!/^\d{8}$/.test(onlyDigits(item.ncm || ""))) errors.push(`${label}: NCM deve ter 8 dígitos.`);
    if (!/^\d{4}$/.test(onlyDigits(item.cfop || ""))) errors.push(`${label}: CFOP deve ter 4 dígitos.`);
    if (!(Number(item.quantity) > 0)) errors.push(`${label}: quantidade deve ser maior que zero.`);
    if (!(Number(item.unitPrice) > 0)) errors.push(`${label}: valor unitário deve ser maior que zero.`);
    if (!item.csosn?.trim() && !item.cst?.trim()) errors.push(`${label}: informe CSOSN ou CST.`);
  });

  return errors;
}

function readinessFor(establishment?: typeof fiscalEstablishments.$inferSelect) {
  return {
    transmissionEnabled: Boolean(
      establishment?.status === "active" &&
      establishment?.certificateReference &&
      establishment?.credentialStatus === "ready" &&
      establishment?.taxProfileStatus === "ready"
    ),
    environment: establishment?.environment || "homologation",
    blockers: [
      !establishment ? "Cadastrar e validar o estabelecimento emitente." : null,
      !establishment?.certificateReference ? "Vincular certificado digital A1 válido." : null,
      establishment?.credentialStatus !== "ready" ? "Concluir credenciamento e homologação na SEFAZ/SVRS." : null,
      establishment?.taxProfileStatus !== "ready" ? "Revisar regime e regras tributárias de ICMS, PIS, COFINS, CBS e IBS." : null,
    ].filter(Boolean),
    protocol: { documentVersion: "NF-e 4.00", schemaVersion: "010e_v1.01", manualVersion: "MOC 7.0" },
  };
}

export async function GET(request: Request) {
  try {
    const identity = await resolveRequestIdentity(request);
    const db = await ensureDefaultOrganization();
    const [establishment] = await db.select().from(fiscalEstablishments)
      .where(eq(fiscalEstablishments.organizationId, identity.organizationId)).limit(1);
    const drafts = await db.select().from(nfeDrafts)
      .where(eq(nfeDrafts.organizationId, identity.organizationId))
      .orderBy(desc(nfeDrafts.createdAt)).limit(100);
    const items = drafts.length
      ? await db.select().from(nfeDraftItems).where(inArray(nfeDraftItems.draftId, drafts.map((draft) => draft.id)))
      : [];

    return Response.json({
      drafts: drafts.map((draft) => ({ ...draft, items: items.filter((item) => item.draftId === draft.id) })),
      readiness: readinessFor(establishment),
    });
  } catch (error) {
    return apiErrorResponse(error, "Não foi possível consultar os rascunhos de NF-e");
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as DraftInput;
    const identity = await resolveRequestIdentity(request);
    const db = await ensureDefaultOrganization();
    const [establishment] = await db.select().from(fiscalEstablishments)
      .where(eq(fiscalEstablishments.organizationId, identity.organizationId)).limit(1);
    const readiness = readinessFor(establishment);

    if (payload.action === "transmit") {
      return Response.json({
        error: "Transmissão bloqueada com segurança: conclua a configuração fiscal antes de enviar à SEFAZ.",
        readiness,
      }, { status: 422 });
    }

    const inputs = Array.isArray(payload.items) ? payload.items.slice(0, 100) : [];
    const validationErrors = validateDraft({ ...payload, items: inputs });
    const idempotencyKey = payload.idempotencyKey?.trim() || request.headers.get("x-seven-operation-id")?.trim() || crypto.randomUUID();
    const [existingDraft] = await db.select().from(nfeDrafts).where(and(
      eq(nfeDrafts.organizationId, identity.organizationId),
      eq(nfeDrafts.idempotencyKey, idempotencyKey),
    )).limit(1);
    if (existingDraft) {
      const existingItems = await db.select().from(nfeDraftItems).where(eq(nfeDraftItems.draftId, existingDraft.id));
      return Response.json({ draft: { ...existingDraft, items: existingItems }, validationErrors: JSON.parse(existingDraft.validationJson || "{}").errors || [], readiness, duplicate: true });
    }
    const draftId = crypto.randomUUID();
    const itemRows = inputs.map((item, index) => {
      const quantity = Math.max(0, Number(item.quantity) || 0);
      const unitPrice = Math.max(0, Number(item.unitPrice) || 0);
      return {
        id: crypto.randomUUID(),
        draftId,
        itemNumber: index + 1,
        description: item.description?.trim() || "Item sem descrição",
        ncm: onlyDigits(item.ncm || ""),
        cest: onlyDigits(item.cest || "") || null,
        cfop: onlyDigits(item.cfop || ""),
        unit: item.unit?.trim().toUpperCase() || "UN",
        quantityMilli: Math.round(quantity * 1000),
        unitPriceCents: Math.round(unitPrice * 100),
        totalCents: Math.round(quantity * unitPrice * 100),
        origin: item.origin?.trim() || "0",
        cst: item.cst?.trim() || null,
        csosn: item.csosn?.trim() || null,
      };
    });
    const productsTotalCents = itemRows.reduce((sum, item) => sum + item.totalCents, 0);
    const freightCents = moneyToCents(payload.freight);
    const discountCents = moneyToCents(payload.discount);
    const otherCents = moneyToCents(payload.other);
    const totalCents = Math.max(0, productsTotalCents + freightCents + otherCents - discountCents);
    const draft = {
      id: draftId,
      organizationId: identity.organizationId,
      establishmentId: establishment?.id || null,
      natureOperation: payload.natureOperation?.trim() || "Não informada",
      purpose: payload.purpose?.trim() || "normal",
      finalConsumer: Boolean(payload.finalConsumer),
      presenceIndicator: payload.presenceIndicator?.trim() || "not_applicable",
      freightMode: payload.freightMode?.trim() || "no_freight",
      environment: establishment?.environment || "homologation",
      recipientName: payload.recipientName?.trim() || "Não informado",
      recipientTaxId: normalizeTaxId(payload.recipientTaxId || ""),
      recipientStateRegistration: payload.recipientStateRegistration?.trim() || null,
      recipientEmail: payload.recipientEmail?.trim().toLowerCase() || null,
      recipientState: payload.recipientState?.trim().toUpperCase() || "RS",
      recipientCityCode: onlyDigits(payload.recipientCityCode || "") || null,
      productsTotalCents,
      freightCents,
      discountCents,
      otherCents,
      totalCents,
      notes: payload.notes?.trim() || null,
      validationStatus: validationErrors.length ? "blocked" : "ready_for_fiscal_review",
      validationJson: JSON.stringify({ errors: validationErrors, readinessBlockers: readiness.blockers }),
      idempotencyKey,
      createdBy: identity.actorEmail || `device:${identity.deviceId}`,
    };

    await db.insert(nfeDrafts).values(draft);
    if (itemRows.length) await db.insert(nfeDraftItems).values(itemRows);
    await db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      organizationId: identity.organizationId,
      actorEmail: identity.actorEmail,
      action: "nfe.draft.created",
      entityType: "nfe_draft",
      entityId: draftId,
      afterJson: JSON.stringify({ ...draft, itemCount: itemRows.length }),
      correlationId: request.headers.get("cf-ray"),
    });
    await db.insert(syncChangeLog).values({
      organizationId: identity.organizationId,
      deviceId: identity.deviceId,
      entityType: "nfe_draft",
      entityId: draftId,
      action: "upsert",
      payloadJson: JSON.stringify({ ...draft, items: itemRows }),
    });

    return Response.json({ draft: { ...draft, items: itemRows }, validationErrors, readiness }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "Não foi possível salvar o rascunho de NF-e");
  }
}
