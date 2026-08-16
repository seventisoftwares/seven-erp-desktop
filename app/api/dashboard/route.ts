import { and, asc, count, desc, eq, gt, gte, lt, lte, ne, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { catalogItems, certificateOrders, financialEntries, parties, serviceOrders } from "../../../db/schema";
import { apiErrorResponse, resolveRequestIdentity } from "../../lib/sync-auth";

export async function GET(request: Request) {
  try {
    const identity = await resolveRequestIdentity(request);
    const db = await getDb();
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const monthStart = `${today.slice(0, 7)}-01`;
    const inThirtyDays = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);

    const [financial] = await db.select({
      revenueCents: sql<number>`coalesce(sum(case when ${financialEntries.direction} in ('income', 'in', 'receivable') and ${financialEntries.paidAt} is not null and ${financialEntries.paidAt} >= ${monthStart} then ${financialEntries.amountCents} else 0 end), 0)`,
      receivableCents: sql<number>`coalesce(sum(case when ${financialEntries.direction} in ('income', 'in', 'receivable') and ${financialEntries.status} = 'open' then ${financialEntries.amountCents} else 0 end), 0)`,
      overdueEntries: sql<number>`coalesce(sum(case when ${financialEntries.status} = 'open' and ${financialEntries.dueDate} < ${today} then 1 else 0 end), 0)`,
    }).from(financialEntries).where(eq(financialEntries.organizationId, identity.organizationId));
    const [openOrders] = await db.select({ value: count() }).from(serviceOrders).where(and(
      eq(serviceOrders.organizationId, identity.organizationId),
      ne(serviceOrders.status, "closed"),
    ));
    const [customers] = await db.select({ value: count() }).from(parties).where(and(
      eq(parties.organizationId, identity.organizationId),
      eq(parties.kind, "customer"),
      eq(parties.status, "active"),
    ));
    const [lowStock] = await db.select({ value: count() }).from(catalogItems).where(and(
      eq(catalogItems.organizationId, identity.organizationId),
      eq(catalogItems.status, "active"),
      gt(catalogItems.minimumStockMilli, 0),
      lt(catalogItems.stockQuantityMilli, catalogItems.minimumStockMilli),
    ));
    const [expiringCertificates] = await db.select({ value: count() }).from(certificateOrders).where(and(
      eq(certificateOrders.organizationId, identity.organizationId),
      ne(certificateOrders.status, "expired"),
      gte(certificateOrders.expiresAt, today),
      lte(certificateOrders.expiresAt, inThirtyDays),
    ));
    const recentServiceOrders = await db.select({
      id: serviceOrders.id,
      number: serviceOrders.number,
      customer: parties.legalName,
      equipmentType: serviceOrders.equipmentType,
      equipmentBrand: serviceOrders.equipmentBrand,
      equipmentModel: serviceOrders.equipmentModel,
      totalCents: serviceOrders.totalCents,
      status: serviceOrders.status,
      openedAt: serviceOrders.openedAt,
    }).from(serviceOrders).innerJoin(parties, eq(serviceOrders.partyId, parties.id)).where(
      eq(serviceOrders.organizationId, identity.organizationId),
    ).orderBy(desc(serviceOrders.openedAt)).limit(5);
    const upcomingEntries = await db.select({
      id: financialEntries.id,
      description: financialEntries.description,
      direction: financialEntries.direction,
      amountCents: financialEntries.amountCents,
      dueDate: financialEntries.dueDate,
    }).from(financialEntries).where(and(
      eq(financialEntries.organizationId, identity.organizationId),
      eq(financialEntries.status, "open"),
      gte(financialEntries.dueDate, today),
    )).orderBy(asc(financialEntries.dueDate)).limit(5);

    return Response.json({
      metrics: {
        revenueCents: Number(financial?.revenueCents || 0),
        receivableCents: Number(financial?.receivableCents || 0),
        openServiceOrders: Number(openOrders?.value || 0),
        customers: Number(customers?.value || 0),
      },
      attention: {
        overdueEntries: Number(financial?.overdueEntries || 0),
        lowStockItems: Number(lowStock?.value || 0),
        expiringCertificates: Number(expiringCertificates?.value || 0),
      },
      recentServiceOrders: recentServiceOrders.map((order) => ({
        id: order.id,
        number: order.number,
        customer: order.customer,
        equipment: [order.equipmentType, order.equipmentBrand, order.equipmentModel].filter(Boolean).join(" · "),
        totalCents: order.totalCents,
        status: order.status,
        openedAt: order.openedAt,
      })),
      upcomingEntries,
    });
  } catch (error) {
    return apiErrorResponse(error, "Não foi possível carregar os indicadores reais.");
  }
}
