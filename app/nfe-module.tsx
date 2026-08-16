"use client";

import { useEffect, useMemo, useState } from "react";

type NfeItem = {
  id: string;
  description: string;
  ncm: string;
  cest: string;
  cfop: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  origin: string;
  csosn: string;
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
  items?: Array<{ id: string }>;
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
  blockers: [
    "Cadastrar e validar o estabelecimento emitente.",
    "Vincular certificado digital A1 válido.",
    "Concluir credenciamento e homologação na SEFAZ/SVRS.",
    "Revisar regime e regras tributárias de ICMS, PIS, COFINS, CBS e IBS.",
  ],
  protocol: { documentVersion: "NF-e 4.00", schemaVersion: "010e_v1.01", manualVersion: "MOC 7.0" },
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const makeClientId = () => typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const newItem = (): NfeItem => ({ id: makeClientId(), description: "", ncm: "", cest: "", cfop: "5102", unit: "UN", quantity: 1, unitPrice: 0, origin: "0", csosn: "102" });

function Glyph({ name, size = 18 }: { name: "plus" | "check" | "file" | "trash" | "arrow" | "shield" | "alert" | "box"; size?: number }) {
  const paths = {
    plus: ["M12 5v14", "M5 12h14"],
    check: ["m5 12 4 4L19 6"],
    file: ["M6 2h8l4 4v16H6z", "M14 2v5h5", "M9 13h6", "M9 17h6"],
    trash: ["M4 7h16", "M9 7V4h6v3", "m9 11 .5 7", "m6-7-.5 7"],
    arrow: ["M5 12h14", "m13 6 6 6-6 6"],
    shield: ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z", "m9 12 2 2 4-4"],
    alert: ["M12 3 2 21h20z", "M12 9v4", "M12 17h.01"],
    box: ["M4 7.5 12 3l8 4.5v9L12 21l-8-4.5z", "M4 7.5 12 12l8-4.5", "M12 12v9"],
  }[name];
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths.map((path) => <path d={path} key={path} />)}</svg>;
}

function StatusPill({ state }: { state: string }) {
  const ready = state === "ready_for_fiscal_review";
  return <span className={`nfe-status ${ready ? "ready" : "pending"}`}><i />{ready ? "Revisão fiscal" : "Com pendências"}</span>;
}

export default function NfeModule() {
  const [view, setView] = useState<"list" | "editor">("list");
  const [step, setStep] = useState(1);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [readiness, setReadiness] = useState<Readiness>(defaultReadiness);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [form, setForm] = useState({
    natureOperation: "Venda de mercadoria",
    purpose: "normal",
    finalConsumer: false,
    presenceIndicator: "not_applicable",
    freightMode: "no_freight",
    recipientName: "",
    recipientTaxId: "",
    recipientStateRegistration: "",
    recipientEmail: "",
    recipientState: "RS",
    recipientCityCode: "",
    freight: 0,
    discount: 0,
    other: 0,
    notes: "",
  });
  const [items, setItems] = useState<NfeItem[]>([newItem()]);

  const loadDrafts = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/nfe-drafts");
      const data = await response.json();
      if (response.ok) {
        setDrafts(data.drafts || []);
        if (data.readiness) setReadiness(data.readiness);
      }
    } catch {
      setNotice("A base fiscal ficará disponível após a publicação desta versão.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    fetch("/api/nfe-drafts").then((response) => response.json().then((data) => ({ ok: response.ok, data }))).then(({ ok, data }) => {
      if (!active || !ok) return;
      setDrafts(data.drafts || []);
      if (data.readiness) setReadiness(data.readiness);
    }).catch(() => {
      if (active) setNotice("A base fiscal ficará disponível após a publicação desta versão.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const totals = useMemo(() => {
    const products = items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0);
    return { products, total: Math.max(0, products + form.freight + form.other - form.discount) };
  }, [items, form.freight, form.other, form.discount]);

  const updateForm = (field: string, value: string | number | boolean) => setForm((current) => ({ ...current, [field]: value }));
  const updateItem = (id: string, field: keyof NfeItem, value: string | number) => setItems((current) => current.map((item) => item.id === id ? { ...item, [field]: value } : item));

  const validate = () => {
    const next: string[] = [];
    const taxId = form.recipientTaxId.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!form.natureOperation.trim()) next.push("Informe a natureza da operação.");
    if (!form.recipientName.trim()) next.push("Informe o nome ou razão social do destinatário.");
    if (!(taxId.length === 11 || taxId.length === 14)) next.push("Informe um CPF com 11 dígitos ou CNPJ com 14 caracteres.");
    if (form.recipientCityCode && !/^\d{7}$/.test(form.recipientCityCode)) next.push("O código IBGE do município deve ter 7 dígitos.");
    items.forEach((item, index) => {
      if (!item.description.trim()) next.push(`Item ${index + 1}: informe a descrição.`);
      if (!/^\d{8}$/.test(item.ncm.replace(/\D/g, ""))) next.push(`Item ${index + 1}: NCM deve ter 8 dígitos.`);
      if (!/^\d{4}$/.test(item.cfop.replace(/\D/g, ""))) next.push(`Item ${index + 1}: CFOP deve ter 4 dígitos.`);
      if (!(item.quantity > 0) || !(item.unitPrice > 0)) next.push(`Item ${index + 1}: informe quantidade e valor válidos.`);
    });
    setErrors(next);
    return next;
  };

  const startNew = () => {
    setStep(1);
    setErrors([]);
    setNotice("");
    setForm({ natureOperation: "Venda de mercadoria", purpose: "normal", finalConsumer: false, presenceIndicator: "not_applicable", freightMode: "no_freight", recipientName: "", recipientTaxId: "", recipientStateRegistration: "", recipientEmail: "", recipientState: "RS", recipientCityCode: "", freight: 0, discount: 0, other: 0, notes: "" });
    setItems([newItem()]);
    setView("editor");
  };

  const saveDraft = async () => {
    setSaving(true);
    setErrors([]);
    setNotice("");
    try {
      const response = await fetch("/api/nfe-drafts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, items: items.map((item) => ({ description: item.description, ncm: item.ncm, cest: item.cest, cfop: item.cfop, unit: item.unit, quantity: item.quantity, unitPrice: item.unitPrice, origin: item.origin, csosn: item.csosn })), idempotencyKey: makeClientId() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar a NF-e.");
      setErrors(data.validationErrors || []);
      setNotice(data.validationErrors?.length ? "Rascunho salvo com pendências para correção." : "Rascunho salvo e pronto para revisão fiscal.");
      await loadDrafts();
      setView("list");
    } catch (error) {
      setErrors([error instanceof Error ? error.message : "Não foi possível salvar a NF-e."]);
    } finally {
      setSaving(false);
    }
  };

  const review = () => {
    validate();
    setStep(4);
  };

  return <div className="module-view nfe-workspace">
    <div className="page-heading module-heading"><div><span className="eyebrow">Fiscal · documento modelo 55</span><h1>Emissão de NF-e</h1><p>Rascunhos, validação fiscal, itens, totais e preparação segura para autorização na SEFAZ.</p></div><div className="nfe-heading-actions">{view === "editor" && <button className="outline-button" onClick={() => setView("list")}>Voltar à fila</button>}<button className="primary-button" onClick={startNew}><Glyph name="plus" />Nova NF-e</button></div></div>

    <section className="nfe-protocol-bar">
      <span><Glyph name="shield" size={21} /></span>
      <div><strong>{readiness.protocol.documentVersion} · {readiness.protocol.manualVersion}</strong><p>Schema {readiness.protocol.schemaVersion} · ambiente de homologação · cálculos conferidos novamente pelo servidor</p></div>
      <a href="https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=ndIjl+iEFdE=" target="_blank" rel="noreferrer">Manual oficial <Glyph name="arrow" size={14} /></a>
    </section>

    {view === "list" ? <>
      <section className="nfe-readiness-grid">
        {[
          ["Emitente", "CNPJ, IE, regime e numeração", false],
          ["Certificado A1", "Assinatura ICP-Brasil no cofre", false],
          ["SEFAZ / SVRS", "Credenciamento e homologação", false],
          ["Layout fiscal", "NF-e 4.00 · schema atualizado", true],
        ].map(([title, note, ready]) => <article key={String(title)} className={ready ? "ready" : "pending"}><span>{ready ? <Glyph name="check" /> : <Glyph name="alert" />}</span><div><strong>{title}</strong><small>{note}</small></div><b>{ready ? "Pronto" : "Pendente"}</b></article>)}
      </section>

      <section className="module-summary nfe-summary"><article><span>Rascunhos</span><strong>{drafts.length}</strong><small>Persistidos na base fiscal</small></article><article><span>A revisar</span><strong>{drafts.filter((draft) => draft.validationStatus === "ready_for_fiscal_review").length}</strong><small>Validação estrutural concluída</small></article><article><span>Autorizadas hoje</span><strong>0</strong><small>A transmissão ainda não está ativa</small></article><article><span>Ambiente</span><strong>HML</strong><small>Produção protegida</small></article></section>

      {notice && <div className="nfe-notice"><Glyph name="check" size={17} /><span>{notice}</span></div>}
      <article className="panel nfe-list-panel">
        <div className="panel-heading"><div><span>Fila de preparação</span><h2>Rascunhos de NF-e</h2></div><button className="outline-button" onClick={startNew}><Glyph name="plus" size={15} />Criar rascunho</button></div>
        {loading ? <div className="nfe-empty">Carregando a base fiscal...</div> : drafts.length ? <div className="table-wrap"><table className="records-table nfe-table"><thead><tr><th>Rascunho</th><th>Destinatário</th><th>Itens</th><th>Total</th><th>Ambiente</th><th>Validação</th></tr></thead><tbody>{drafts.map((draft) => <tr key={draft.id}><td><b>{draft.natureOperation}</b><small>{new Date(draft.createdAt).toLocaleString("pt-BR")}</small></td><td><b>{draft.recipientName}</b><small>{draft.recipientTaxId || "Documento pendente"}</small></td><td>{draft.items?.length || 0}</td><td><strong>{money.format(draft.totalCents / 100)}</strong></td><td><span className="nfe-env">Homologação</span></td><td><StatusPill state={draft.validationStatus} /></td></tr>)}</tbody></table></div> : <div className="nfe-empty"><span><Glyph name="file" size={29} /></span><h3>Nenhum rascunho de NF-e</h3><p>Crie o primeiro documento, inclua os itens e confira as pendências antes da homologação.</p><button className="primary-button" onClick={startNew}><Glyph name="plus" />Criar primeira NF-e</button></div>}
        <footer className="nfe-locked-footer"><Glyph name="shield" size={17} /><span>Autorização, numeração definitiva e DANFE serão liberados somente após a ativação oficial do emitente.</span></footer>
      </article>
    </> : <section className="nfe-editor-layout">
      <div className="nfe-editor-main">
        <nav className="nfe-steps" aria-label="Etapas da NF-e">{["Identificação", "Destinatário", "Itens e tributos", "Revisão"].map((label, index) => <button key={label} className={step === index + 1 ? "active" : step > index + 1 ? "done" : ""} onClick={() => setStep(index + 1)}><i>{step > index + 1 ? "✓" : index + 1}</i><span>{label}</span></button>)}</nav>

        <article className="panel nfe-form-panel">
          {step === 1 && <><header><span>Etapa 1 de 4</span><h2>Identificação da operação</h2><p>Defina o enquadramento geral do documento antes de informar o destinatário.</p></header><div className="nfe-form-grid">
            <label className="wide"><span>Natureza da operação *</span><input value={form.natureOperation} onChange={(event) => updateForm("natureOperation", event.target.value)} /></label>
            <label><span>Finalidade</span><select value={form.purpose} onChange={(event) => updateForm("purpose", event.target.value)}><option value="normal">NF-e normal</option><option value="complementary">Complementar</option><option value="adjustment">Ajuste</option><option value="return">Devolução</option></select></label>
            <label><span>Presença do comprador</span><select value={form.presenceIndicator} onChange={(event) => updateForm("presenceIndicator", event.target.value)}><option value="not_applicable">Não se aplica</option><option value="in_person">Operação presencial</option><option value="internet">Internet</option><option value="delivery">Entrega a domicílio</option></select></label>
            <label><span>Modalidade do frete</span><select value={form.freightMode} onChange={(event) => updateForm("freightMode", event.target.value)}><option value="no_freight">Sem frete</option><option value="sender">Por conta do remetente</option><option value="recipient">Por conta do destinatário</option><option value="third_party">Por conta de terceiros</option></select></label>
            <label className="nfe-checkbox"><input type="checkbox" checked={form.finalConsumer} onChange={(event) => updateForm("finalConsumer", event.target.checked)} /><span>Consumidor final</span></label>
          </div></>}

          {step === 2 && <><header><span>Etapa 2 de 4</span><h2>Destinatário da NF-e</h2><p>O CNPJ aceita o formato alfanumérico; o CPF continua exclusivamente numérico.</p></header><div className="nfe-form-grid">
            <label className="wide"><span>Nome ou razão social *</span><input value={form.recipientName} onChange={(event) => updateForm("recipientName", event.target.value)} placeholder="Digite o nome ou a razão social" /></label>
            <label><span>CPF / CNPJ *</span><input value={form.recipientTaxId} onChange={(event) => updateForm("recipientTaxId", event.target.value.toUpperCase())} placeholder="11 dígitos ou 14 caracteres" maxLength={18} /></label>
            <label><span>Inscrição estadual</span><input value={form.recipientStateRegistration} onChange={(event) => updateForm("recipientStateRegistration", event.target.value)} placeholder="ISENTO ou número" /></label>
            <label><span>E-mail para XML/DANFE</span><input type="email" value={form.recipientEmail} onChange={(event) => updateForm("recipientEmail", event.target.value)} placeholder="Digite o e-mail fiscal" /></label>
            <label><span>UF</span><select value={form.recipientState} onChange={(event) => updateForm("recipientState", event.target.value)}><option>RS</option><option>SC</option><option>PR</option><option>SP</option><option>RJ</option><option>MG</option></select></label>
            <label><span>Código IBGE do município</span><input value={form.recipientCityCode} onChange={(event) => updateForm("recipientCityCode", event.target.value.replace(/\D/g, ""))} maxLength={7} placeholder="Digite os 7 dígitos" /></label>
          </div></>}

          {step === 3 && <><header className="nfe-items-header"><div><span>Etapa 3 de 4</span><h2>Itens e tributação</h2><p>O total é recalculado no servidor para evitar divergências.</p></div><button className="outline-button" onClick={() => setItems((current) => [...current, newItem()])}><Glyph name="plus" size={15} />Adicionar item</button></header><div className="nfe-items">{items.map((item, index) => <section key={item.id} className="nfe-item-card">
            <div className="nfe-item-title"><span><Glyph name="box" size={17} /></span><strong>Item {index + 1}</strong>{items.length > 1 && <button onClick={() => setItems((current) => current.filter((currentItem) => currentItem.id !== item.id))} aria-label={`Excluir item ${index + 1}`}><Glyph name="trash" size={15} /></button>}</div>
            <div className="nfe-form-grid item-fields"><label className="wide"><span>Descrição *</span><input value={item.description} onChange={(event) => updateItem(item.id, "description", event.target.value)} placeholder="Produto ou mercadoria" /></label><label><span>NCM *</span><input value={item.ncm} onChange={(event) => updateItem(item.id, "ncm", event.target.value.replace(/\D/g, ""))} maxLength={8} placeholder="8 dígitos" /></label><label><span>CEST</span><input value={item.cest} onChange={(event) => updateItem(item.id, "cest", event.target.value.replace(/\D/g, ""))} maxLength={7} /></label><label><span>CFOP *</span><input value={item.cfop} onChange={(event) => updateItem(item.id, "cfop", event.target.value.replace(/\D/g, ""))} maxLength={4} /></label><label><span>Unidade</span><input value={item.unit} onChange={(event) => updateItem(item.id, "unit", event.target.value.toUpperCase())} maxLength={6} /></label><label><span>Quantidade *</span><input type="number" min="0.001" step="0.001" value={item.quantity} onChange={(event) => updateItem(item.id, "quantity", Number(event.target.value))} /></label><label><span>Valor unitário *</span><input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(event) => updateItem(item.id, "unitPrice", Number(event.target.value))} /></label><label><span>Origem</span><select value={item.origin} onChange={(event) => updateItem(item.id, "origin", event.target.value)}><option value="0">0 · Nacional</option><option value="1">1 · Importação direta</option><option value="2">2 · Adquirida no mercado interno</option></select></label><label><span>CSOSN *</span><select value={item.csosn} onChange={(event) => updateItem(item.id, "csosn", event.target.value)}><option value="102">102 · Sem crédito</option><option value="101">101 · Com crédito</option><option value="500">500 · ICMS cobrado anteriormente</option><option value="900">900 · Outros</option></select></label></div>
            <footer><span>Total do item</span><strong>{money.format(item.quantity * item.unitPrice)}</strong></footer>
          </section>)}</div></>}

          {step === 4 && <><header><span>Etapa 4 de 4</span><h2>Revisão e preparação fiscal</h2><p>Confira os dados. O rascunho pode ser salvo mesmo com pendências; a transmissão não.</p></header><div className="nfe-review-grid"><section><span>Operação</span><strong>{form.natureOperation || "Não informada"}</strong><small>Finalidade: {form.purpose === "normal" ? "NF-e normal" : form.purpose}</small></section><section><span>Destinatário</span><strong>{form.recipientName || "Não informado"}</strong><small>{form.recipientTaxId || "CPF/CNPJ pendente"} · {form.recipientState}</small></section><section><span>Itens</span><strong>{items.length} {items.length === 1 ? "item" : "itens"}</strong><small>{money.format(totals.products)} em produtos</small></section><section className="total"><span>Total da NF-e</span><strong>{money.format(totals.total)}</strong><small>Frete e descontos considerados</small></section></div>
            {errors.length ? <div className="nfe-validation-box error"><Glyph name="alert" size={19} /><div><strong>{errors.length} {errors.length === 1 ? "pendência encontrada" : "pendências encontradas"}</strong><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div></div> : <div className="nfe-validation-box success"><Glyph name="check" size={19} /><div><strong>Validação estrutural concluída</strong><p>Os dados básicos estão completos. Ainda será necessária a revisão tributária antes da autorização.</p></div></div>}
            <label className="nfe-notes"><span>Informações complementares</span><textarea value={form.notes} onChange={(event) => updateForm("notes", event.target.value)} maxLength={2000} placeholder="Dados adicionais de interesse do contribuinte..." /></label>
          </>}

          <footer className="nfe-form-actions"><button className="outline-button" onClick={() => step === 1 ? setView("list") : setStep((current) => current - 1)}>{step === 1 ? "Cancelar" : "Voltar"}</button><div><button className="outline-button" disabled={saving} onClick={saveDraft}>{saving ? "Salvando..." : "Salvar rascunho"}</button>{step < 3 && <button className="primary-button" onClick={() => setStep((current) => current + 1)}>Continuar <Glyph name="arrow" size={15} /></button>}{step === 3 && <button className="primary-button" onClick={review}>Revisar NF-e <Glyph name="arrow" size={15} /></button>}{step === 4 && <button className="primary-button" disabled title="Configure emitente, A1, credenciamento e regras fiscais">Transmitir à SEFAZ</button>}</div></footer>
        </article>
      </div>

      <aside className="nfe-totals-card">
        <header><span>Resumo do documento</span><b>Homologação</b></header>
        <div><span>Produtos</span><strong>{money.format(totals.products)}</strong></div><div><span>Frete</span><strong>{money.format(form.freight)}</strong></div><div><span>Outras despesas</span><strong>{money.format(form.other)}</strong></div><div><span>Desconto</span><strong>− {money.format(form.discount)}</strong></div><footer><span>Total</span><strong>{money.format(totals.total)}</strong></footer>
        <section><Glyph name="shield" size={18} /><p><strong>Transmissão protegida</strong><span>{readiness.blockers.length} configurações ainda precisam ser concluídas.</span></p></section>
        <label><span>Frete</span><input type="number" min="0" step="0.01" value={form.freight} onChange={(event) => updateForm("freight", Number(event.target.value))} /></label><label><span>Desconto</span><input type="number" min="0" step="0.01" value={form.discount} onChange={(event) => updateForm("discount", Number(event.target.value))} /></label><label><span>Outras despesas</span><input type="number" min="0" step="0.01" value={form.other} onChange={(event) => updateForm("other", Number(event.target.value))} /></label>
      </aside>
    </section>}
  </div>;
}
