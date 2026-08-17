"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

type Connection = { id: string; connector: string; environment: string; credentialReference?: string | null; configuration?: Record<string, any>; updatedAt?: string };
type Certificate = { id: string; originalName: string; sha256: string; size: number; importedAt: string; validatedLocally: boolean };
type ConnectorId = "nfe_sefaz" | "nfse_national" | "nfe_distribution" | "cte_received" | "mdfe_received" | "banrisul" | "btg" | "certificate_partner";
type Definition = { id: ConnectorId; group: "Fiscal" | "Bancos e cobrança" | "Certificados"; title: string; provider: string; description: string; docs: string; credential: "pfx" | "oauth-client" | "btg-oauth" | "partner" };

const definitions: Definition[] = [
  { id: "nfe_sefaz", group: "Fiscal", title: "NF-e / NFC-e", provider: "SEFAZ / Portal Nacional NF-e", description: "NF-e modelo 55, NFC-e modelo 65, eventos, inutilização e consultas. Usa certificado A1 e dados fiscais do estabelecimento.", docs: "https://www.nfe.fazenda.gov.br/portal/", credential: "pfx" },
  { id: "nfse_national", group: "Fiscal", title: "NFS-e Padrão Nacional", provider: "SE/CGNFS-e", description: "DPS, emissão, consultas e eventos no padrão nacional para municípios aderentes.", docs: "https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/documentacao-atual", credential: "pfx" },
  { id: "nfe_distribution", group: "Fiscal", title: "Distribuição / Manifestação NF-e", provider: "Ambiente Nacional NF-e", description: "Consulta por NSU e obtenção de DF-e destinados ao CNPJ da empresa.", docs: "https://www.nfe.fazenda.gov.br/portal/", credential: "pfx" },
  { id: "cte_received", group: "Fiscal", title: "CT-e recebido", provider: "Portal Nacional CT-e", description: "Consulta e importação de CT-e destinados à empresa.", docs: "https://www.cte.fazenda.gov.br/portal/", credential: "pfx" },
  { id: "mdfe_received", group: "Fiscal", title: "MDF-e recebido", provider: "Portal MDF-e / SVRS", description: "Consulta e armazenamento de MDF-e recebido; sem emissão de MDF-e nesta versão.", docs: "https://dfe-portal.svrs.rs.gov.br/Mdfe", credential: "pfx" },
  { id: "banrisul", group: "Bancos e cobrança", title: "Banrisul Cobrança", provider: "Banrisul Developers", description: "Aplicação OAuth2 Client Credentials, beneficiário/convênio e API de cobrança.", docs: "https://developers.banrisul.com.br/pages/docs/clientes-banrisul/api-cobranca-v1.html", credential: "oauth-client" },
  { id: "btg", group: "Bancos e cobrança", title: "BTG Pactual Empresas", provider: "BTG Developers", description: "Boleto, Pix e Banking com aplicação BTG e OAuth Authorization Code autorizado pela conta PJ.", docs: "https://developers.empresas.btgpactual.com/docs/comecando", credential: "btg-oauth" },
  { id: "certificate_partner", group: "Certificados", title: "Parceiro de certificados digitais", provider: "AR / parceiro ICP-Brasil", description: "Pedidos, renovações e comissões conforme a API efetivamente contratada com a AR/parceiro.", docs: "https://www.gov.br/iti/pt-br/assuntos/icp-brasil", credential: "partner" },
];

const baseConfig: Record<string, any> = {
  environment: "homologation", certificateId: "", cnpj: "", stateRegistration: "", municipalRegistration: "", uf: "RS", cityCode: "", lastNsu: "0",
  enableNfce: false, cscId: "", cscConfigured: false,
  beneficiaryCode: "", oauthUrl: "", oauthAuthMethod: "basic", apiBaseUrl: "", scopes: "",
  redirectUri: "", accountId: "", partnerCode: "",
};

const statusText: Record<string, string> = {
  active: "Ativa", certificate_validated: "Certificado validado", authorization_required: "Aguardando autorização",
  provider_configured: "Configurada", validation_failed: "Com pendências", external_auth_failed: "Falha de autenticação",
  external_unreachable: "Sem conexão", configuration_saved: "Configuração salva", configuration_pending: "Incompleta", not_configured: "Não configurada",
};

export default function IntegrationsModuleV4({ onClose }: { onClose: () => void }) {
  const bridge = (window as any).sevenDesktop;
  const [connections, setConnections] = useState<Connection[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [selected, setSelected] = useState<Definition | null>(null);
  const [config, setConfig] = useState<Record<string, any>>(baseConfig);
  const [storedSecrets, setStoredSecrets] = useState<string[]>([]);
  const [clientId, setClientId] = useState(""); const [clientSecret, setClientSecret] = useState(""); const [cscToken, setCscToken] = useState(""); const [pfxPassword, setPfxPassword] = useState("");
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [group, setGroup] = useState<"Todos" | Definition["group"]>("Todos");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/integrations"); const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível carregar as integrações.");
      setConnections((data.connections || []).filter((item: Connection) => !item.connector.startsWith("__")));
      if (bridge?.certificatesList) setCertificates(await bridge.certificatesList());
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Falha ao carregar integrações."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const visible = useMemo(() => group === "Todos" ? definitions : definitions.filter((item) => item.group === group), [group]);
  const connectionFor = (id: string) => connections.find((item) => item.connector === id);
  const validationFor = (id: string) => connectionFor(id)?.configuration?.validationStatus || (connectionFor(id) ? connectionFor(id)?.status : "not_configured");

  const open = async (definition: Definition) => {
    const current = connectionFor(definition.id); const saved = current?.configuration || {};
    setSelected(definition); setConfig({ ...baseConfig, ...saved, environment: current?.environment || saved.environment || "homologation" });
    setClientId(""); setClientSecret(""); setCscToken(""); setPfxPassword(""); setError(""); setNotice("");
    if (bridge?.integrationSecretsStatus) {
      const status = await bridge.integrationSecretsStatus(definition.id);
      setStoredSecrets(status?.stored || []);
    } else setStoredSecrets([]);
  };

  const importCertificate = async () => {
    if (!bridge?.certificateImport) return setError("A importação de certificado está disponível somente no aplicativo desktop.");
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await bridge.certificateImport({ passphrase: pfxPassword });
      if (result?.canceled) return;
      const certificate = result.certificate as Certificate;
      setCertificates((current) => [...current.filter((item) => item.id !== certificate.id), certificate]);
      setConfig((current) => ({ ...current, certificateId: certificate.id })); setPfxPassword("");
      setNotice(`Certificado ${certificate.originalName} aberto com sucesso e armazenado no cofre criptografado deste computador.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível importar o certificado."); }
    finally { setSaving(false); }
  };

  const persistSecrets = async () => {
    if (!selected || !bridge?.integrationSecretsSet) return storedSecrets;
    if (selected.id === "nfe_sefaz" && cscToken) {
      await bridge.integrationSecretsSet("nfe_sefaz", { cscToken });
    }
    if (selected.credential === "oauth-client" || selected.credential === "btg-oauth") {
      if ((clientId && !clientSecret) || (!clientId && clientSecret)) throw new Error("Para substituir credenciais OAuth, informe Client ID e Client Secret juntos.");
      if (clientId && clientSecret) await bridge.integrationSecretsSet(selected.id, { clientId, clientSecret });
    }
    const refreshed = bridge?.integrationSecretsStatus ? await bridge.integrationSecretsStatus(selected.id) : { stored: storedSecrets };
    setStoredSecrets(refreshed?.stored || []);
    return refreshed?.stored || [];
  };

  const sanitizedConfig = (secrets: string[]) => {
    const safe = { ...config };
    delete safe.cscToken;
    if (selected?.id === "nfe_sefaz") safe.cscConfigured = secrets.includes("cscToken");
    return safe;
  };

  const saveConnection = async (safeConfig: Record<string, any>, secrets: string[]) => {
    if (!selected) throw new Error("Integração não selecionada.");
    const credentialReference = selected.credential === "pfx" ? (safeConfig.certificateId || "") : secrets.length ? "secure-os-vault" : "";
    const response = await fetch("/api/integrations", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "save", connector: selected.id, environment: safeConfig.environment, credentialReference, configuration: safeConfig }),
    });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || "Não foi possível salvar a integração.");
    return data;
  };

  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!selected) return; setSaving(true); setError(""); setNotice("");
    try {
      const secrets = await persistSecrets(); const safeConfig = sanitizedConfig(secrets);
      await saveConnection(safeConfig, secrets); setConfig(safeConfig); await load();
      setClientId(""); setClientSecret(""); setCscToken("");
      setNotice("Configuração salva. Nenhum PFX, Client Secret ou CSC foi gravado no banco comum do ERP.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Falha ao salvar integração."); }
    finally { setSaving(false); }
  };

  const test = async () => {
    if (!selected || !bridge?.integrationTest) return setError("Teste avançado disponível somente no aplicativo desktop.");
    setSaving(true); setError(""); setNotice("");
    try {
      const secrets = await persistSecrets(); const safeConfig = sanitizedConfig(secrets);
      const result = await bridge.integrationTest({ connector: selected.id, environment: safeConfig.environment, configuration: safeConfig });
      const validated = { ...safeConfig, validationStatus: result.status, validationMessage: result.message, validationBlockers: result.blockers || [], lastValidatedAt: result.checkedAt || new Date().toISOString(), externalRequestPerformed: Boolean(result.externalRequestPerformed) };
      await saveConnection(validated, secrets); setConfig(validated); await load(); setClientId(""); setClientSecret(""); setCscToken("");
      if (result.ok) setNotice(result.message || "Configuração validada."); else setError([result.message, ...(result.blockers || [])].filter(Boolean).join(" · "));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Falha ao testar integração."); }
    finally { setSaving(false); }
  };

  const badgeClass = (id: string) => {
    const status = validationFor(id);
    if (status === "active" || status === "certificate_validated" || status === "provider_configured") return "active";
    if (status.includes("failed") || status === "external_unreachable") return "error";
    return connectionFor(id) ? "saved" : "off";
  };

  return <div className="enhanced-module integrations-v3">
    <header className="enhanced-header"><div><span className="enhanced-kicker">Administração · integrações específicas</span><h1>Central de integrações</h1><p>Configuração separada por provedor, com cofre criptografado para PFX e segredos, validações locais e testes externos quando o protocolo permite.</p></div><div className="enhanced-actions"><button className="enhanced-secondary" onClick={onClose}>Voltar ao ERP</button><button className="enhanced-secondary" onClick={() => void load()}>Atualizar</button></div></header>
    <div className="core-independence-banner"><strong>Segurança local</strong><span>OS e rotinas internas não dependem destas conexões. PFX, Client Secrets e CSC não trafegam na sincronização Seven Mesh.</span></div>
    {error && !selected && <div className="enhanced-alert error">{error}</div>}
    <div className="integration-tabs">{(["Todos", "Fiscal", "Bancos e cobrança", "Certificados"] as const).map((item) => <button key={item} className={group === item ? "active" : ""} onClick={() => setGroup(item)}>{item}</button>)}</div>
    <section className="integration-catalog-v2">{visible.map((definition) => <article className="integration-card-v2" key={definition.id}><div className="integration-card-top"><span className="integration-provider-mark">{definition.title.replace(/[^A-Za-zÀ-ÿ]/g, "").slice(0,2).toUpperCase()}</span><div><span className="integration-group">{definition.group}</span><h2>{definition.title}</h2><small>{definition.provider}</small></div><b className={`integration-state ${badgeClass(definition.id)}`}>{loading ? "Carregando" : statusText[validationFor(definition.id)] || "Configuração salva"}</b></div><p>{definition.description}</p><footer><a href={definition.docs} target="_blank" rel="noreferrer">Documentação oficial</a><button onClick={() => void open(definition)}>{connectionFor(definition.id) ? "Gerenciar" : "Configurar"}</button></footer></article>)}</section>

    {selected && <div className="enhanced-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}><form className="enhanced-modal integration-config-v3" onSubmit={save}><div className="enhanced-modal-title"><div><span>{selected.group.toUpperCase()}</span><h2>{selected.title}</h2><p>{selected.provider}</p></div><button type="button" onClick={() => setSelected(null)}>×</button></div>
      {error && <div className="enhanced-alert error modal-alert">{error}</div>}{notice && <div className="enhanced-alert success modal-alert">{notice}</div>}
      <div className="form-grid two">
        <label><span>Ambiente</span><select value={config.environment} onChange={(e) => setConfig({ ...config, environment: e.target.value })}><option value="homologation">Homologação / Sandbox</option><option value="production">Produção</option></select></label>
        {selected.credential === "pfx" && <><label><span>Certificado A1</span><select value={config.certificateId || ""} onChange={(e) => setConfig({ ...config, certificateId: e.target.value })}><option value="">Selecione...</option>{certificates.map((cert) => <option key={cert.id} value={cert.id}>{cert.originalName} · SHA {cert.sha256.slice(0,10)}</option>)}</select></label><label><span>Senha do PFX/P12 a importar</span><input type="password" value={pfxPassword} onChange={(e) => setPfxPassword(e.target.value)} placeholder="Usada somente na importação" /></label><label className="cert-import-action"><span>Adicionar certificado A1</span><button type="button" className="enhanced-secondary" onClick={() => void importCertificate()} disabled={saving}>Selecionar .PFX / .P12</button></label><label><span>CNPJ do estabelecimento</span><input value={config.cnpj || ""} onChange={(e) => setConfig({ ...config, cnpj: e.target.value })} placeholder="Vazio = Cadastro da Empresa" /></label></>}
        {selected.id === "nfe_sefaz" && <><label><span>Inscrição Estadual</span><input value={config.stateRegistration || ""} onChange={(e) => setConfig({ ...config, stateRegistration: e.target.value })} placeholder="Vazio = Cadastro da Empresa" /></label><label><span>UF</span><input maxLength={2} value={config.uf || "RS"} onChange={(e) => setConfig({ ...config, uf: e.target.value.toUpperCase() })} /></label><label className="checkbox-line"><input type="checkbox" checked={Boolean(config.enableNfce)} onChange={(e) => setConfig({ ...config, enableNfce: e.target.checked })} /><span>Também configurar NFC-e modelo 65</span></label>{config.enableNfce && <><label><span>ID do CSC</span><input value={config.cscId || ""} onChange={(e) => setConfig({ ...config, cscId: e.target.value })} /></label><label className="full"><span>CSC / Token NFC-e</span><input type="password" value={cscToken} onChange={(e) => setCscToken(e.target.value)} placeholder={storedSecrets.includes("cscToken") ? "CSC já salvo no cofre seguro — preencha apenas para substituir" : "Token fornecido pela SEFAZ"} /><small>{storedSecrets.includes("cscToken") ? "Existe um CSC armazenado criptografado neste computador." : "Será armazenado somente no cofre do sistema operacional."}</small></label></>}</>}
        {selected.id === "nfse_national" && <><label><span>Inscrição Municipal</span><input value={config.municipalRegistration || ""} onChange={(e) => setConfig({ ...config, municipalRegistration: e.target.value })} placeholder="Vazio = Cadastro da Empresa" /></label><label><span>Código IBGE do município</span><input value={config.cityCode || ""} onChange={(e) => setConfig({ ...config, cityCode: e.target.value })} placeholder="7 dígitos" /></label></>}
        {["nfe_distribution","cte_received","mdfe_received"].includes(selected.id) && <label><span>Último NSU conhecido</span><input value={config.lastNsu || "0"} onChange={(e) => setConfig({ ...config, lastNsu: e.target.value })} /></label>}
        {selected.credential === "oauth-client" && <><label><span>Client ID</span><input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder={storedSecrets.includes("clientId") ? "Já salvo — preencha apenas para substituir" : "Client ID da Application"} /></label><label><span>Client Secret</span><input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder={storedSecrets.includes("clientSecret") ? "Já salvo — preencha apenas para substituir" : "Client Secret"} /></label><label><span>Código beneficiário / convênio</span><input value={config.beneficiaryCode || ""} onChange={(e) => setConfig({ ...config, beneficiaryCode: e.target.value })} /></label><label><span>Método no endpoint OAuth</span><select value={config.oauthAuthMethod || "basic"} onChange={(e) => setConfig({ ...config, oauthAuthMethod: e.target.value })}><option value="basic">HTTP Basic + grant_type</option><option value="body">Client ID/Secret no corpo</option></select></label><label className="full"><span>Endpoint OAuth2</span><input value={config.oauthUrl || ""} onChange={(e) => setConfig({ ...config, oauthUrl: e.target.value })} placeholder="URL de token indicada para a API/ambiente" /></label><label className="full"><span>Base URL API Cobrança</span><input value={config.apiBaseUrl || ""} onChange={(e) => setConfig({ ...config, apiBaseUrl: e.target.value })} placeholder="Ex.: https://apidev.banrisul.com.br/cobranca/v1/" /></label><label className="full"><span>Scopes, quando exigidos</span><input value={config.scopes || ""} onChange={(e) => setConfig({ ...config, scopes: e.target.value })} /></label></>}
        {selected.credential === "btg-oauth" && <><label><span>Client ID</span><input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder={storedSecrets.includes("clientId") ? "Já salvo — preencha apenas para substituir" : "Client ID"} /></label><label><span>Client Secret</span><input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder={storedSecrets.includes("clientSecret") ? "Já salvo — preencha apenas para substituir" : "Client Secret"} /></label><label className="full"><span>Redirect URI cadastrada no BTG</span><input value={config.redirectUri || ""} onChange={(e) => setConfig({ ...config, redirectUri: e.target.value })} /></label><label><span>Account ID</span><input value={config.accountId || ""} onChange={(e) => setConfig({ ...config, accountId: e.target.value })} /></label><label><span>Scopes OAuth</span><input value={config.scopes || ""} onChange={(e) => setConfig({ ...config, scopes: e.target.value })} placeholder="Inclua openid + escopos do recurso" /></label></>}
        {selected.credential === "partner" && <><label><span>Código da AR / parceiro</span><input value={config.partnerCode || ""} onChange={(e) => setConfig({ ...config, partnerCode: e.target.value })} /></label><label className="full"><span>Base URL da API fornecida pelo parceiro</span><input value={config.apiBaseUrl || ""} onChange={(e) => setConfig({ ...config, apiBaseUrl: e.target.value })} /></label></>}
      </div>
      {config.validationMessage && <div className={`integration-validation ${String(config.validationStatus).includes("failed") || String(config.validationStatus).includes("unreachable") ? "bad" : "good"}`}><strong>Última validação</strong><span>{config.validationMessage}</span>{Array.isArray(config.validationBlockers) && config.validationBlockers.map((item: string) => <small key={item}>• {item}</small>)}<small>{config.externalRequestPerformed ? "Foi executada uma chamada externa nesta validação." : "Validação local; nenhuma chamada externa foi fingida."}</small></div>}
      <div className="enhanced-modal-footer"><small>PFX, senhas, CSC e Client Secrets permanecem exclusivamente no cofre deste computador.</small><div><button type="button" className="enhanced-secondary" onClick={() => void test()} disabled={saving}>Testar configuração</button><button className="enhanced-primary" disabled={saving}>{saving ? "Salvando..." : "Salvar configuração"}</button></div></div>
    </form></div>}
  </div>;
}
