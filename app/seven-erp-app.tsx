"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import NfeModule from "./nfe-module";

type NavItem = { id: string; label: string; icon: string; badge?: string };
type NavGroup = { label: string; items: NavItem[] };

declare global {
  interface SevenDesktopStatus { online: boolean; paired: boolean; pending: number; deviceName?: string; apiBase?: string }
  interface SevenDesktopBridge {
    getStatus: () => Promise<SevenDesktopStatus>;
    onStatus: (callback: (status: SevenDesktopStatus) => void) => () => void;
    pair?: (payload: { code: string; deviceName: string }) => Promise<{ paired: boolean }>;
    forget?: () => Promise<{ paired: boolean }>;
    apiRequest?: (path: string, options: { method?: string; headers?: Record<string, string>; body?: string | null }) => Promise<{ status: number; ok: boolean; headers: Record<string, string>; body: string }>;
  }
  interface Window {
    sevenDesktop?: SevenDesktopBridge;
  }
}

const navGroups: NavGroup[] = [
  { label: "Principal", items: [
    { id: "dashboard", label: "Visão geral", icon: "grid" },
    { id: "tasks", label: "Minha agenda", icon: "calendar" },
  ]},
  { label: "Operações", items: [
    { id: "sales", label: "Vendas e orçamentos", icon: "briefcase" },
    { id: "crm", label: "CRM e oportunidades", icon: "target" },
    { id: "pdv", label: "PDV e caixa", icon: "store" },
    { id: "service", label: "Ordens de serviço", icon: "tool" },
    { id: "purchases", label: "Compras", icon: "cart" },
    { id: "inventory", label: "Estoque", icon: "box" },
    { id: "shipping", label: "Expedição", icon: "truck" },
  ]},
  { label: "Gestão", items: [
    { id: "customers", label: "Clientes e contatos", icon: "users" },
    { id: "suppliers", label: "Fornecedores", icon: "building" },
    { id: "catalog", label: "Produtos e serviços", icon: "tag" },
    { id: "contracts", label: "Contratos e assinaturas", icon: "repeat" },
    { id: "certificates", label: "Certificados digitais", icon: "shield" },
  ]},
  { label: "Fiscal e financeiro", items: [
    { id: "fiscal", label: "Documentos fiscais", icon: "file" },
    { id: "nfe", label: "Emissão de NF-e", icon: "invoice" },
    { id: "manifestation", label: "Manifestação NF-e", icon: "inbox" },
    { id: "sped", label: "SPED e obrigações", icon: "database" },
    { id: "finance", label: "Financeiro", icon: "wallet" },
    { id: "billing", label: "Boletos e carnês", icon: "barcode" },
    { id: "reports", label: "Relatórios", icon: "chart" },
  ]},
  { label: "Administração", items: [
    { id: "users", label: "Usuários e permissões", icon: "lock" },
    { id: "devices", label: "Dispositivos e sincronização", icon: "monitor" },
  ]},
];

const moduleCopy: Record<string, { eyebrow: string; title: string; description: string }> = {
  tasks: { eyebrow: "Produtividade", title: "Minha agenda", description: "Tarefas, retornos, vencimentos e compromissos centralizados." },
  sales: { eyebrow: "Comercial", title: "Vendas e orçamentos", description: "Do primeiro orçamento ao pedido faturado, sem perder nenhuma etapa." },
  crm: { eyebrow: "Relacionamento", title: "CRM e oportunidades", description: "Funil comercial, atividades, propostas, metas e previsão de fechamento." },
  pdv: { eyebrow: "Varejo", title: "PDV e caixa", description: "Abertura de caixa, vendas rápidas, sangrias, suprimentos e fechamento por operador." },
  service: { eyebrow: "Serviços", title: "Ordens de serviço", description: "Abertura, diagnóstico, peças, apontamentos, aprovação e entrega." },
  purchases: { eyebrow: "Suprimentos", title: "Compras", description: "Solicitações, cotações, pedidos e recebimentos com rastreabilidade." },
  inventory: { eyebrow: "Operação", title: "Estoque", description: "Saldos, lotes, seriais, movimentações e inventários por local." },
  shipping: { eyebrow: "Logística", title: "Expedição", description: "Separação, conferência, volumes, etiquetas, rastreio e comprovantes de entrega." },
  customers: { eyebrow: "Relacionamento", title: "Clientes e contatos", description: "Uma visão única de pessoas, empresas, contatos, histórico e crédito." },
  suppliers: { eyebrow: "Suprimentos", title: "Fornecedores", description: "Homologação, documentos, condições comerciais, contatos e desempenho de fornecedores." },
  catalog: { eyebrow: "Cadastros", title: "Produtos e serviços", description: "Catálogo, preços, custos, tributos, kits, variações e fornecedores." },
  contracts: { eyebrow: "Receita recorrente", title: "Contratos e assinaturas", description: "Gestão dos softwares Seven TI, mensalidades, licenças e renovações." },
  certificates: { eyebrow: "ICP-Brasil", title: "Certificados digitais", description: "Pedidos, validações, emissões, vencimentos, renovações e comissões." },
  fiscal: { eyebrow: "Fiscal", title: "Documentos fiscais", description: "Emissão de NFS-e, NF-e e NFC-e; CT-e e MDF-e somente por importação." },
  manifestation: { eyebrow: "Fiscal recebido", title: "Manifestação NF-e", description: "Distribuição de documentos fiscais e eventos do destinatário no Ambiente Nacional." },
  sped: { eyebrow: "Compliance", title: "SPED e obrigações", description: "Apuração, conferências, blocos fiscais, exportações e calendário de obrigações." },
  finance: { eyebrow: "Tesouraria", title: "Financeiro", description: "Contas, caixa, bancos, conciliação, cobrança e fluxo de caixa." },
  billing: { eyebrow: "Cobrança", title: "Boletos e carnês", description: "Cobranças registradas, Pix, parcelas, remessas e baixa automática." },
  reports: { eyebrow: "Inteligência", title: "Relatórios", description: "Indicadores comerciais, operacionais, financeiros e fiscais." },
  users: { eyebrow: "Governança", title: "Usuários e permissões", description: "Perfis, alçadas, segregação de funções, acesso por empresa e trilha de auditoria." },
  devices: { eyebrow: "Nuvem Seven", title: "Dispositivos e sincronização", description: "Autorize computadores, acompanhe a conexão e mantenha os dados sincronizados com segurança." },
};

const moduleCapabilities: Record<string, string[]> = {
  sales: ["Orçamentos versionados", "Pedidos de venda", "Aprovação comercial", "Comissões e metas"],
  crm: ["Funil de oportunidades", "Agenda de atividades", "Propostas vinculadas", "Previsão de receita"],
  pdv: ["Abertura e fechamento", "Venda balcão", "Sangria e suprimento", "Conferência por operador"],
  service: ["Triagem e diagnóstico", "Peças e mão de obra", "Aprovação do cliente", "Termo de entrega"],
  purchases: ["Solicitação de compra", "Mapa de cotações", "Pedido e aprovação", "Recebimento fiscal"],
  inventory: ["Múltiplos depósitos", "Lote e número de série", "Inventário e ajustes", "Estoque mínimo"],
  shipping: ["Separação e conferência", "Montagem de volumes", "Etiqueta e rastreio", "Comprovante de entrega"],
  suppliers: ["Homologação cadastral", "Condições comerciais", "Documentos e certidões", "Avaliação de desempenho"],
  catalog: ["Tabela de preços", "Custos e margem", "Regras fiscais por item", "Kits e variações"],
  contracts: ["Faturas recorrentes", "Licenças de software", "Reajustes automáticos", "Renovação e cancelamento"],
  certificates: ["Pedidos ICP-Brasil", "Agenda de validação", "Vencimentos e renovação", "Comissões do parceiro"],
  sped: ["Conferência por período", "EFD ICMS/IPI", "EFD Contribuições", "Calendário de obrigações"],
  finance: ["Contas a pagar e receber", "Fluxo de caixa", "Conciliação bancária", "Centros de custo"],
  billing: ["Boleto registrado", "Pix e boleto híbrido", "Carnês parcelados", "Baixa por webhook"],
  reports: ["DRE gerencial", "Curva ABC", "Rentabilidade por cliente", "Indicadores fiscais"],
  users: ["Perfis por função", "Alçadas de aprovação", "Acesso por empresa", "Auditoria de alterações"],
};

const iconPaths: Record<string, string[]> = {
  grid: ["M4 4h6v6H4z", "M14 4h6v6h-6z", "M4 14h6v6H4z", "M14 14h6v6h-6z"],
  calendar: ["M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z", "M8 2v4", "M16 2v4", "M3 9h18"],
  briefcase: ["M4 7h16v13H4z", "M9 7V4h6v3", "M4 12h16"],
  tool: ["M14.7 6.3a4 4 0 0 0-5-5L12 4 8 8 5.7 5.7a4 4 0 0 0 5 5L19 19l2-2-6.3-6.3Z"],
  cart: ["M3 3h2l2.4 11.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 2-1.6L21 7H6", "M10 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z", "M18 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"],
  box: ["M4 7.5 12 3l8 4.5v9L12 21l-8-4.5z", "M4 7.5 12 12l8-4.5", "M12 12v9"],
  users: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M22 21v-2a4 4 0 0 0-3-3.9", "M16 3.1a4 4 0 0 1 0 7.8"],
  tag: ["M20 13 13 20 3 10V3h7z", "M7.5 7.5h.01"],
  repeat: ["M17 2l4 4-4 4", "M3 11V9a3 3 0 0 1 3-3h15", "M7 22l-4-4 4-4", "M21 13v2a3 3 0 0 1-3 3H3"],
  shield: ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z", "m9 12 2 2 4-4"],
  file: ["M6 2h8l4 4v16H6z", "M14 2v5h5", "M9 13h6", "M9 17h6"],
  inbox: ["M4 4h16v16H4z", "M4 14h4l2 3h4l2-3h4", "M8 8h8", "M8 11h8"],
  wallet: ["M3 6h17v14H3z", "M3 9h17", "M15 14h3"],
  barcode: ["M4 5v14", "M7 5v14", "M11 5v14", "M14 5v14", "M19 5v14"],
  chart: ["M4 20V10", "M10 20V4", "M16 20v-7", "M22 20H2"],
  search: ["M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z", "m21 21-4.4-4.4"],
  bell: ["M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9", "M10 21h4"],
  plus: ["M12 5v14", "M5 12h14"],
  chevron: ["m9 18 6-6-6-6"],
  arrow: ["M5 12h14", "m13 6 6 6-6 6"],
  menu: ["M4 7h16", "M4 12h16", "M4 17h16"],
  close: ["M6 6l12 12", "M18 6 6 18"],
  settings: ["M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z", "M19 12a7 7 0 0 1-.2 1.7l2 1.6-2 3.4-2.5-1a8 8 0 0 1-2.9 1.7L13 22H9l-.4-2.6a8 8 0 0 1-2.9-1.7l-2.5 1-2-3.4 2-1.6A7 7 0 0 1 3 12c0-.6.1-1.2.2-1.7l-2-1.6 2-3.4 2.5 1a8 8 0 0 1 2.9-1.7L9 2h4l.4 2.6a8 8 0 0 1 2.9 1.7l2.5-1 2 3.4-2 1.6c.1.5.2 1.1.2 1.7Z"],
  target: ["M22 12a10 10 0 1 1-10-10", "M22 2 12 12", "M16 2h6v6", "M16 12a4 4 0 1 1-4-4"],
  store: ["M4 10v11h16V10", "M3 4h18l-2 6H5z", "M8 21v-7h8v7"],
  truck: ["M3 6h11v11H3z", "M14 10h4l3 3v4h-7z", "M7 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z", "M18 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"],
  building: ["M4 21V5l8-3v19", "M12 8h8v13", "M8 7h.01", "M8 11h.01", "M8 15h.01", "M16 12h.01", "M16 16h.01"],
  database: ["M4 6c0-2 16-2 16 0s-16 2-16 0Z", "M4 6v6c0 2 16 2 16 0V6", "M4 12v6c0 2 16 2 16 0v-6"],
  lock: ["M5 10h14v11H5z", "M8 10V7a4 4 0 0 1 8 0v3", "M12 14v3"],
  invoice: ["M5 2h14v20l-3-2-4 2-4-2-3 2z", "M8 7h8", "M8 11h8", "M8 15h4"],
  monitor: ["M3 4h18v13H3z", "M8 21h8", "M12 17v4"],
};

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths = iconPaths[name] ?? iconPaths.grid;
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths.map((path, index) => <path d={path} key={`${name}-${index}`} />)}</svg>;
}

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function Status({ tone, children }: { tone: "green" | "amber" | "blue" | "gray"; children: ReactNode }) {
  return <span className={`status status-${tone}`}><i />{children}</span>;
}

export default function SevenErpApp() {
  const [active, setActive] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [period, setPeriod] = useState("Este mês");
  const [quickOpen, setQuickOpen] = useState(false);
  const activeCopy = useMemo(() => moduleCopy[active], [active]);
  const changeModule = (id: string) => { setActive(id); setSidebarOpen(false); };

  return <div className="erp-shell">
    {sidebarOpen && <button className="sidebar-backdrop" aria-label="Fechar menu" onClick={() => setSidebarOpen(false)} />}
    <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
      <div className="brand"><div className="brand-mark"><span>S</span><i /></div><div><strong>SEVEN</strong><span>ERP</span></div></div>
      <button className="sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Fechar menu"><Icon name="close" /></button>
      <button className="company-switcher"><span className="company-avatar">7</span><span><strong>Seven TI</strong><small>Tenant interno · Matriz</small></span><Icon name="chevron" size={14} /></button>
      <nav className="main-nav" aria-label="Navegação principal">
        {navGroups.map((group) => <div className="nav-group" key={group.label}><p>{group.label}</p>{group.items.map((item) => <button key={item.id} onClick={() => changeModule(item.id)} className={active === item.id ? "active" : ""}><Icon name={item.icon} /><span>{item.label}</span>{item.badge && <b>{item.badge}</b>}</button>)}</div>)}
      </nav>
      <div className="sidebar-footer">
        <button onClick={() => changeModule("integrations")} className={active === "integrations" ? "active" : ""}><Icon name="settings" /><span>Integrações e ajustes</span></button>
        <div className="user-card"><span className="user-avatar">AD</span><span><strong>Administrador</strong><small>Conta autenticada</small></span><span className="online-dot" title="Online" /></div>
      </div>
    </aside>

    <section className="workspace">
      <header className="topbar">
        <button className="mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Abrir menu"><Icon name="menu" /></button>
        <button className="search-box"><Icon name="search" /><span>Buscar clientes, documentos, O.S...</span><kbd>⌘ K</kbd></button>
        <div className="topbar-actions"><ConnectionBadge /><button className="icon-button" aria-label="Notificações"><Icon name="bell" /></button><button className="primary-button" onClick={() => setQuickOpen(true)}><Icon name="plus" />Novo</button></div>
      </header>
      <main className="content">
        {active === "dashboard" && <Dashboard period={period} setPeriod={setPeriod} openQuick={() => setQuickOpen(true)} changeModule={changeModule} />}
        {active === "fiscal" && <FiscalModule openQuick={() => setQuickOpen(true)} changeModule={changeModule} />}
        {active === "nfe" && <NfeModule />}
        {active === "manifestation" && <ManifestationModule />}
        {active === "integrations" && <IntegrationsModule />}
        {active === "devices" && <DevicesModule />}
        {active === "customers" && <CustomersModule openQuick={() => setQuickOpen(true)} />}
        {active !== "dashboard" && active !== "fiscal" && active !== "nfe" && active !== "manifestation" && active !== "integrations" && active !== "devices" && active !== "customers" && <ModulePlaceholder active={active} copy={activeCopy} openQuick={() => setQuickOpen(true)} />}
      </main>
    </section>
    {quickOpen && <QuickCreate onClose={() => setQuickOpen(false)} onNavigate={changeModule} />}
  </div>;
}

function ConnectionBadge() {
  const [status, setStatus] = useState<SevenDesktopStatus | null>(null);
  useEffect(() => {
    const bridge = window.sevenDesktop;
    if (!bridge) return;
    let active = true;
    bridge.getStatus().then((value) => active && setStatus(value)).catch(() => undefined);
    const unsubscribe = bridge.onStatus((value) => active && setStatus(value));
    return () => { active = false; unsubscribe(); };
  }, []);
  if (!status) return <span className="environment cloud"><i />SaaS · Nuvem</span>;
  return <span className={`environment ${status.online ? "synced" : "offline"}`} title={status.deviceName}><i />{status.online ? status.pending ? `${status.pending} pendente(s)` : "Sincronizado" : `Offline · ${status.pending} na fila`}</span>;
}

type DashboardData = {
  metrics: { revenueCents: number; receivableCents: number; openServiceOrders: number; customers: number };
  attention: { overdueEntries: number; lowStockItems: number; expiringCertificates: number };
  recentServiceOrders: Array<{ id: string; number: number; customer: string; equipment: string; totalCents: number; status: string; openedAt: string }>;
  upcomingEntries: Array<{ id: string; description: string; direction: string; amountCents: number; dueDate: string }>;
};

const emptyDashboard: DashboardData = {
  metrics: { revenueCents: 0, receivableCents: 0, openServiceOrders: 0, customers: 0 },
  attention: { overdueEntries: 0, lowStockItems: 0, expiringCertificates: 0 },
  recentServiceOrders: [],
  upcomingEntries: [],
};

function Dashboard({ period, setPeriod, openQuick, changeModule }: { period: string; setPeriod: (value: string) => void; openQuick: () => void; changeModule: (id: string) => void }) {
  const [data, setData] = useState<DashboardData>(emptyDashboard);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    fetch("/api/dashboard").then((response) => response.json().then((payload) => ({ response, payload }))).then(({ response, payload }) => {
      if (!response.ok) throw new Error(payload.error || "Não foi possível carregar o painel.");
      if (active) setData(payload);
    }).catch((caught) => active && setError(caught instanceof Error ? caught.message : "Não foi possível carregar o painel.")).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);
  const today = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" }).format(new Date());
  const metrics = [
    { label: "Receita recebida", value: currency.format(data.metrics.revenueCents / 100), note: "Lançamentos reais do período" },
    { label: "A receber", value: currency.format(data.metrics.receivableCents / 100), note: "Títulos financeiros em aberto" },
    { label: "Ordens abertas", value: String(data.metrics.openServiceOrders), note: "Ordens ainda não concluídas" },
    { label: "Clientes", value: String(data.metrics.customers), note: "Cadastros ativos na empresa" },
  ];
  const attentionCount = data.attention.overdueEntries + data.attention.lowStockItems + data.attention.expiringCertificates;

  return <>
    <div className="page-heading"><div><span className="eyebrow">{today}</span><h1>Bem-vindo ao Seven ERP.</h1><p>O painel exibe somente informações reais cadastradas pela sua empresa.</p></div><div className="heading-actions"><select value={period} onChange={(event) => setPeriod(event.target.value)} aria-label="Período"><option>Hoje</option><option>Esta semana</option><option>Este mês</option><option>Este ano</option></select><button className="outline-button" onClick={() => changeModule("reports")}><Icon name="chart" />Ver relatórios</button></div></div>
    {error && <p className="form-error">{error}</p>}
    <section className="metrics-grid" aria-label="Indicadores principais">{metrics.map((metric) => <article className="metric-card metric-clean" key={metric.label}><div className="metric-top"><span>{metric.label}</span></div><strong>{loading ? "—" : metric.value}</strong><div className="metric-bottom"><small>{metric.note}</small></div></article>)}</section>

    <section className="attention-center attention-clean" aria-label="Central de atenção">
      <header><span><Icon name="bell" size={18} /></span><div><strong>Central de atenção</strong><small>{loading ? "Verificando registros..." : attentionCount ? `${attentionCount} pendência(s) localizada(s)` : "Nenhuma pendência registrada"}</small></div></header>
      {data.attention.lowStockItems > 0 && <button onClick={() => changeModule("inventory")}><i className="attention-red" /><span><b>{data.attention.lowStockItems} item(ns) abaixo do mínimo</b><small>Revisar estoque</small></span><Icon name="arrow" size={14} /></button>}
      {data.attention.overdueEntries > 0 && <button onClick={() => changeModule("finance")}><i className="attention-purple" /><span><b>{data.attention.overdueEntries} título(s) vencido(s)</b><small>Revisar contas em aberto</small></span><Icon name="arrow" size={14} /></button>}
      {data.attention.expiringCertificates > 0 && <button onClick={() => changeModule("certificates")}><i className="attention-green" /><span><b>{data.attention.expiringCertificates} certificado(s) a vencer</b><small>Próximos 30 dias</small></span><Icon name="arrow" size={14} /></button>}
    </section>

    <section className="dashboard-grid dashboard-clean-grid">
      <article className="panel revenue-panel">
        <div className="panel-heading"><div><span>Dados reais</span><h2>Desempenho financeiro</h2></div></div>
        <div className="clean-empty"><span><Icon name="chart" size={24} /></span><h3>{data.metrics.revenueCents || data.metrics.receivableCents ? "Movimentação financeira disponível" : "Nenhuma movimentação financeira"}</h3><p>{data.metrics.revenueCents || data.metrics.receivableCents ? "Os totais acima foram calculados diretamente dos lançamentos da empresa." : "Cadastre contas a pagar ou receber para preencher os indicadores e relatórios."}</p><button className="outline-button" onClick={() => changeModule("finance")}>Abrir financeiro</button></div>
      </article>

      <article className="panel quick-panel">
        <div className="panel-heading"><div><span>Atalhos</span><h2>Ações rápidas</h2></div></div>
        <div className="quick-grid">{[["briefcase","Novo orçamento","sales"],["tool","Abrir O.S.","service"],["invoice","Emitir NF-e","nfe"],["users","Novo cliente","customers"],["barcode","Gerar cobrança","billing"],["shield","Novo certificado","certificates"]].map(([icon,label,id]) => <button key={label} onClick={() => changeModule(id)}><span><Icon name={icon} /></span><b>{label}</b><Icon name="arrow" size={15} /></button>)}</div>
        <button className="quick-create" onClick={openQuick}><Icon name="plus" />Criar outro registro</button>
      </article>

      <article className="panel operation-panel">
        <div className="panel-heading"><div><span>Operação</span><h2>Ordens de serviço recentes</h2></div><button onClick={() => changeModule("service")}>Ver todas <Icon name="arrow" size={14} /></button></div>
        {data.recentServiceOrders.length ? <div className="table-wrap"><table><thead><tr><th>O.S.</th><th>Cliente</th><th>Equipamento</th><th>Valor</th><th>Status</th></tr></thead><tbody>{data.recentServiceOrders.map((order) => <tr key={order.id}><td><b>#{order.number}</b><small>{new Date(order.openedAt).toLocaleDateString("pt-BR")}</small></td><td>{order.customer}</td><td>{order.equipment || "Não informado"}</td><td>{currency.format(order.totalCents / 100)}</td><td><Status tone="blue">{order.status}</Status></td></tr>)}</tbody></table></div> : <div className="clean-empty clean-empty-table"><span><Icon name="tool" size={22} /></span><h3>Nenhuma ordem de serviço</h3><p>As ordens criadas pela empresa aparecerão aqui.</p></div>}
      </article>

      <article className="panel agenda-panel">
        <div className="panel-heading"><div><span>Financeiro</span><h2>Próximos vencimentos</h2></div><button onClick={() => changeModule("finance")}>Ver agenda</button></div>
        {data.upcomingEntries.length ? <div className="agenda-list">{data.upcomingEntries.map((entry) => { const date = new Date(`${entry.dueDate}T12:00:00`); return <div key={entry.id}><time><b>{String(date.getDate()).padStart(2, "0")}</b><span>{date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "").toUpperCase()}</span></time><p><strong>{entry.description}</strong><span>{entry.direction === "out" ? "Conta a pagar" : "Conta a receber"}</span></p><b className={entry.direction === "out" ? "expense-value" : ""}>{entry.direction === "out" ? "− " : ""}{currency.format(entry.amountCents / 100)}</b></div>; })}</div> : <div className="clean-empty clean-empty-table"><span><Icon name="calendar" size={22} /></span><h3>Nenhum vencimento próximo</h3><p>Os lançamentos financeiros em aberto aparecerão aqui.</p></div>}
      </article>
    </section>
  </>;
}

function FiscalModule({ openQuick, changeModule }: { openQuick: () => void; changeModule: (id: string) => void }) {
  return <div className="module-view fiscal-workspace">
    <div className="page-heading module-heading"><div><span className="eyebrow">Central fiscal</span><h1>Documentos fiscais</h1><p>Emissão de documentos próprios e guarda dos XMLs; CT-e e MDF-e entram somente por importação.</p></div><button className="primary-button" onClick={openQuick}><Icon name="plus" />Preparar documento</button></div>

    <section className="compliance-banner">
      <span className="compliance-icon"><Icon name="shield" size={24} /></span>
      <div><strong>Base fiscal preparada para as regras vigentes em 2026</strong><p>Campos textuais para CNPJ alfanumérico, ambientes separados, idempotência, trilha de auditoria e conectores versionados.</p></div>
      <a href="https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/acoes-e-programas/programas-e-atividades/cnpj-alfanumerico" target="_blank" rel="noreferrer">Referência oficial <Icon name="arrow" size={14} /></a>
    </section>

    <section className="fiscal-models">
      {[
        ["NFS-e","Emissão própria","Padrão Nacional · município do emitente","gray","Não configurado","Configurar emissão"],
        ["NF-e / NFC-e","Emissão própria","SEFAZ / autorizador da UF","gray","Não configurado","Configurar emissão"],
        ["CT-e","Somente recebimento","Modelo 57 · importação e guarda do XML","gray","Não configurado","Configurar importação"],
        ["MDF-e","Somente recebimento","Modelo 58 · importação e guarda do XML","gray","Não configurado","Configurar importação"],
      ].map(([title,kind,note,tone,status,action]) => <article key={title}><div><span>{kind}</span><h2>{title}</h2><p>{note}</p></div><Status tone={tone as "blue"|"amber"|"gray"}>{status}</Status><button onClick={() => title === "NF-e / NFC-e" ? changeModule("nfe") : openQuick()}>{title === "NF-e / NFC-e" ? "Abrir emissão de NF-e" : action} <Icon name="arrow" size={14} /></button></article>)}
    </section>

    <article className="panel fiscal-table-panel">
      <div className="panel-heading"><div><span>Fila de emissão</span><h2>Documentos próprios em preparação</h2></div><div className="fiscal-filters"><button className="active">Todos</button><button>NFS-e</button><button>NF-e</button><button>NFC-e</button></div></div>
      <div className="table-wrap"><table className="records-table"><thead><tr><th>Modelo</th><th>Número</th><th>Destinatário / tomador</th><th>Valor</th><th>Status</th><th /></tr></thead><tbody /></table></div>
      <div className="clean-empty clean-empty-table"><span><Icon name="file" size={24} /></span><h3>Nenhum documento fiscal</h3><p>Somente documentos criados ou importados pela empresa aparecerão nesta fila.</p><button className="primary-button" onClick={openQuick}>Preparar primeiro documento</button></div>
      <div className="fiscal-note"><Icon name="shield" size={16} /><span>Nenhum documento foi transmitido. CT-e e MDF-e recebidos serão tratados no fluxo de importação DF-e.</span></div>
    </article>
  </div>;
}

type ManifestEventId = "science" | "confirmation" | "unknown" | "operation_not_performed";
type ManifestDocument = {
  id: string;
  accessKey: string;
  nsu: string;
  issuerName: string;
  issuerTaxId: string;
  issueDate: string;
  totalCents: number;
  state: "pending" | "science" | "confirmed" | "draft";
};

const manifestEvents: Array<{ id: ManifestEventId; code: string; title: string; short: string; description: string }> = [
  { id: "science", code: "210210", title: "Ciência da Emissão", short: "Ciência", description: "Registra que a empresa tomou conhecimento da NF-e, sem confirmar a operação." },
  { id: "confirmation", code: "210200", title: "Confirmação da Operação", short: "Confirmada", description: "Confirma que a operação descrita na NF-e ocorreu para o destinatário." },
  { id: "unknown", code: "210220", title: "Desconhecimento da Operação", short: "Desconhecida", description: "Informa que o destinatário não reconhece a operação ou o emitente." },
  { id: "operation_not_performed", code: "210240", title: "Operação não Realizada", short: "Não realizada", description: "Informa que a operação foi reconhecida, mas não se concretizou; exige justificativa." },
];

function manifestationLabel(state: ManifestDocument["state"]) {
  if (state === "science") return { label: "Ciência registrada", tone: "blue" as const };
  if (state === "confirmed") return { label: "Operação confirmada", tone: "green" as const };
  if (state === "draft") return { label: "Evento em rascunho", tone: "amber" as const };
  return { label: "Aguardando manifestação", tone: "gray" as const };
}

function ManifestationModule() {
  const [documents, setDocuments] = useState<ManifestDocument[]>([]);
  const [eventCount, setEventCount] = useState(0);
  const [loadingDocuments, setLoadingDocuments] = useState(true);
  const [selected, setSelected] = useState<ManifestDocument | null>(null);
  const [eventId, setEventId] = useState<ManifestEventId | null>(null);
  const [justification, setJustification] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "science" | "confirmed">("all");
  const [activationHint, setActivationHint] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/recipient-manifestations").then((response) => response.json().then((payload) => ({ response, payload }))).then(({ response, payload }) => {
      if (!response.ok) throw new Error(payload.error || "Não foi possível consultar as NF-e recebidas.");
      if (!active) return;
      setDocuments((payload.documents || []).map((document: Record<string, unknown>) => ({
        id: String(document.id || ""),
        accessKey: String(document.accessKey || ""),
        nsu: String(document.nsu || ""),
        issuerName: String(document.issuerName || "Emitente não informado"),
        issuerTaxId: String(document.issuerTaxId || ""),
        issueDate: String(document.issueDate || new Date().toISOString().slice(0, 10)),
        totalCents: Number(document.totalCents || 0),
        state: document.manifestationStatus === "science" ? "science" : document.manifestationStatus === "confirmed" ? "confirmed" : document.manifestationStatus === "draft" ? "draft" : "pending",
      })));
      setEventCount(Array.isArray(payload.events) ? payload.events.length : 0);
    }).catch((caught) => active && setError(caught instanceof Error ? caught.message : "Não foi possível consultar as NF-e recebidas.")).finally(() => active && setLoadingDocuments(false));
    return () => { active = false; };
  }, []);

  const visibleDocuments = documents.filter((document) => {
    const normalized = query.trim().toLowerCase();
    const matchesQuery = !normalized || document.issuerName.toLowerCase().includes(normalized) || document.accessKey.includes(normalized.replace(/\D/g, ""));
    return matchesQuery && (filter === "all" || document.state === filter);
  });

  const closeModal = () => {
    setSelected(null);
    setEventId(null);
    setJustification("");
    setSaved(false);
    setError("");
  };

  const submitDraft = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || !eventId) return;
    if (eventId === "operation_not_performed" && justification.trim().length < 15) {
      setError("Informe uma justificativa com pelo menos 15 caracteres.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/recipient-manifestations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventType: eventId, justification, document: selected, idempotencyKey: `manifest-${selected.accessKey}-${eventId}-${Date.now()}-${Math.random().toString(36).slice(2)}` }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível criar o rascunho");
      setDocuments((current) => current.map((document) => document.id === selected.id ? { ...document, state: "draft" } : document));
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível criar o rascunho");
    } finally {
      setSaving(false);
    }
  };

  return <div className="module-view manifestation-workspace">
    <div className="page-heading module-heading"><div><span className="eyebrow">Fiscal recebido</span><h1>Manifestação do Destinatário</h1><p>Localize NF-e destinadas à empresa, preserve os XMLs e controle os eventos enviados ao Ambiente Nacional.</p></div><button className="primary-button" onClick={() => setActivationHint((current) => !current)}><Icon name="settings" />Ativar sincronização</button></div>

    <section className="compliance-banner manifestation-banner">
      <span className="compliance-icon"><Icon name="inbox" size={24} /></span>
      <div><strong>Integração oficial: NFeDistribuicaoDFe + RecepcaoEvento</strong><p>A busca será incremental por NSU, respeitará o intervalo de consulta do Ambiente Nacional e usará certificado A1 do CNPJ destinatário.</p></div>
      <a href="https://www.nfe.fazenda.gov.br/portal/WebServices.aspx/manifestacaoDestinatario.aspx?tipoConteudo=o9MkXc%2BhmKs%3D" target="_blank" rel="noreferrer">Web Services oficiais <Icon name="arrow" size={14} /></a>
    </section>

    {activationHint && <div className="activation-hint"><Icon name="shield" size={18} /><div><strong>Ativação protegida</strong><span>Cadastre o certificado A1, o CNPJ do tenant e selecione homologação ou produção. Até lá, os eventos permanecem como rascunhos e nada é transmitido.</span></div><button onClick={() => setActivationHint(false)} aria-label="Fechar aviso"><Icon name="close" size={14} /></button></div>}

    <section className="module-summary manifestation-summary">
      <article><span>NF-e localizadas</span><strong>{loadingDocuments ? "—" : documents.length}</strong><small>Documentos efetivamente importados</small></article>
      <article><span>Aguardando manifestação</span><strong>{loadingDocuments ? "—" : documents.filter((document) => document.state === "pending").length}</strong><small>Documentos ainda sem evento</small></article>
      <article><span>Ciência registrada</span><strong>{loadingDocuments ? "—" : documents.filter((document) => document.state === "science").length}</strong><small>Operação ainda não confirmada</small></article>
      <article><span>Eventos armazenados</span><strong>{loadingDocuments ? "—" : eventCount}</strong><small>Histórico real da empresa</small></article>
    </section>

    <section className="manifest-context">
      <article><span className="manifest-context-icon"><Icon name="inbox" /></span><div><strong>Manifestação do Destinatário</strong><p>Eventos sobre NF-e recebidas: ciência, confirmação, desconhecimento ou operação não realizada.</p></div></article>
      <article><span className="manifest-context-icon neutral"><Icon name="file" /></span><div><strong>Não é o MDF-e</strong><p>O MDF-e é o documento fiscal modelo 58. Neste ERP ele será somente importado, nunca emitido.</p></div></article>
    </section>

    <article className="panel manifest-panel">
      <div className="panel-heading manifest-panel-heading"><div><span>Documentos recebidos</span><h2>NF-e destinadas à empresa</h2></div><div className="fiscal-filters"><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Todas</button><button className={filter === "pending" ? "active" : ""} onClick={() => setFilter("pending")}>Pendentes</button><button className={filter === "science" ? "active" : ""} onClick={() => setFilter("science")}>Ciência</button><button className={filter === "confirmed" ? "active" : ""} onClick={() => setFilter("confirmed")}>Confirmadas</button></div></div>
      <div className="manifest-search"><Icon name="search" size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar emitente ou chave de acesso..." aria-label="Buscar NF-e recebida" /><span>{visibleDocuments.length} exibidas</span></div>
      <div className="table-wrap"><table className="records-table manifest-table"><thead><tr><th>Emitente</th><th>Emissão</th><th>Chave / NSU</th><th>Valor</th><th>Manifestação</th><th /></tr></thead><tbody>{visibleDocuments.map((document) => {
        const status = manifestationLabel(document.state);
        return <tr key={document.id}><td><b>{document.issuerName}</b><small>{document.issuerTaxId}</small></td><td>{new Date(`${document.issueDate}T12:00:00`).toLocaleDateString("pt-BR")}</td><td><span className="access-key">{document.accessKey.slice(0, 8)}…{document.accessKey.slice(-8)}</span><small>NSU {document.nsu}</small></td><td>{currency.format(document.totalCents / 100)}</td><td><Status tone={status.tone}>{status.label}</Status></td><td><button className="row-action" onClick={() => { setSelected(document); setEventId(null); setSaved(false); setError(""); }}>{document.state === "confirmed" ? "Ver eventos" : "Manifestar"} <Icon name="arrow" size={13} /></button></td></tr>;
      })}</tbody></table></div>
      {!visibleDocuments.length && <div className="clean-empty clean-empty-table"><span><Icon name="inbox" size={24} /></span><h3>Nenhuma NF-e recebida</h3><p>Somente documentos efetivamente importados do Ambiente Nacional aparecerão aqui.</p></div>}
      <div className="fiscal-note"><Icon name="shield" size={16} /><span>A lista apresenta somente registros persistidos na empresa.</span></div>
    </article>

    {selected && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeModal()}><section className="quick-modal manifest-modal" role="dialog" aria-modal="true" aria-labelledby="manifest-title">
      <div className="modal-heading"><div><span>NF-e recebida · evento fiscal</span><h2 id="manifest-title">Manifestar documento</h2></div><button onClick={closeModal} aria-label="Fechar"><Icon name="close" /></button></div>
      {!saved ? <form onSubmit={submitDraft} className="manifest-form">
        <div className="manifest-document"><span className="doc-model">NF-e</span><div><strong>{selected.issuerName}</strong><code>{selected.accessKey}</code></div><b>{currency.format(selected.totalCents / 100)}</b></div>
        <div className="manifest-warning"><Icon name="shield" size={17} /><span>Esta versão cria somente um rascunho auditável. A transmissão ficará bloqueada até certificado, ambiente e credenciais oficiais serem homologados.</span></div>
        <fieldset className="manifest-event-options"><legend>Selecione o evento</legend>{manifestEvents.map((option) => <button type="button" key={option.id} className={eventId === option.id ? "selected" : ""} onClick={() => { setEventId(option.id); setError(""); }} aria-pressed={eventId === option.id}><span><b>{option.title}</b><small>{option.description}</small></span><code>{option.code}</code></button>)}</fieldset>
        {eventId === "operation_not_performed" && <label className="manifest-justification"><span>Justificativa *</span><textarea value={justification} onChange={(event) => setJustification(event.target.value)} minLength={15} maxLength={255} placeholder="Explique por que a operação não foi realizada (15 a 255 caracteres)." /><small>{justification.length}/255 caracteres</small></label>}
        {error && <p className="form-error">{error}</p>}
        <footer className="form-actions"><button type="button" className="outline-button" onClick={closeModal}>Cancelar</button><button type="submit" className="primary-button" disabled={!eventId || saving}>{saving ? "Salvando..." : "Salvar rascunho"}</button></footer>
      </form> : <div className="saved-state"><span><Icon name="shield" size={28} /></span><h3>Rascunho fiscal salvo</h3><p>O evento {manifestEvents.find((option) => option.id === eventId)?.title} foi preparado com idempotência e trilha de auditoria. Nenhuma transmissão ocorreu.</p><button className="primary-button" onClick={closeModal}>Concluir</button></div>}
    </section></div>}
  </div>;
}

type IntegrationConnectorId = "nfse_national" | "nfe_sefaz" | "nfe_distribution" | "cte_received" | "mdfe_received" | "banrisul" | "btg" | "certificate_partner";
type IntegrationConnector = {
  id: IntegrationConnectorId;
  logo: string;
  kind: string;
  title: string;
  owner: string;
  category: "fiscal" | "bank" | "certificate";
  description: string;
  requirements: string[];
  href: string;
  primaryLabel: string;
  secondaryLabel: string;
};
type IntegrationConnection = {
  id: string;
  connector: string;
  environment: string;
  status: string;
  credentialReference: string;
  configuration: Record<string, string | number | boolean>;
  lastHealthCheckAt?: string | null;
  lastError?: string | null;
  updatedAt: string;
};
type IntegrationForm = {
  environment: "homologation" | "production";
  credentialReference: string;
  primaryReference: string;
  secondaryReference: string;
  webhookUrl: string;
  notes: string;
};

const connectorData: IntegrationConnector[] = [
  { id: "nfse_national", logo: "N", kind: "nfse", title: "NFS-e Padrão Nacional", owner: "SE/CGNFS-e", category: "fiscal", description: "DPS, consulta, eventos e DANFSe pelo ambiente nacional compatível com o município configurado.", requirements: ["Certificado A1", "Inscrição municipal", "Homologação"], href: "https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual", primaryLabel: "CNPJ do estabelecimento", secondaryLabel: "Inscrição municipal" },
  { id: "nfe_sefaz", logo: "S", kind: "sefaz", title: "NF-e / NFC-e", owner: "Portal Nacional da NF-e", category: "fiscal", description: "Autorização, consulta, eventos, inutilização, distribuição e contingência por autorizador.", requirements: ["Certificado A1", "IE ativa", "Credenciamento SEFAZ"], href: "https://www.nfe.fazenda.gov.br/portal/webservices.aspx", primaryLabel: "CNPJ do estabelecimento", secondaryLabel: "Inscrição estadual" },
  { id: "nfe_distribution", logo: "DF", kind: "sefaz", title: "Distribuição e Manifestação NF-e", owner: "Ambiente Nacional da NF-e", category: "fiscal", description: "Busca incremental por NSU, guarda do XML e os quatro eventos oficiais da Manifestação do Destinatário.", requirements: ["Certificado A1", "CNPJ destinatário", "Controle de NSU"], href: "https://www.nfe.fazenda.gov.br/portal/WebServices.aspx/manifestacaoDestinatario.aspx?tipoConteudo=o9MkXc%2BhmKs%3D", primaryLabel: "CNPJ destinatário", secondaryLabel: "Último NSU conhecido" },
  { id: "cte_received", logo: "57", kind: "cte", title: "CT-e recebido", owner: "Portal Nacional do CT-e", category: "fiscal", description: "Importação, consulta, armazenamento e vínculo financeiro do CT-e modelo 57 recebido; sem emissão pela Seven TI.", requirements: ["Certificado A1", "CNPJ interessado", "Controle de NSU"], href: "https://www.cte.fazenda.gov.br/portal/", primaryLabel: "CNPJ interessado", secondaryLabel: "Último NSU conhecido" },
  { id: "mdfe_received", logo: "58", kind: "mdfe", title: "MDF-e recebido", owner: "Portal Nacional do MDF-e", category: "fiscal", description: "Importação e guarda do MDF-e modelo 58 recebido; sem autorização, encerramento ou emissão pelo ERP.", requirements: ["Certificado A1", "CNPJ interessado", "Controle de NSU"], href: "https://dfe-portal.svrs.rs.gov.br/Mdfe", primaryLabel: "CNPJ interessado", secondaryLabel: "Último NSU conhecido" },
  { id: "banrisul", logo: "BR", kind: "bank", title: "Banrisul Cobrança + Pix", owner: "Banrisul Developers", category: "bank", description: "Registro e consulta de boletos, boleto híbrido com QR Pix, baixas e conciliação por APIs oficiais.", requirements: ["Conta Banrisul", "Convênio cobrança", "Credenciais sandbox"], href: "https://developers.banrisul.com.br/BPI/link/api-cobranca-titulos.html", primaryLabel: "Conta de cobrança (referência)", secondaryLabel: "Convênio / aplicação" },
  { id: "btg", logo: "BT", kind: "btg", title: "BTG Empresas", owner: "BTG Pactual Developers", category: "bank", description: "Boletos individuais ou em lote, Pix QR Code, consultas e webhooks usando as APIs oficiais do BTG Empresas.", requirements: ["Conta BTG", "Aplicação verificada", "Credenciais e webhook"], href: "https://empresas.btgpactual.com/developers", primaryLabel: "Conta de cobrança (referência)", secondaryLabel: "Aplicação / convênio" },
  { id: "certificate_partner", logo: "CD", kind: "pki", title: "Certificados digitais", owner: "ICP-Brasil / parceiro AR", category: "certificate", description: "Pedidos, agenda, validação, emissão, renovação e comissão; integração depende da API do parceiro.", requirements: ["Acesso de parceiro", "Documentação da API", "Credenciais de homologação"], href: "https://www.gov.br/iti/pt-br/assuntos/icp-brasil", primaryLabel: "Código da AR / parceiro", secondaryLabel: "Contrato / canal" },
];

const emptyIntegrationForm: IntegrationForm = { environment: "homologation", credentialReference: "", primaryReference: "", secondaryReference: "", webhookUrl: "", notes: "" };

function integrationStatus(status?: string) {
  if (status === "active") return { label: "Ativa", tone: "green" as const };
  if (status === "ready_for_activation") return { label: "Pronta para homologar", tone: "green" as const };
  if (status === "configuration_saved") return { label: "Configuração salva", tone: "blue" as const };
  if (status === "configuration_pending") return { label: "Credencial pendente", tone: "amber" as const };
  if (status === "validation_failed") return { label: "Revisar configuração", tone: "amber" as const };
  return { label: "Não configurado", tone: "gray" as const };
}

type SyncDevice = { id: string; name: string; platform: string; appVersion?: string | null; status: string; lastSeenAt?: string | null; lastSyncCursor: number; createdAt: string };

function DevicesModule() {
  const [devices, setDevices] = useState<SyncDevice[]>([]);
  const [pairing, setPairing] = useState<{ code: string; expiresAt: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDevices = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/sync/pairing");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível consultar os dispositivos.");
      setDevices(data.devices || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível consultar os dispositivos.");
    } finally { setLoading(false); }
  };

  useEffect(() => {
    let active = true;
    fetch("/api/sync/pairing").then((response) => response.json().then((data) => ({ response, data }))).then(({ response, data }) => {
      if (!active) return;
      if (!response.ok) throw new Error(data.error || "Não foi possível consultar os dispositivos.");
      setDevices(data.devices || []);
    }).catch((caught) => active && setError(caught instanceof Error ? caught.message : "Falha ao carregar dispositivos.")).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const generateCode = async () => {
    setError("");
    try {
      const response = await fetch("/api/sync/pairing", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível gerar o código.");
      setPairing(data);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível gerar o código."); }
  };

  const revoke = async (deviceId: string) => {
    if (!window.confirm("Revogar o acesso deste computador? Os dados locais permanecerão nele, mas não poderão mais sincronizar.")) return;
    const response = await fetch("/api/sync/pairing", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ deviceId }) });
    const data = await response.json();
    if (!response.ok) return setError(data.error || "Não foi possível revogar o dispositivo.");
    await loadDevices();
  };

  const activeDevices = devices.filter((device) => device.status === "active");
  return <div className="module-view devices-workspace">
    <div className="page-heading module-heading"><div><span className="eyebrow">Nuvem Seven · multi-dispositivo</span><h1>Dispositivos e sincronização</h1><p>Conecte computadores Windows e macOS à mesma empresa, com fila offline e sincronização automática.</p></div><button className="primary-button" onClick={generateCode}><Icon name="plus" />Autorizar computador</button></div>
    <section className="sync-architecture"><article><span><Icon name="monitor" /></span><div><strong>Trabalho local</strong><small>Cache criptografado e operações disponíveis mesmo sem internet.</small></div></article><i><Icon name="repeat" /></i><article><span><Icon name="shield" /></span><div><strong>API segura Seven</strong><small>Token individual, idempotência, auditoria e isolamento por empresa.</small></div></article><i><Icon name="repeat" /></i><article><span><Icon name="building" /></span><div><strong>Todos sincronizados</strong><small>Alterações chegam aos demais computadores quando eles estiverem online.</small></div></article></section>
    <section className="module-summary"><article><span>Dispositivos ativos</span><strong>{activeDevices.length}</strong><small>Computadores autorizados</small></article><article><span>Última sincronização</span><strong>{activeDevices[0]?.lastSeenAt ? new Date(activeDevices[0].lastSeenAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—"}</strong><small>Conexão mais recente</small></article><article><span>Operações offline</span><strong>0</strong><small>Fila central processada</small></article><article><span>API</span><strong>v1</strong><small>Sincronização incremental</small></article></section>
    {error && <p className="form-error sync-error">{error}</p>}
    <article className="panel devices-panel"><div className="panel-heading"><div><span>Computadores da empresa</span><h2>Dispositivos autorizados</h2></div><button className="outline-button" onClick={loadDevices}>Atualizar</button></div>{loading ? <div className="manifest-empty">Carregando dispositivos...</div> : devices.length ? <div className="device-list">{devices.map((device) => <article key={device.id}><span className={`device-icon ${device.status}`}><Icon name="monitor" /></span><div><strong>{device.name}</strong><small>{device.platform} · Seven ERP {device.appVersion || "1.0"}</small></div><p><Status tone={device.status === "active" ? "green" : "gray"}>{device.status === "active" ? "Autorizado" : "Revogado"}</Status><small>{device.lastSeenAt ? `Visto ${new Date(device.lastSeenAt).toLocaleString("pt-BR")}` : "Ainda não conectado"}</small></p>{device.status === "active" && <button onClick={() => revoke(device.id)}>Revogar</button>}</article>)}</div> : <div className="nfe-empty"><span><Icon name="monitor" size={28} /></span><h3>Nenhum computador pareado</h3><p>Gere um código e informe-o no instalador do Seven ERP. O código expira em 15 minutos e funciona uma única vez.</p><button className="primary-button" onClick={generateCode}>Gerar código de pareamento</button></div>}</article>
    {pairing && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setPairing(null)}><section className="quick-modal pairing-modal" role="dialog" aria-modal="true"><div className="modal-heading"><div><span>Autorização de dispositivo</span><h2>Conectar novo computador</h2></div><button onClick={() => setPairing(null)} aria-label="Fechar"><Icon name="close" /></button></div><div className="pairing-content"><span><Icon name="shield" size={26} /></span><h3>Digite este código no aplicativo</h3><strong>{pairing.code.match(/.{1,4}/g)?.join(" – ")}</strong><p>Válido até {new Date(pairing.expiresAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}. Não envie o código por canais públicos.</p><button className="outline-button" onClick={() => navigator.clipboard.writeText(pairing.code)}>Copiar código</button></div></section></div>}
  </div>;
}

function IntegrationsModule() {
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [selected, setSelected] = useState<IntegrationConnector | null>(null);
  const [form, setForm] = useState<IntegrationForm>(emptyIntegrationForm);
  const [policiesOpen, setPoliciesOpen] = useState(false);
  const [policies, setPolicies] = useState({ timeoutSeconds: 30, maxRetries: 3, syncIntervalMinutes: 15, requireManualApproval: true, allowProduction: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadConnections = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/integrations");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível consultar as integrações.");
      setConnections(data.connections || []);
      const savedPolicies = (data.connections || []).find((connection: IntegrationConnection) => connection.connector === "system_policies")?.configuration || {};
      setPolicies((current) => ({
        timeoutSeconds: Number(savedPolicies.timeoutSeconds) || current.timeoutSeconds,
        maxRetries: Number(savedPolicies.maxRetries) || current.maxRetries,
        syncIntervalMinutes: Number(savedPolicies.syncIntervalMinutes) || current.syncIntervalMinutes,
        requireManualApproval: typeof savedPolicies.requireManualApproval === "boolean" ? savedPolicies.requireManualApproval : current.requireManualApproval,
        allowProduction: typeof savedPolicies.allowProduction === "boolean" ? savedPolicies.allowProduction : current.allowProduction,
      }));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível consultar as integrações.");
    } finally { setLoading(false); }
  };

  useEffect(() => {
    let active = true;
    fetch("/api/integrations").then((response) => response.json().then((data) => ({ response, data }))).then(({ response, data }) => {
      if (!response.ok) throw new Error(data.error || "Não foi possível consultar as integrações.");
      if (!active) return;
      setConnections(data.connections || []);
      const savedPolicies = (data.connections || []).find((connection: IntegrationConnection) => connection.connector === "system_policies")?.configuration || {};
      setPolicies((current) => ({
        timeoutSeconds: Number(savedPolicies.timeoutSeconds) || current.timeoutSeconds,
        maxRetries: Number(savedPolicies.maxRetries) || current.maxRetries,
        syncIntervalMinutes: Number(savedPolicies.syncIntervalMinutes) || current.syncIntervalMinutes,
        requireManualApproval: typeof savedPolicies.requireManualApproval === "boolean" ? savedPolicies.requireManualApproval : current.requireManualApproval,
        allowProduction: typeof savedPolicies.allowProduction === "boolean" ? savedPolicies.allowProduction : current.allowProduction,
      }));
    }).catch((caught) => active && setError(caught instanceof Error ? caught.message : "Não foi possível consultar as integrações.")).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const connectionFor = (connectorId: string) => connections.find((connection) => connection.connector === connectorId);
  const openConfiguration = (connector: IntegrationConnector) => {
    const connection = connectionFor(connector.id);
    const configuration = connection?.configuration || {};
    setSelected(connector);
    setForm({
      environment: connection?.environment === "production" ? "production" : "homologation",
      credentialReference: connection?.credentialReference || "",
      primaryReference: String(configuration.primaryReference || ""),
      secondaryReference: String(configuration.secondaryReference || ""),
      webhookUrl: String(configuration.webhookUrl || ""),
      notes: String(configuration.notes || ""),
    });
    setError(""); setNotice("");
  };
  const closeIntegrationModal = () => { setSelected(null); setPoliciesOpen(false); setError(""); setNotice(""); };

  const saveConnection = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/integrations", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "save", connector: selected.id, environment: form.environment, credentialReference: form.credentialReference, configuration: { primaryReference: form.primaryReference, secondaryReference: form.secondaryReference, webhookUrl: form.webhookUrl, notes: form.notes } }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar a configuração.");
      await loadConnections();
      setNotice("Configuração salva. Agora você pode verificar as pendências do conector.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível salvar a configuração."); }
    finally { setSaving(false); }
  };

  const validateConnection = async () => {
    if (!selected) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const connection = connectionFor(selected.id);
      if (!connection) throw new Error("Salve a configuração antes de verificá-la.");
      const response = await fetch("/api/integrations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "validate", connector: selected.id, environment: connection.environment }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível verificar a configuração.");
      await loadConnections();
      setNotice(data.lastError || "Configuração local validada. A conexão oficial poderá ser homologada com as credenciais do provedor.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível verificar a configuração."); }
    finally { setSaving(false); }
  };

  const removeConnection = async () => {
    if (!selected) return;
    const connection = connectionFor(selected.id);
    if (!connection || !window.confirm(`Remover a configuração de ${selected.title}?`)) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/integrations", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ connector: selected.id, environment: connection.environment }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível remover a configuração.");
      await loadConnections(); closeIntegrationModal();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível remover a configuração."); }
    finally { setSaving(false); }
  };

  const savePolicies = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/integrations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "save", connector: "system_policies", environment: "global", configuration: policies }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar as políticas.");
      await loadConnections(); setNotice("Políticas de conexão salvas para toda a empresa.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível salvar as políticas."); }
    finally { setSaving(false); }
  };

  const operationalConnections = connections.filter((connection) => connection.connector !== "system_policies");
  const activeCount = operationalConnections.filter((connection) => connection.status === "active").length;
  const configuredCount = operationalConnections.length;
  const fiscalEnvironment = operationalConnections.find((connection) => connectorData.find((item) => item.id === connection.connector)?.category === "fiscal")?.environment;
  const lastCheck = operationalConnections.map((connection) => connection.lastHealthCheckAt).filter(Boolean).sort().at(-1);

  return <div className="module-view integrations-workspace">
    <div className="page-heading module-heading"><div><span className="eyebrow">Infraestrutura</span><h1>Integrações oficiais</h1><p>Configure ambientes e referências de credenciais, valide pendências e acompanhe cada conexão.</p></div><button className="outline-button" onClick={() => { setPoliciesOpen(true); setSelected(null); setError(""); setNotice(""); }}><Icon name="settings" />Políticas de conexão</button></div>
    {error && !selected && !policiesOpen && <p className="form-error integration-page-message">{error}</p>}
    <section className="integration-overview"><article><span>Conexões ativas</span><strong>{loading ? "—" : activeCount}</strong><small>{configuredCount ? `${configuredCount} configuração(ões) salva(s)` : "Nenhuma credencial configurada"}</small></article><article><span>Ambiente fiscal</span><strong>{fiscalEnvironment === "production" ? "Produção" : fiscalEnvironment === "homologation" ? "Homologação" : "—"}</strong><small>{fiscalEnvironment ? "Definido pela configuração mais recente" : "Ambiente ainda não selecionado"}</small></article><article><span>Última verificação</span><strong>{lastCheck ? new Date(String(lastCheck)).toLocaleDateString("pt-BR") : "—"}</strong><small>{lastCheck ? new Date(String(lastCheck)).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "Nenhuma verificação executada"}</small></article></section>
    <section className="connector-grid">{connectorData.map((connector) => { const connection = connectionFor(connector.id); const state = integrationStatus(connection?.status); return <article key={connector.id} className={`connector-card ${connection ? "configured" : ""}`}>
      <div className="connector-heading"><span className={`integration-logo ${connector.kind}`}>{connector.logo}</span><div><h2>{connector.title}</h2><p>{connector.owner}</p></div><Status tone={state.tone}>{loading ? "Carregando" : state.label}</Status></div>
      <p className="connector-description">{connector.description}</p>
      <div className="requirements"><span>Para ativar</span><div>{connector.requirements.map((item) => <b key={item}>{item}</b>)}</div></div>
      {connection?.lastError && <p className="connector-error">{connection.lastError}</p>}
      <footer><a href={connector.href} target="_blank" rel="noreferrer">Documentação oficial <Icon name="arrow" size={13} /></a><div className="connector-actions">{connection && <button onClick={() => openConfiguration(connector)}>Revisar</button>}<button className="connector-primary" onClick={() => openConfiguration(connector)}>{connection ? "Configurar" : "Começar"}</button></div></footer>
    </article>; })}</section>
    <div className="security-callout"><Icon name="shield" size={22} /><div><strong>Segredos não ficam gravados em telas ou tabelas do ERP</strong><p>Informe somente o identificador da credencial já armazenada no cofre seguro. Nunca cole certificado, senha, token ou chave privada neste formulário.</p></div></div>

    {selected && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeIntegrationModal()}><section className="quick-modal integration-modal" role="dialog" aria-modal="true" aria-labelledby="integration-title">
      <div className="modal-heading"><div><span>Configuração do conector</span><h2 id="integration-title">{selected.title}</h2></div><button onClick={closeIntegrationModal} aria-label="Fechar"><Icon name="close" /></button></div>
      <form className="integration-form" onSubmit={saveConnection}>
        <div className="integration-form-alert"><Icon name="shield" size={18} /><div><strong>Configuração segura</strong><span>Cadastre referências e parâmetros operacionais. Segredos devem permanecer no cofre de credenciais.</span></div></div>
        <div className="form-grid">
          <label><span>Ambiente</span><select value={form.environment} onChange={(event) => setForm((current) => ({ ...current, environment: event.target.value as IntegrationForm["environment"] }))}><option value="homologation">Homologação</option><option value="production" disabled={!policies.allowProduction}>Produção {policies.allowProduction ? "" : "(bloqueada pela política)"}</option></select></label>
          <label><span>Identificador da credencial no cofre</span><input value={form.credentialReference} onChange={(event) => setForm((current) => ({ ...current, credentialReference: event.target.value }))} placeholder="Informe somente a referência segura" maxLength={200} /></label>
          <label><span>{selected.primaryLabel}</span><input value={form.primaryReference} onChange={(event) => setForm((current) => ({ ...current, primaryReference: event.target.value }))} placeholder="Informe o cadastro oficial" maxLength={160} /></label>
          <label><span>{selected.secondaryLabel}</span><input value={form.secondaryReference} onChange={(event) => setForm((current) => ({ ...current, secondaryReference: event.target.value }))} placeholder="Informe a referência operacional" maxLength={160} /></label>
          <label className="wide"><span>URL do webhook</span><input type="url" value={form.webhookUrl} onChange={(event) => setForm((current) => ({ ...current, webhookUrl: event.target.value }))} placeholder="Informe a URL HTTPS, quando exigida" maxLength={500} /></label>
          <label className="wide integration-notes"><span>Observações internas</span><textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Registre orientações de homologação ou responsáveis" maxLength={1000} /></label>
        </div>
        {notice && <p className="form-success">{notice}</p>}{error && <p className="form-error">{error}</p>}
        <footer className="form-actions integration-form-actions">{connectionFor(selected.id) ? <button type="button" className="danger-button" disabled={saving} onClick={removeConnection}>Remover configuração</button> : <span />}<div><button type="button" className="outline-button" disabled={saving || !connectionFor(selected.id)} onClick={validateConnection}>Verificar configuração</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "Salvando..." : "Salvar configuração"}</button></div></footer>
      </form>
    </section></div>}

    {policiesOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeIntegrationModal()}><section className="quick-modal integration-modal policy-modal" role="dialog" aria-modal="true" aria-labelledby="policy-title">
      <div className="modal-heading"><div><span>Governança e segurança</span><h2 id="policy-title">Políticas de conexão</h2></div><button onClick={closeIntegrationModal} aria-label="Fechar"><Icon name="close" /></button></div>
      <form className="integration-form" onSubmit={savePolicies}>
        <div className="form-grid">
          <label><span>Tempo limite (segundos)</span><input type="number" min="5" max="120" value={policies.timeoutSeconds} onChange={(event) => setPolicies((current) => ({ ...current, timeoutSeconds: Number(event.target.value) }))} /></label>
          <label><span>Tentativas automáticas</span><input type="number" min="0" max="10" value={policies.maxRetries} onChange={(event) => setPolicies((current) => ({ ...current, maxRetries: Number(event.target.value) }))} /></label>
          <label><span>Intervalo de sincronização (minutos)</span><input type="number" min="5" max="1440" value={policies.syncIntervalMinutes} onChange={(event) => setPolicies((current) => ({ ...current, syncIntervalMinutes: Number(event.target.value) }))} /></label>
          <label className="policy-toggle"><input type="checkbox" checked={policies.requireManualApproval} onChange={(event) => setPolicies((current) => ({ ...current, requireManualApproval: event.target.checked }))} /><span><b>Exigir aprovação manual</b><small>Bloqueia ativação automática após a homologação.</small></span></label>
          <label className="policy-toggle wide"><input type="checkbox" checked={policies.allowProduction} onChange={(event) => setPolicies((current) => ({ ...current, allowProduction: event.target.checked }))} /><span><b>Permitir seleção do ambiente de produção</b><small>A ativação continua dependente das credenciais e da homologação oficial.</small></span></label>
        </div>
        {notice && <p className="form-success">{notice}</p>}{error && <p className="form-error">{error}</p>}
        <footer className="form-actions"><button type="button" className="outline-button" onClick={closeIntegrationModal}>Cancelar</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "Salvando..." : "Salvar políticas"}</button></footer>
      </form>
    </section></div>}
  </div>;
}

type CustomerRow = { id: string; legalName: string; tradeName?: string | null; taxId?: string | null; email?: string | null; city?: string | null; state?: string | null; status: string };

function CustomersModule({ openQuick }: { openQuick: () => void }) {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    fetch("/api/customers").then((response) => response.json().then((payload) => ({ response, payload }))).then(({ response, payload }) => {
      if (!response.ok) throw new Error(payload.error || "Não foi possível consultar os clientes.");
      if (active) setCustomers(payload.customers || []);
    }).catch((caught) => active && setError(caught instanceof Error ? caught.message : "Não foi possível consultar os clientes.")).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  return <div className="module-view customers-workspace">
    <div className="page-heading module-heading"><div><span className="eyebrow">Relacionamento</span><h1>Clientes e contatos</h1><p>Cadastro fiscal preparado para pessoas, empresas e órgãos públicos.</p></div><button className="primary-button" onClick={openQuick}><Icon name="plus" />Novo cliente</button></div>
    <div className="data-mode"><Status tone="green">Base persistente</Status><span>Somente clientes cadastrados pela empresa são exibidos. CNPJ é armazenado como texto para aceitar o formato alfanumérico.</span></div>
    {error && <p className="form-error">{error}</p>}
    <div className="module-toolbar"><div className="module-search"><Icon name="search" /><span>Pesquisar nome, CNPJ/CPF, e-mail ou cidade...</span></div><button>Segmentos</button><button>Exportar</button></div>
    <article className="panel customers-panel"><div className="panel-heading"><div><span>Cadastros</span><h2>{loading ? "Carregando clientes..." : `${customers.length} cliente(s)`}</h2></div><button>Personalizar colunas</button></div><div className="table-wrap"><table className="records-table"><thead><tr><th>Cliente</th><th>CPF / CNPJ</th><th>Contato</th><th>Cidade</th><th>Status</th><th /></tr></thead><tbody>{customers.map((customer) => <tr key={customer.id}><td><div className="customer-name"><span>{customer.legalName.slice(0,2).toUpperCase()}</span><p><strong>{customer.tradeName || customer.legalName}</strong><small>{customer.legalName}</small></p></div></td><td>{customer.taxId || "Não informado"}</td><td>{customer.email || "Não informado"}</td><td>{[customer.city,customer.state].filter(Boolean).join(" / ") || "Não informado"}</td><td><Status tone="green">Ativo</Status></td><td><button className="row-action">Abrir <Icon name="arrow" size={13} /></button></td></tr>)}</tbody></table></div>{!loading && !customers.length && <div className="clean-empty clean-empty-table"><span><Icon name="users" size={24} /></span><h3>Nenhum cliente cadastrado</h3><p>Cadastre o primeiro cliente para iniciar a operação.</p><button className="primary-button" onClick={openQuick}>Cadastrar cliente</button></div>}</article>
  </div>;
}

function ModulePlaceholder({ active, copy, openQuick }: { active: string; copy?: { eyebrow: string; title: string; description: string }; openQuick: () => void }) {
  const data = copy ?? { eyebrow: "Configuração", title: "Integrações e ajustes", description: "Credenciais, ambientes, certificados, bancos e automações do Seven ERP." };
  const capabilities = moduleCapabilities[active] || ["Cadastros estruturados", "Filtros avançados", "Permissões por perfil", "Trilha de auditoria"];
  return <div className="module-view">
    <div className="page-heading module-heading"><div><span className="eyebrow">{data.eyebrow}</span><h1>{data.title}</h1><p>{data.description}</p></div><button className="primary-button" onClick={openQuick}><Icon name="plus" />Novo registro</button></div>
    <div className="module-toolbar"><div className="module-search"><Icon name="search" /><span>Pesquisar em {data.title.toLowerCase()}...</span></div><button>Filtros</button><button>Exportar</button></div>
    <section className="module-summary"><article><span>Total de registros</span><strong>0</strong><small>Nenhum cadastro</small></article><article><span>Pendências</span><strong>0</strong><small>Nenhuma pendência</small></article><article><span>Concluídos no mês</span><strong>0</strong><small>Sem movimentação</small></article><article><span>Valor movimentado</span><strong>{currency.format(0)}</strong><small>Sem movimentação</small></article></section>
    <article className="panel module-panel"><div className="panel-heading"><div><span>Escopo operacional</span><h2>Recursos do módulo</h2></div><button className="outline-button">Configurar fluxo</button></div><div className="capability-grid">{capabilities.map((capability, index) => <article key={capability}><span><Icon name={index === 0 ? "file" : index === 1 ? "repeat" : index === 2 ? "shield" : "chart"} size={19} /></span><div><strong>{capability}</strong><small>Disponível após a configuração operacional do módulo.</small></div><b>Sem registros</b></article>)}</div><div className="empty-state compact"><h3>Nenhum registro cadastrado</h3><p>Este módulo está limpo e receberá apenas informações inseridas ou importadas pela empresa.</p><button className="primary-button" onClick={openQuick}><Icon name="plus" />Criar primeiro registro</button></div></article>
  </div>;
}

function QuickCreate({ onClose, onNavigate }: { onClose: () => void; onNavigate: (id: string) => void }) {
  const [mode, setMode] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedName, setSavedName] = useState("");
  const options = [
    { id: "quote", icon: "briefcase", title: "Orçamento", text: "Proposta comercial com produtos e serviços" },
    { id: "service", icon: "tool", title: "Ordem de serviço", text: "Atendimento técnico e equipamentos" },
    { id: "customer", icon: "users", title: "Cliente", text: "Pessoa física, jurídica ou órgão público" },
    { id: "nfe", icon: "invoice", title: "NF-e", text: "Criar rascunho, itens, impostos e validação fiscal" },
    { id: "billing", icon: "barcode", title: "Cobrança", text: "Boleto, carnê, Pix ou recorrência" },
    { id: "certificate", icon: "shield", title: "Certificado digital", text: "Novo pedido ICP-Brasil" },
  ];

  const submitCustomer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true); setError("");
    const form = new FormData(event.currentTarget);
    const legalName = String(form.get("legalName") || "");
    try {
      const response = await fetch("/api/customers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(form.entries())) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar o cliente");
      setSavedName(legalName);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar o cliente");
    } finally { setSaving(false); }
  };

  const selected = options.find((option) => option.id === mode);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className={`quick-modal ${mode ? "quick-modal-form" : ""}`} role="dialog" aria-modal="true" aria-labelledby="quick-title">
    <div className="modal-heading"><div><span>{mode ? "Novo registro" : "Criação rápida"}</span><h2 id="quick-title">{mode === "customer" ? "Cadastrar cliente" : selected ? selected.title : "O que você quer criar?"}</h2></div><button onClick={onClose} aria-label="Fechar"><Icon name="close" /></button></div>

    {!mode && <div className="modal-options">{options.map((option) => <button key={option.id} onClick={() => setMode(option.id)}><span><Icon name={option.icon} /></span><p><strong>{option.title}</strong><small>{option.text}</small></p><Icon name="arrow" size={16} /></button>)}</div>}

    {mode === "customer" && !savedName && <form className="customer-form" onSubmit={submitCustomer}>
      <div className="form-intro"><span><Icon name="users" /></span><p><strong>Dados principais</strong><small>Os demais dados fiscais e endereços podem ser complementados depois.</small></p></div>
      <div className="form-grid">
        <label><span>Tipo de pessoa</span><select name="personType"><option value="legal">Pessoa jurídica</option><option value="individual">Pessoa física</option></select></label>
        <label className="wide"><span>Razão social ou nome *</span><input name="legalName" required placeholder="Digite o nome completo" /></label>
        <label><span>Nome fantasia</span><input name="tradeName" placeholder="Como prefere identificar" /></label>
        <label><span>CPF / CNPJ</span><input name="taxId" placeholder="Aceita formato alfanumérico" /></label>
        <label><span>E-mail</span><input name="email" type="email" placeholder="Digite o e-mail" /></label>
        <label><span>Telefone</span><input name="phone" placeholder="Digite o telefone" /></label>
        <label><span>Cidade</span><input name="city" placeholder="Digite a cidade" /></label>
        <label><span>UF</span><select name="state" defaultValue="RS"><option>RS</option><option>SC</option><option>PR</option><option>SP</option><option>RJ</option></select></label>
      </div>
      {error && <p className="form-error">{error}</p>}
      <footer className="form-actions"><button type="button" className="outline-button" onClick={() => setMode(null)}>Voltar</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "Salvando..." : "Salvar cliente"}</button></footer>
    </form>}

    {mode === "customer" && savedName && <div className="saved-state"><span><Icon name="shield" size={28} /></span><h3>Cliente salvo com sucesso</h3><p>{savedName} já está disponível na base do Seven ERP.</p><button className="primary-button" onClick={onClose}>Concluir</button></div>}

    {mode && mode !== "customer" && <div className="protected-flow"><span><Icon name={selected?.icon || "file"} size={26} /></span><h3>{mode === "nfe" ? "Editor de NF-e disponível" : "Fluxo preparado para homologação"}</h3><p>{selected?.text}. {mode === "nfe" ? "O editor salva rascunhos reais e bloqueia a transmissão até a configuração oficial." : "Esta operação será ativada após os cadastros, permissões e credenciais oficiais serem configurados."}</p><ul><li><Icon name="shield" size={15} />Validação de permissões</li><li><Icon name="shield" size={15} />Numeração e idempotência</li><li><Icon name="shield" size={15} />Auditoria completa da operação</li></ul><div><button className="outline-button" onClick={() => setMode(null)}>Voltar</button><button className="primary-button" onClick={() => { if (mode === "nfe") onNavigate("nfe"); onClose(); }}>{mode === "nfe" ? "Abrir emissão" : "Entendi"}</button></div></div>}
  </section></div>;
}
