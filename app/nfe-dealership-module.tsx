"use client";

import { useEffect, useMemo, useState } from "react";
import { readCatalog, type CatalogItem, type VehicleData } from "./catalog-core";
import NfeDanfeReferencePreview from "./nfe-danfe-reference-preview";

type AnyRow = Record<string, any>;
type ViewMode = "list" | "editor";
type EmissionMode = "simulation" | "sefaz";
type CompanyProfile = AnyRow & {
  taxRegime?: string;
  nfeSeries?: string;
  nfeNextNumber?: string;
  legalName?: string;
  tradeName?: string;
  taxId?: string;
  state?: string;
  city?: string;
};
type Customer = {
  id: string;
  legalName?: string;
  tradeName?: string | null;
  taxId?: string | null;
  stateRegistration?: string | null;
  postalCode?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  district?: string | null;
  city?: string | null;
  cityCode?: string | null;
  state?: string | null;
  email?: string | null;
  phone?: string | null;
};
type NfeItem = {
  id: string;
  catalogItemId?: string;
  code: string;
  description: string;
  ncm: string;
  cest: string;
  cfop: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  gtin: string;
  origin: string;
  cst: string;
  csosn: string;
  simpleCreditRate: string;
  icmsBase: string;
  icmsRate: string;
  pisCst: string;
  pisBase: string;
  pisRate: string;
  cofinsCst: string;
  cofinsBase: string;
  cofinsRate: string;
  ibsCbsCst: string;
  cClassTrib: string;
  ibsCbsBase: string;
  ibsUfRate: string;
  ibsMunRate: string;
  cbsRate: string;
  vehicle?: VehicleData;
  infAdProd?: string;
};
type DraftRow = AnyRow & {
  id: string;
  recipientName?: string;
  recipientTaxId?: string;
  totalCents?: number;
  environment?: string;
  createdAt?: string;
  transmissionStatus?: string | null;
  accessKey?: string | null;
  protocol?: string | null;
  nfeNumber?: number | null;
  nfeSeries?: number | null;
  items?: AnyRow[];
};
type Inutilization = AnyRow & {
  id: string;
  environment: string;
  year: number;
  series: number;
  startNumber: number;
  endNumber: number;
  status: string;
};
type Readiness = {
  transmissionEnabled: boolean;
  environment: string;
  blockers: string[];
};

type FormState = {
  environment: string;
  natureOperation: string;
  purpose: string;
  finalConsumer: boolean;
  presenceIndicator: string;
  freightMode: string;
  recipientName: string;
  recipientTaxId: string;
  recipientIeIndicator: string;
  recipientStateRegistration: string;
  recipientStreet: string;
  recipientNumber: string;
  recipientComplement: string;
  recipientDistrict: string;
  recipientCity: string;
  recipientCityCode: string;
  recipientState: string;
  recipientPostalCode: string;
  recipientPhone: string;
  recipientEmail: string;
  paymentMethod: string;
  freight: number;
  discount: number;
  other: number;
  notes: string;
};

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const makeId = () => typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `nfe-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const steps = ["Operação", "Comprador", "Veículo / itens", "Tributação", "Totais", "Revisão"];
const defaultReadiness: Readiness = { transmissionEnabled: false, environment: "homologation", blockers: [] };

const blankForm = (): FormState => ({
  environment: "homologation",
  natureOperation: "VENDA DE MERCADORIA",
  purpose: "normal",
  finalConsumer: true,
  presenceIndicator: "in_person",
  freightMode: "no_freight",
  recipientName: "",
  recipientTaxId: "",
  recipientIeIndicator: "9",
  recipientStateRegistration: "",
  recipientStreet: "",
  recipientNumber: "",
  recipientComplement: "",
  recipientDistrict: "",
  recipientCity: "",
  recipientCityCode: "",
  recipientState: "RS",
  recipientPostalCode: "",
  recipientPhone: "",
  recipientEmail: "",
  paymentMethod: "01",
  freight: 0,
  discount: 0,
  other: 0,
  notes: "",
});

const blankItem = (): NfeItem => ({
  id: makeId(),
  code: "",
  description: "",
  ncm: "",
  cest: "",
  cfop: "",
  unit: "UN",
  quantity: 1,
  unitPrice: 0,
  gtin: "SEM GTIN",
  origin: "",
  cst: "",
  csosn: "",
  simpleCreditRate: "",
  icmsBase: "",
  icmsRate: "",
  pisCst: "",
  pisBase: "",
  pisRate: "",
  cofinsCst: "",
  cofinsBase: "",
  cofinsRate: "",
  ibsCbsCst: "",
  cClassTrib: "",
  ibsCbsBase: "",
  ibsUfRate: "",
  ibsMunRate: "",
  cbsRate: "",
});

function formatCnpj(value: unknown) {
  const raw = String(value || "").replace(/\D/g, "");
  return raw.length === 14 ? raw.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : String(value || "—");
}
function statusOf(row: DraftRow) {
  return String(row.transmissionStatus || row.transmission?.status || "draft");
}
function statusLabel(row: DraftRow) {
  const value = statusOf(row);
  if (value === "authorized") return "Autorizada";
  if (value === "cancelled") return "Cancelada";
  if (value === "processing") return "Processando";
  if (value === "rejected") return "Rejeitada";
  if (value === "external_error") return "Falha externa";
  if (value === "signed") return "Assinada";
  return "Rascunho";
}
function valueText(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  return String(value).trim();
}
function vehiclePairs(vehicle?: VehicleData) {
  if (!vehicle) return [] as Array<[string, string]>;
  const year = [vehicle.manufactureYear, vehicle.modelYear].filter(Boolean).join("/");
  const plate = [vehicle.plate, vehicle.plateState].filter(Boolean).join("/");
  const warranty = [vehicle.warrantyStart, vehicle.warrantyEnd].filter(Boolean).join(" a ");
  const pairs: Array<[string, unknown]> = [
    ["Marca", vehicle.make], ["Modelo", vehicle.model], ["Versão", vehicle.version], ["Chassi / VIN", vehicle.vin],
    ["RENAVAM", vehicle.renavam], ["Placa", plate], ["Ano fab./mod.", year], ["Cor", vehicle.exteriorColor],
    ["Motor", vehicle.engineNumber || vehicle.engineCode], ["Câmbio", vehicle.transmission], ["Combustível", vehicle.fuel],
    ["Tração", vehicle.traction], ["Cilindrada", vehicle.displacementCc ? `${vehicle.displacementCc} cc` : ""],
    ["Potência", vehicle.powerCv ? `${vehicle.powerCv} cv` : ""], ["Torque", vehicle.torqueNm ? `${vehicle.torqueNm} Nm` : ""],
    ["KM", vehicle.mileageKm === undefined ? "" : vehicle.mileageKm], ["Portas", vehicle.doors], ["Lugares", vehicle.seats],
    ["FIPE", vehicle.fipeCode], ["Garantia", warranty], ["Gravame", vehicle.gravame], ["Restrições", vehicle.restrictions],
    ["Opcionais", vehicle.options], ["Acessórios", vehicle.accessories], ["Observações", vehicle.notes],
  ];
  return pairs.map(([label, value]) => [label, valueText(value)] as [string, string]).filter(([, value]) => Boolean(value));
}
function vehicleInfAdProd(vehicle?: VehicleData) {
  return vehiclePairs(vehicle).map(([label, value]) => `${label.toUpperCase()}: ${value}`).join(" | ").slice(0, 500);
}
function itemFromCatalog(item: CatalogItem): NfeItem {
  return {
    ...blankItem(),
    catalogItemId: item.id,
    code: item.sku || item.id.slice(0, 8).toUpperCase(),
    description: item.name,
    ncm: item.ncm || "",
    cest: item.cest || "",
    cfop: item.defaultCfop || "",
    unit: item.unit || "UN",
    quantity: 1,
    unitPrice: (Number(item.priceCents) || 0) / 100,
    gtin: item.gtin || "SEM GTIN",
    origin: item.origin || "",
    cst: item.cst || "",
    csosn: item.csosn || "",
    pisCst: item.pisCst || "",
    cofinsCst: item.cofinsCst || "",
    ibsCbsCst: item.ibsCbsCst || "",
    cClassTrib: item.cClassTrib || "",
    vehicle: item.category === "vehicle" ? item.vehicle : undefined,
    infAdProd: item.category === "vehicle" ? vehicleInfAdProd(item.vehicle) : "",
  };
}
function invalidSimulationKey() {
  const bytes = new Uint8Array(43);
  crypto.getRandomValues(bytes);
  const base = Array.from(bytes, (value) => String(value % 10)).join("");
  let weight = 2;
  let sum = 0;
  for (let index = base.length - 1; index >= 0; index -= 1) {
    sum += Number(base[index]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const remainder = sum % 11;
  const validDv = remainder === 0 || remainder === 1 ? 0 : 11 - remainder;
  return `${base}${(validDv + 1) % 10}`;
}
function randomSimulationNumber() {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return (bytes[0] % 999999999) + 1;
}

export default function NfeDealershipModule({ onClose }: { onClose?: () => void }) {
  const [view, setView] = useState<ViewMode>("list");
  const [step, setStep] = useState(0);
  const [emissionMode, setEmissionMode] = useState<EmissionMode>("simulation");
  const [company, setCompany] = useState<CompanyProfile>({});
  const [logoDataUrl, setLogoDataUrl] = useState("");
  const [readiness, setReadiness] = useState<Readiness>(defaultReadiness);
  const [a1Ready, setA1Ready] = useState(false);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [inutilizations, setInutilizations] = useState<Inutilization[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [form, setForm] = useState<FormState>(blankForm);
  const [items, setItems] = useState<NfeItem[]>([blankItem()]);
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [selectedCatalogItem, setSelectedCatalogItem] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [workingId, setWorkingId] = useState("");
  const [notice, setNotice] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [simulationDraft, setSimulationDraft] = useState<AnyRow | null>(null);
  const [simulationOpen, setSimulationOpen] = useState(false);
  const [inut, setInut] = useState({ environment: "homologation", year: new Date().getFullYear(), series: "", startNumber: "", endNumber: "", justification: "" });

  const isNormalRegime = ["lucro_presumido", "lucro_real"].includes(String(company.taxRegime || ""));
  const isSimple = ["simples_nacional", "simples_excesso"].includes(String(company.taxRegime || ""));
  const readyForSefaz = readiness.transmissionEnabled && a1Ready;
  const selectedItem = items.find((item) => item.id === selectedItemId) || items[0] || null;

  const load = async () => {
    setLoading(true);
    try {
      const [draftResponse, companyResponse, customerResponse] = await Promise.all([
        fetch("/api/nfe-drafts"), fetch("/api/company"), fetch("/api/customers"),
      ]);
      const [draftData, companyData, customerData] = await Promise.all([
        draftResponse.json().catch(() => ({})), companyResponse.json().catch(() => ({})), customerResponse.json().catch(() => ({})),
      ]);
      if (!draftResponse.ok) throw new Error(draftData.error || "Não foi possível carregar as NF-e.");
      const nextCompany = companyResponse.ok ? companyData.company || {} : {};
      setCompany(nextCompany);
      setDrafts(Array.isArray(draftData.drafts) ? draftData.drafts : []);
      setInutilizations(Array.isArray(draftData.inutilizations) ? draftData.inutilizations : []);
      setReadiness(draftData.readiness || defaultReadiness);
      setCustomers(customerResponse.ok && Array.isArray(customerData.customers) ? customerData.customers : []);
      setCatalog(readCatalog().filter((item) => item.status === "active").sort((a, b) => {
        if (a.category === "vehicle" && b.category !== "vehicle") return -1;
        if (a.category !== "vehicle" && b.category === "vehicle") return 1;
        return a.name.localeCompare(b.name, "pt-BR");
      }));
      const bridge = (window as any).sevenDesktop;
      if (bridge?.integrationSecretsStatus) {
        const secret = await bridge.integrationSecretsStatus("nfe_sefaz").catch(() => null);
        setA1Ready(Boolean(secret?.certificateId));
      }
      if (bridge?.companyLogo && nextCompany.taxId) {
        const logo = await bridge.companyLogo({ action: "get", taxId: nextCompany.taxId }).catch(() => null);
        setLogoDataUrl(String(logo?.logoDataUrl || ""));
      } else setLogoDataUrl("");
    } catch (caught) {
      setErrors([caught instanceof Error ? caught.message : "Falha ao carregar o módulo de NF-e."]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const reload = () => void load();
    const catalogReload = () => setCatalog(readCatalog().filter((item) => item.status === "active"));
    window.addEventListener("seven:company-updated", reload);
    window.addEventListener("seven:company-logo-updated", reload);
    window.addEventListener("seven:catalog-updated", catalogReload);
    return () => {
      window.removeEventListener("seven:company-updated", reload);
      window.removeEventListener("seven:company-logo-updated", reload);
      window.removeEventListener("seven:catalog-updated", catalogReload);
    };
  }, []);

  const totals = useMemo(() => {
    const products = items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0);
    return { products, total: Math.max(0, products + Number(form.freight || 0) + Number(form.other || 0) - Number(form.discount || 0)) };
  }, [items, form.freight, form.other, form.discount]);

  const stats = useMemo(() => ({
    authorized: drafts.filter((row) => statusOf(row) === "authorized").length,
    pending: drafts.filter((row) => !["authorized", "cancelled"].includes(statusOf(row))).length,
    vehicles: catalog.filter((row) => row.category === "vehicle").length,
  }), [drafts, catalog]);

  const visibleDrafts = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR");
    if (!term) return drafts;
    return drafts.filter((row) => [row.recipientName, row.recipientTaxId, row.nfeNumber, row.accessKey, statusLabel(row)].some((value) => String(value || "").toLocaleLowerCase("pt-BR").includes(term)));
  }, [drafts, query]);

  const updateForm = <K extends keyof FormState>(field: K, value: FormState[K]) => setForm((current) => ({ ...current, [field]: value }));
  const updateItem = <K extends keyof NfeItem>(id: string, field: K, value: NfeItem[K]) => setItems((current) => current.map((item) => item.id === id ? { ...item, [field]: value } : item));

  const startNew = () => {
    const first = blankItem();
    setForm({ ...blankForm(), environment: readiness.environment || "homologation" });
    setItems([first]);
    setSelectedItemId(first.id);
    setSelectedCustomer("");
    setSelectedCatalogItem("");
    setErrors([]);
    setNotice("");
    setStep(0);
    setView("editor");
  };

  const chooseCustomer = (id: string) => {
    setSelectedCustomer(id);
    const customer = customers.find((row) => row.id === id);
    if (!customer) return;
    setForm((current) => ({
      ...current,
      recipientName: customer.tradeName || customer.legalName || "",
      recipientTaxId: customer.taxId || "",
      recipientStateRegistration: customer.stateRegistration || "",
      recipientIeIndicator: customer.stateRegistration ? "1" : "9",
      recipientStreet: customer.street || "",
      recipientNumber: customer.number || "",
      recipientComplement: customer.complement || "",
      recipientDistrict: customer.district || "",
      recipientCity: customer.city || "",
      recipientCityCode: customer.cityCode || "",
      recipientState: customer.state || current.recipientState,
      recipientPostalCode: String(customer.postalCode || "").replace(/\D/g, ""),
      recipientPhone: customer.phone || "",
      recipientEmail: customer.email || "",
    }));
  };

  const addCatalogItem = () => {
    const catalogItem = catalog.find((row) => row.id === selectedCatalogItem);
    if (!catalogItem) return;
    const next = itemFromCatalog(catalogItem);
    setItems((current) => {
      const base = current.length === 1 && !current[0].code && !current[0].description ? [] : current;
      return [...base, next];
    });
    setSelectedItemId(next.id);
    setSelectedCatalogItem("");
  };

  const collectErrors = () => {
    const next: string[] = [];
    if (!form.natureOperation.trim()) next.push("Informe a natureza da operação.");
    if (!form.recipientName.trim() || !form.recipientTaxId.trim()) next.push("Informe o comprador e CPF/CNPJ.");
    if (!["1", "2", "9"].includes(form.recipientIeIndicator)) next.push("Informe o indicador de IE do comprador.");
    if (form.recipientIeIndicator === "1" && !form.recipientStateRegistration.trim()) next.push("Comprador contribuinte exige Inscrição Estadual.");
    if (!form.recipientStreet.trim() || !form.recipientNumber.trim() || !form.recipientDistrict.trim() || !form.recipientCity.trim()) next.push("Complete o endereço do comprador.");
    if (!/^\d{7}$/.test(form.recipientCityCode)) next.push("Código IBGE do comprador deve ter 7 dígitos.");
    if (!/^\d{8}$/.test(form.recipientPostalCode)) next.push("CEP do comprador deve ter 8 dígitos.");
    if (!/^\d{2}$/.test(form.paymentMethod)) next.push("Informe o código do meio de pagamento.");
    items.forEach((item, index) => {
      const label = `Item ${index + 1}`;
      if (!item.code.trim() || !item.description.trim()) next.push(`${label}: código e descrição são obrigatórios.`);
      if (!/^\d{8}$/.test(item.ncm)) next.push(`${label}: NCM deve ter 8 dígitos.`);
      if (!/^\d{4}$/.test(item.cfop)) next.push(`${label}: CFOP deve ter 4 dígitos.`);
      if (!item.unit.trim() || !item.gtin.trim() || !item.origin.trim()) next.push(`${label}: unidade, GTIN/SEM GTIN e origem são obrigatórios.`);
      if (!(Number(item.quantity) > 0) || !(Number(item.unitPrice) > 0)) next.push(`${label}: quantidade e valor devem ser maiores que zero.`);
      if (isSimple && !item.csosn.trim()) next.push(`${label}: informe CSOSN.`);
      if (isNormalRegime && !item.cst.trim()) next.push(`${label}: informe CST ICMS.`);
      if (!item.pisCst.trim() || !item.cofinsCst.trim()) next.push(`${label}: informe CST PIS e COFINS.`);
      if (isNormalRegime && (!item.ibsCbsCst.trim() || !item.cClassTrib.trim())) next.push(`${label}: informe CST IBS/CBS e cClassTrib.`);
    });
    return next;
  };

  const payloadForDraft = () => ({
    ...form,
    items: items.map(({ id: _id, catalogItemId: _catalogItemId, ...item }) => ({
      ...item,
      infAdProd: item.vehicle ? vehicleInfAdProd(item.vehicle) : item.infAdProd,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      simpleCreditRate: item.simpleCreditRate === "" ? undefined : Number(item.simpleCreditRate),
      icmsBase: item.icmsBase === "" ? undefined : Number(item.icmsBase),
      icmsRate: item.icmsRate === "" ? undefined : Number(item.icmsRate),
      pisBase: item.pisBase === "" ? undefined : Number(item.pisBase),
      pisRate: item.pisRate === "" ? undefined : Number(item.pisRate),
      cofinsBase: item.cofinsBase === "" ? undefined : Number(item.cofinsBase),
      cofinsRate: item.cofinsRate === "" ? undefined : Number(item.cofinsRate),
      ibsCbsBase: item.ibsCbsBase === "" ? undefined : Number(item.ibsCbsBase),
      ibsUfRate: item.ibsUfRate === "" ? undefined : Number(item.ibsUfRate),
      ibsMunRate: item.ibsMunRate === "" ? undefined : Number(item.ibsMunRate),
      cbsRate: item.cbsRate === "" ? undefined : Number(item.cbsRate),
    })),
    idempotencyKey: makeId(),
  });

  const showSimulation = (source: AnyRow) => {
    const number = randomSimulationNumber();
    const key = invalidSimulationKey();
    const snapshot = {
      ...source,
      simulation: true,
      environment: "production",
      transmissionStatus: "simulation",
      accessKey: key,
      protocol: "",
      nfeNumber: number,
      nfeSeries: Number(String(company.nfeSeries || 1).replace(/\D/g, "")) || 1,
      createdAt: new Date().toISOString(),
      transmission: { status: "simulation", accessKey: key, number, series: Number(String(company.nfeSeries || 1).replace(/\D/g, "")) || 1 },
    };
    setSimulationDraft(snapshot);
    setSimulationOpen(true);
  };

  const saveDraft = async (emitAfter = false) => {
    setSaving(true);
    setErrors([]);
    setNotice("");
    try {
      const validation = collectErrors();
      if (validation.length) {
        setErrors(validation);
        throw new Error("Revise os campos destacados antes de continuar.");
      }
      const payload = payloadForDraft();
      const response = await fetch("/api/nfe-drafts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar a NF-e.");
      const draft = { ...payload, ...(data.draft || {}), items: payload.items };
      if (emitAfter && emissionMode === "simulation") {
        showSimulation(draft);
        setNotice("Documento de teste gerado localmente. A SEFAZ não foi acionada.");
      } else if (emitAfter && emissionMode === "sefaz") {
        if (!readyForSefaz) throw new Error("O ambiente SEFAZ real ainda possui pendências. Revise certificado e configuração fiscal.");
        const txResponse = await fetch("/api/nfe-drafts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "transmit", draftId: data.draft?.id }) });
        const txData = await txResponse.json();
        if (!txResponse.ok && txResponse.status !== 202) throw new Error(txData.error || txData.message || "A SEFAZ recusou a transmissão.");
        setNotice(txData.status === "authorized" || txData.transmission?.status === "authorized" ? `NF-e autorizada${txData.protocol || txData.transmission?.protocol ? ` · Protocolo ${txData.protocol || txData.transmission.protocol}` : ""}.` : "NF-e enviada à SEFAZ. Consulte o processamento.");
        setView("list");
      } else {
        setNotice("Rascunho salvo com sucesso.");
        setView("list");
      }
      await load();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Falha ao salvar a NF-e.";
      setErrors((current) => current.length ? current : [message]);
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (draft: DraftRow, action: "transmit" | "consult_receipt" | "consult_protocol" | "cancel", extra: AnyRow = {}) => {
    if (action === "transmit" && emissionMode === "simulation") {
      const catalogMap = new Map(catalog.map((row) => [row.id, row]));
      const enrichedItems = (draft.items || []).map((item: AnyRow) => {
        const catalogItem = item.catalogItemId ? catalogMap.get(item.catalogItemId) : catalog.find((row) => row.sku === item.code || row.name === item.description);
        const vehicle = item.vehicle || (catalogItem?.category === "vehicle" ? catalogItem.vehicle : undefined);
        return { ...item, vehicle, infAdProd: vehicle ? vehicleInfAdProd(vehicle) : item.infAdProd };
      });
      showSimulation({ ...draft, items: enrichedItems });
      return;
    }
    if (action === "transmit" && !readyForSefaz) {
      setErrors(["Transmissão SEFAZ indisponível: revise o certificado A1 e a configuração fiscal do estabelecimento."]);
      return;
    }
    setWorkingId(`${action}:${draft.id}`);
    setErrors([]);
    setNotice("");
    try {
      const response = await fetch("/api/nfe-drafts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, draftId: draft.id, ...extra }) });
      const data = await response.json();
      if (!response.ok && response.status !== 202) {
        const blockers = Array.isArray(data.blockers) ? data.blockers : [];
        throw new Error([data.error || data.message || "Operação fiscal recusada.", ...blockers].filter(Boolean).join(" · "));
      }
      if (data.status === "cancelled") setNotice(`NF-e cancelada${data.cancellation?.protocol ? ` · Protocolo ${data.cancellation.protocol}` : ""}.`);
      else if (data.status === "authorized" || data.transmission?.status === "authorized") setNotice(`NF-e autorizada${data.protocol || data.transmission?.protocol ? ` · Protocolo ${data.protocol || data.transmission.protocol}` : ""}.`);
      else if (response.status === 202 || data.status === "processing") setNotice("A SEFAZ ainda está processando a NF-e.");
      else setNotice(data.message || data.xMotivo || data.transmission?.xMotivo || "Operação concluída.");
      await load();
    } catch (caught) {
      setErrors([caught instanceof Error ? caught.message : "Falha na operação fiscal."]);
    } finally {
      setWorkingId("");
    }
  };

  const requestCancellation = async (draft: DraftRow) => {
    const justification = window.prompt("Justificativa do cancelamento (15 a 255 caracteres):", "");
    if (justification === null) return;
    if (justification.trim().length < 15) {
      setErrors(["A justificativa do cancelamento deve ter pelo menos 15 caracteres."]);
      return;
    }
    await runAction(draft, "cancel", { justification: justification.trim() });
  };

  const saveDanfe = async (draft: DraftRow) => {
    setWorkingId(`danfe:${draft.id}`);
    setErrors([]);
    try {
      const bridge = (window as any).sevenDesktop;
      if (!bridge?.nfeDanfePdf) throw new Error("A geração do DANFE requer o aplicativo desktop atualizado.");
      const result = await bridge.nfeDanfePdf(draft.id);
      if (result?.canceled) return;
      if (!result?.saved) throw new Error("O DANFE não foi salvo.");
      setNotice(`DANFE salvo${result.filePath ? ` · ${result.filePath}` : ""}.`);
    } catch (caught) {
      setErrors([caught instanceof Error ? caught.message : "Falha ao gerar o DANFE."]);
    } finally {
      setWorkingId("");
    }
  };

  const submitInutilization = async () => {
    setWorkingId("inutilization");
    setErrors([]);
    try {
      if (inut.justification.trim().length < 15) throw new Error("A justificativa deve ter pelo menos 15 caracteres.");
      const response = await fetch("/api/nfe-drafts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "inutilize", environment: inut.environment, year: Number(inut.year), series: inut.series, startNumber: inut.startNumber, endNumber: inut.endNumber, justification: inut.justification.trim() }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Inutilização não aceita.");
      setNotice(`Faixa inutilizada${data.inutilization?.protocol ? ` · Protocolo ${data.inutilization.protocol}` : ""}.`);
      setInut({ environment: "homologation", year: new Date().getFullYear(), series: "", startNumber: "", endNumber: "", justification: "" });
      await load();
    } catch (caught) {
      setErrors([caught instanceof Error ? caught.message : "Falha na inutilização."]);
    } finally {
      setWorkingId("");
    }
  };

  const companyName = company.tradeName || company.legalName || "Empresa não cadastrada";
  const companyWithLogo = { ...company, logoDataUrl };

  const modeSelector = <div className="dealer-nfe-mode" aria-label="Modo de emissão">
    <button type="button" className={emissionMode === "simulation" ? "active" : ""} onClick={() => setEmissionMode("simulation")}><span>TESTE</span><b>Simulação local</b><small>Transmitir gera documento sem validade</small></button>
    <button type="button" className={emissionMode === "sefaz" ? "active" : ""} disabled={!readyForSefaz} onClick={() => setEmissionMode("sefaz")}><span>REAL</span><b>SEFAZ</b><small>{readyForSefaz ? "Assina e transmite de verdade" : "Configure A1 e ambiente fiscal"}</small></button>
  </div>;

  return <div className="dealer-nfe-root">
    <header className="dealer-nfe-header">
      <div className="dealer-nfe-title">
        <div className="dealer-nfe-mark">NF</div>
        <div><span>SEVEN ERP AUTOMOTIVO 2.0</span><h1>Emissão de NF-e</h1><p>Fluxo fiscal para lojas, revendas e concessionárias.</p></div>
      </div>
      <div className="dealer-nfe-header-right">{modeSelector}<button className="dealer-nfe-close" onClick={onClose}>Fechar</button></div>
    </header>

    <section className="dealer-nfe-company-strip">
      <div className="dealer-nfe-company-identity">{logoDataUrl ? <img src={logoDataUrl} alt="Logo do emitente" /> : <div className="dealer-nfe-company-placeholder">🏢</div>}<div><span>Emitente ativo</span><b>{companyName}</b><small>{formatCnpj(company.taxId)} · {[company.city, company.state].filter(Boolean).join("/") || "Município não informado"}</small></div></div>
      <div className="dealer-nfe-health"><div><span>Certificado A1</span><b className={a1Ready ? "ok" : "warn"}>{a1Ready ? "Configurado" : "Pendente"}</b></div><div><span>SEFAZ</span><b className={readiness.transmissionEnabled ? "ok" : "warn"}>{readiness.transmissionEnabled ? "Disponível" : "Requer atenção"}</b></div><div><span>Série</span><b>{company.nfeSeries || "—"}</b></div><div><span>Próxima NF-e</span><b>{company.nfeNextNumber || "—"}</b></div></div>
    </section>

    {errors.length > 0 && <div className="dealer-nfe-feedback error"><b>Revise antes de continuar</b><ul>{errors.slice(0, 12).map((error, index) => <li key={`${index}-${error}`}>{error}</li>)}</ul></div>}
    {notice && <div className="dealer-nfe-feedback notice">{notice}</div>}

    {view === "list" ? <main className="dealer-nfe-dashboard">
      <div className="dealer-nfe-dashboard-head"><div><span>Central fiscal</span><h2>Notas fiscais</h2><p>Rascunhos, autorizações, consultas e documentos da loja.</p></div><button className="dealer-primary" onClick={startNew}>+ Nova NF-e</button></div>
      <div className="dealer-nfe-kpis"><div><span>Autorizadas</span><b>{stats.authorized}</b><small>NF-e com autorização</small></div><div><span>Pendentes</span><b>{stats.pending}</b><small>Rascunhos e processamento</small></div><div><span>Veículos no estoque</span><b>{stats.vehicles}</b><small>Cadastros ativos</small></div><div><span>Emissão atual</span><b>{emissionMode === "simulation" ? "TESTE" : "SEFAZ"}</b><small>{emissionMode === "simulation" ? "Sem transmissão fiscal" : "Transmissão real"}</small></div></div>

      <section className="dealer-card dealer-nfe-list-card">
        <div className="dealer-card-head"><div><b>Documentos</b><span>{visibleDrafts.length} registro(s)</span></div><div className="dealer-list-tools"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente, CNPJ, número ou chave..." /><button onClick={() => void load()}>Atualizar</button></div></div>
        <div className="dealer-table-wrap"><table className="dealer-table"><thead><tr><th>NF-e</th><th>Comprador</th><th>Emissão</th><th>Valor</th><th>Ambiente</th><th>Situação</th><th></th></tr></thead><tbody>
          {loading ? <tr><td colSpan={7} className="dealer-empty">Carregando documentos...</td></tr> : visibleDrafts.map((draft) => <tr key={draft.id}><td><b>{draft.nfeNumber ? String(draft.nfeNumber).padStart(9, "0") : "Rascunho"}</b><small>{draft.nfeSeries ? `Série ${draft.nfeSeries}` : "Sem numeração reservada"}</small></td><td><b>{draft.recipientName || "Sem comprador"}</b><small>{draft.recipientTaxId || ""}</small></td><td>{draft.createdAt ? new Date(draft.createdAt).toLocaleDateString("pt-BR") : "—"}</td><td className="money">{BRL.format((Number(draft.totalCents) || 0) / 100)}</td><td><span className="dealer-env">{draft.environment === "production" ? "Produção" : "Homologação"}</span></td><td><span className={`dealer-status ${statusOf(draft)}`}>{statusLabel(draft)}</span></td><td><div className="dealer-row-actions">
            {(!draft.transmissionStatus || ["rejected", "external_error"].includes(String(draft.transmissionStatus))) && <button className="primary" onClick={() => void runAction(draft, "transmit")} disabled={workingId.includes(draft.id)}>{emissionMode === "simulation" ? "Transmitir NF-e" : "Transmitir SEFAZ"}</button>}
            {draft.transmissionStatus === "processing" && <button onClick={() => void runAction(draft, "consult_receipt")}>Recibo</button>}
            {draft.accessKey && <button onClick={() => void runAction(draft, "consult_protocol")}>Consultar</button>}
            {["authorized", "cancelled"].includes(String(draft.transmissionStatus)) && <button onClick={() => void saveDanfe(draft)}>DANFE</button>}
            {draft.transmissionStatus === "authorized" && <button className="danger" onClick={() => void requestCancellation(draft)}>Cancelar</button>}
          </div></td></tr>)}
          {!loading && !visibleDrafts.length && <tr><td colSpan={7} className="dealer-empty">Nenhuma NF-e encontrada.</td></tr>}
        </tbody></table></div>
      </section>

      <details className="dealer-card dealer-fiscal-tools"><summary>Ferramentas fiscais · inutilização de numeração</summary><div className="dealer-inut-grid"><label><span>Ambiente</span><select value={inut.environment} onChange={(e) => setInut((current) => ({ ...current, environment: e.target.value }))}><option value="homologation">Homologação</option><option value="production">Produção</option></select></label><label><span>Ano</span><input type="number" value={inut.year} onChange={(e) => setInut((current) => ({ ...current, year: Number(e.target.value) }))} /></label><label><span>Série</span><input value={inut.series} onChange={(e) => setInut((current) => ({ ...current, series: e.target.value.replace(/\D/g, "") }))} /></label><label><span>Nº inicial</span><input value={inut.startNumber} onChange={(e) => setInut((current) => ({ ...current, startNumber: e.target.value.replace(/\D/g, "") }))} /></label><label><span>Nº final</span><input value={inut.endNumber} onChange={(e) => setInut((current) => ({ ...current, endNumber: e.target.value.replace(/\D/g, "") }))} /></label><label className="wide"><span>Justificativa</span><input value={inut.justification} onChange={(e) => setInut((current) => ({ ...current, justification: e.target.value }))} /></label><button onClick={() => void submitInutilization()} disabled={workingId === "inutilization"}>Inutilizar faixa</button></div>{inutilizations.length > 0 && <div className="dealer-inut-history">{inutilizations.slice(0, 6).map((row) => <span key={row.id}>Série {row.series} · {row.startNumber}–{row.endNumber} · {row.status}</span>)}</div>}</details>
    </main> : <main className="dealer-nfe-editor">
      <div className="dealer-editor-top"><div><span>Nova NF-e · série {company.nfeSeries || "—"}</span><h2>{steps[step]}</h2><p>O número fiscal só é reservado quando houver transmissão real à SEFAZ.</p></div><div className="dealer-editor-progress"><b>{step + 1}</b><span>de {steps.length}</span></div></div>

      <nav className="dealer-steps">{steps.map((label, index) => <button key={label} type="button" className={index === step ? "active" : index < step ? "done" : ""} onClick={() => setStep(index)}><i>{index < step ? "✓" : index + 1}</i><span>{label}</span></button>)}</nav>

      <div className="dealer-editor-workspace">
        {step === 0 && <section className="dealer-card dealer-form-card"><div className="dealer-card-head"><div><b>Dados da operação</b><span>Defina o tipo de saída e o ambiente fiscal.</span></div></div><div className="dealer-grid cols4"><label className="span2"><span>Natureza da operação *</span><input value={form.natureOperation} onChange={(e) => updateForm("natureOperation", e.target.value)} /></label><label><span>Ambiente fiscal</span><select value={form.environment} onChange={(e) => updateForm("environment", e.target.value)}><option value="homologation">Homologação</option><option value="production">Produção</option></select></label><label><span>Finalidade</span><select value={form.purpose} onChange={(e) => updateForm("purpose", e.target.value)}><option value="normal">Normal</option><option value="complementary">Complementar</option><option value="adjustment">Ajuste</option><option value="return">Devolução</option></select></label><label><span>Presença do comprador</span><select value={form.presenceIndicator} onChange={(e) => updateForm("presenceIndicator", e.target.value)}><option value="in_person">Presencial</option><option value="internet">Internet</option><option value="delivery">Entrega</option><option value="not_applicable">Não se aplica</option></select></label><label><span>Frete por conta</span><select value={form.freightMode} onChange={(e) => updateForm("freightMode", e.target.value)}><option value="no_freight">Sem frete</option><option value="sender">Emitente</option><option value="recipient">Destinatário</option><option value="third_party">Terceiros</option></select></label><label><span>Meio de pagamento *</span><input maxLength={2} value={form.paymentMethod} onChange={(e) => updateForm("paymentMethod", e.target.value.replace(/\D/g, ""))} placeholder="01" /></label><label className="dealer-checkbox"><input type="checkbox" checked={form.finalConsumer} onChange={(e) => updateForm("finalConsumer", e.target.checked)} /><span>Consumidor final</span></label></div></section>}

        {step === 1 && <section className="dealer-card dealer-form-card"><div className="dealer-card-head"><div><b>Comprador / destinatário</b><span>Use um cliente cadastrado ou preencha manualmente.</span></div><label className="dealer-customer-select"><span>Cliente cadastrado</span><select value={selectedCustomer} onChange={(e) => chooseCustomer(e.target.value)}><option value="">Selecionar cliente...</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.tradeName || customer.legalName} {customer.taxId ? `· ${customer.taxId}` : ""}</option>)}</select></label></div><div className="dealer-grid cols4"><label className="span2"><span>Nome / Razão social *</span><input value={form.recipientName} onChange={(e) => updateForm("recipientName", e.target.value)} /></label><label><span>CPF/CNPJ *</span><input value={form.recipientTaxId} onChange={(e) => updateForm("recipientTaxId", e.target.value.toUpperCase())} /></label><label><span>Indicador IE *</span><select value={form.recipientIeIndicator} onChange={(e) => updateForm("recipientIeIndicator", e.target.value)}><option value="1">1 - Contribuinte</option><option value="2">2 - Isento</option><option value="9">9 - Não contribuinte</option></select></label><label><span>Inscrição Estadual</span><input value={form.recipientStateRegistration} onChange={(e) => updateForm("recipientStateRegistration", e.target.value)} /></label><label className="span2"><span>Logradouro *</span><input value={form.recipientStreet} onChange={(e) => updateForm("recipientStreet", e.target.value)} /></label><label><span>Número *</span><input value={form.recipientNumber} onChange={(e) => updateForm("recipientNumber", e.target.value)} /></label><label><span>Complemento</span><input value={form.recipientComplement} onChange={(e) => updateForm("recipientComplement", e.target.value)} /></label><label><span>Bairro *</span><input value={form.recipientDistrict} onChange={(e) => updateForm("recipientDistrict", e.target.value)} /></label><label><span>Cidade *</span><input value={form.recipientCity} onChange={(e) => updateForm("recipientCity", e.target.value)} /></label><label><span>Código IBGE *</span><input maxLength={7} value={form.recipientCityCode} onChange={(e) => updateForm("recipientCityCode", e.target.value.replace(/\D/g, ""))} /></label><label><span>UF *</span><input maxLength={2} value={form.recipientState} onChange={(e) => updateForm("recipientState", e.target.value.toUpperCase())} /></label><label><span>CEP *</span><input maxLength={8} value={form.recipientPostalCode} onChange={(e) => updateForm("recipientPostalCode", e.target.value.replace(/\D/g, ""))} /></label><label><span>Telefone</span><input value={form.recipientPhone} onChange={(e) => updateForm("recipientPhone", e.target.value)} /></label><label className="span2"><span>E-mail</span><input value={form.recipientEmail} onChange={(e) => updateForm("recipientEmail", e.target.value)} /></label></div></section>}

        {step === 2 && <section className="dealer-card dealer-items-card"><div className="dealer-card-head"><div><b>Veículos, produtos e serviços</b><span>Veículos cadastrados aparecem primeiro e levam seus dados para o item da NF-e.</span></div><div className="dealer-item-picker"><select value={selectedCatalogItem} onChange={(e) => setSelectedCatalogItem(e.target.value)}><option value="">Selecionar do catálogo...</option>{catalog.map((item) => <option key={item.id} value={item.id}>{item.category === "vehicle" ? "🚗 " : ""}{item.sku ? `${item.sku} · ` : ""}{item.name} · {BRL.format((Number(item.priceCents) || 0) / 100)}</option>)}</select><button onClick={addCatalogItem} disabled={!selectedCatalogItem}>Adicionar</button><button onClick={() => { const next = blankItem(); setItems((current) => [...current, next]); setSelectedItemId(next.id); }}>Item manual</button></div></div><div className="dealer-items-list">{items.map((item, index) => <article key={item.id} className={`dealer-item ${selectedItemId === item.id ? "selected" : ""}`} onClick={() => setSelectedItemId(item.id)}><div className="dealer-item-number">{index + 1}</div><div className="dealer-item-main"><div className="dealer-item-row"><label><span>Código</span><input value={item.code} onChange={(e) => updateItem(item.id, "code", e.target.value)} /></label><label className="grow"><span>Descrição</span><input value={item.description} onChange={(e) => updateItem(item.id, "description", e.target.value)} /></label><label><span>NCM</span><input maxLength={8} value={item.ncm} onChange={(e) => updateItem(item.id, "ncm", e.target.value.replace(/\D/g, ""))} /></label><label><span>CFOP</span><input maxLength={4} value={item.cfop} onChange={(e) => updateItem(item.id, "cfop", e.target.value.replace(/\D/g, ""))} /></label></div><div className="dealer-item-row compact"><label><span>Un.</span><input value={item.unit} onChange={(e) => updateItem(item.id, "unit", e.target.value.toUpperCase())} /></label><label><span>Quantidade</span><input type="number" step="0.0001" value={item.quantity} onChange={(e) => updateItem(item.id, "quantity", Number(e.target.value))} /></label><label><span>Valor unitário</span><input type="number" step="0.01" value={item.unitPrice} onChange={(e) => updateItem(item.id, "unitPrice", Number(e.target.value))} /></label><div className="dealer-item-total"><span>Total</span><b>{BRL.format((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0))}</b></div><button className="dealer-remove" disabled={items.length === 1} onClick={(e) => { e.stopPropagation(); setItems((current) => current.filter((row) => row.id !== item.id)); }}>Remover</button></div>{item.vehicle && <div className="dealer-vehicle-block"><div className="dealer-vehicle-title"><span>🚗</span><div><b>{[item.vehicle.make, item.vehicle.model, item.vehicle.version].filter(Boolean).join(" ") || item.description}</b><small>Dados que serão exibidos abaixo deste veículo no DANFE</small></div></div><div className="dealer-vehicle-specs">{vehiclePairs(item.vehicle).map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}</div></div>}</div></article>)}</div></section>}

        {step === 3 && <section className="dealer-card dealer-tax-card"><div className="dealer-card-head"><div><b>Tributação do item</b><span>Selecione o item e revise os códigos fiscais antes da emissão.</span></div><select value={selectedItem?.id || ""} onChange={(e) => setSelectedItemId(e.target.value)}>{items.map((item, index) => <option key={item.id} value={item.id}>Item {index + 1} · {item.description || item.code || "Sem descrição"}</option>)}</select></div>{selectedItem ? <div className="dealer-grid cols4"><label><span>GTIN</span><input value={selectedItem.gtin} onChange={(e) => updateItem(selectedItem.id, "gtin", e.target.value.toUpperCase())} /></label><label><span>Origem *</span><select value={selectedItem.origin} onChange={(e) => updateItem(selectedItem.id, "origin", e.target.value)}><option value="">Selecione</option>{[0,1,2,3,4,5,6,7,8].map((value) => <option key={value} value={String(value)}>{value}</option>)}</select></label><label><span>CEST</span><input value={selectedItem.cest} onChange={(e) => updateItem(selectedItem.id, "cest", e.target.value.replace(/\D/g, ""))} /></label><div className="dealer-tax-divider span4"><b>ICMS</b></div>{isSimple ? <><label><span>CSOSN *</span><input value={selectedItem.csosn} onChange={(e) => updateItem(selectedItem.id, "csosn", e.target.value.replace(/\D/g, ""))} /></label><label><span>% Crédito</span><input value={selectedItem.simpleCreditRate} onChange={(e) => updateItem(selectedItem.id, "simpleCreditRate", e.target.value)} /></label></> : <><label><span>CST ICMS *</span><input value={selectedItem.cst} onChange={(e) => updateItem(selectedItem.id, "cst", e.target.value.replace(/\D/g, ""))} /></label><label><span>Base ICMS</span><input value={selectedItem.icmsBase} onChange={(e) => updateItem(selectedItem.id, "icmsBase", e.target.value)} /></label><label><span>% ICMS</span><input value={selectedItem.icmsRate} onChange={(e) => updateItem(selectedItem.id, "icmsRate", e.target.value)} /></label></>}<div className="dealer-tax-divider span4"><b>PIS / COFINS</b></div><label><span>CST PIS *</span><input value={selectedItem.pisCst} onChange={(e) => updateItem(selectedItem.id, "pisCst", e.target.value.replace(/\D/g, ""))} /></label><label><span>Base PIS</span><input value={selectedItem.pisBase} onChange={(e) => updateItem(selectedItem.id, "pisBase", e.target.value)} /></label><label><span>% PIS</span><input value={selectedItem.pisRate} onChange={(e) => updateItem(selectedItem.id, "pisRate", e.target.value)} /></label><label><span>CST COFINS *</span><input value={selectedItem.cofinsCst} onChange={(e) => updateItem(selectedItem.id, "cofinsCst", e.target.value.replace(/\D/g, ""))} /></label><label><span>Base COFINS</span><input value={selectedItem.cofinsBase} onChange={(e) => updateItem(selectedItem.id, "cofinsBase", e.target.value)} /></label><label><span>% COFINS</span><input value={selectedItem.cofinsRate} onChange={(e) => updateItem(selectedItem.id, "cofinsRate", e.target.value)} /></label>{isNormalRegime && <><div className="dealer-tax-divider span4"><b>IBS / CBS</b></div><label><span>CST IBS/CBS *</span><input value={selectedItem.ibsCbsCst} onChange={(e) => updateItem(selectedItem.id, "ibsCbsCst", e.target.value.replace(/\D/g, ""))} /></label><label><span>cClassTrib *</span><input value={selectedItem.cClassTrib} onChange={(e) => updateItem(selectedItem.id, "cClassTrib", e.target.value.replace(/\D/g, ""))} /></label><label><span>Base IBS/CBS</span><input value={selectedItem.ibsCbsBase} onChange={(e) => updateItem(selectedItem.id, "ibsCbsBase", e.target.value)} /></label><label><span>% IBS UF</span><input value={selectedItem.ibsUfRate} onChange={(e) => updateItem(selectedItem.id, "ibsUfRate", e.target.value)} /></label><label><span>% IBS Município</span><input value={selectedItem.ibsMunRate} onChange={(e) => updateItem(selectedItem.id, "ibsMunRate", e.target.value)} /></label><label><span>% CBS</span><input value={selectedItem.cbsRate} onChange={(e) => updateItem(selectedItem.id, "cbsRate", e.target.value)} /></label></>}</div> : <div className="dealer-empty">Nenhum item selecionado.</div>}</section>}

        {step === 4 && <div className="dealer-totals-layout"><section className="dealer-card dealer-form-card"><div className="dealer-card-head"><div><b>Totais e informações complementares</b><span>Valores adicionais da operação.</span></div></div><div className="dealer-grid cols3"><label><span>Frete</span><input type="number" min="0" step="0.01" value={form.freight} onChange={(e) => updateForm("freight", Number(e.target.value))} /></label><label><span>Desconto</span><input type="number" min="0" step="0.01" value={form.discount} onChange={(e) => updateForm("discount", Number(e.target.value))} /></label><label><span>Outras despesas</span><input type="number" min="0" step="0.01" value={form.other} onChange={(e) => updateForm("other", Number(e.target.value))} /></label><label className="span3"><span>Informações complementares</span><textarea rows={7} value={form.notes} onChange={(e) => updateForm("notes", e.target.value)} placeholder="Observações da operação. Os dados técnicos do veículo ficam vinculados ao próprio item." /></label></div></section><aside className="dealer-card dealer-total-card"><span>Resumo da NF-e</span><div><small>Produtos / veículos</small><b>{BRL.format(totals.products)}</b></div><div><small>Frete</small><b>{BRL.format(Number(form.freight) || 0)}</b></div><div><small>Outras despesas</small><b>{BRL.format(Number(form.other) || 0)}</b></div><div><small>Desconto</small><b>- {BRL.format(Number(form.discount) || 0)}</b></div><strong><small>Total da NF-e</small><b>{BRL.format(totals.total)}</b></strong></aside></div>}

        {step === 5 && <section className="dealer-review"><div className="dealer-review-grid"><div className="dealer-card"><span>Emitente</span><b>{companyName}</b><small>{formatCnpj(company.taxId)}</small><small>Série {company.nfeSeries || "—"} · {form.environment === "production" ? "Produção" : "Homologação"}</small></div><div className="dealer-card"><span>Comprador</span><b>{form.recipientName || "Não informado"}</b><small>{form.recipientTaxId || "CPF/CNPJ pendente"}</small><small>{[form.recipientCity, form.recipientState].filter(Boolean).join("/")}</small></div><div className="dealer-card"><span>Itens</span><b>{items.length}</b><small>{items.filter((item) => item.vehicle).length} veículo(s)</small><small>{BRL.format(totals.products)} em produtos</small></div><div className="dealer-card highlight"><span>Total</span><b>{BRL.format(totals.total)}</b><small>{emissionMode === "simulation" ? "Transmitir NF-e abrirá um documento de teste" : "Transmitir NF-e enviará para a SEFAZ"}</small></div></div><div className={`dealer-review-readiness ${collectErrors().length ? "blocked" : "ready"}`}><div><b>{collectErrors().length ? `${collectErrors().length} pendência(s) de preenchimento` : "NF-e pronta para a próxima ação"}</b><span>{collectErrors()[0] || (emissionMode === "simulation" ? "Modo teste ativo: chave e código de barras serão gerados localmente e a SEFAZ não será chamada." : "Modo SEFAZ real ativo: certificado e configuração fiscal serão usados na transmissão.")}</span></div>{emissionMode === "sefaz" && <span className={readyForSefaz ? "ok" : "warn"}>{readyForSefaz ? "A1 + SEFAZ OK" : "SEFAZ bloqueada"}</span>}</div></section>}
      </div>

      <footer className="dealer-editor-footer"><div><button className="dealer-secondary" onClick={() => setView("list")}>Cancelar</button><button className="dealer-secondary" onClick={() => void saveDraft(false)} disabled={saving}>Salvar rascunho</button></div><div className="dealer-footer-nav"><button className="dealer-secondary" disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))}>← Anterior</button>{step < steps.length - 1 ? <button className="dealer-primary" onClick={() => setStep((current) => Math.min(steps.length - 1, current + 1))}>Próximo →</button> : <button className="dealer-primary transmit" onClick={() => void saveDraft(true)} disabled={saving || (emissionMode === "sefaz" && !readyForSefaz)}>{saving ? "Processando..." : "Transmitir NF-e"}</button>}</div></footer>
    </main>}

    {simulationOpen && simulationDraft && <div className="dealer-simulation-overlay" role="dialog" aria-modal="true" aria-label="NF-e sem valor fiscal"><div className="dealer-simulation-window"><header className="dealer-simulation-toolbar no-print"><div><span>Documento de teste</span><b>NF-e gerada localmente</b><small>Sem comunicação com a SEFAZ</small></div><div><button onClick={() => { const next = { ...simulationDraft, accessKey: invalidSimulationKey(), nfeNumber: randomSimulationNumber() }; next.transmission = { ...(next.transmission || {}), accessKey: next.accessKey, number: next.nfeNumber }; setSimulationDraft(next); }}>Nova chave</button><button onClick={() => window.print()}>Imprimir / PDF</button><button className="close" onClick={() => setSimulationOpen(false)}>Fechar</button></div></header><div className="dealer-simulation-stage"><div className="dealer-simulation-paper"><div className="dealer-simulation-watermark">SEM VALOR FISCAL</div><NfeDanfeReferencePreview draft={simulationDraft} company={companyWithLogo} snapshot={simulationDraft} /></div></div></div></div>}
  </div>;
}
