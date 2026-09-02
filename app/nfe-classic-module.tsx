"use client";

import { useEffect, useMemo, useState } from "react";
import { readCatalog, type CatalogItem } from "./catalog-core";

type CompanyProfile = {
  taxRegime?: string; nfeSeries?: string; nfeNextNumber?: string; state?: string;
  legalName?: string; tradeName?: string; taxId?: string; stateRegistration?: string;
};
type Customer = {
  id: string; legalName?: string; tradeName?: string | null; taxId?: string | null; stateRegistration?: string | null;
  postalCode?: string | null; street?: string | null; number?: string | null; district?: string | null; city?: string | null;
  cityCode?: string | null; state?: string | null; email?: string | null; phone?: string | null; complement?: string | null;
};
type NfeItem = {
  id: string; catalogItemId?: string; code: string; description: string; ncm: string; cest: string; cfop: string; unit: string;
  quantity: number; unitPrice: number; gtin: string; origin: string; cst: string; csosn: string;
  simpleCreditRate: string; icmsBase: string; icmsRate: string; pisCst: string; pisBase: string; pisRate: string;
  cofinsCst: string; cofinsBase: string; cofinsRate: string; ibsCbsCst: string; cClassTrib: string;
  ibsCbsBase: string; ibsUfRate: string; ibsMunRate: string; cbsRate: string;
};
type Cancellation = { accepted?: boolean; protocol?: string; cStat?: string; xMotivo?: string; registeredAt?: string; late?: boolean };
type Transmission = {
  status?: string; accessKey?: string; protocol?: string; receipt?: string; cStat?: string; xMotivo?: string;
  number?: number; series?: number; updatedAt?: string; cancellation?: Cancellation | null;
};
type DraftRow = {
  id: string; natureOperation: string; recipientName: string; recipientTaxId: string; totalCents: number;
  validationStatus: string; environment: string; createdAt: string; items?: NfeItem[]; transmission?: Transmission | null;
  transmissionStatus?: string | null; cancellation?: Cancellation | null; accessKey?: string | null; protocol?: string | null;
  nfeNumber?: number | null; nfeSeries?: number | null;
};
type Inutilization = {
  id: string; environment: string; year: number; series: number; startNumber: number; endNumber: number;
  status: string; protocol?: string | null; cStat?: string | null; xMotivo?: string | null; receivedAt?: string | null;
};
type Readiness = {
  transmissionEnabled: boolean; environment: string; blockers: string[];
  protocol?: { documentVersion?: string; schemaVersion?: string; manualVersion?: string };
};

const makeId = () => typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `nfe-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const defaultReadiness: Readiness = { transmissionEnabled: false, environment: "homologation", blockers: [] };

const newItem = (): NfeItem => ({
  id: makeId(), code: "", description: "", ncm: "", cest: "", cfop: "", unit: "UN", quantity: 1, unitPrice: 0,
  gtin: "SEM GTIN", origin: "", cst: "", csosn: "", simpleCreditRate: "", icmsBase: "", icmsRate: "",
  pisCst: "", pisBase: "", pisRate: "", cofinsCst: "", cofinsBase: "", cofinsRate: "",
  ibsCbsCst: "", cClassTrib: "", ibsCbsBase: "", ibsUfRate: "", ibsMunRate: "", cbsRate: "",
});

const emptyForm = () => ({
  environment: "homologation", natureOperation: "", purpose: "normal", finalConsumer: false,
  presenceIndicator: "not_applicable", freightMode: "no_freight", recipientName: "", recipientTaxId: "",
  recipientIeIndicator: "", recipientStateRegistration: "", recipientStreet: "", recipientNumber: "",
  recipientComplement: "", recipientDistrict: "", recipientCity: "", recipientCityCode: "", recipientState: "RS",
  recipientPostalCode: "", recipientPhone: "", recipientEmail: "", paymentMethod: "", freight: 0, discount: 0,
  other: 0, notes: "",
});

const emptyInutilization = () => ({
  environment: "homologation", year: new Date().getFullYear(), series: "", startNumber: "", endNumber: "", justification: "",
});

function statusLabel(draft: DraftRow) {
  const status = draft.transmissionStatus || draft.transmission?.status;
  if (status === "cancelled") return "Cancelada";
  if (status === "authorized") return "Autorizada";
  if (status === "processing") return "Processando";
  if (status === "rejected") return "Rejeitada";
  if (status === "external_error") return "Falha externa";
  if (status === "signed") return "Assinada";
  return draft.validationStatus === "ready_for_fiscal_review" ? "Rascunho pronto" : "Com pendências";
}

function itemFromCatalog(item: CatalogItem): NfeItem {
  return {
    ...newItem(), catalogItemId: item.id, code: item.sku || item.id.slice(0, 8).toUpperCase(),
    description: item.name, ncm: item.ncm || "", cest: item.cest || "", cfop: item.defaultCfop || "",
    unit: item.unit || "UN", quantity: 1, unitPrice: (Number(item.priceCents) || 0) / 100,
    gtin: item.gtin || "SEM GTIN", origin: item.origin || "", cst: item.cst || "", csosn: item.csosn || "",
    pisCst: item.pisCst || "", cofinsCst: item.cofinsCst || "", ibsCbsCst: item.ibsCbsCst || "", cClassTrib: item.cClassTrib || "",
  };
}

export default function NfeClassicModule() {
  const [view, setView] = useState<"list" | "editor">("list");
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [inutilizations, setInutilizations] = useState<Inutilization[]>([]);
  const [readiness, setReadiness] = useState<Readiness>(defaultReadiness);
  const [company, setCompany] = useState<CompanyProfile>({});
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [selectedCatalogItem, setSelectedCatalogItem] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [a1Ready, setA1Ready] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [workingId, setWorkingId] = useState("");
  const [notice, setNotice] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [items, setItems] = useState<NfeItem[]>([newItem()]);
  const [inut, setInut] = useState(emptyInutilization);

  const isNormalRegime = ["lucro_presumido", "lucro_real"].includes(company.taxRegime || "");
  const isSimple = ["simples_nacional", "simples_excesso"].includes(company.taxRegime || "");
  const selectedItem = items.find((item) => item.id === selectedItemId) || items[0] || null;

  const load = async () => {
    setLoading(true);
    try {
      const [draftResponse, companyResponse, customerResponse] = await Promise.all([
        fetch("/api/nfe-drafts"), fetch("/api/company"), fetch("/api/customers"),
      ]);
      const [draftData, companyData, customerData] = await Promise.all([draftResponse.json(), companyResponse.json(), customerResponse.json()]);
      if (!draftResponse.ok) throw new Error(draftData.error || "Não foi possível carregar NF-e.");
      setDrafts(draftData.drafts || []);
      setInutilizations(draftData.inutilizations || []);
      if (draftData.readiness) setReadiness(draftData.readiness);
      if (companyResponse.ok) setCompany(companyData.company || {});
      if (customerResponse.ok) setCustomers(customerData.customers || []);
      setCatalog(readCatalog().filter((item) => item.status === "active").sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
      const bridge = (window as any).sevenDesktop;
      if (bridge?.integrationSecretsStatus) {
        const info = await bridge.integrationSecretsStatus("nfe_sefaz");
        setA1Ready(Boolean(info?.certificateId));
      }
    } catch (caught) {
      setErrors([caught instanceof Error ? caught.message : "Falha ao carregar o módulo fiscal."]);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    void load();
    const catalogHandler = () => setCatalog(readCatalog().filter((item) => item.status === "active").sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
    window.addEventListener("seven:catalog-updated", catalogHandler);
    return () => window.removeEventListener("seven:catalog-updated", catalogHandler);
  }, []);

  const totals = useMemo(() => {
    const products = items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0);
    return { products, total: Math.max(0, products + Number(form.freight) + Number(form.other) - Number(form.discount)) };
  }, [items, form.freight, form.other, form.discount]);

  const updateForm = (field: string, value: string | number | boolean) => setForm((current) => ({ ...current, [field]: value }));
  const updateItem = (id: string, field: keyof NfeItem, value: string | number) => setItems((current) => current.map((item) => item.id === id ? { ...item, [field]: value } : item));

  const chooseCustomer = (id: string) => {
    setSelectedCustomer(id);
    const customer = customers.find((row) => row.id === id);
    if (!customer) return;
    setForm((current) => ({
      ...current,
      recipientName: customer.tradeName || customer.legalName || "",
      recipientTaxId: customer.taxId || "",
      recipientStateRegistration: customer.stateRegistration || "",
      recipientIeIndicator: customer.stateRegistration ? "1" : current.recipientIeIndicator,
      recipientStreet: customer.street || "",
      recipientNumber: customer.number || "",
      recipientComplement: customer.complement || "",
      recipientDistrict: customer.district || "",
      recipientCity: customer.city || "",
      recipientCityCode: customer.cityCode || "",
      recipientState: customer.state || current.recipientState || "RS",
      recipientPostalCode: String(customer.postalCode || "").replace(/\D/g, ""),
      recipientPhone: customer.phone || "",
      recipientEmail: customer.email || "",
    }));
  };

  const addCatalogItem = () => {
    const item = catalog.find((row) => row.id === selectedCatalogItem);
    if (!item) return;
    const next = itemFromCatalog(item);
    setItems((current) => {
      const clean = current.length === 1 && !current[0].description && !current[0].code ? [] : current;
      return [...clean, next];
    });
    setSelectedItemId(next.id);
    setSelectedCatalogItem("");
  };

  const validateBasic = () => {
    const next: string[] = [];
    if (!form.natureOperation.trim()) next.push("Informe a natureza da operação.");
    if (!form.recipientName.trim() || !form.recipientTaxId.trim()) next.push("Informe o destinatário e CPF/CNPJ.");
    if (!["1", "2", "9"].includes(form.recipientIeIndicator)) next.push("Informe o indicador de IE do destinatário.");
    if (form.recipientIeIndicator === "1" && !form.recipientStateRegistration.trim()) next.push("Destinatário contribuinte exige Inscrição Estadual.");
    for (const [value, label] of [[form.recipientStreet, "logradouro"], [form.recipientNumber, "número"], [form.recipientDistrict, "bairro"], [form.recipientCity, "cidade"]]) {
      if (!String(value).trim()) next.push(`Informe ${label} do destinatário.`);
    }
    if (!/^\d{7}$/.test(form.recipientCityCode)) next.push("Código IBGE do destinatário deve ter 7 dígitos.");
    if (!/^\d{8}$/.test(form.recipientPostalCode)) next.push("CEP do destinatário deve ter 8 dígitos.");
    if (!/^\d{2}$/.test(form.paymentMethod)) next.push("Informe o código do meio de pagamento.");
    items.forEach((item, index) => {
      const label = `Item ${index + 1}`;
      if (!item.code.trim() || !item.description.trim()) next.push(`${label}: informe código e descrição.`);
      if (!/^\d{8}$/.test(item.ncm)) next.push(`${label}: NCM deve ter 8 dígitos.`);
      if (!/^\d{4}$/.test(item.cfop)) next.push(`${label}: CFOP deve ter 4 dígitos.`);
      if (!item.unit.trim() || !item.gtin.trim() || !item.origin.trim()) next.push(`${label}: unidade, GTIN/SEM GTIN e origem são obrigatórios.`);
      if (!(item.quantity > 0) || !(item.unitPrice > 0)) next.push(`${label}: quantidade e valor devem ser maiores que zero.`);
      if (isSimple && !item.csosn.trim()) next.push(`${label}: informe CSOSN.`);
      if (isNormalRegime && !item.cst.trim()) next.push(`${label}: informe CST ICMS.`);
      if (!item.pisCst.trim() || !item.cofinsCst.trim()) next.push(`${label}: informe CST PIS e COFINS.`);
      if (isNormalRegime && (!item.ibsCbsCst.trim() || !item.cClassTrib.trim())) next.push(`${label}: informe CST IBS/CBS e cClassTrib.`);
    });
    setErrors(next);
    return next;
  };

  const startNew = () => {
    const first = newItem();
    setForm(emptyForm()); setItems([first]); setSelectedItemId(first.id); setSelectedCustomer(""); setSelectedCatalogItem("");
    setErrors([]); setNotice(""); setView("editor");
  };

  const payloadForDraft = () => ({
    ...form,
    items: items.map(({ id: _id, catalogItemId: _catalogItemId, ...item }) => ({
      ...item, quantity: Number(item.quantity), unitPrice: Number(item.unitPrice),
      simpleCreditRate: item.simpleCreditRate === "" ? undefined : Number(item.simpleCreditRate),
      icmsBase: item.icmsBase === "" ? undefined : Number(item.icmsBase), icmsRate: item.icmsRate === "" ? undefined : Number(item.icmsRate),
      pisBase: item.pisBase === "" ? undefined : Number(item.pisBase), pisRate: item.pisRate === "" ? undefined : Number(item.pisRate),
      cofinsBase: item.cofinsBase === "" ? undefined : Number(item.cofinsBase), cofinsRate: item.cofinsRate === "" ? undefined : Number(item.cofinsRate),
      ibsCbsBase: item.ibsCbsBase === "" ? undefined : Number(item.ibsCbsBase), ibsUfRate: item.ibsUfRate === "" ? undefined : Number(item.ibsUfRate),
      ibsMunRate: item.ibsMunRate === "" ? undefined : Number(item.ibsMunRate), cbsRate: item.cbsRate === "" ? undefined : Number(item.cbsRate),
    })),
    idempotencyKey: makeId(),
  });

  const saveDraft = async (transmitAfter = false) => {
    setSaving(true); setErrors([]); setNotice("");
    try {
      const validation = validateBasic();
      if (validation.length) throw new Error("Revise as pendências indicadas antes de salvar a NF-e.");
      const response = await fetch("/api/nfe-drafts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payloadForDraft()) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar a NF-e.");
      const draftId = data.draft?.id;
      if (transmitAfter && draftId) {
        const txResponse = await fetch("/api/nfe-drafts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "transmit", draftId }) });
        const txData = await txResponse.json();
        if (!txResponse.ok && txResponse.status !== 202) throw new Error(txData.error || txData.message || "A SEFAZ recusou a transmissão.");
        setNotice(txData.status === "authorized" || txData.transmission?.status === "authorized" ? `NF-e autorizada${txData.protocol || txData.transmission?.protocol ? ` · Protocolo ${txData.protocol || txData.transmission.protocol}` : ""}.` : "NF-e enviada. Consulte o processamento na fila fiscal.");
      } else {
        setNotice("Rascunho de NF-e salvo.");
      }
      setView("list"); await load();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Não foi possível salvar a NF-e.";
      setErrors((current) => current.length ? current : [message]);
    } finally { setSaving(false); }
  };

  const runAction = async (draftId: string, action: "transmit" | "consult_receipt" | "consult_protocol" | "cancel", extra: Record<string, unknown> = {}) => {
    setWorkingId(draftId); setErrors([]); setNotice("");
    try {
      const response = await fetch("/api/nfe-drafts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, draftId, ...extra }) });
      const data = await response.json();
      if (!response.ok && response.status !== 202) {
        const details = Array.isArray(data.blockers) ? data.blockers : [];
        throw new Error([data.error || data.message || "Operação fiscal recusada.", ...details].filter(Boolean).join(" · "));
      }
      if (data.status === "cancelled") setNotice(`NF-e cancelada${data.cancellation?.protocol ? ` · Protocolo ${data.cancellation.protocol}` : ""}.`);
      else if (data.status === "authorized" || data.transmission?.status === "authorized") setNotice(`NF-e autorizada${data.protocol || data.transmission?.protocol ? ` · Protocolo ${data.protocol || data.transmission.protocol}` : ""}.`);
      else if (response.status === 202 || data.status === "processing") setNotice("A SEFAZ ainda está processando. Consulte o recibo.");
      else setNotice(data.message || data.xMotivo || data.transmission?.xMotivo || "Operação concluída.");
      await load();
    } catch (caught) { setErrors([caught instanceof Error ? caught.message : "Falha na operação fiscal."]); }
    finally { setWorkingId(""); }
  };

  const requestCancellation = async (draft: DraftRow) => {
    const justification = window.prompt("Justificativa do cancelamento (15 a 255 caracteres):", "");
    if (justification === null) return;
    if (justification.trim().length < 15) return setErrors(["A justificativa do cancelamento deve ter pelo menos 15 caracteres."]);
    await runAction(draft.id, "cancel", { justification: justification.trim() });
  };

  const saveDanfe = async (draft: DraftRow) => {
    setWorkingId(`danfe:${draft.id}`); setErrors([]); setNotice("");
    try {
      const bridge = (window as any).sevenDesktop;
      if (!bridge?.nfeDanfePdf) throw new Error("A geração de DANFE requer o aplicativo desktop atualizado.");
      const result = await bridge.nfeDanfePdf(draft.id);
      if (result?.canceled) return;
      if (!result?.saved) throw new Error("O DANFE não foi salvo.");
      setNotice(`DANFE PDF salvo${result.filePath ? ` · ${result.filePath}` : ""}.`);
    } catch (caught) { setErrors([caught instanceof Error ? caught.message : "Falha ao gerar o DANFE."]); }
    finally { setWorkingId(""); }
  };

  const submitInutilization = async () => {
    setWorkingId("inutilization"); setErrors([]); setNotice("");
    try {
      if (inut.justification.trim().length < 15) throw new Error("Justificativa deve ter pelo menos 15 caracteres.");
      const response = await fetch("/api/nfe-drafts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "inutilize", environment: inut.environment, year: Number(inut.year), series: inut.series, startNumber: inut.startNumber, endNumber: inut.endNumber, justification: inut.justification.trim() }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Inutilização não aceita.");
      setNotice(`Faixa inutilizada${data.inutilization?.protocol ? ` · Protocolo ${data.inutilization.protocol}` : ""}.`);
      setInut(emptyInutilization()); await load();
    } catch (caught) { setErrors([caught instanceof Error ? caught.message : "Falha na inutilização."]); }
    finally { setWorkingId(""); }
  };

  const taxRegimeLabel = isNormalRegime ? "Regime normal" : isSimple ? "Simples Nacional" : company.taxRegime === "mei" ? "MEI" : "Não configurado";

  return <div className="module-view nfe-workspace nfe-classic-workspace">
    <div className="page-heading module-heading nfe-classic-heading">
      <div><span className="eyebrow">Fiscal · NF-e modelo 55</span><h1>Nota Fiscal Eletrônica</h1><p>Emissor clássico com preenchimento por clientes e produtos cadastrados.</p></div>
      <div className="nfe-heading-actions">{view === "editor" && <button className="classic-button" onClick={() => setView("list")}>Voltar</button>}<button className="classic-button primary" onClick={startNew}>Nova NF-e</button></div>
    </div>

    <div className="nfe-classic-statusbar"><span>NF-e 4.00</span><b>{taxRegimeLabel}</b><span>A1: {a1Ready ? "vinculado" : "pendente"}</span><span>Série: {company.nfeSeries || "—"}</span><span>Próximo nº: {company.nfeNextNumber || "—"}</span><span>Ambiente padrão: {readiness.environment === "production" ? "Produção" : "Homologação"}</span></div>

    {errors.length > 0 && <div className="nfe-classic-message error"><strong>Pendências:</strong><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div>}
    {notice && <div className="nfe-classic-message success">{notice}</div>}

    {view === "list" ? <>
      <section className="nfe-classic-list">
        <div className="nfe-classic-list-head"><strong>Notas fiscais e rascunhos</strong><div><button className="classic-button" onClick={() => void load()}>Atualizar</button><button className="classic-button primary" onClick={startNew}>Nova NF-e</button></div></div>
        <div className="nfe-classic-table-wrap"><table className="nfe-classic-table"><thead><tr><th>Número</th><th>Emissão</th><th>Destinatário</th><th>CPF/CNPJ</th><th>Valor</th><th>Ambiente</th><th>Situação</th><th>Ações</th></tr></thead><tbody>
          {loading ? <tr><td colSpan={8}>Carregando...</td></tr> : drafts.map((draft) => <tr key={draft.id}><td><b>{draft.nfeNumber ? String(draft.nfeNumber).padStart(9, "0") : "Rascunho"}</b><small>{draft.nfeSeries ? `Série ${draft.nfeSeries}` : ""}</small></td><td>{new Date(draft.createdAt).toLocaleDateString("pt-BR")}</td><td><b>{draft.recipientName}</b></td><td>{draft.recipientTaxId}</td><td className="number">{money.format((draft.totalCents || 0) / 100)}</td><td>{draft.environment === "production" ? "Produção" : "Homologação"}</td><td><span className={`classic-status ${String(draft.transmissionStatus || "draft")}`}>{statusLabel(draft)}</span></td><td><div className="classic-actions">
            {(!draft.transmissionStatus || ["rejected", "external_error"].includes(String(draft.transmissionStatus))) && <button onClick={() => void runAction(draft.id, "transmit")} disabled={workingId === draft.id}>Transmitir</button>}
            {draft.transmissionStatus === "processing" && <button onClick={() => void runAction(draft.id, "consult_receipt")}>Recibo</button>}
            {draft.accessKey && <button onClick={() => void runAction(draft.id, "consult_protocol")}>Consultar</button>}
            {["authorized", "cancelled"].includes(String(draft.transmissionStatus)) && <button onClick={() => void saveDanfe(draft)}>DANFE</button>}
            {draft.transmissionStatus === "authorized" && <button onClick={() => void requestCancellation(draft)}>Cancelar</button>}
          </div></td></tr>)}
          {!loading && !drafts.length && <tr><td colSpan={8} className="classic-empty">Nenhuma NF-e emitida. Clique em “Nova NF-e”.</td></tr>}
        </tbody></table></div>
      </section>

      <details className="nfe-classic-inutilization"><summary>Inutilização de numeração</summary><div className="classic-section-body"><div className="classic-grid six"><label>Ambiente<select value={inut.environment} onChange={(e) => setInut((c) => ({ ...c, environment: e.target.value }))}><option value="homologation">Homologação</option><option value="production">Produção</option></select></label><label>Ano<input type="number" value={inut.year} onChange={(e) => setInut((c) => ({ ...c, year: Number(e.target.value) }))} /></label><label>Série<input value={inut.series} onChange={(e) => setInut((c) => ({ ...c, series: e.target.value.replace(/\D/g, "") }))} /></label><label>Nº inicial<input value={inut.startNumber} onChange={(e) => setInut((c) => ({ ...c, startNumber: e.target.value.replace(/\D/g, "") }))} /></label><label>Nº final<input value={inut.endNumber} onChange={(e) => setInut((c) => ({ ...c, endNumber: e.target.value.replace(/\D/g, "") }))} /></label><label className="span-2">Justificativa<input value={inut.justification} onChange={(e) => setInut((c) => ({ ...c, justification: e.target.value }))} /></label></div><div className="classic-section-actions"><button className="classic-button" disabled={workingId === "inutilization"} onClick={() => void submitInutilization()}>Inutilizar faixa</button></div>{inutilizations.length > 0 && <table className="nfe-classic-table compact"><thead><tr><th>Faixa</th><th>Ano</th><th>Status</th><th>Protocolo</th></tr></thead><tbody>{inutilizations.slice(0, 8).map((row) => <tr key={row.id}><td>Série {row.series} · {row.startNumber} a {row.endNumber}</td><td>{row.year}</td><td>{row.status}</td><td>{row.protocol || row.xMotivo || "—"}</td></tr>)}</tbody></table>}</div></details>
    </> : <div className="nfe-classic-form">
      <div className="nfe-classic-toolbar"><div><b>Nova NF-e</b><span>Série {company.nfeSeries || "—"} · Nº será reservado no envio</span></div><div><button className="classic-button" onClick={() => setView("list")}>Cancelar</button><button className="classic-button" disabled={saving} onClick={() => void saveDraft(false)}>Salvar rascunho</button><button className="classic-button primary" disabled={saving} onClick={() => void saveDraft(true)}>{saving ? "Processando..." : "Salvar e transmitir"}</button></div></div>

      <section className="classic-section"><h2>Identificação da NF-e</h2><div className="classic-section-body"><div className="classic-grid six">
        <label className="span-2">Natureza da operação *<input value={form.natureOperation} onChange={(e) => updateForm("natureOperation", e.target.value)} /></label>
        <label>Ambiente *<select value={form.environment} onChange={(e) => updateForm("environment", e.target.value)}><option value="homologation">Homologação</option><option value="production">Produção</option></select></label>
        <label>Finalidade<select value={form.purpose} onChange={(e) => updateForm("purpose", e.target.value)}><option value="normal">Normal</option><option value="complementary">Complementar</option><option value="adjustment">Ajuste</option><option value="return">Devolução</option></select></label>
        <label>Presença<select value={form.presenceIndicator} onChange={(e) => updateForm("presenceIndicator", e.target.value)}><option value="not_applicable">Não se aplica</option><option value="in_person">Presencial</option><option value="internet">Internet</option><option value="delivery">Entrega</option></select></label>
        <label>Frete<select value={form.freightMode} onChange={(e) => updateForm("freightMode", e.target.value)}><option value="no_freight">Sem frete</option><option value="sender">Emitente</option><option value="recipient">Destinatário</option><option value="third_party">Terceiros</option></select></label>
        <label>Pagamento *<input maxLength={2} value={form.paymentMethod} onChange={(e) => updateForm("paymentMethod", e.target.value.replace(/\D/g, ""))} placeholder="Ex.: 01, 03, 17" /></label>
        <label className="classic-check"><input type="checkbox" checked={form.finalConsumer} onChange={(e) => updateForm("finalConsumer", e.target.checked)} /> Consumidor final</label>
      </div></div></section>

      <section className="classic-section"><h2>Destinatário</h2><div className="classic-section-body">
        <div className="classic-pick-row"><label>Cliente cadastrado<select value={selectedCustomer} onChange={(e) => chooseCustomer(e.target.value)}><option value="">Selecione um cliente...</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.tradeName || customer.legalName} {customer.taxId ? `· ${customer.taxId}` : ""}</option>)}</select></label><span>Ao selecionar, os dados existentes são preenchidos automaticamente.</span></div>
        <div className="classic-grid six">
          <label className="span-2">Nome / Razão social *<input value={form.recipientName} onChange={(e) => updateForm("recipientName", e.target.value)} /></label><label>CPF/CNPJ *<input value={form.recipientTaxId} onChange={(e) => updateForm("recipientTaxId", e.target.value.toUpperCase())} /></label><label>Indicador IE *<select value={form.recipientIeIndicator} onChange={(e) => updateForm("recipientIeIndicator", e.target.value)}><option value="">Selecione</option><option value="1">1 - Contribuinte</option><option value="2">2 - Isento</option><option value="9">9 - Não contribuinte</option></select></label><label>Inscrição Estadual<input value={form.recipientStateRegistration} onChange={(e) => updateForm("recipientStateRegistration", e.target.value)} /></label>
          <label className="span-2">Logradouro *<input value={form.recipientStreet} onChange={(e) => updateForm("recipientStreet", e.target.value)} /></label><label>Número *<input value={form.recipientNumber} onChange={(e) => updateForm("recipientNumber", e.target.value)} /></label><label>Complemento<input value={form.recipientComplement} onChange={(e) => updateForm("recipientComplement", e.target.value)} /></label><label>Bairro *<input value={form.recipientDistrict} onChange={(e) => updateForm("recipientDistrict", e.target.value)} /></label>
          <label>Cidade *<input value={form.recipientCity} onChange={(e) => updateForm("recipientCity", e.target.value)} /></label><label>Cód. IBGE *<input maxLength={7} value={form.recipientCityCode} onChange={(e) => updateForm("recipientCityCode", e.target.value.replace(/\D/g, ""))} /></label><label>UF *<input maxLength={2} value={form.recipientState} onChange={(e) => updateForm("recipientState", e.target.value.toUpperCase())} /></label><label>CEP *<input maxLength={8} value={form.recipientPostalCode} onChange={(e) => updateForm("recipientPostalCode", e.target.value.replace(/\D/g, ""))} /></label><label>Telefone<input value={form.recipientPhone} onChange={(e) => updateForm("recipientPhone", e.target.value)} /></label><label>E-mail<input value={form.recipientEmail} onChange={(e) => updateForm("recipientEmail", e.target.value)} /></label>
        </div>
      </div></section>

      <section className="classic-section products"><h2>Produtos / Serviços</h2><div className="classic-section-body">
        <div className="classic-product-picker"><select value={selectedCatalogItem} onChange={(e) => setSelectedCatalogItem(e.target.value)}><option value="">Selecione um produto cadastrado...</option>{catalog.map((item) => <option key={item.id} value={item.id}>{item.sku ? `${item.sku} - ` : ""}{item.name} · {money.format(item.priceCents / 100)}</option>)}</select><button className="classic-button" disabled={!selectedCatalogItem} onClick={addCatalogItem}>Adicionar</button><button className="classic-button" onClick={() => { const next = newItem(); setItems((rows) => [...rows, next]); setSelectedItemId(next.id); }}>Item manual</button></div>
        <div className="nfe-classic-table-wrap"><table className="nfe-classic-table item-table"><thead><tr><th>#</th><th>Código</th><th>Descrição</th><th>NCM</th><th>CFOP</th><th>Un.</th><th>Quantidade</th><th>Vlr. unit.</th><th>Vlr. total</th><th></th></tr></thead><tbody>{items.map((item, index) => <tr key={item.id} className={selectedItem?.id === item.id ? "selected" : ""} onClick={() => setSelectedItemId(item.id)}><td>{index + 1}</td><td><input value={item.code} onChange={(e) => updateItem(item.id, "code", e.target.value)} /></td><td><input value={item.description} onChange={(e) => updateItem(item.id, "description", e.target.value)} /></td><td><input maxLength={8} value={item.ncm} onChange={(e) => updateItem(item.id, "ncm", e.target.value.replace(/\D/g, ""))} /></td><td><input maxLength={4} value={item.cfop} onChange={(e) => updateItem(item.id, "cfop", e.target.value.replace(/\D/g, ""))} /></td><td><input value={item.unit} onChange={(e) => updateItem(item.id, "unit", e.target.value.toUpperCase())} /></td><td><input type="number" step="0.0001" value={item.quantity} onChange={(e) => updateItem(item.id, "quantity", Number(e.target.value))} /></td><td><input type="number" step="0.01" value={item.unitPrice} onChange={(e) => updateItem(item.id, "unitPrice", Number(e.target.value))} /></td><td className="number"><b>{money.format((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0))}</b></td><td><button className="classic-icon-button" disabled={items.length === 1} onClick={(e) => { e.stopPropagation(); setItems((rows) => rows.filter((row) => row.id !== item.id)); }}>×</button></td></tr>)}</tbody></table></div>

        {selectedItem && <div className="classic-tax-panel"><div className="classic-tax-title"><b>Tributação do item selecionado</b><span>{selectedItem.code} · {selectedItem.description || "Sem descrição"}</span></div><div className="classic-grid seven">
          <label>GTIN<input value={selectedItem.gtin} onChange={(e) => updateItem(selectedItem.id, "gtin", e.target.value.toUpperCase())} /></label><label>Origem<select value={selectedItem.origin} onChange={(e) => updateItem(selectedItem.id, "origin", e.target.value)}><option value="">Selecione</option>{[0,1,2,3,4,5,6,7,8].map((v) => <option key={v} value={String(v)}>{v}</option>)}</select></label>
          {isSimple ? <><label>CSOSN *<input value={selectedItem.csosn} onChange={(e) => updateItem(selectedItem.id, "csosn", e.target.value.replace(/\D/g, ""))} /></label><label>% Crédito<input value={selectedItem.simpleCreditRate} onChange={(e) => updateItem(selectedItem.id, "simpleCreditRate", e.target.value)} /></label></> : <><label>CST ICMS *<input value={selectedItem.cst} onChange={(e) => updateItem(selectedItem.id, "cst", e.target.value.replace(/\D/g, ""))} /></label><label>Base ICMS<input value={selectedItem.icmsBase} onChange={(e) => updateItem(selectedItem.id, "icmsBase", e.target.value)} /></label><label>% ICMS<input value={selectedItem.icmsRate} onChange={(e) => updateItem(selectedItem.id, "icmsRate", e.target.value)} /></label></>}
          <label>CST PIS *<input value={selectedItem.pisCst} onChange={(e) => updateItem(selectedItem.id, "pisCst", e.target.value.replace(/\D/g, ""))} /></label><label>Base PIS<input value={selectedItem.pisBase} onChange={(e) => updateItem(selectedItem.id, "pisBase", e.target.value)} /></label><label>% PIS<input value={selectedItem.pisRate} onChange={(e) => updateItem(selectedItem.id, "pisRate", e.target.value)} /></label>
          <label>CST COFINS *<input value={selectedItem.cofinsCst} onChange={(e) => updateItem(selectedItem.id, "cofinsCst", e.target.value.replace(/\D/g, ""))} /></label><label>Base COFINS<input value={selectedItem.cofinsBase} onChange={(e) => updateItem(selectedItem.id, "cofinsBase", e.target.value)} /></label><label>% COFINS<input value={selectedItem.cofinsRate} onChange={(e) => updateItem(selectedItem.id, "cofinsRate", e.target.value)} /></label>
          {isNormalRegime && <><label>CST IBS/CBS *<input value={selectedItem.ibsCbsCst} onChange={(e) => updateItem(selectedItem.id, "ibsCbsCst", e.target.value.replace(/\D/g, ""))} /></label><label>cClassTrib *<input value={selectedItem.cClassTrib} onChange={(e) => updateItem(selectedItem.id, "cClassTrib", e.target.value.replace(/\D/g, ""))} /></label><label>Base IBS/CBS<input value={selectedItem.ibsCbsBase} onChange={(e) => updateItem(selectedItem.id, "ibsCbsBase", e.target.value)} /></label><label>% IBS UF<input value={selectedItem.ibsUfRate} onChange={(e) => updateItem(selectedItem.id, "ibsUfRate", e.target.value)} /></label><label>% IBS Mun<input value={selectedItem.ibsMunRate} onChange={(e) => updateItem(selectedItem.id, "ibsMunRate", e.target.value)} /></label><label>% CBS<input value={selectedItem.cbsRate} onChange={(e) => updateItem(selectedItem.id, "cbsRate", e.target.value)} /></label></>}
        </div></div>}
      </div></section>

      <section className="classic-section"><h2>Totais e informações adicionais</h2><div className="classic-section-body"><div className="classic-bottom-layout"><div className="classic-grid three"><label>Frete<input type="number" min="0" step="0.01" value={form.freight} onChange={(e) => updateForm("freight", Number(e.target.value))} /></label><label>Desconto<input type="number" min="0" step="0.01" value={form.discount} onChange={(e) => updateForm("discount", Number(e.target.value))} /></label><label>Outras despesas<input type="number" min="0" step="0.01" value={form.other} onChange={(e) => updateForm("other", Number(e.target.value))} /></label><label className="span-3">Informações complementares<textarea rows={4} value={form.notes} onChange={(e) => updateForm("notes", e.target.value)} /></label></div><div className="classic-total-box"><span>Produtos<b>{money.format(totals.products)}</b></span><span>Frete<b>{money.format(Number(form.freight) || 0)}</b></span><span>Outras despesas<b>{money.format(Number(form.other) || 0)}</b></span><span>Desconto<b>- {money.format(Number(form.discount) || 0)}</b></span><strong>Total da NF-e<b>{money.format(totals.total)}</b></strong></div></div></div></section>

      <div className="nfe-classic-footer-actions"><span>Confira os dados antes de transmitir. O sistema não inventa tributação ausente.</span><div><button className="classic-button" onClick={() => setView("list")}>Cancelar</button><button className="classic-button" disabled={saving} onClick={() => void saveDraft(false)}>Salvar rascunho</button><button className="classic-button primary" disabled={saving} onClick={() => void saveDraft(true)}>Salvar e transmitir</button></div></div>
    </div>}
  </div>;
}
