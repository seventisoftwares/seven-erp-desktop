"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

type Connection = {
  id: string; connector: string; environment: string; status: string; credentialReference?: string | null;
  configuration?: Record<string, string | number | boolean>; lastHealthCheckAt?: string | null; lastError?: string | null; updatedAt?: string | null;
};
type Definition = {
  id: string; group: "Fiscal" | "Bancos e cobrança" | "Certificados"; title: string; provider: string; description: string;
  externalUse: string; credentialLabel: string; primaryLabel: string; secondaryLabel: string; requirements: string[]; docs: string;
};

const definitions: Definition[] = [
  { id: "nfe_sefaz", group: "Fiscal", title: "NF-e / NFC-e", provider: "SEFAZ / Portal Nacional", description: "Autorização, consulta, eventos, inutilização e contingência dos documentos modelos 55 e 65.", externalUse: "Somente para transmitir e consultar documentos fiscais na SEFAZ. Rascunhos, cadastros, vendas e OS funcionam sem esta integração.", credentialLabel: "Referência do certificado A1 / credencial", primaryLabel: "CNPJ do estabelecimento", secondaryLabel: "Inscrição Estadual", requirements: ["Certificado A1", "IE ativa", "Credenciamento no autorizador"], docs: "https://www.nfe.fazenda.gov.br/portal/webservices.aspx" },
  { id: "nfse_national", group: "Fiscal", title: "NFS-e Padrão Nacional", provider: "SE/CGNFS-e", description: "DPS, emissão, consulta, eventos e DANFSe para municípios aderentes ao padrão nacional.", externalUse: "Necessária apenas para transmitir NFS-e. Ordens de serviço podem ser abertas, fechadas e cobradas internamente sem NFS-e configurada.", credentialLabel: "Referência do certificado / segredo", primaryLabel: "CNPJ do prestador", secondaryLabel: "Inscrição Municipal", requirements: ["Certificado A1", "Inscrição municipal", "Município compatível"], docs: "https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual" },
  { id: "nfe_distribution", group: "Fiscal", title: "Distribuição e Manifestação NF-e", provider: "Ambiente Nacional NF-e", description: "Consulta por NSU, download de XML e eventos do destinatário.", externalUse: "Opcional. Usada somente para buscar documentos recebidos e registrar manifestações.", credentialLabel: "Referência do certificado A1", primaryLabel: "CNPJ destinatário", secondaryLabel: "Último NSU (opcional)", requirements: ["Certificado A1", "CNPJ destinatário"], docs: "https://www.nfe.fazenda.gov.br/portal/" },
  { id: "cte_received", group: "Fiscal", title: "CT-e recebido", provider: "Portal Nacional CT-e", description: "Importação e armazenamento de CT-e recebidos para conferência e vínculo financeiro.", externalUse: "Opcional. Não interfere em compras, estoque, OS ou financeiro manual.", credentialLabel: "Referência do certificado A1", primaryLabel: "CNPJ interessado", secondaryLabel: "Último NSU (opcional)", requirements: ["Certificado A1", "CNPJ interessado"], docs: "https://www.cte.fazenda.gov.br/portal/" },
  { id: "mdfe_received", group: "Fiscal", title: "MDF-e recebido", provider: "Portal MDF-e / SVRS", description: "Importação e guarda de MDF-e recebidos, sem emissão pelo ERP.", externalUse: "Opcional. Serve apenas para consulta/importação de documentos externos.", credentialLabel: "Referência do certificado A1", primaryLabel: "CNPJ interessado", secondaryLabel: "Último NSU (opcional)", requirements: ["Certificado A1", "CNPJ interessado"], docs: "https://dfe-portal.svrs.rs.gov.br/Mdfe" },
  { id: "banrisul", group: "Bancos e cobrança", title: "Banrisul Cobrança + Pix", provider: "Banrisul Developers", description: "Registro de boletos, Pix, baixa e conciliação por APIs oficiais.", externalUse: "Necessária apenas para registrar cobrança no Banrisul. Contas a receber e lançamentos financeiros continuam disponíveis sem integração.", credentialLabel: "Referência da credencial OAuth / aplicação", primaryLabel: "Conta / beneficiário", secondaryLabel: "Convênio / aplicação", requirements: ["Conta Banrisul", "Convênio de cobrança", "Aplicação API"], docs: "https://developers.banrisul.com.br/" },
  { id: "btg", group: "Bancos e cobrança", title: "BTG Empresas", provider: "BTG Pactual Developers", description: "Boletos, Pix, consultas e webhooks do BTG Empresas.", externalUse: "Necessária somente para enviar cobranças ao BTG. Financeiro manual e recebimentos internos não dependem dela.", credentialLabel: "Referência da credencial da aplicação", primaryLabel: "Conta / beneficiário", secondaryLabel: "Aplicação / convênio", requirements: ["Conta BTG Empresas", "Aplicação aprovada", "Credenciais API"], docs: "https://empresas.btgpactual.com/developers" },
  { id: "certificate_partner", group: "Certificados", title: "Parceiro de certificados digitais", provider: "ICP-Brasil / AR parceira", description: "Pedidos, agenda, validação, emissão, renovação e comissões quando o parceiro disponibilizar API.", externalUse: "Opcional. O ERP pode cadastrar e acompanhar pedidos internamente mesmo sem API do parceiro.", credentialLabel: "Referência da credencial do parceiro", primaryLabel: "Código AR / parceiro", secondaryLabel: "Contrato / canal", requirements: ["Contrato de parceiro", "Documentação da API", "Credenciais"], docs: "https://www.gov.br/iti/pt-br/assuntos/icp-brasil" },
];

const statusMap: Record<string, { label: string; tone: string }> = {
  configuration_saved: { label: "Configuração salva", tone: "saved" },
  configuration_pending: { label: "Configuração incompleta", tone: "pending" },
  ready_for_activation: { label: "Pronta para homologação", tone: "ready" },
  validation_failed: { label: "Pendências", tone: "error" },
  active: { label: "Ativa", tone: "active" },
};

export default function IntegrationsModuleV2({ onClose }: { onClose: () => void }) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [group, setGroup] = useState<"Todos" | Definition["group"]>("Todos");
  const [selected, setSelected] = useState<Definition | null>(null);
  const [form, setForm] = useState({ environment: "homologation", credentialReference: "", primaryReference: "", secondaryReference: "", webhookUrl: "", notes: "" });

  const load = async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/integrations");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível consultar as integrações.");
      setConnections(data.connections || []);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível consultar as integrações."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const visible = useMemo(() => group === "Todos" ? definitions : definitions.filter((item) => item.group === group), [group]);
  const connectionFor = (id: string) => connections.find((item) => item.connector === id);
  const configured = definitions.filter((item) => connectionFor(item.id)).length;
  const ready = definitions.filter((item) => ["ready_for_activation", "active"].includes(connectionFor(item.id)?.status || "")).length;

  const open = (definition: Definition) => {
    const connection = connectionFor(definition.id);
    const config = connection?.configuration || {};
    setSelected(definition); setError(""); setNotice("");
    setForm({
      environment: connection?.environment === "production" ? "production" : "homologation",
      credentialReference: connection?.credentialReference || "",
      primaryReference: String(config.primaryReference || ""), secondaryReference: String(config.secondaryReference || ""),
      webhookUrl: String(config.webhookUrl || ""), notes: String(config.notes || ""),
    });
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!selected) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/integrations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "save", connector: selected.id, environment: form.environment, credentialReference: form.credentialReference, configuration: { primaryReference: form.primaryReference, secondaryReference: form.secondaryReference, webhookUrl: form.webhookUrl, notes: form.notes } }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar a integração.");
      await load(); setNotice("Configuração salva. Ela continua opcional e não bloqueia os módulos internos do ERP.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Falha ao salvar integração."); }
    finally { setSaving(false); }
  };

  const verify = async () => {
    if (!selected) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const current = connectionFor(selected.id);
      if (!current) throw new Error("Salve a configuração antes de verificar.");
      const response = await fetch("/api/integrations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "validate", connector: selected.id, environment: current.environment }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível verificar a configuração.");
      await load();
      setNotice(data.lastError || "Campos obrigatórios conferidos. A homologação externa depende das credenciais e regras do provedor.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Falha na verificação."); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    if (!selected) return;
    const current = connectionFor(selected.id);
    if (!current || !window.confirm(`Remover a configuração de ${selected.title}? O ERP continuará funcionando normalmente.`)) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/integrations", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ connector: selected.id, environment: current.environment }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Não foi possível remover.");
      setSelected(null); await load(); setNotice("Integração removida. Nenhum módulo interno foi desativado.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Falha ao remover integração."); }
    finally { setSaving(false); }
  };

  return <div className="enhanced-module integrations-v2">
    <header className="enhanced-header"><div><span className="enhanced-kicker">Administração · conexões opcionais</span><h1>Central de integrações</h1><p>Conecte o ERP a órgãos fiscais, bancos e parceiros somente quando precisar executar uma ação externa.</p></div><div className="enhanced-actions"><button className="enhanced-secondary" onClick={onClose}>Voltar ao ERP</button><button className="enhanced-secondary" onClick={() => void load()}>Atualizar status</button></div></header>

    <div className="core-independence-banner"><strong>Integrações não bloqueiam o ERP</strong><span>OS, clientes, produtos, estoque, compras, vendas, financeiro manual e rascunhos fiscais funcionam sem nenhuma conexão externa. Integração só é exigida na operação que precisa falar com o provedor.</span></div>
    {error && !selected && <div className="enhanced-alert error">{error}</div>}
    {notice && !selected && <div className="enhanced-alert success">{notice}</div>}

    <section className="enhanced-metrics"><article><span>Disponíveis</span><strong>{definitions.length}</strong><small>Conectores oficiais catalogados</small></article><article><span>Configuradas</span><strong>{loading ? "—" : configured}</strong><small>Sem impacto nos módulos internos</small></article><article><span>Prontas</span><strong>{loading ? "—" : ready}</strong><small>Configuração local conferida</small></article><article><span>Modo do ERP</span><strong>Independente</strong><small>Core não depende de APIs externas</small></article></section>

    <div className="integration-tabs">{(["Todos", "Fiscal", "Bancos e cobrança", "Certificados"] as const).map((item) => <button key={item} className={group === item ? "active" : ""} onClick={() => setGroup(item)}>{item}</button>)}</div>

    <section className="integration-catalog-v2">{visible.map((definition) => { const connection = connectionFor(definition.id); const status = statusMap[connection?.status || ""] || { label: "Não configurada", tone: "off" }; return <article key={definition.id} className="integration-card-v2"><div className="integration-card-top"><span className="integration-provider-mark">{definition.title.split(/\s/).map((part) => part[0]).join("").slice(0, 2)}</span><div><span className="integration-group">{definition.group}</span><h2>{definition.title}</h2><small>{definition.provider}</small></div><b className={`integration-state ${status.tone}`}>{status.label}</b></div><p>{definition.description}</p><div className="integration-use"><strong>Quando é necessária?</strong><span>{definition.externalUse}</span></div><ul>{definition.requirements.map((item) => <li key={item}>✓ {item}</li>)}</ul><footer><span>{connection ? `Ambiente: ${connection.environment === "production" ? "Produção" : "Homologação"}` : "Uso opcional"}</span><button onClick={() => open(definition)}>{connection ? "Gerenciar" : "Configurar"}</button></footer></article>})}</section>

    {selected && <div className="enhanced-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}><form className="enhanced-modal integration-config-v2" onSubmit={save}><div className="enhanced-modal-title"><div><span>{selected.group.toUpperCase()}</span><h2>{selected.title}</h2><p>{selected.provider}</p></div><button type="button" onClick={() => setSelected(null)}>×</button></div><div className="integration-optional-note"><strong>Conector opcional</strong><span>Desconfigurar ou remover esta conexão não impede a emissão de OS nem o uso dos módulos internos.</span></div>{error && <div className="enhanced-alert error">{error}</div>}{notice && <div className="enhanced-alert success">{notice}</div>}<div className="form-grid two"><label><span>Ambiente</span><select value={form.environment} onChange={(event) => setForm({ ...form, environment: event.target.value })}><option value="homologation">Homologação / testes</option><option value="production">Produção</option></select></label><label><span>{selected.credentialLabel}</span><input value={form.credentialReference} onChange={(event) => setForm({ ...form, credentialReference: event.target.value })} placeholder="Ex.: vault://empresa/conector" /></label><label><span>{selected.primaryLabel}</span><input value={form.primaryReference} onChange={(event) => setForm({ ...form, primaryReference: event.target.value })} /></label><label><span>{selected.secondaryLabel}</span><input value={form.secondaryReference} onChange={(event) => setForm({ ...form, secondaryReference: event.target.value })} /></label><label className="full"><span>Webhook / URL de retorno (se aplicável)</span><input value={form.webhookUrl} onChange={(event) => setForm({ ...form, webhookUrl: event.target.value })} placeholder="https://..." /></label><label className="full"><span>Observações técnicas</span><textarea rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label></div><section className="integration-requirements"><div><strong>Pré-requisitos do provedor</strong>{selected.requirements.map((item) => <span key={item}>• {item}</span>)}</div><div><strong>Uso externo</strong><span>{selected.externalUse}</span><a href={selected.docs} target="_blank" rel="noreferrer">Abrir documentação oficial ↗</a></div></section><div className="enhanced-modal-footer"><div>{connectionFor(selected.id) && <button type="button" className="danger-text" onClick={remove} disabled={saving}>Remover configuração</button>}</div><div><button type="button" className="enhanced-secondary" onClick={verify} disabled={saving || !connectionFor(selected.id)}>{saving ? "Verificando..." : "Verificar configuração"}</button><button className="enhanced-primary" disabled={saving}>{saving ? "Salvando..." : "Salvar configuração"}</button></div></div></form></div>}
  </div>;
}
