export type VehicleStockStatus = "available" | "reserved" | "sold" | "in_transit" | "demo" | "workshop" | "blocked";
export type VehicleCondition = "new" | "used" | "seminovo" | "demo";

export type VehicleData = {
  make?: string;
  model?: string;
  version?: string;
  modelCode?: string;
  condition?: VehicleCondition;
  vin?: string;
  renavam?: string;
  plate?: string;
  plateState?: string;
  manufactureYear?: string;
  modelYear?: string;
  manufactureDate?: string;
  bodyType?: string;
  exteriorColor?: string;
  colorCode?: string;
  interiorColor?: string;
  doors?: number;
  seats?: number;
  fuel?: string;
  transmission?: string;
  traction?: string;
  engineNumber?: string;
  engineCode?: string;
  displacementCc?: number;
  powerCv?: number;
  torqueNm?: number;
  cylinders?: number;
  mileageKm?: number;
  keyCount?: number;
  stockStatus?: VehicleStockStatus;
  yardLocation?: string;
  entryDate?: string;
  purchaseDate?: string;
  supplierName?: string;
  supplierTaxId?: string;
  purchaseInvoiceNumber?: string;
  purchaseInvoiceKey?: string;
  listPriceCents?: number;
  fipeCode?: string;
  fipeReferenceMonth?: string;
  fipeValueCents?: number;
  licensingYear?: string;
  crlvStatus?: string;
  ipvaStatus?: string;
  gravame?: string;
  restrictions?: string;
  firstRegistrationDate?: string;
  warrantyStart?: string;
  warrantyEnd?: string;
  manualAvailable?: boolean;
  spareKeyAvailable?: boolean;
  options?: string;
  accessories?: string;
  notes?: string;
};

export type CatalogItem = {
  id: string;
  type: "product" | "service";
  category?: "general" | "vehicle";
  sku: string;
  name: string;
  description: string;
  ncm: string;
  cest: string;
  serviceCode: string;
  unit: string;
  costCents: number;
  priceCents: number;
  stockQuantityMilli: number;
  minimumStockMilli: number;
  status: "active" | "inactive";
  gtin?: string;
  origin?: string;
  defaultCfop?: string;
  cst?: string;
  csosn?: string;
  pisCst?: string;
  cofinsCst?: string;
  ibsCbsCst?: string;
  cClassTrib?: string;
  vehicle?: VehicleData;
  createdAt: string;
  updatedAt: string;
};

export type OsCatalogLine = {
  id: string;
  catalogItemId: string;
  sku: string;
  name: string;
  type: "product" | "service";
  unit: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
};

export const CATALOG_STORAGE_KEY = "seven:catalog:v1";
export const OS_ITEMS_STORAGE_KEY = "seven:os:items:v1";

export const makeLocalId = (prefix = "item") => typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
  ? crypto.randomUUID()
  : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function readCatalog(): CatalogItem[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(CATALOG_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function writeCatalog(items: CatalogItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CATALOG_STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent("seven:catalog-updated"));
}

export function readOsItemsMap(): Record<string, OsCatalogLine[]> {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(OS_ITEMS_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch { return {}; }
}

export function readOsItems(orderId: string): OsCatalogLine[] {
  return readOsItemsMap()[orderId] || [];
}

export function writeOsItems(orderId: string, lines: OsCatalogLine[]) {
  if (!orderId || typeof window === "undefined") return;
  const map = readOsItemsMap();
  map[orderId] = lines;
  localStorage.setItem(OS_ITEMS_STORAGE_KEY, JSON.stringify(map));
  window.dispatchEvent(new CustomEvent("seven:os-items-updated", { detail: { orderId } }));
}

export function makeOsLine(item: CatalogItem, quantity = 1): OsCatalogLine {
  const qty = Math.max(0.001, Number(quantity) || 1);
  return {
    id: makeLocalId("os-line"),
    catalogItemId: item.id,
    sku: item.sku,
    name: item.name,
    type: item.type,
    unit: item.unit || "UN",
    quantity: qty,
    unitPriceCents: Number(item.priceCents) || 0,
    totalCents: Math.round(qty * (Number(item.priceCents) || 0)),
  };
}

export function recalcLine(line: OsCatalogLine, patch: Partial<Pick<OsCatalogLine, "quantity" | "unitPriceCents">>): OsCatalogLine {
  const quantity = patch.quantity === undefined ? line.quantity : Math.max(0.001, Number(patch.quantity) || 0.001);
  const unitPriceCents = patch.unitPriceCents === undefined ? line.unitPriceCents : Math.max(0, Math.round(Number(patch.unitPriceCents) || 0));
  return { ...line, ...patch, quantity, unitPriceCents, totalCents: Math.round(quantity * unitPriceCents) };
}

export const linesTotalCents = (lines: OsCatalogLine[]) => lines.reduce((sum, line) => sum + (Number(line.totalCents) || 0), 0);
