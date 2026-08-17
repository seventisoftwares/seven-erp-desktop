"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

type Connection = { id: string; connector: string; environment: string; credentialReference?: string | null; configuration?: Record<string, any>; updatedAt?: string };
type Certificate = { id: string; originalName: string; sha256: string; size: number; importedAt: string; validatedLocally: boolean };
type ConnectorId = "nfe_sefaz" | "nfse_national" | "nfe_distribution" | "cte_received" | "mdfe_received" | "banrisul" | "btg" | "certificate_partner";
type Definition = { id: ConnectorId; group: string; title: string; provider: string; description: string; docs: string; credential: "pfx" | "oauth-client" | "btg-oauth" | "partner" };

const definitions: Definition[] = [
  { id: "nfe_sefaz", group: "Fiscal", title: "NF-e / NFC-e", provider: "SEFAZ / Portal Nacional NF-e", description: "Autorização de NF-e modelo 55 e NFC-e modelo 65, eventos, inutilização e consultas.", docs: "https://www.nfe.fazenda.gov.br/portal/", credential: "pfx" },
  { id: "nfse_national", group: "Fiscal", title: "NFS-e Padrão Nacional", provider: "SE/CGNFS-e", description: "DPS, emissão, consulta e eventos no Emissor Público Nacional para municípios compatíveis.", docs: "https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/documentacao-atual", credential: "pfx" },
  { id: "nfe_distribution", group: "Fiscal", title: "Distribuição / Manifestação NF-e", provider: "Ambiente Nacional NF-e", description: "Consulta incremental por NSU, download de DF-e e preparação de eventos do destinatário.", docs: "https://www.nfe.fazenda.gov.br/portal/", credential: "pfx" },
  { id: "cte_received", group: "Fiscal", title: "CT-e recebido", provider: "Portal Nacional CT-e", description: "Distribuição e importação de CT-e recebidos pelo CNPJ da empresa.", docs: "https://www.cte.fazenda.gov.br/portal/", credential: "pfx" },
  { id: "mdfe_received", group: "Fiscal", title: "MDF-e recebido", provider: "Portal MDF-e / SVRS", description: "Consulta e importação de MDF-e recebido. O Seven ERP não emite MDF-e nesta versão.", docs: "https://dfe-portal.svrs.rs.gov.br/Mdfe", credential: "pfx" },
  { id: "banrisul", group: "Bancos e cobrança", title: "Banrisul Cobrança", provider: "Banrisul Developers", description: "OAuth2 Client Credentials, registro/consulta de boletos e convênio de cobrança.", docs: "https://developers.banrisul.com.br/pages/docs/clientes-banrisul/api-cobranca-v1.html", credential: "oauth-client" },
  { id: "btg", group: "Bancos e cobrança", title: "BTG Pactual Empresas", provider: "BTG Developers", description: "Boletos, Pix e APIs bancárias com aplicativo BTG e fluxo OAuth autorizado pela conta PJ.", docs: "https://developers.empresas.btgpactual.com/docs/comecando", credential: "btg-oauth" },
  { id: "certificate_partner", group: "Certificados", title: "Parceiro de certificados digitais", provider: "AR / parceiro ICP-Brasil", description: "Integração parametrizada para pedidos, renovações e comissões conforme API contratada.", docs: "https://www.gov.br/iti/pt-br/assuntos/icp-brasil", credential: "partner" },
];

const emptyForm: Record<string, any> = { environment: "homologation", certificateId: "", cnpj: "", stateRegistration: "", municipalRegistration: "", uf: "RS", cityCode: "", lastNsu: "0", enableNfce: false, cscId: "", cscToken: "", beneficiaryCode: "", oauthUrl: "", apiBaseUrl: "", redirectUri: "", accountId: "", scopes: "", partnerCode: "" };

export default function IntegrationsModuleV3({ onClose }: { onClose: () => void }) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [selected, setSelected] = useState<Definition | null>(null);
  const [form, setForm] = useState<Record<string, any>>(emptyForm);
  const [secretStatus, setSecretStatus] = useState<{ stored: string[] }>({ stored: [] });
  const [clientId, setClientId] = useState(""); const [clientSecret, setClientSecret] = useState("");
  const [pfxPassword, setPfxPassword] = useState("");
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false);
  const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [group, setGroup] = useState("Todos");
  const bridge = (window as any).sevenDesktop;

  const load = async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/integrations"); const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível carregar integrações.");
      setConnections((data.connections || []).filter((item: Connection) => !item.connector.startsWith("__")));
      if (bridge?.certificatesList) setCertificates(await bridge.certificatesList());
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Falha ao carregar integrações."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const visible = useMemo(() => group === "Todos" ? definitions : definitions.filter((item) => item.group === group), [group]);
  const connectionFor = (id: string) => connections.find((item) => item.connector === id);
  const validationFor = (id: string) => connectionFor(id)?.configuration?.validationStatus || "not_configured";

  const open = async (definition: Definition) => {
    const current = connectionFor(definition.id); const config = current?.configuration || {};
    setSelected(definition); setForm({ ...emptyForm, ...config, environment: current?.environment || config.environment || "homologation" });
    setError(""); setNotice(""); setClientId(""); setClientSecret(""); setPfxPassword("");
    if (bridge?.integrationSecretsStatus) setSecretStatus(await bridge.integrationSecretsStatus(definition.id));
  };

  const importCertificate = async () => {
    if (!bridge?.certificateImport) return setError("Importação de certificado disponível somente no aplicativo desktop.");
    setSaving(true); setError("");
    try {
      const result = await bridge.certificateImport({ passphrase: pfxPassword });
      if (result?.canceled) return;
      const cert = result.certificate as Certificate;
      setCertificates((current) => [...current, cert]); setForm((current) => ({ ...current, certificateId: cert.id })); setPfxPassword("");
      setNotice(`Certificado ${cert.originalName} importado e validado no cofre seguro deste computador.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível importar o PFX."); }
    finally { setSaving(false); }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!selected) return; setSaving(true); setError(""); setNotice("");
    try {
      if ((selected.credential === "oauth-client" || selected.credential === "btg-oauth") && (clientId || clientSecret)) {
        const existingFields = secretStatus.stored || [];
        const secrets: Record<string, string> = {};
        if (clientId) secrets.clientId = clientId; else if (existingFields.includes("clientId")) secrets.clientId = "__KEEP__";
        if (clientSecret) secrets.clientSecret = clientSecret; else if (existingFields.includes("clientSecret")) secrets.clientSecret = "__KEEP__";
        if (secrets.clientId === "__KEEP__" || secrets.clientSecret === "__KEEP__") {
          // Não sobrescreve o cofre quando somente um campo novo foi informado.
          if (!clientId || !clientSecret) throw new Error("Para substituir credenciais OAuth, informe Client ID e Client Secret juntos.");
        }
        await bridge.integrationSecretsSet(selected.id, { clientId, clientSecret });
        setSecretStatus(await bridge.integrationSecretsStatus(selected.id));
      }
      const credentialReference = selected.credential === "pfx" ? (form.certificateId || "") : secretStatus.stored?.length ? "secure-os-vault" : (clientId && clientSecret ? "secure-os-vault" : "");
      const response = await fetch("/api/integrations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "save", connector: selected.id, environment: form.environment, credentialReference, configuration: form }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Não foi possível salvar.");
      await load(); setNotice("Configuração salva localmente. Use ‘Testar configuração’ para conferir os requisitos reais deste conector.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Falha ao salvar integração."); }
    finally { setSaving(false); }
  };

  const test = async () => {
    if (!selected || !bridge?.integrationTest) return; setSaving(true); setError(""); setNotice("");
    try {
      const result = await bridge.integrationTest({ connector: selected.id, environment: form.environment, configuration: form });
      const next = { ...form, validationStatus: result.status, validationMessage: result.message, validationBlockers: result.blockers || [], lastValidatedAt: result.checkedAt || new Date().toISOString(), externalRequestPerformed: Boolean(result.externalRequestPerformed) };
      setForm(next);
      const credentialReference = selected.credential === "pfx" ? (form.certificateId || "") : (secretStatus.stored?.length ? "secure-os-vault" : "");
      await fetch("/api/integrations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "save", connector: selected.id, environment: form.environment, credentialReference, configuration: next }) });
      await load();
      if (result.ok) setNotice(result.message || "Configuração validada."); else setError([result.message, ...(result.blockers || [])].filter(Boolean).join(" · "));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Falha ao testar integração."); }
    finally { setSaving(false); }
  };

  const statusLabel = (id: string) => ({ active: "Ativa", certificate_validated: "Certificado validado", authorization_required: "Aguardando autorização", provider_configured: "Configurada", validation_failed: "Com pendências", external_auth_failed: "Falha de autenticação", external_unreachable: "Sem conexão", not_configured: "Não configurada" } as Record<string, string>)[validationFor(id)] || "Configuração salva";

  return <div className="enhanced-module integrations-v3">
    <header className="enhanced-header"><div><span className="enhanced-kicker">Administração · integrações reais</span><h1>Central de integrações</h1><p>Cada conector possui seus próprios requisitos, credenciais e validações. O ERP não marca uma integração como ativa sem conferir o que é possível conferir de verdade.</p></div><div className="enhanced-actions"><button className="enhanced-secondary" onClick={onClose}>Voltar ao ERP</button><button className="enhanced-secondary" onClick={() => void load()}>Atualizar</button></div></header>
    <div className="core-independence-banner"><strong>Core independente</strong><span>OS e rotinas internas funcionam sem estas integrações. PFX e segredos bancários ficam no cofre criptografado do próprio computador.</span></div>
    {error && !selected && <div className="enhanced-alert error">{error}</div>}
    <div className="integration-tabs">{["Todos", "Fiscal", "Bancos e cobrança", "Certificados"].map((item) => <button key={item} className={group === item ? "active" : ""} onClick={() => setGroup(item)}>{item}</button>)}</div>
    <section className="integration-catalog-v2">{visible.map((definition) => <article className="integration-card-v2" key={definition.id}><div className="integration-card-top"><span className="integration-provider-mark">{definition.title.slice(0, 2).toUpperCase()}</span><div><span className="integration-group">{definition.group}</span><h2>{definition.title}</h2><small>{definition.provider}</small></div><b className={`integration-state ${validationFor(definition.id) === "active" ? "active" : validationFor(definition.id) === "validation_failed" ? "error" : connectionFor(definition.id) ? "saved" : "off"}`}>{loading ? "Carregando" : statusLabel(definition.id)}</b></div><p>{definition.description}</p><footer><a href={definition.docs} target="_blank" rel="noreferrer">Documentação oficial</a><button onClick={() => void open(definition)}>{connectionFor(definition.id) ? "Gerenciar" : "Configurar"}</button></footer></article>)}</section>

    {selected && <div className="enhanced-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}><form className="enhanced-modal integration-config-v3" onSubmit={save}><div className="enhanced-modal-title"><div><span>{selected.group.toUpperCase()}</span><h2>{selected.title}</h2><p>{selected.provider}</p></div><button type="button" onClick={() => setSelected(null)}>×</button></div>{error && <div className="enhanced-alert error modal-alert">{error}</div>}{notice && <div className="enhanced-alert success modal-alert">{notice}</div>}
      <div className="form-grid two"><label><span>Ambiente</span><select value={form.environment} onChange={(e) => setForm({ ...form, environment: e.target.value })}><option value="homologation">Homologação / Sandbox</option><option value="production">Produção</option></select></label>
      {selected.credential === "pfx" && <><label><span>Certificado A1 deste computador</span><select value={form.certificateId || ""} onChange={(e) => setForm({ ...form, certificateId: e.target.value })}><option value="">Selecione...</option>{certificates.map((cert) => <option value={cert.id} key={cert.id}>{cert.originalName} · {cert.sha256.slice(0, 10)}</option>)}</select></label><label><span>Senha do novo PFX/P12</span><input type="password" value={pfxPassword} onChange={(e) => setPfxPassword(e.target.value)} placeholder="Somente para importar" /></label><label className="cert-import-action"><span>Importar certificado</span><button type="button" className="enhanced-secondary" onClick={() => void importCertificate()} disabled={saving}>Selecionar .PFX / .P12</button></label></>}
      {selected.credential === "pfx" && <><label><span>CNPJ do estabelecimento</span><input value={form.cnpj || ""} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} placeholder="Se vazio, usa Cadastro da Empresa" /></label></>}
      {selected.id === "nfe_sefaz" && <><label><span>Inscrição Estadual</span><input value={form.stateRegistration || ""} onChange={(e) => setForm({ ...form, stateRegistration: e.target.value })} /></label><label><span>UF</span><input maxLength={2} value={form.uf || "RS"} onChange={(e) => setForm({ ...form, uf: e.target.value.toUpperCase() })} /></label><label className="checkbox-line"><input type="checkbox" checked={Boolean(form.enableNfce)} onChange={(e) => setForm({ ...form, enableNfce: e.target.checked })} /><span>Também emitir NFC-e modelo 65</span></label>{form.enableNfce && <><label><span>ID do CSC</span><input value={form.cscId || ""} onChange={(e) => setForm({ ...form, cscId: e.target.value })} /></label><label><span>CSC / Token NFC-e</span><input type="password" value={form.cscToken || ""} onChange={(e) => setForm({ ...form, cscToken: e.target.value })} /></label></>}</>}
      {selected.id === "nfse_national" && <><label><span>Inscrição Municipal</span><input value={form.municipalRegistration || ""} onChange={(e) => setForm({ ...form, municipalRegistration: e.target.value })} /></label><label><span>Código IBGE do município</span><input value={form.cityCode || ""} onChange={(e) => setForm({ ...form, cityCode: e.target.value })} placeholder="7 dígitos" /></label></>}
      {["nfe_distribution", "cte_received", "mdfe_received"].includes(selected.id) && <label><span>Último NSU</span><input value={form.lastNsu || "0"} onChange={(e) => setForm({ ...form, lastNsu: e.target.value })} /></label>}
      {selected.credential === "oauth-client" && <><label><span>Client ID</span><input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder={secretStatus.stored.includes("clientId") ? "Salvo no cofre seguro" : "Client ID"} /></label><label><span>Client Secret</span><input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder={secretStatus.stored.includes("clientSecret") ? "Salvo no cofre seguro" : "Client Secret"} /></label><label><span>Código de beneficiário / convênio</span><input value={form.beneficiaryCode || ""} onChange={(e) => setForm({ ...form, beneficiaryCode: e.target.value })} /></label><label className="full"><span>Endpoint OAuth2 do ambiente</span><input value={form.oauthUrl || ""} onChange={(e) => setForm({ ...form, oauthUrl: e.target.value })} placeholder="URL fornecida pelo Banrisul para a API contratada" /></label><label className="full"><span>Base URL da API Cobrança</span><input value={form.apiBaseUrl || ""} onChange={(e) => setForm({ ...form, apiBaseUrl: e.target.value })} placeholder="https://apidev.banrisul.com.br/cobranca/v1/" /></label></>}
      {selected.credential === "btg-oauth" && <><label><span>Client ID</span><input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder={secretStatus.stored.includes("clientId") ? "Salvo no cofre seguro" : "Client ID"} /></label><label><span>Client Secret</span><input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder={secretStatus.stored.includes("clientSecret") ? "Salvo no cofre seguro" : "Client Secret"} /></label><label className="full"><span>Redirect URI cadastrada no BTG</span><input value={form.redirectUri || ""} onChange={(e) => setForm({ ...form, redirectUri: e.target.value })} /></label><label><span>Account ID</span><input value={form.accountId || ""} onChange={(e) => setForm({ ...form, accountId: e.target.value })} /></label><label><span>Scopes</span><input value={form.scopes || ""} onChange={(e) => setForm({ ...form, scopes: e.target.value })} /></label></>}
      {selected.credential === "partner" && <><label><span>Código da AR / parceiro</span><input value={form.partnerCode || ""} onChange={(e) => setForm({ ...form, partnerCode: e.target.value })} /></label><label className="full"><span>Base URL da API do parceiro</span><input value={form.apiBaseUrl || ""} onChange={(e) => setForm({ ...form, apiBaseUrl: e.target.value })} /></label></>}
      </div>
      {form.validationMessage && <div className={`integration-validation ${String(form.validationStatus).includes("failed") ? "bad" : "good"}`}><strong>Última validação</strong><span>{form.validationMessage}</span>{Array.isArray(form.validationBlockers) && form.validationBlockers.map((item: string) => <small key={item}>• {item}</small>)}</div>}
      <div className="enhanced-modal-footer"><small>Segredos bancários e PFX não são gravados no banco comum nem enviados pela malha.</small><div><button type="button" className="enhanced-secondary" onClick={() => void test()} disabled={saving}>Testar configuração</button><button className="enhanced-primary" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</button></div></div>
    </form></div>}
  </div>;
}
