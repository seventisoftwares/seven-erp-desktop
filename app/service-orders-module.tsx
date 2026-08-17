"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

type Customer = { id: string; legalName: string; tradeName?: string | null; taxId?: string | null; phone?: string | null; email?: string | null };
type ServiceOrder = {
  id: string; number: number; partyId: string; customerName?: string | null; customerTradeName?: string | null; customerTaxId?: string | null;
  customerPhone?: string | null; customerEmail?: string | null; status: string; priority: string; equipmentType?: string | null;
  equipmentBrand?: string | null; equipmentModel?: string | null; serialNumber?: string | null; reportedIssue: string; diagnosis?: string | null;
  solution?: string | null; technicianEmail?: string | null; laborCents: number; partsCents: number; totalCents: number; openedAt: string; closedAt?: string | null;
};

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const statusLabels: Record<string, string> = {
  open: "Aberta", diagnosis: "Em diagnóstico", waiting_approval: "Aguardando aprovação", approved: "Aprovada",
  in_progress: "Em execução", finished: "Finalizada", delivered: "Entregue", cancelled: "Cancelada",
};
const priorityLabels: Record<string, string> = { low: "Baixa", normal: "Normal", high: "Alta", urgent: "Urgente" };

function money(cents: number) { return currency.format((Number(cents) || 0) / 100); }
function dateTime(value?: string | null) { return value ? new Date(value).toLocaleString("pt-BR") : "—"; }

export default function ServiceOrdersModule({ onClose }: { onClose: () => void }) {
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [selected, setSelected] = useState<ServiceOrder | null>(null);
  const [editing, setEditing] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const [ordersResponse, customersResponse] = await Promise.all([fetch("/api/service-orders"), fetch("/api/customers")]);
      const ordersData = await ordersResponse.json();
      const customersData = await customersResponse.json();
      if (!ordersResponse.ok) throw new Error(ordersData.error || "Não foi possível carregar as ordens de serviço.");
      if (!customersResponse.ok) throw new Error(customersData.error || "Não foi possível carregar os clientes.");
      setOrders(ordersData.orders || []);
      setCustomers(customersData.customers || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao carregar ordens de serviço.");
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return orders.filter((order) => {
      const matchesStatus = statusFilter === "all" || order.status === statusFilter;
      const haystack = [order.number, order.customerName, order.customerTradeName, order.equipmentType, order.equipmentBrand, order.equipmentModel, order.serialNumber, order.reportedIssue].join(" ").toLowerCase();
      return matchesStatus && (!term || haystack.includes(term));
    });
  }, [orders, search, statusFilter]);

  const openCount = orders.filter((item) => !["finished", "delivered", "cancelled"].includes(item.status)).length;
  const waitingCount = orders.filter((item) => item.status === "waiting_approval").length;
  const finishedCount = orders.filter((item) => ["finished", "delivered"].includes(item.status)).length;
  const totalOpen = orders.filter((item) => !["cancelled"].includes(item.status)).reduce((sum, item) => sum + item.totalCents, 0);

  const createOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/service-orders", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(form.entries())),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível emitir a ordem de serviço.");
      setNewOpen(false);
      setNotice(data.queued ? "OS registrada na fila offline e será sincronizada quando a internet voltar." : `OS ${String(data.order?.number || "").padStart(5, "0")} emitida com sucesso.`);
      await load();
      if (data.order) setSelected(data.order);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível emitir a OS."); }
    finally { setSaving(false); }
  };

  const updateOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    setSaving(true); setError(""); setNotice("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/service-orders", {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: selected.id, ...Object.fromEntries(form.entries()) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível atualizar a OS.");
      setSelected(data.order); setEditing(false); setNotice("Ordem de serviço atualizada."); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível atualizar a OS."); }
    finally { setSaving(false); }
  };

  const printOrder = (order: ServiceOrder) => {
    setSelected(order);
    window.setTimeout(() => window.print(), 60);
  };

  return <div className="enhanced-module service-orders-v2">
    <header className="enhanced-header">
      <div><span className="enhanced-kicker">Operações · independente de integrações</span><h1>Ordens de serviço</h1><p>Abra, acompanhe, finalize e imprima atendimentos sem configurar API, banco, SEFAZ ou qualquer serviço externo.</p></div>
      <div className="enhanced-actions"><button className="enhanced-secondary" onClick={onClose}>Voltar ao ERP</button><button className="enhanced-primary" onClick={() => { setNewOpen(true); setError(""); }}>+ Nova OS</button></div>
    </header>

    <div className="core-independence-banner"><strong>ERP independente</strong><span>A emissão de OS é nativa do Seven ERP. Integrações são opcionais e não bloqueiam este módulo.</span></div>
    {error && <div className="enhanced-alert error">{error}</div>}
    {notice && <div className="enhanced-alert success">{notice}</div>}

    <section className="enhanced-metrics">
      <article><span>OS em andamento</span><strong>{openCount}</strong><small>Abertas, diagnóstico ou execução</small></article>
      <article><span>Aguardando aprovação</span><strong>{waitingCount}</strong><small>Orçamentos pendentes do cliente</small></article>
      <article><span>Finalizadas</span><strong>{finishedCount}</strong><small>Concluídas ou entregues</small></article>
      <article><span>Valor das OS</span><strong>{money(totalOpen)}</strong><small>Mão de obra + peças</small></article>
    </section>

    <section className="enhanced-panel">
      <div className="enhanced-toolbar">
        <div><h2>Atendimentos</h2><p>{orders.length} ordem(ns) registrada(s)</p></div>
        <div className="enhanced-filters"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente, equipamento, série..." /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Todos os status</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button onClick={() => void load()}>Atualizar</button></div>
      </div>
      {loading ? <div className="enhanced-empty">Carregando ordens de serviço...</div> : filtered.length ? <div className="service-table-wrap"><table className="enhanced-table"><thead><tr><th>OS</th><th>Cliente / equipamento</th><th>Status</th><th>Prioridade</th><th>Abertura</th><th>Total</th><th></th></tr></thead><tbody>{filtered.map((order) => <tr key={order.id}><td><strong>#{String(order.number).padStart(5, "0")}</strong></td><td><strong>{order.customerTradeName || order.customerName || "Cliente"}</strong><small>{[order.equipmentType, order.equipmentBrand, order.equipmentModel].filter(Boolean).join(" · ") || "Equipamento não informado"}</small></td><td><span className={`order-status ${order.status}`}>{statusLabels[order.status] || order.status}</span></td><td>{priorityLabels[order.priority] || order.priority}</td><td>{dateTime(order.openedAt)}</td><td><strong>{money(order.totalCents)}</strong></td><td><div className="table-actions"><button onClick={() => { setSelected(order); setEditing(false); }}>Abrir</button><button onClick={() => printOrder(order)}>Imprimir</button></div></td></tr>)}</tbody></table></div> : <div className="enhanced-empty"><strong>Nenhuma OS encontrada</strong><span>Emita a primeira ordem de serviço sem precisar configurar nenhuma integração.</span><button className="enhanced-primary" onClick={() => setNewOpen(true)}>Emitir primeira OS</button></div>}
    </section>

    {newOpen && <div className="enhanced-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setNewOpen(false)}><form className="enhanced-modal service-form" onSubmit={createOrder}><div className="enhanced-modal-title"><div><span>NOVA ORDEM DE SERVIÇO</span><h2>Emitir OS</h2></div><button type="button" onClick={() => setNewOpen(false)}>×</button></div><div className="form-grid two"><label><span>Cliente *</span><select name="partyId" required defaultValue=""><option value="" disabled>Selecione o cliente</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.tradeName || customer.legalName}</option>)}</select></label><label><span>Prioridade</span><select name="priority" defaultValue="normal"><option value="low">Baixa</option><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></label><label><span>Tipo de equipamento</span><input name="equipmentType" placeholder="Notebook, impressora, servidor..." /></label><label><span>Marca</span><input name="equipmentBrand" placeholder="Dell, Epson, HP..." /></label><label><span>Modelo</span><input name="equipmentModel" /></label><label><span>Número de série</span><input name="serialNumber" /></label><label className="full"><span>Defeito relatado / serviço solicitado *</span><textarea name="reportedIssue" required rows={4} placeholder="Descreva detalhadamente o atendimento solicitado..." /></label><label className="full"><span>Diagnóstico inicial</span><textarea name="diagnosis" rows={3} /></label><label><span>Mão de obra (R$)</span><input name="labor" type="number" min="0" step="0.01" defaultValue="0" /></label><label><span>Peças / materiais (R$)</span><input name="parts" type="number" min="0" step="0.01" defaultValue="0" /></label><label className="full"><span>Técnico responsável</span><input name="technicianEmail" type="email" placeholder="tecnico@empresa.com.br" /></label></div><div className="enhanced-modal-footer"><small>Nenhuma integração externa é necessária para salvar esta OS.</small><div><button type="button" className="enhanced-secondary" onClick={() => setNewOpen(false)}>Cancelar</button><button className="enhanced-primary" disabled={saving}>{saving ? "Emitindo..." : "Emitir ordem de serviço"}</button></div></div></form></div>}

    {selected && <div className="enhanced-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}><section className="enhanced-modal service-detail"><div className="enhanced-modal-title"><div><span>ORDEM DE SERVIÇO</span><h2>OS #{String(selected.number).padStart(5, "0")}</h2></div><button onClick={() => setSelected(null)}>×</button></div>{editing ? <form onSubmit={updateOrder}><div className="form-grid two"><label><span>Status</span><select name="status" defaultValue={selected.status}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span>Prioridade</span><select name="priority" defaultValue={selected.priority}>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="full"><span>Diagnóstico</span><textarea name="diagnosis" rows={4} defaultValue={selected.diagnosis || ""} /></label><label className="full"><span>Solução / serviço executado</span><textarea name="solution" rows={4} defaultValue={selected.solution || ""} /></label><label><span>Mão de obra (R$)</span><input name="labor" type="number" step="0.01" min="0" defaultValue={(selected.laborCents / 100).toFixed(2)} /></label><label><span>Peças (R$)</span><input name="parts" type="number" step="0.01" min="0" defaultValue={(selected.partsCents / 100).toFixed(2)} /></label><label className="full"><span>Técnico</span><input name="technicianEmail" type="email" defaultValue={selected.technicianEmail || ""} /></label></div><div className="enhanced-modal-footer"><span /><div><button type="button" className="enhanced-secondary" onClick={() => setEditing(false)}>Cancelar</button><button className="enhanced-primary" disabled={saving}>{saving ? "Salvando..." : "Salvar alterações"}</button></div></div></form> : <div className="service-detail-body"><div className="detail-badges"><span className={`order-status ${selected.status}`}>{statusLabels[selected.status] || selected.status}</span><span>Prioridade {priorityLabels[selected.priority] || selected.priority}</span></div><div className="detail-grid"><article><span>Cliente</span><strong>{selected.customerTradeName || selected.customerName || "—"}</strong><small>{selected.customerTaxId || "Sem CPF/CNPJ"}</small></article><article><span>Equipamento</span><strong>{[selected.equipmentBrand, selected.equipmentModel].filter(Boolean).join(" ") || selected.equipmentType || "—"}</strong><small>{selected.serialNumber ? `Série: ${selected.serialNumber}` : "Sem número de série"}</small></article><article className="wide"><span>Relato do cliente</span><p>{selected.reportedIssue}</p></article><article className="wide"><span>Diagnóstico</span><p>{selected.diagnosis || "Ainda não informado."}</p></article><article className="wide"><span>Solução / execução</span><p>{selected.solution || "Ainda não informada."}</p></article></div><div className="service-values"><span>Mão de obra <strong>{money(selected.laborCents)}</strong></span><span>Peças <strong>{money(selected.partsCents)}</strong></span><span>Total <strong>{money(selected.totalCents)}</strong></span></div><div className="enhanced-modal-footer"><small>Aberta em {dateTime(selected.openedAt)}</small><div><button className="enhanced-secondary" onClick={() => printOrder(selected)}>Imprimir</button><button className="enhanced-primary" onClick={() => setEditing(true)}>Editar OS</button></div></div></div>}</section></div>}

    {selected && <article className="service-print-sheet"><header><div><strong>SEVEN ERP</strong><span>Ordem de Serviço</span></div><h1>OS #{String(selected.number).padStart(5, "0")}</h1></header><section><p><b>Cliente:</b> {selected.customerTradeName || selected.customerName || "—"}</p><p><b>CPF/CNPJ:</b> {selected.customerTaxId || "—"}</p><p><b>Contato:</b> {selected.customerPhone || selected.customerEmail || "—"}</p><p><b>Equipamento:</b> {[selected.equipmentType, selected.equipmentBrand, selected.equipmentModel].filter(Boolean).join(" / ") || "—"}</p><p><b>Nº de série:</b> {selected.serialNumber || "—"}</p></section><section><h2>Defeito / serviço solicitado</h2><p>{selected.reportedIssue}</p><h2>Diagnóstico</h2><p>{selected.diagnosis || "—"}</p><h2>Serviço executado / solução</h2><p>{selected.solution || "—"}</p></section><footer><p>Mão de obra: {money(selected.laborCents)} · Peças: {money(selected.partsCents)} · <b>Total: {money(selected.totalCents)}</b></p><div><span>Assinatura do cliente</span><span>Responsável técnico</span></div></footer></article>}
  </div>;
}
