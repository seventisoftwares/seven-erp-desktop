"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

type Connection = { id: string; connector: string; environment: string; credentialReference?: string | null; configuration?: Record<string, any>; status?: string; updatedAt?: string };
type Certificate = { id: string; originalName: string; sha256: string; size: number; importedAt: string; validatedLocally: boolean };
type SecretInfo = { stored: string[]; certificateId?: string | null; localValidationStatus?: string | null; localValidationMessage?: string | null; localValidatedAt?: string | null };
type ConnectorId = "nfe_sefaz" | "nfse_national" | "nfe_distribution" | "cte_received" | "mdfe_received" | "banrisul" | "btg" | "certificate_partner";
type Definition = { id: ConnectorId; group: "Fiscal" | "Bancos e cobrança" | "Certificados"; title: string; provider: string; description: string; docs: string; credential: "pfx" | "oauth-client" | "btg-oauth" | "partner" };

const definitions: Definition[] = [
  { id: "nfe_sefaz", group: "Fiscal", title: "NF-e / NFC-e", provider: "SEFAZ / Portal Nacional NF-e", description: "NF-e modelo 55, NFC-e modelo 65, eventos, inutilização e consultas, com certificado A1 por computador.", docs: "https://www.nfe.fazenda.gov.br/portal/", credential: "pfx" },
  { id: "nfse_national", group: "Fiscal", title: "NFS-e Padrão Nacional", provider: "SE/CGNFS-e", description: "DPS, emissão, consultas e eventos do padrão nacional nos municípios aderentes.", docs: "https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/documentacao-atual", credential: "pfx" },
  { id: "nfe_distribution", group: "Fiscal", title: "Distribuição / Manifestação NF-e", provider: "Ambiente Nacional NF-e", description: "Consulta por NSU e obtenção de documentos fiscais destinados ao CNPJ da empresa.", docs: "https://www.nfe.fazenda.gov.br/portal/", credential: "pfx" },
  { id: "cte_received", group: "Fiscal", title: "CT-e recebido", provider: "Portal Nacional CT-e", description: "Consulta e importação de CT-e recebidos pela empresa.", docs: "https://www.cte.fazenda.gov.br/portal/", credential: "pfx" },
  { id: "mdfe_received", group: "Fiscal", title: "MDF-e recebido", provider: "Portal MDF-e / SVRS", description: "Consulta e armazenamento de MDF-e recebido; sem emissão nesta versão.", docs: "https://dfe-portal.svrs.rs.gov.br/Mdfe", credential: "pfx" },
  { id: "banrisul", group: "Bancos e cobrança", title: "Banrisul Cobrança", provider: "Banrisul Developers", description: "Application OAuth2 Client Credentials, beneficiário/convênio e endpoints da API de cobrança.", docs: "https://developers.banrisul.com.br/pages/docs/clientes-banrisul/api-cobranca-v1.html", credential: "oauth-client" },
  { id: "btg", group: "Bancos e cobrança", title: "BTG Pactual Empresas", provider: "BTG Developers", description: "Boleto, Pix e Banking com aplicativo BTG e consentimento OAuth Authorization Code da conta PJ.", docs: "https://developers.empresas.btgpactual.com/docs/comecando", credential: "btg-oauth" },
  { id: "certificate_partner", group: "Certificados", title: "Parceiro de certificados digitais", provider: "AR / parceiro ICP-Brasil", description: "Pedidos, renovações e comissões conforme a API fornecida pelo parceiro contratado.", docs: "https://www.gov.br/iti/pt-br/assuntos/icp-brasil", credential: "partner" },
];

const baseConfig: Record<string, any> = { environment: "homologation", cnpj: "", stateRegistration: "", municipalRegistration: "", uf: "RS", cityCode: "", lastNsu: "0", enableNfce: false, cscId: "", beneficiaryCode: "", oauthUrl: "", oauthAuthMethod: "basic", apiBaseUrl: "", scopes: "", redirectUri: "", accountId: "", partnerCode: "" };
const labels: Record<string,string> = { active: "Ativa neste PC", certificate_validated: "A1 validado neste PC", authorization_required: "Aguardando autorização", provider_configured: "Configurada", validation_failed: "Com pendências", external_auth_failed: "Falha de autenticação", external_unreachable: "Sem conexão", configuration_saved: "Teste necessário", certificate_required: "Importe o A1 neste PC", not_configured: "Não configurada" };

export default function IntegrationsModuleV5({ onClose }: { onClose: () => void }) {
  const bridge = (window as any).sevenDesktop;
  const [connections, setConnections] = useState<Connection[]>([]); const [certificates, setCertificates] = useState<Certificate[]>([]); const [localInfo, setLocalInfo] = useState<Record<string,SecretInfo>>({});
  const [selected, setSelected] = useState<Definition|null>(null); const [config, setConfig] = useState<Record<string,any>>(baseConfig); const [certificateId, setCertificateId] = useState("");
  const [clientId, setClientId] = useState(""); const [clientSecret, setClientSecret] = useState(""); const [cscToken, setCscToken] = useState(""); const [pfxPassword, setPfxPassword] = useState("");
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [group, setGroup] = useState<"Todos"|Definition["group"]>("Todos");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/integrations"); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Não foi possível carregar integrações.");
      setConnections((data.connections || []).filter((item: Connection) => !item.connector.startsWith("__")));
      if (bridge?.certificatesList) setCertificates(await bridge.certificatesList());
      if (bridge?.integrationSecretsStatus) {
        const entries = await Promise.all(definitions.map(async (item) => [item.id, await bridge.integrationSecretsStatus(item.id)] as const));
        setLocalInfo(Object.fromEntries(entries));
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Falha ao carregar integrações."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const visible = useMemo(() => group === "Todos" ? definitions : definitions.filter((item) => item.group === group), [group]);
  const connectionFor = (id: string) => connections.find((item) => item.connector === id);
  const localFor = (id: string) => localInfo[id] || { stored: [] };

  const open = async (definition: Definition) => {
    const saved = connectionFor(definition.id)?.configuration || {};
    const { certificateId: _legacyCert, cscToken: _legacyCsc, cscConfigured: _legacyCscFlag, validationStatus: _vs, validationMessage: _vm, validationBlockers: _vb, lastValidatedAt: _va, externalRequestPerformed: _er, ...syncSafe } = saved;
    let info = localFor(definition.id);
    if (bridge?.integrationSecretsStatus) info = await bridge.integrationSecretsStatus(definition.id);
    setSelected(definition); setConfig({ ...baseConfig, ...syncSafe, environment: connectionFor(definition.id)?.environment || syncSafe.environment || "homologation" }); setCertificateId(info.certificateId || "");
    setClientId(""); setClientSecret(""); setCscToken(""); setPfxPassword(""); setError(""); setNotice(""); setLocalInfo((current) => ({ ...current, [definition.id]: info }));
  };

  const importCertificate = async () => {
    if (!bridge?.certificateImport || !selected) return setError("Importação de certificado disponível somente no aplicativo desktop.");
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await bridge.certificateImport({ passphrase: pfxPassword }); if (result?.canceled) return;
      const cert = result.certificate as Certificate; setCertificates((rows) => [...rows.filter((item) => item.id !== cert.id), cert]); setCertificateId(cert.id); setPfxPassword("");
      await bridge.integrationSecretsSet(selected.id, { certificateId: cert.id, localValidationStatus: "configuration_saved", localValidationMessage: "Novo certificado vinculado; execute o teste novamente.", localValidatedAt: new Date().toISOString() });
      const info = await bridge.integrationSecretsStatus(selected.id); setLocalInfo((current) => ({ ...current, [selected.id]: info })); setNotice(`Certificado ${cert.originalName} validado e vinculado somente a este computador.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível importar o PFX/P12."); }
    finally { setSaving(false); }
  };

  const persistLocal = async () => {
    if (!selected || !bridge?.integrationSecretsSet) return localFor(selected?.id || "");
    const patch: Record<string, any> = {};
    if (selected.credential === "pfx") patch.certificateId = certificateId || null;
    if (selected.id === "nfe_sefaz" && cscToken) patch.cscToken = cscToken;
    if (selected.credential === "oauth-client" || selected.credential === "btg-oauth") {
      if ((clientId && !clientSecret) || (!clientId && clientSecret)) throw new Error("Para substituir as credenciais OAuth, informe Client ID e Client Secret juntos.");
      if (clientId && clientSecret) { patch.clientId = clientId; patch.clientSecret = clientSecret; }
    }
    await bridge.integrationSecretsSet(selected.id, patch);
    return bridge.integrationSecretsStatus(selected.id);
  };

  const saveGlobal = async (info: SecretInfo) => {
    if (!selected) return;
    const credentialReference = selected.credential === "pfx" ? "per-device-a1" : (info.stored?.includes("clientSecret") ? "per-device-secure-vault" : "");
    const response = await fetch("/api/integrations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "save", connector: selected.id, environment: config.environment, credentialReference, configuration: config }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || "Não foi possível salvar a integração.");
  };

  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!selected) return; setSaving(true); setError(""); setNotice("");
    try {
      let info = await persistLocal(); await saveGlobal(info);
      info = await bridge.integrationSecretsSet(selected.id, { localValidationStatus: selected.credential === "pfx" && !info.certificateId ? "certificate_required" : "configuration_saved", localValidationMessage: "Configuração alterada; execute ‘Testar configuração’ neste computador.", localValidatedAt: new Date().toISOString() });
      setLocalInfo((current) => ({ ...current, [selected.id]: info })); setClientId(""); setClientSecret(""); setCscToken(""); await load();
      setNotice("Configuração da empresa sincronizada. Certificado e segredos permaneceram somente neste computador.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Falha ao salvar integração."); }
    finally { setSaving(false); }
  };

  const test = async () => {
    if (!selected || !bridge?.integrationTest) return setError("Teste avançado disponível somente no aplicativo desktop.");
    setSaving(true); setError(""); setNotice("");
    try {
      let info = await persistLocal(); await saveGlobal(info);
      const testConfig = { ...config, certificateId: info.certificateId || "" };
      const result = await bridge.integrationTest({ connector: selected.id, environment: config.environment, configuration: testConfig });
      info = await bridge.integrationSecretsSet(selected.id, { localValidationStatus: result.status || "validation_failed", localValidationMessage: result.message || "Validação concluída.", localValidatedAt: result.checkedAt || new Date().toISOString() });
      setLocalInfo((current) => ({ ...current, [selected.id]: info })); setClientId(""); setClientSecret(""); setCscToken(""); await load();
      if (result.ok) setNotice(result.message || "Configuração validada."); else setError([result.message, ...(result.blockers || [])].filter(Boolean).join(" · "));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Falha ao testar integração."); }
    finally { setSaving(false); }
  };

  const statusOf = (definition: Definition) => {
    const info = localFor(definition.id); if (info.localValidationStatus) return info.localValidationStatus;
    if (definition.credential === "pfx" && connectionFor(definition.id) && !info.certificateId) return "certificate_required";
    return connectionFor(definition.id) ? "configuration_saved" : "not_configured";
  };
  const tone = (status: string) => status === "active" || status === "certificate_validated" || status === "provider_configured" ? "active" : status.includes("failed") || status === "external_unreachable" || status === "certificate_required" ? "error" : status === "not_configured" ? "off" : "saved";

  return <div className="enhanced-module integrations-v3">
    <header className="enhanced-header"><div><span className="enhanced-kicker">Administração · integrações por provedor</span><h1>Central de integrações</h1><p>Configuração específica para cada serviço, com certificado e credenciais vinculados individualmente a cada computador.</p></div><div className="enhanced-actions"><button className="enhanced-secondary" onClick={onClose}>Voltar ao ERP</button><button className="enhanced-secondary" onClick={() => void load()}>Atualizar</button></div></header>
    <div className="core-independence-banner"><strong>Arquitetura profissional</strong><span>Dados não sensíveis sincronizam entre PCs. PFX, senha, CSC, Client Secret e resultado de validação permanecem locais em cada máquina.</span></div>
    {error && !selected && <div className="enhanced-alert error">{error}</div>}
    <div className="integration-tabs">{(["Todos","Fiscal","Bancos e cobrança","Certificados"] as const).map((item) => <button key={item} className={group === item ? "active" : ""} onClick={() => setGroup(item)}>{item}</button>)}</div>
    <section className="integration-catalog-v2">{visible.map((definition) => { const status = statusOf(definition); return <article className="integration-card-v2" key={definition.id}><div className="integration-card-top"><span className="integration-provider-mark">{definition.title.replace(/[^A-Za-zÀ-ÿ]/g,"").slice(0,2).toUpperCase()}</span><div><span className="integration-group">{definition.group}</span><h2>{definition.title}</h2><small>{definition.provider}</small></div><b className={`integration-state ${tone(status)}`}>{loading ? "Carregando" : labels[status] || "Configuração salva"}</b></div><p>{definition.description}</p>{localFor(definition.id).localValidationMessage && <div className="integration-use"><strong>Status deste computador</strong><span>{localFor(definition.id).localValidationMessage}</span></div>}<footer><a href={definition.docs} target="_blank" rel="noreferrer">Documentação oficial</a><button onClick={() => void open(definition)}>{connectionFor(definition.id) ? "Gerenciar" : "Configurar"}</button></footer></article>; })}</section>

    {selected && <div className="enhanced-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}><form className="enhanced-modal integration-config-v3" onSubmit={save}><div className="enhanced-modal-title"><div><span>{selected.group.toUpperCase()}</span><h2>{selected.title}</h2><p>{selected.provider}</p></div><button type="button" onClick={() => setSelected(null)}>×</button></div>{error && <div className="enhanced-alert error modal-alert">{error}</div>}{notice && <div className="enhanced-alert success modal-alert">{notice}</div>}
      <div className="form-grid two"><label><span>Ambiente</span><select value={config.environment} onChange={(e) => setConfig({ ...config, environment: e.target.value })}><option value="homologation">Homologação / Sandbox</option><option value="production">Produção</option></select></label>
      {selected.credential === "pfx" && <><label><span>Certificado A1 deste computador</span><select value={certificateId} onChange={(e) => setCertificateId(e.target.value)}><option value="">Nenhum certificado vinculado</option>{certificates.map((cert) => <option key={cert.id} value={cert.id}>{cert.originalName} · SHA {cert.sha256.slice(0,10)}</option>)}</select></label><label><span>Senha do novo PFX/P12</span><input type="password" value={pfxPassword} onChange={(e) => setPfxPassword(e.target.value)} placeholder="Usada somente para importar" /></label><label className="cert-import-action"><span>Adicionar certificado A1</span><button type="button" className="enhanced-secondary" onClick={() => void importCertificate()} disabled={saving}>Selecionar .PFX / .P12</button></label><label><span>CNPJ do estabelecimento</span><input value={config.cnpj || ""} onChange={(e) => setConfig({ ...config, cnpj: e.target.value })} placeholder="Vazio = Cadastro da Empresa" /></label></>}
      {selected.id === "nfe_sefaz" && <><label><span>Inscrição Estadual</span><input value={config.stateRegistration || ""} onChange={(e) => setConfig({ ...config, stateRegistration: e.target.value })} placeholder="Vazio = Cadastro da Empresa" /></label><label><span>UF</span><input maxLength={2} value={config.uf || "RS"} onChange={(e) => setConfig({ ...config, uf: e.target.value.toUpperCase() })} /></label><label className="checkbox-line"><input type="checkbox" checked={Boolean(config.enableNfce)} onChange={(e) => setConfig({ ...config, enableNfce: e.target.checked })}/><span>Também configurar NFC-e modelo 65</span></label>{config.enableNfce && <><label><span>ID do CSC</span><input value={config.cscId || ""} onChange={(e) => setConfig({ ...config, cscId: e.target.value })}/></label><label className="full"><span>CSC / Token NFC-e deste computador</span><input type="password" value={cscToken} onChange={(e) => setCscToken(e.target.value)} placeholder={localFor(selected.id).stored?.includes("cscToken") ? "Já salvo — preencha somente para substituir" : "Token fornecido pela SEFAZ"}/><small>O CSC nunca é colocado no JSON sincronizado.</small></label></>}</>}
      {selected.id === "nfse_national" && <><label><span>Inscrição Municipal</span><input value={config.municipalRegistration || ""} onChange={(e) => setConfig({ ...config, municipalRegistration: e.target.value })} placeholder="Vazio = Cadastro da Empresa"/></label><label><span>Código IBGE do município</span><input value={config.cityCode || ""} onChange={(e) => setConfig({ ...config, cityCode: e.target.value })} placeholder="7 dígitos"/></label></>}
      {["nfe_distribution","cte_received","mdfe_received"].includes(selected.id) && <label><span>Último NSU conhecido</span><input value={config.lastNsu || "0"} onChange={(e) => setConfig({ ...config, lastNsu: e.target.value })}/></label>}
      {selected.credential === "oauth-client" && <><label><span>Client ID deste computador</span><input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder={localFor(selected.id).stored?.includes("clientId") ? "Já salvo — preencha só para substituir" : "Client ID"}/></label><label><span>Client Secret deste computador</span><input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder={localFor(selected.id).stored?.includes("clientSecret") ? "Já salvo — preencha só para substituir" : "Client Secret"}/></label><label><span>Código beneficiário / convênio</span><input value={config.beneficiaryCode || ""} onChange={(e) => setConfig({ ...config, beneficiaryCode: e.target.value })}/></label><label><span>Autenticação do endpoint OAuth</span><select value={config.oauthAuthMethod || "basic"} onChange={(e) => setConfig({ ...config, oauthAuthMethod: e.target.value })}><option value="basic">HTTP Basic + grant_type</option><option value="body">Client ID/Secret no corpo</option></select></label><label className="full"><span>Endpoint OAuth2</span><input value={config.oauthUrl || ""} onChange={(e) => setConfig({ ...config, oauthUrl: e.target.value })} placeholder="URL de token indicada pelo Banrisul"/></label><label className="full"><span>Base URL API Cobrança</span><input value={config.apiBaseUrl || ""} onChange={(e) => setConfig({ ...config, apiBaseUrl: e.target.value })} placeholder="https://apidev.banrisul.com.br/cobranca/v1/"/></label><label className="full"><span>Scopes, quando exigidos</span><input value={config.scopes || ""} onChange={(e) => setConfig({ ...config, scopes: e.target.value })}/></label></>}
      {selected.credential === "btg-oauth" && <><label><span>Client ID deste computador</span><input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder={localFor(selected.id).stored?.includes("clientId") ? "Já salvo — preencha só para substituir" : "Client ID"}/></label><label><span>Client Secret deste computador</span><input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder={localFor(selected.id).stored?.includes("clientSecret") ? "Já salvo — preencha só para substituir" : "Client Secret"}/></label><label className="full"><span>Redirect URI cadastrada no BTG</span><input value={config.redirectUri || ""} onChange={(e) => setConfig({ ...config, redirectUri: e.target.value })}/></label><label><span>Account ID</span><input value={config.accountId || ""} onChange={(e) => setConfig({ ...config, accountId: e.target.value })}/></label><label><span>Scopes OAuth</span><input value={config.scopes || ""} onChange={(e) => setConfig({ ...config, scopes: e.target.value })} placeholder="Inclua openid e os escopos do recurso"/></label></>}
      {selected.credential === "partner" && <><label><span>Código da AR / parceiro</span><input value={config.partnerCode || ""} onChange={(e) => setConfig({ ...config, partnerCode: e.target.value })}/></label><label className="full"><span>Base URL da API do parceiro</span><input value={config.apiBaseUrl || ""} onChange={(e) => setConfig({ ...config, apiBaseUrl: e.target.value })}/></label></>}
      </div>
      {localFor(selected.id).localValidationMessage && <div className={`integration-validation ${String(localFor(selected.id).localValidationStatus).includes("failed") || localFor(selected.id).localValidationStatus === "external_unreachable" || localFor(selected.id).localValidationStatus === "certificate_required" ? "bad" : "good"}`}><strong>Validação deste computador</strong><span>{localFor(selected.id).localValidationMessage}</span>{localFor(selected.id).localValidatedAt && <small>{new Date(localFor(selected.id).localValidatedAt!).toLocaleString("pt-BR")}</small>}</div>}
      <div className="enhanced-modal-footer"><small>Configuração geral sincroniza; certificados e credenciais são vinculados separadamente em cada PC.</small><div><button type="button" className="enhanced-secondary" onClick={() => void test()} disabled={saving}>Testar configuração</button><button className="enhanced-primary" disabled={saving}>{saving ? "Salvando..." : "Salvar configuração"}</button></div></div>
    </form></div>}
  </div>;
}
