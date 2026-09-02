"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type AnyRow = Record<string, any>;
type SnapshotMap = Record<string, { payload: AnyRow; savedAt: string }>;

const STORAGE_KEY = "seven:nfe:mirror-snapshots:v1";
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const decimal = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 4 });

const readSnapshots = (): SnapshotMap => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as SnapshotMap; } catch { return {}; }
};

const saveSnapshot = (draftId: string, payload: AnyRow) => {
  if (!draftId || typeof localStorage === "undefined") return;
  const current = readSnapshots();
  current[draftId] = { payload, savedAt: new Date().toISOString() };
  const entries = Object.entries(current).sort((a, b) => String(b[1].savedAt).localeCompare(String(a[1].savedAt))).slice(0, 200);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
};

const brMoney = (value: unknown) => money.format(Number(value) || 0);
const centsMoney = (value: unknown) => money.format((Number(value) || 0) / 100);
const text = (value: unknown, fallback = "—") => String(value ?? "").trim() || fallback;
const yesNo = (value: unknown) => value ? "Sim" : "Não";
const formatDate = (value: unknown) => value ? new Date(String(value)).toLocaleString("pt-BR") : "—";
const taxId = (value: unknown) => text(value).toUpperCase();

const purposeLabels: Record<string, string> = { normal: "1 · NF-e normal", complementary: "2 · Complementar", adjustment: "3 · Ajuste", return: "4 · Devolução/retorno" };
const presenceLabels: Record<string, string> = { not_applicable: "0 · Não se aplica", in_person: "1 · Presencial", internet: "2 · Internet", delivery: "4 · Entrega a domicílio" };
const freightLabels: Record<string, string> = { sender: "0 · Emitente", recipient: "1 · Destinatário", third_party: "2 · Terceiros", no_freight: "9 · Sem frete" };
const ieLabels: Record<string, string> = { "1": "1 · Contribuinte ICMS", "2": "2 · Contribuinte isento", "9": "9 · Não contribuinte" };
const paymentLabels: Record<string, string> = { "01": "Dinheiro", "02": "Cheque", "03": "Cartão de crédito", "04": "Cartão de débito", "05": "Crédito loja", "15": "Boleto bancário", "16": "Depósito bancário", "17": "PIX", "18": "Transferência bancária", "19": "Fidelidade/cashback", "90": "Sem pagamento", "99": "Outros" };

function itemQuantity(item: AnyRow) {
  if (item.quantity !== undefined) return Number(item.quantity) || 0;
  if (item.quantityMilli !== undefined) return (Number(item.quantityMilli) || 0) / 1000;
  return 0;
}
function itemUnitPrice(item: AnyRow) {
  if (item.unitPrice !== undefined) return Number(item.unitPrice) || 0;
  if (item.unitPriceCents !== undefined) return (Number(item.unitPriceCents) || 0) / 100;
  return 0;
}
function itemTotal(item: AnyRow) {
  if (item.totalCents !== undefined && item.quantity === undefined) return (Number(item.totalCents) || 0) / 100;
  return itemQuantity(item) * itemUnitPrice(item);
}

function buildWarnings(draft: AnyRow, snapshot?: AnyRow) {
  const source = { ...draft, ...(snapshot || {}) };
  const items = Array.isArray(snapshot?.items) ? snapshot!.items : Array.isArray(draft.items) ? draft.items : [];
  const warnings: string[] = [];
  if (!source.natureOperation) warnings.push("Natureza da operação não informada.");
  if (!source.recipientName || !source.recipientTaxId) warnings.push("Destinatário incompleto.");
  if (!source.recipientIeIndicator) warnings.push("Indicador de IE do destinatário não registrado no espelho.");
  if (!source.recipientStreet || !source.recipientCity || !source.recipientPostalCode) warnings.push("Endereço completo do destinatário não está registrado neste rascunho.");
  if (!source.paymentMethod) warnings.push("Meio de pagamento não registrado.");
  if (!items.length) warnings.push("Nenhum item informado.");
  items.forEach((item: AnyRow, index: number) => {
    if (!item.ncm || !item.cfop) warnings.push(`Item ${index + 1}: NCM/CFOP incompleto.`);
    if (!item.csosn && !item.cst) warnings.push(`Item ${index + 1}: CST/CSOSN não informado.`);
  });
  return warnings;
}

function Detail({ label, value, wide = false }: { label: string; value: unknown; wide?: boolean }) {
  return <div className={wide ? "mirror-detail wide" : "mirror-detail"}><span>{label}</span><strong>{text(value)}</strong></div>;
}

function TaxLine({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="mirror-tax-line"><b>{title}</b><span>{children}</span></div>;
}

function MirrorSheet({ draft, company, snapshot }: { draft: AnyRow; company: AnyRow; snapshot?: AnyRow }) {
  const source = { ...draft, ...(snapshot || {}) };
  const items: AnyRow[] = Array.isArray(snapshot?.items) ? snapshot!.items : Array.isArray(draft.items) ? draft.items : [];
  const products = draft.productsTotalCents !== undefined ? (Number(draft.productsTotalCents) || 0) / 100 : items.reduce((sum, item) => sum + itemTotal(item), 0);
  const freight = snapshot?.freight !== undefined ? Number(snapshot.freight) || 0 : (Number(draft.freightCents) || 0) / 100;
  const discount = snapshot?.discount !== undefined ? Number(snapshot.discount) || 0 : (Number(draft.discountCents) || 0) / 100;
  const other = snapshot?.other !== undefined ? Number(snapshot.other) || 0 : (Number(draft.otherCents) || 0) / 100;
  const total = draft.totalCents !== undefined ? (Number(draft.totalCents) || 0) / 100 : Math.max(0, products + freight + other - discount);
  const warnings = buildWarnings(draft, snapshot);
  const addressCompany = [company.street, company.number, company.complement, company.district, company.city, company.state, company.postalCode].filter(Boolean).join(" · ");
  const addressRecipient = [source.recipientStreet, source.recipientNumber, source.recipientComplement, source.recipientDistrict, source.recipientCity, source.recipientState, source.recipientPostalCode].filter(Boolean).join(" · ");
  const status = draft.transmissionStatus || draft.transmission?.status || "draft";
  const statusText = status === "authorized" ? "AUTORIZADA" : status === "cancelled" ? "CANCELADA" : status === "processing" ? "PROCESSANDO" : status === "rejected" ? "REJEITADA" : "RASCUNHO";

  return <article className="nfe-mirror-sheet">
    <div className="mirror-watermark">SEM VALOR FISCAL</div>
    <header className="mirror-sheet-header">
      <div className="mirror-brand-block"><span>SEVEN ERP · FISCAL</span><h1>ESPELHO DA NF-e</h1><p>Pré-visualização para conferência · Documento modelo 55</p></div>
      <div className="mirror-id-block"><b>{statusText}</b><span>{source.environment === "production" ? "Produção" : "Homologação"}</span><small>Série {draft.nfeSeries || company.nfeSeries || "—"} · Nº {draft.nfeNumber || "a reservar"}</small></div>
    </header>

    <div className="mirror-warning-strip"><strong>SEM VALOR FISCAL</strong><span>Este espelho não substitui a NF-e nem o DANFE. Use somente para conferência antes ou depois da transmissão.</span></div>

    <section className="mirror-section">
      <div className="mirror-section-title"><b>1</b><div><span>IDENTIFICAÇÃO DA OPERAÇÃO</span><h2>{text(source.natureOperation, "Natureza não informada")}</h2></div></div>
      <div className="mirror-detail-grid four">
        <Detail label="Finalidade" value={purposeLabels[source.purpose] || source.purpose} />
        <Detail label="Consumidor final" value={yesNo(source.finalConsumer)} />
        <Detail label="Presença" value={presenceLabels[source.presenceIndicator] || source.presenceIndicator} />
        <Detail label="Frete" value={freightLabels[source.freightMode] || source.freightMode} />
        <Detail label="Criado em" value={formatDate(draft.createdAt)} />
        <Detail label="Chave de acesso" value={draft.accessKey || draft.transmission?.accessKey || "Ainda não gerada"} wide />
        <Detail label="Protocolo" value={draft.protocol || draft.transmission?.protocol || "Ainda não autorizado"} />
      </div>
    </section>

    <section className="mirror-split">
      <div className="mirror-section compact">
        <div className="mirror-section-title"><b>2</b><div><span>EMITENTE</span><h2>{text(company.tradeName || company.legalName, "Empresa não cadastrada")}</h2></div></div>
        <div className="mirror-detail-grid two">
          <Detail label="Razão social" value={company.legalName} wide />
          <Detail label="CNPJ" value={company.taxId} />
          <Detail label="IE" value={company.stateRegistration} />
          <Detail label="Regime" value={company.taxRegime} />
          <Detail label="Endereço" value={addressCompany} wide />
          <Detail label="Contato" value={[company.phone, company.email].filter(Boolean).join(" · ")} wide />
        </div>
      </div>

      <div className="mirror-section compact">
        <div className="mirror-section-title"><b>3</b><div><span>DESTINATÁRIO</span><h2>{text(source.recipientName, "Não informado")}</h2></div></div>
        <div className="mirror-detail-grid two">
          <Detail label="CPF/CNPJ" value={taxId(source.recipientTaxId)} />
          <Detail label="Indicador IE" value={ieLabels[source.recipientIeIndicator] || source.recipientIeIndicator} />
          <Detail label="IE" value={source.recipientStateRegistration} />
          <Detail label="Município IBGE" value={source.recipientCityCode} />
          <Detail label="Endereço" value={addressRecipient} wide />
          <Detail label="Contato" value={[source.recipientPhone, source.recipientEmail].filter(Boolean).join(" · ")} wide />
        </div>
      </div>
    </section>

    <section className="mirror-section">
      <div className="mirror-section-title"><b>4</b><div><span>PRODUTOS / SERVIÇOS</span><h2>{items.length} item(ns)</h2></div></div>
      <div className="mirror-items-wrap"><table className="mirror-items"><thead><tr><th>#</th><th>Código / Descrição</th><th>NCM</th><th>CFOP</th><th>CST/CSOSN</th><th>Qtd.</th><th>Un.</th><th>V. unit.</th><th>Total</th></tr></thead><tbody>
        {items.map((item, index) => <tr key={item.id || index}><td>{index + 1}</td><td><b>{text(item.code)}</b><span>{text(item.description)}</span>{item.gtin && <small>GTIN: {item.gtin}</small>}</td><td>{text(item.ncm)}</td><td>{text(item.cfop)}</td><td>{text(item.cst || item.csosn)}</td><td>{decimal.format(itemQuantity(item))}</td><td>{text(item.unit)}</td><td>{brMoney(itemUnitPrice(item))}</td><td><b>{brMoney(itemTotal(item))}</b></td></tr>)}
      </tbody></table></div>

      {items.map((item, index) => <div className="mirror-item-tax" key={`tax-${item.id || index}`}><header><b>Tributação do item {index + 1}</b><span>{text(item.description)}</span></header><div className="mirror-tax-grid">
        <TaxLine title="ICMS">Origem {text(item.origin)} · {item.csosn ? `CSOSN ${item.csosn}` : `CST ${text(item.cst)}`} · Base {item.icmsBase === "" || item.icmsBase === undefined ? "—" : brMoney(item.icmsBase)} · Alíquota {item.icmsRate === "" || item.icmsRate === undefined ? "—" : `${decimal.format(Number(item.icmsRate))}%`}</TaxLine>
        <TaxLine title="PIS">CST {text(item.pisCst)} · Base {item.pisBase === "" || item.pisBase === undefined ? "—" : brMoney(item.pisBase)} · Alíquota {item.pisRate === "" || item.pisRate === undefined ? "—" : `${decimal.format(Number(item.pisRate))}%`}</TaxLine>
        <TaxLine title="COFINS">CST {text(item.cofinsCst)} · Base {item.cofinsBase === "" || item.cofinsBase === undefined ? "—" : brMoney(item.cofinsBase)} · Alíquota {item.cofinsRate === "" || item.cofinsRate === undefined ? "—" : `${decimal.format(Number(item.cofinsRate))}%`}</TaxLine>
        <TaxLine title="IBS/CBS">CST {text(item.ibsCbsCst)} · cClassTrib {text(item.cClassTrib)} · Base {item.ibsCbsBase === "" || item.ibsCbsBase === undefined ? "—" : brMoney(item.ibsCbsBase)} · IBS UF {item.ibsUfRate === "" || item.ibsUfRate === undefined ? "—" : `${decimal.format(Number(item.ibsUfRate))}%`} · IBS Mun {item.ibsMunRate === "" || item.ibsMunRate === undefined ? "—" : `${decimal.format(Number(item.ibsMunRate))}%`} · CBS {item.cbsRate === "" || item.cbsRate === undefined ? "—" : `${decimal.format(Number(item.cbsRate))}%`}</TaxLine>
      </div></div>)}
    </section>

    <section className="mirror-bottom-grid">
      <div className="mirror-section compact">
        <div className="mirror-section-title"><b>5</b><div><span>PAGAMENTO E OBSERVAÇÕES</span><h2>Condições da operação</h2></div></div>
        <div className="mirror-detail-grid two">
          <Detail label="Meio de pagamento" value={source.paymentMethod ? `${source.paymentMethod} · ${paymentLabels[source.paymentMethod] || "Código informado"}` : "Não informado"} wide />
          <Detail label="Informações complementares" value={source.notes} wide />
        </div>
      </div>
      <div className="mirror-totals">
        <span>Produtos <b>{brMoney(products)}</b></span>
        <span>Frete <b>{brMoney(freight)}</b></span>
        <span>Outras despesas <b>{brMoney(other)}</b></span>
        <span>Desconto <b>- {brMoney(discount)}</b></span>
        <strong>VALOR TOTAL <b>{brMoney(total)}</b></strong>
      </div>
    </section>

    <section className={warnings.length ? "mirror-review-alert has-warning" : "mirror-review-alert ok"}>
      <div><b>{warnings.length ? `${warnings.length} ponto(s) para conferir` : "Espelho sem pendências básicas"}</b><span>{warnings.length ? "O espelho serve para revisão; a validação fiscal definitiva continua sendo executada antes da transmissão." : "Ainda assim, confira classificação tributária e dados da operação antes de transmitir."}</span></div>
      {warnings.length > 0 && <ul>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
    </section>

    <footer className="mirror-sheet-footer"><span>Seven ERP · Espelho NF-e</span><b>SEM VALOR FISCAL</b><span>Gerado em {new Date().toLocaleString("pt-BR")}</span></footer>
  </article>;
}

export default function NfeMirrorCenter() {
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [drafts, setDrafts] = useState<AnyRow[]>([]);
  const [company, setCompany] = useState<AnyRow>({});
  const [snapshots, setSnapshots] = useState<SnapshotMap>({});
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const syncTarget = () => setPortalTarget(document.querySelector(".nfe-workspace .module-heading .nfe-heading-actions"));
    syncTarget();
    const observer = new MutationObserver(syncTarget);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const previousFetch = window.fetch.bind(window);
    const wrappedFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const response = await previousFetch(input, init);
      if (rawUrl.startsWith("/api/nfe-drafts") && String(init?.method || "GET").toUpperCase() === "POST" && response.ok && typeof init?.body === "string") {
        try {
          const payload = JSON.parse(init.body);
          if (!payload.action || payload.action === "save") {
            const cloned = response.clone();
            const data = await cloned.json();
            if (data?.draft?.id) saveSnapshot(data.draft.id, payload);
          }
        } catch { /* snapshot auxiliar não pode bloquear a emissão */ }
      }
      return response;
    };
    window.fetch = wrappedFetch;
    return () => { if (window.fetch === wrappedFetch) window.fetch = previousFetch; };
  }, []);

  const load = async () => {
    setLoading(true); setError("");
    try {
      const [draftResponse, companyResponse] = await Promise.all([fetch("/api/nfe-drafts"), fetch("/api/company")]);
      const [draftData, companyData] = await Promise.all([draftResponse.json(), companyResponse.json()]);
      if (!draftResponse.ok) throw new Error(draftData.error || "Não foi possível carregar os rascunhos de NF-e.");
      const rows = Array.isArray(draftData.drafts) ? draftData.drafts : [];
      setDrafts(rows); setCompany(companyResponse.ok ? companyData.company || {} : {}); setSnapshots(readSnapshots());
      setSelectedId((current) => current && rows.some((row: AnyRow) => row.id === current) ? current : rows[0]?.id || "");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Falha ao abrir o espelho da NF-e."); }
    finally { setLoading(false); }
  };

  const openMirror = () => { setOpen(true); void load(); };
  const selected = useMemo(() => drafts.find((draft) => draft.id === selectedId) || null, [drafts, selectedId]);
  const snapshot = selected ? snapshots[selected.id]?.payload : undefined;

  const launcher = portalTarget ? createPortal(<button type="button" className="outline-button nfe-mirror-launcher" onClick={openMirror}>▤ Espelho NF-e</button>, portalTarget) : null;

  return <>{launcher}{open && <div className="nfe-mirror-overlay" role="dialog" aria-modal="true" aria-label="Espelho da NF-e">
    <div className="nfe-mirror-topbar no-print">
      <div><span>FISCAL · CONFERÊNCIA</span><h2>Espelho NF-e</h2><p>Revise todos os dados antes de transmitir. O DANFE continua separado e só representa a NF-e autorizada.</p></div>
      <div className="nfe-mirror-controls">
        <label><span>Documento</span><select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}><option value="">Selecione...</option>{drafts.map((draft) => <option key={draft.id} value={draft.id}>{draft.nfeNumber ? `NF-e ${draft.nfeNumber}` : "Rascunho"} · {draft.recipientName || "Sem destinatário"} · {draft.totalCents !== undefined ? centsMoney(draft.totalCents) : ""}</option>)}</select></label>
        <button onClick={() => window.print()} disabled={!selected}>Imprimir / Salvar PDF</button>
        <button className="mirror-close" onClick={() => setOpen(false)}>Fechar</button>
      </div>
    </div>
    <div className="nfe-mirror-stage">
      {error ? <div className="mirror-empty-state"><b>Não foi possível abrir o espelho</b><span>{error}</span></div>
        : loading ? <div className="mirror-empty-state"><b>Carregando...</b><span>Preparando os dados fiscais.</span></div>
        : !selected ? <div className="mirror-empty-state"><b>Nenhum rascunho salvo</b><span>Salve a NF-e como rascunho e depois abra o Espelho NF-e.</span></div>
        : <><div className="mirror-snapshot-note no-print">{snapshot ? <><b>Snapshot completo encontrado</b><span>O espelho usa os campos exatamente como foram salvos neste computador.</span></> : <><b>Rascunho anterior ao recurso de espelho</b><span>Alguns dados detalhados podem aparecer como “—”. Salve novamente uma NF-e nova para registrar o snapshot completo.</span></>}</div><MirrorSheet draft={selected} company={company} snapshot={snapshot} /></>}
    </div>
  </div>}</>;
}
