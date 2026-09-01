"use client";

import { useEffect, useMemo, useState } from "react";

type CompanyProfile = { taxRegime?: string; nfeSeries?: string; nfeNextNumber?: string; state?: string };

type NfeItem = {
  id: string;
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
};

type Transmission = {
  status?: string;
  accessKey?: string;
  protocol?: string;
  receipt?: string;
  cStat?: string;
  xMotivo?: string;
  number?: number;
  series?: number;
  updatedAt?: string;
};

type DraftRow = {
  id: string;
  natureOperation: string;
  recipientName: string;
  recipientTaxId: string;
  totalCents: number;
  validationStatus: string;
  environment: string;
  createdAt: string;
  items?: NfeItem[];
  transmission?: Transmission | null;
  transmissionStatus?: string | null;
  accessKey?: string | null;
  protocol?: string | null;
  nfeNumber?: number | null;
  nfeSeries?: number | null;
};

type Readiness = {
  transmissionEnabled: boolean;
  environment: string;
  blockers: string[];
  protocol: { documentVersion: string; schemaVersion: string; manualVersion: string };
};

const defaultReadiness: Readiness = {
  transmissionEnabled: false,
  environment: "homologation",
  blockers: [],
  protocol: { documentVersion: "NF-e 4.00", schemaVersion: "010e_v1.01", manualVersion: "MOC 7.0" },
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const makeClientId = () => typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const newItem = (): NfeItem => ({
  id: makeClientId(), code: "", description: "", ncm: "", cest: "", cfop: "", unit: "", quantity: 1, unitPrice: 0,
  gtin: "", origin: "", cst: "", csosn: "", simpleCreditRate: "", icmsBase: "", icmsRate: "",
  pisCst: "", pisBase: "", pisRate: "", cofinsCst: "", cofinsBase: "", cofinsRate: "",
  ibsCbsCst: "", cClassTrib: "", ibsCbsBase: "", ibsUfRate: "", ibsMunRate: "", cbsRate: "",
});

const emptyForm = () => ({
  environment: "homologation",
  natureOperation: "",
  purpose: "normal",
  finalConsumer: false,
  presenceIndicator: "not_applicable",
  freightMode: "no_freight",
  recipientName: "",
  recipientTaxId: "",
  recipientIeIndicator: "",
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
  paymentMethod: "",
  freight: 0,
  discount: 0,
  other: 0,
  notes: "",
});

function Glyph({ name, size = 18 }: { name: "plus" | "check" | "file" | "trash" | "arrow" | "shield" | "alert" | "box" | "send" | "refresh"; size?: number }) {
  const paths: Record<string, string[]> = {
    plus: ["M12 5v14", "M5 12h14"], check: ["m5 12 4 4L19 6"], file: ["M6 2h8l4 4v16H6z", "M14 2v5h5", "M9 13h6", "M9 17h6"],
    trash: ["M4 7h16", "M9 7V4h6v3", "m9 11 .5 7", "m6-7-.5 7"], arrow: ["M5 12h14", "m13 6 6 6-6 6"],
    shield: ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z", "m9 12 2 2 4-4"], alert: ["M12 3 2 21h20z", "M12 9v4", "M12 17h.01"],
    box: ["M4 7.5 12 3l8 4.5v9L12 21l-8-4.5z", "M4 7.5 12 12l8-4.5", "M12 12v9"], send: ["M22 2 11 13", "m22 2-7 20-4-9-9-4Z"],
    refresh: ["M20 7h-5V2", "M4 17h5v5", "M5.5 9a7 7 0 0 1 11.8-3L20 7", "M18.5 15a7 7 0 0 1-11.8 3L4 17"],
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{(paths[name] || []).map((value) => <path d={value} key={value} />)}</svg>;
}

function statusLabel(draft: DraftRow) {
  const status = draft.transmissionStatus || draft.transmission?.status;
  if (status === "authorized") return "Autorizada";
  if (status === "processing") return "Processando SEFAZ";
  if (status === "rejected") return "Rejeitada";
  if (status === "external_error") return "Falha externa";
  if (status === "signed") return "Assinada";
  return draft.validationStatus === "ready_for_fiscal_review" ? "Pronta para revisão" : "Com pendências";
}

function statusTone(draft: DraftRow) {
  const status = draft.transmissionStatus || draft.transmission?.status;
  if (status === "authorized") return "ready";
  if (["rejected", "external_error"].includes(String(status))) return "pending";
  return draft.validationStatus === "ready_for_fiscal_review" ? "ready" : "pending";
}

export default function NfeModule() {
  const [view, setView] = useState<"list" | "editor">("list");
  const [step, setStep] = useState(1);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [readiness, setReadiness] = useState<Readiness>(defaultReadiness);
  const [company, setCompany] = useState<CompanyProfile>({});
  const [a1Ready, setA1Ready] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [workingId, setWorkingId] = useState("");
  const [notice, setNotice] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [items, setItems] = useState<NfeItem[]>([newItem()]);

  const isNormalRegime = ["lucro_presumido", "lucro_real"].includes(company.taxRegime || "");
  const isSimple = ["simples_nacional", "simples_excesso"].includes(company.taxRegime || "");

  const load = async () => {
    setLoading(true);
    try {
      const [draftResponse, companyResponse] = await Promise.all([fetch("/api/nfe-drafts"), fetch("/api/company")]);
      const draftData = await draftResponse.json();
      const companyData = await companyResponse.json();
      if (!draftResponse.ok) throw new Error(draftData.error || "Não foi possível carregar NF-e.");
      setDrafts(draftData.drafts || []);
      if (draftData.readiness) setReadiness(draftData.readiness);
      if (companyResponse.ok) setCompany(companyData.company || {});
      const bridge = (window as any).sevenDesktop;
      if (bridge?.integrationSecretsStatus) {
        const info = await bridge.integrationSecretsStatus("nfe_sefaz");
        setA1Ready(Boolean(info?.certificateId));
      }
    } catch (caught) {
      setErrors([caught instanceof Error ? caught.message : "Falha ao carregar o módulo fiscal."]);
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const totals = useMemo(() => {
    const products = items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0);
    return { products, total: Math.max(0, products + Number(form.freight) + Number(form.other) - Number(form.discount)) };
  }, [items, form.freight, form.other, form.discount]);

  const updateForm = (field: string, value: string | number | boolean) => setForm((current) => ({ ...current, [field]: value }));
  const updateItem = (id: string, field: keyof NfeItem, value: string | number) => setItems((current) => current.map((item) => item.id === id ? { ...item, [field]: value } : item));

  const validateBasic = () => {
    const next: string[] = [];
    if (!form.natureOperation.trim()) next.push("Informe a natureza da operação.");
    if (!form.recipientName.trim()) next.push("Informe o destinatário.");
    if (!form.recipientTaxId.trim()) next.push("Informe CPF/CNPJ do destinatário.");
    if (!["1", "2", "9"].includes(form.recipientIeIndicator)) next.push("Informe se o destinatário é contribuinte, isento ou não contribuinte.");
    if (form.recipientIeIndicator === "1" && !form.recipientStateRegistration.trim()) next.push("Destinatário contribuinte exige Inscrição Estadual.");
    for (const [value, label] of [[form.recipientStreet, "logradouro"], [form.recipientNumber, "número"], [form.recipientDistrict, "bairro"], [form.recipientCity, "cidade"]]) if (!String(value).trim()) next.push(`Informe ${label} do destinatário.`);
    if (!/^\d{7}$/.test(form.recipientCityCode)) next.push("Código IBGE do destinatário deve ter 7 dígitos.");
    if (!/^\d{8}$/.test(form.recipientPostalCode)) next.push("CEP do destinatário deve ter 8 dígitos.");
    if (!/^\d{2}$/.test(form.paymentMethod)) next.push("Informe o código do meio de pagamento.");
    items.forEach((item, index) => {
      const label = `Item ${index + 1}`;
      if (!item.code.trim()) next.push(`${label}: informe o código.`);
      if (!item.description.trim()) next.push(`${label}: informe a descrição.`);
      if (!/^\d{8}$/.test(item.ncm)) next.push(`${label}: NCM deve ter 8 dígitos.`);
      if (!/^\d{4}$/.test(item.cfop)) next.push(`${label}: CFOP deve ter 4 dígitos.`);
      if (!item.unit.trim()) next.push(`${label}: informe a unidade.`);
      if (!item.gtin.trim()) next.push(`${label}: informe GTIN ou SEM GTIN.`);
      if (!item.origin.trim()) next.push(`${label}: informe a origem.`);
      if (!(item.quantity > 0) || !(item.unitPrice > 0)) next.push(`${label}: quantidade e valor devem ser maiores que zero.`);
      if (isSimple && !item.csosn.trim()) next.push(`${label}: informe CSOSN.`);
      if (isNormalRegime && !item.cst.trim()) next.push(`${label}: informe CST ICMS.`);
      if (!item.pisCst.trim()) next.push(`${label}: informe CST PIS.`);
      if (!item.cofinsCst.trim()) next.push(`${label}: informe CST COFINS.`);
      if (isNormalRegime && (!item.ibsCbsCst.trim() || !item.cClassTrib.trim())) next.push(`${label}: informe CST IBS/CBS e cClassTrib.`);
    });
    setErrors(next);
    return next;
  };

  const startNew = () => {
    setForm(emptyForm()); setItems([newItem()]); setStep(1); setErrors([]); setNotice(""); setView("editor");
  };

  const saveDraft = async () => {
    setSaving(true); setErrors([]); setNotice("");
    try {
      const payload = {
        ...form,
        items: items.map(({ id: _id, ...item }) => ({
          ...item,
          quantity: Number(item.quantity), unitPrice: Number(item.unitPrice),
          simpleCreditRate: item.simpleCreditRate === "" ? undefined : Number(item.simpleCreditRate),
          icmsBase: item.icmsBase === "" ? undefined : Number(item.icmsBase), icmsRate: item.icmsRate === "" ? undefined : Number(item.icmsRate),
          pisBase: item.pisBase === "" ? undefined : Number(item.pisBase), pisRate: item.pisRate === "" ? undefined : Number(item.pisRate),
          cofinsBase: item.cofinsBase === "" ? undefined : Number(item.cofinsBase), cofinsRate: item.cofinsRate === "" ? undefined : Number(item.cofinsRate),
          ibsCbsBase: item.ibsCbsBase === "" ? undefined : Number(item.ibsCbsBase), ibsUfRate: item.ibsUfRate === "" ? undefined : Number(item.ibsUfRate),
          ibsMunRate: item.ibsMunRate === "" ? undefined : Number(item.ibsMunRate), cbsRate: item.cbsRate === "" ? undefined : Number(item.cbsRate),
        })),
        idempotencyKey: makeClientId(),
      };
      const response = await fetch("/api/nfe-drafts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar a NF-e.");
      setNotice("Rascunho salvo. A transmissão continuará bloqueada até todas as validações fiscais serem aprovadas.");
      setView("list");
      await load();
    } catch (caught) { setErrors([caught instanceof Error ? caught.message : "Não foi possível salvar a NF-e."]); }
    finally { setSaving(false); }
  };

  const runAction = async (draftId: string, action: "transmit" | "consult_receipt" | "consult_protocol") => {
    setWorkingId(draftId); setErrors([]); setNotice("");
    try {
      const response = await fetch("/api/nfe-drafts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, draftId }) });
      const data = await response.json();
      if (!response.ok && response.status !== 202) {
        const details = Array.isArray(data.blockers) ? data.blockers : [];
        throw new Error([data.error || data.message || "Operação fiscal recusada.", ...details].filter(Boolean).join(" · "));
      }
      if (data.status === "authorized" || data.transmission?.status === "authorized") setNotice(`NF-e autorizada pela SEFAZ${data.protocol || data.transmission?.protocol ? ` · Protocolo ${data.protocol || data.transmission.protocol}` : ""}.`);
      else if (response.status === 202 || data.status === "processing") setNotice("A SEFAZ recebeu o lote e ainda está processando. Use “Consultar recibo” sem gerar uma nova numeração.");
      else setNotice(data.message || data.xMotivo || data.transmission?.xMotivo || "Consulta fiscal concluída.");
      await load();
    } catch (caught) { setErrors([caught instanceof Error ? caught.message : "Falha na operação fiscal."]); }
    finally { setWorkingId(""); }
  };

  const review = () => { validateBasic(); setStep(4); };
  const taxRegimeLabel = isNormalRegime ? "Regime normal (CRT 3)" : isSimple ? "Simples Nacional" : company.taxRegime === "mei" ? "MEI" : "Não configurado";
  const authorizedToday = drafts.filter((draft) => draft.transmissionStatus === "authorized" && draft.transmission?.updatedAt && new Date(draft.transmission.updatedAt).toDateString() === new Date().toDateString()).length;

  return <div className="module-view nfe-workspace">
    <div className="page-heading module-heading"><div><span className="eyebrow">Fiscal · documento modelo 55</span><h1>Emissão de NF-e</h1><p>Geração, assinatura A1, transmissão e protocolo SEFAZ com bloqueio fiscal por pendência.</p></div><div className="nfe-heading-actions">{view === "editor" && <button className="outline-button" onClick={() => setView("list")}>Voltar à fila</button>}<button className="primary-button" onClick={startNew}><Glyph name="plus" />Nova NF-e</button></div></div>

    <section className="nfe-protocol-bar"><span><Glyph name="shield" size={21} /></span><div><strong>{readiness.protocol?.documentVersion || "NF-e 4.00"} · emissão fail-closed</strong><p>{taxRegimeLabel} · A1 {a1Ready ? "vinculado neste computador" : "pendente"} · série {company.nfeSeries || "não definida"} · próximo nº {company.nfeNextNumber || "não informado"}</p></div><a href="https://www.nfe.fazenda.gov.br/portal/" target="_blank" rel="noreferrer">Portal NF-e <Glyph name="arrow" size={14} /></a></section>

    {errors.length > 0 && <div className="nfe-validation-box error"><Glyph name="alert" size={19} /><div><strong>Pendências</strong><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div></div>}
    {notice && <div className="nfe-notice"><Glyph name="check" size={17} /><span>{notice}</span></div>}

    {view === "list" ? <>
      <section className="nfe-readiness-grid">{[
        ["Cadastro emitente", company.taxRegime && company.nfeSeries ? "Regime, série e dados fiscais" : "Complete o Cadastro da Empresa", Boolean(company.taxRegime && company.nfeSeries)],
        ["Numeração", company.nfeNextNumber ? `Próximo número informado: ${company.nfeNextNumber}` : "Informe o próximo número livre da série", Boolean(company.nfeNextNumber)],
        ["Certificado A1", a1Ready ? "Certificado vinculado ao computador" : "Vincule o A1 em Integrações", a1Ready],
        ["Autorização", "Status só vira autorizada com cStat 100 + protocolo", true],
      ].map(([title, note, ready]) => <article key={String(title)} className={ready ? "ready" : "pending"}><span>{ready ? <Glyph name="check" /> : <Glyph name="alert" />}</span><div><strong>{title}</strong><small>{note}</small></div><b>{ready ? "Pronto" : "Pendente"}</b></article>)}</section>

      <section className="module-summary nfe-summary"><article><span>Rascunhos</span><strong>{drafts.length}</strong><small>Persistidos localmente</small></article><article><span>Autorizadas hoje</span><strong>{authorizedToday}</strong><small>Com protocolo SEFAZ</small></article><article><span>Processando</span><strong>{drafts.filter((draft) => draft.transmissionStatus === "processing").length}</strong><small>Com recibo preservado</small></article><article><span>Ambiente seguro</span><strong>HML</strong><small>Produção é escolha explícita</small></article></section>

      <article className="panel nfe-list-panel"><div className="panel-heading"><div><span>Fila fiscal</span><h2>NF-e e rascunhos</h2></div><button className="outline-button" onClick={() => void load()}><Glyph name="refresh" size={15} />Atualizar</button></div>
        {loading ? <div className="nfe-empty">Carregando a base fiscal...</div> : drafts.length ? <div className="table-wrap"><table className="records-table nfe-table"><thead><tr><th>Documento</th><th>Destinatário</th><th>Total</th><th>Ambiente</th><th>Status</th><th>Ações</th></tr></thead><tbody>{drafts.map((draft) => <tr key={draft.id}><td><b>{draft.nfeNumber ? `NF-e ${draft.nfeNumber}` : draft.natureOperation}</b><small>{draft.accessKey ? `Chave ${draft.accessKey}` : new Date(draft.createdAt).toLocaleString("pt-BR")}</small></td><td><b>{draft.recipientName}</b><small>{draft.recipientTaxId}</small></td><td><strong>{money.format((draft.totalCents || 0) / 100)}</strong></td><td><span className="nfe-env">{draft.environment === "production" ? "Produção" : "Homologação"}</span></td><td><span className={`nfe-status ${statusTone(draft)}`}><i />{statusLabel(draft)}</span>{draft.protocol && <small>Prot. {draft.protocol}</small>}</td><td><div className="nfe-heading-actions">{!draft.transmissionStatus || ["rejected", "external_error"].includes(draft.transmissionStatus) ? <button className="primary-button" disabled={workingId === draft.id} onClick={() => void runAction(draft.id, "transmit")}><Glyph name="send" size={14} />{workingId === draft.id ? "Processando" : "Transmitir"}</button> : null}{draft.transmissionStatus === "processing" && <button className="outline-button" disabled={workingId === draft.id} onClick={() => void runAction(draft.id, "consult_receipt")}>Consultar recibo</button>}{draft.accessKey && <button className="outline-button" disabled={workingId === draft.id} onClick={() => void runAction(draft.id, "consult_protocol")}>Consultar SEFAZ</button>}</div></td></tr>)}</tbody></table></div> : <div className="nfe-empty"><span><Glyph name="file" size={29} /></span><h3>Nenhuma NF-e</h3><p>Crie um rascunho fiscal completo. Nenhuma classificação tributária será inventada automaticamente.</p><button className="primary-button" onClick={startNew}><Glyph name="plus" />Criar primeira NF-e</button></div>}
        <footer className="nfe-locked-footer"><Glyph name="shield" size={17} /><span>Número, chave e XML ficam preservados após a primeira transmissão. Reconsultas nunca geram uma nota nova.</span></footer>
      </article>
    </> : <section className="nfe-editor-layout"><div className="nfe-editor-main">
      <nav className="nfe-steps" aria-label="Etapas da NF-e">{["Operação", "Destinatário", "Itens e tributos", "Revisão"].map((label, index) => <button key={label} className={step === index + 1 ? "active" : step > index + 1 ? "done" : ""} onClick={() => setStep(index + 1)}><i>{step > index + 1 ? "✓" : index + 1}</i><span>{label}</span></button>)}</nav>
      <article className="panel nfe-form-panel">
        {step === 1 && <><header><span>Etapa 1 de 4</span><h2>Identificação da operação</h2><p>Homologação é o padrão seguro. Produção precisa ser escolhida conscientemente.</p></header><div className="nfe-form-grid">
          <label><span>Ambiente *</span><select value={form.environment} onChange={(e) => updateForm("environment", e.target.value)}><option value="homologation">Homologação</option><option value="production">Produção</option></select></label>
          <label className="wide"><span>Natureza da operação *</span><input value={form.natureOperation} onChange={(e) => updateForm("natureOperation", e.target.value)} placeholder="Ex.: Venda de mercadoria adquirida de terceiros" /></label>
          <label><span>Finalidade</span><select value={form.purpose} onChange={(e) => updateForm("purpose", e.target.value)}><option value="normal">Normal</option><option value="complementary">Complementar</option><option value="adjustment">Ajuste</option><option value="return">Devolução</option></select></label>
          <label><span>Presença do comprador</span><select value={form.presenceIndicator} onChange={(e) => updateForm("presenceIndicator", e.target.value)}><option value="not_applicable">Não se aplica</option><option value="in_person">Presencial</option><option value="internet">Internet</option><option value="delivery">Entrega a domicílio</option></select></label>
          <label><span>Frete</span><select value={form.freightMode} onChange={(e) => updateForm("freightMode", e.target.value)}><option value="no_freight">Sem frete</option><option value="sender">Remetente</option><option value="recipient">Destinatário</option><option value="third_party">Terceiros</option></select></label>
          <label className="nfe-checkbox"><input type="checkbox" checked={form.finalConsumer} onChange={(e) => updateForm("finalConsumer", e.target.checked)} /><span>Consumidor final</span></label>
        </div></>}

        {step === 2 && <><header><span>Etapa 2 de 4</span><h2>Destinatário e endereço fiscal</h2><p>CPF/CNPJ, condição perante o ICMS e endereço serão enviados no XML.</p></header><div className="nfe-form-grid">
          <label className="wide"><span>Nome / razão social *</span><input value={form.recipientName} onChange={(e) => updateForm("recipientName", e.target.value)} /></label><label><span>CPF / CNPJ *</span><input value={form.recipientTaxId} onChange={(e) => updateForm("recipientTaxId", e.target.value.toUpperCase())} /></label>
          <label><span>Indicador IE *</span><select value={form.recipientIeIndicator} onChange={(e) => updateForm("recipientIeIndicator", e.target.value)}><option value="">Selecione</option><option value="1">1 · Contribuinte ICMS</option><option value="2">2 · Contribuinte isento</option><option value="9">9 · Não contribuinte</option></select></label><label><span>Inscrição Estadual</span><input value={form.recipientStateRegistration} onChange={(e) => updateForm("recipientStateRegistration", e.target.value)} /></label>
          <label className="wide"><span>Logradouro *</span><input value={form.recipientStreet} onChange={(e) => updateForm("recipientStreet", e.target.value)} /></label><label><span>Número *</span><input value={form.recipientNumber} onChange={(e) => updateForm("recipientNumber", e.target.value)} /></label><label><span>Complemento</span><input value={form.recipientComplement} onChange={(e) => updateForm("recipientComplement", e.target.value)} /></label>
          <label><span>Bairro *</span><input value={form.recipientDistrict} onChange={(e) => updateForm("recipientDistrict", e.target.value)} /></label><label><span>Cidade *</span><input value={form.recipientCity} onChange={(e) => updateForm("recipientCity", e.target.value)} /></label><label><span>Código IBGE *</span><input maxLength={7} value={form.recipientCityCode} onChange={(e) => updateForm("recipientCityCode", e.target.value.replace(/\D/g, ""))} /></label>
          <label><span>UF *</span><input maxLength={2} value={form.recipientState} onChange={(e) => updateForm("recipientState", e.target.value.toUpperCase())} /></label><label><span>CEP *</span><input maxLength={8} value={form.recipientPostalCode} onChange={(e) => updateForm("recipientPostalCode", e.target.value.replace(/\D/g, ""))} /></label><label><span>Telefone</span><input value={form.recipientPhone} onChange={(e) => updateForm("recipientPhone", e.target.value)} /></label>
          <label><span>E-mail fiscal</span><input type="email" value={form.recipientEmail} onChange={(e) => updateForm("recipientEmail", e.target.value)} /></label><label><span>Meio de pagamento *</span><input maxLength={2} value={form.paymentMethod} onChange={(e) => updateForm("paymentMethod", e.target.value.replace(/\D/g, ""))} placeholder="Ex.: 01 dinheiro, 03 crédito" /></label>
        </div></>}

        {step === 3 && <><header className="nfe-items-header"><div><span>Etapa 3 de 4</span><h2>Itens e tributação</h2><p>CFOP, CSOSN/CST, PIS, COFINS e IBS/CBS não recebem valores fiscais automáticos.</p></div><button className="outline-button" onClick={() => setItems((current) => [...current, newItem()])}><Glyph name="plus" size={15} />Adicionar item</button></header><div className="nfe-items">{items.map((item, index) => <section key={item.id} className="nfe-item-card">
          <div className="nfe-item-title"><span><Glyph name="box" size={17} /></span><strong>Item {index + 1}</strong>{items.length > 1 && <button onClick={() => setItems((current) => current.filter((row) => row.id !== item.id))}><Glyph name="trash" size={15} /></button>}</div>
          <div className="nfe-form-grid item-fields"><label><span>Código *</span><input value={item.code} onChange={(e) => updateItem(item.id, "code", e.target.value)} /></label><label className="wide"><span>Descrição *</span><input value={item.description} onChange={(e) => updateItem(item.id, "description", e.target.value)} /></label><label><span>NCM *</span><input maxLength={8} value={item.ncm} onChange={(e) => updateItem(item.id, "ncm", e.target.value.replace(/\D/g, ""))} /></label><label><span>CEST</span><input maxLength={7} value={item.cest} onChange={(e) => updateItem(item.id, "cest", e.target.value.replace(/\D/g, ""))} /></label><label><span>CFOP *</span><input maxLength={4} value={item.cfop} onChange={(e) => updateItem(item.id, "cfop", e.target.value.replace(/\D/g, ""))} /></label><label><span>Unidade *</span><input value={item.unit} onChange={(e) => updateItem(item.id, "unit", e.target.value.toUpperCase())} /></label><label><span>Quantidade *</span><input type="number" min="0.0001" step="0.0001" value={item.quantity} onChange={(e) => updateItem(item.id, "quantity", Number(e.target.value))} /></label><label><span>Valor unitário *</span><input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => updateItem(item.id, "unitPrice", Number(e.target.value))} /></label><label><span>GTIN *</span><input value={item.gtin} onChange={(e) => updateItem(item.id, "gtin", e.target.value.toUpperCase())} placeholder="Código válido ou SEM GTIN" /></label><label><span>Origem *</span><select value={item.origin} onChange={(e) => updateItem(item.id, "origin", e.target.value)}><option value="">Selecione</option>{[0,1,2,3,4,5,6,7,8].map((value) => <option key={value} value={String(value)}>{value}</option>)}</select></label></div>
          <div className="nfe-form-grid item-fields">{isSimple && <><label><span>CSOSN *</span><input value={item.csosn} onChange={(e) => updateItem(item.id, "csosn", e.target.value.replace(/\D/g, ""))} placeholder="Ex.: 102" /></label><label><span>% crédito Simples</span><input type="number" step="0.0001" value={item.simpleCreditRate} onChange={(e) => updateItem(item.id, "simpleCreditRate", e.target.value)} /></label></>}{isNormalRegime && <><label><span>CST ICMS *</span><input maxLength={2} value={item.cst} onChange={(e) => updateItem(item.id, "cst", e.target.value.replace(/\D/g, ""))} /></label><label><span>Base ICMS</span><input type="number" step="0.01" value={item.icmsBase} onChange={(e) => updateItem(item.id, "icmsBase", e.target.value)} /></label><label><span>% ICMS</span><input type="number" step="0.0001" value={item.icmsRate} onChange={(e) => updateItem(item.id, "icmsRate", e.target.value)} /></label></>}
            <label><span>CST PIS *</span><input maxLength={2} value={item.pisCst} onChange={(e) => updateItem(item.id, "pisCst", e.target.value.replace(/\D/g, ""))} /></label><label><span>Base PIS</span><input type="number" step="0.01" value={item.pisBase} onChange={(e) => updateItem(item.id, "pisBase", e.target.value)} /></label><label><span>% PIS</span><input type="number" step="0.0001" value={item.pisRate} onChange={(e) => updateItem(item.id, "pisRate", e.target.value)} /></label>
            <label><span>CST COFINS *</span><input maxLength={2} value={item.cofinsCst} onChange={(e) => updateItem(item.id, "cofinsCst", e.target.value.replace(/\D/g, ""))} /></label><label><span>Base COFINS</span><input type="number" step="0.01" value={item.cofinsBase} onChange={(e) => updateItem(item.id, "cofinsBase", e.target.value)} /></label><label><span>% COFINS</span><input type="number" step="0.0001" value={item.cofinsRate} onChange={(e) => updateItem(item.id, "cofinsRate", e.target.value)} /></label>
            {isNormalRegime && <><label><span>CST IBS/CBS *</span><input maxLength={3} value={item.ibsCbsCst} onChange={(e) => updateItem(item.id, "ibsCbsCst", e.target.value.replace(/\D/g, ""))} /></label><label><span>cClassTrib *</span><input maxLength={6} value={item.cClassTrib} onChange={(e) => updateItem(item.id, "cClassTrib", e.target.value.replace(/\D/g, ""))} /></label><label><span>Base IBS/CBS</span><input type="number" step="0.01" value={item.ibsCbsBase} onChange={(e) => updateItem(item.id, "ibsCbsBase", e.target.value)} /></label><label><span>% IBS UF</span><input type="number" step="0.0001" value={item.ibsUfRate} onChange={(e) => updateItem(item.id, "ibsUfRate", e.target.value)} placeholder="2026 padrão: 0,1" /></label><label><span>% IBS Município</span><input type="number" step="0.0001" value={item.ibsMunRate} onChange={(e) => updateItem(item.id, "ibsMunRate", e.target.value)} placeholder="2026 padrão: 0" /></label><label><span>% CBS</span><input type="number" step="0.0001" value={item.cbsRate} onChange={(e) => updateItem(item.id, "cbsRate", e.target.value)} placeholder="2026 padrão: 0,9" /></label></>}
          </div><footer><span>Total do item</span><strong>{money.format(item.quantity * item.unitPrice)}</strong></footer>
        </section>)}</div></>}

        {step === 4 && <><header><span>Etapa 4 de 4</span><h2>Revisão</h2><p>Salvar cria o rascunho. A autorização é uma ação separada na fila fiscal.</p></header><div className="nfe-review-grid"><section><span>Operação</span><strong>{form.natureOperation || "Não informada"}</strong><small>{form.environment === "production" ? "PRODUÇÃO" : "HOMOLOGAÇÃO"}</small></section><section><span>Destinatário</span><strong>{form.recipientName || "Não informado"}</strong><small>{form.recipientTaxId || "Documento pendente"}</small></section><section><span>Itens</span><strong>{items.length}</strong><small>{money.format(totals.products)} em produtos</small></section><section className="total"><span>Total</span><strong>{money.format(totals.total)}</strong><small>Sem somar IBS/CBS ao vNF legado em 2026</small></section></div>
          {errors.length ? <div className="nfe-validation-box error"><Glyph name="alert" size={19} /><div><strong>Corrija as pendências antes de salvar</strong><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div></div> : <div className="nfe-validation-box success"><Glyph name="check" size={19} /><div><strong>Validação básica concluída</strong><p>O backend fará nova validação fiscal completa antes de assinar ou transmitir.</p></div></div>}
          <label className="nfe-notes"><span>Informações adicionais</span><textarea rows={4} value={form.notes} onChange={(e) => updateForm("notes", e.target.value)} /></label></>}

        <footer className="nfe-form-actions">{step > 1 && <button className="outline-button" onClick={() => setStep((value) => value - 1)}>Voltar</button>}<span />{step < 3 && <button className="primary-button" onClick={() => setStep((value) => value + 1)}>Continuar <Glyph name="arrow" size={15} /></button>}{step === 3 && <button className="primary-button" onClick={review}>Revisar <Glyph name="arrow" size={15} /></button>}{step === 4 && <button className="primary-button" disabled={saving || errors.length > 0} onClick={() => void saveDraft()}>{saving ? "Salvando..." : "Salvar rascunho"}</button>}</footer>
      </article></div><aside className="panel nfe-totals-panel"><span>Resumo</span><h3>{taxRegimeLabel}</h3><dl><div><dt>Produtos</dt><dd>{money.format(totals.products)}</dd></div><div><dt>Frete</dt><dd>{money.format(Number(form.freight))}</dd></div><div><dt>Desconto</dt><dd>- {money.format(Number(form.discount))}</dd></div><div><dt>Outras despesas</dt><dd>{money.format(Number(form.other))}</dd></div><div className="grand"><dt>Total</dt><dd>{money.format(totals.total)}</dd></div></dl><label><span>Frete</span><input type="number" min="0" step="0.01" value={form.freight} onChange={(e) => updateForm("freight", Number(e.target.value))} /></label><label><span>Desconto</span><input type="number" min="0" step="0.01" value={form.discount} onChange={(e) => updateForm("discount", Number(e.target.value))} /></label><label><span>Outras despesas</span><input type="number" min="0" step="0.01" value={form.other} onChange={(e) => updateForm("other", Number(e.target.value))} /></label></aside>
    </section>}
  </div>;
}
