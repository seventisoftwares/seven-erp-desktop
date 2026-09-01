"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

type Connection = { id: string; connector: string; environment: string; credentialReference?: string | null; configuration?: Record<string, any>; status?: string; updatedAt?: string };
type Certificate = { id: string; originalName: string; sha256: string; size: number; importedAt: string; validatedLocally: boolean };
type SecretInfo = { stored: string[]; certificateId?: string | null; localValidationStatus?: string | null; localValidationMessage?: string | null; localValidatedAt?: string | null };
type ConnectorId = "nfe_sefaz" | "nfse_national" | "nfe_distribution" | "cte_received" | "mdfe_received" | "banrisul" | "btg" | "certificate_partner";
type Definition = { id: ConnectorId; group: "Fiscal" | "Bancos e cobrança" | "Certificados"; title: string; provider: string; description: string; docs: string; credential: "pfx" | "oauth-client" | "btg-oauth" | "partner" };

const definitions: Definition[] = [
  { id: "nfe_sefaz", group: "Fiscal", title: "NF-e / NFC-e", provider: "SEFAZ / Portal Nacional NF-e", description: "Consulta SOAP NFeStatusServico4 real por mTLS. A autorização de NF-e só será liberada depois da assinatura e retorno oficial da SEFAZ.", docs: "https://www.nfe.fazenda.gov.br/portal/", credential: "pfx" },
  { id: "nfse_national", group: "Fiscal", title: "NFS-e Padrão Nacional", provider: "SE/CGNFS-e", description: "Conexão HTTPS/mTLS real com a SEFIN Nacional em produção ou produção restrita, sem criar documento durante o teste.", docs: "https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/apis-prod-restrita-e-producao", credential: "pfx" },
  { id: "nfe_distribution", group: "Fiscal", title: "Distribuição / Manifestação NF-e", provider: "Ambiente Nacional NF-e", description: "Operacional: consulta real NFeDistribuicaoDFe por distNSU, baixa docZip, descompacta e armazena os XMLs recebidos.", docs: "https://www.nfe.fazenda.gov.br/portal/WebServices.aspx", credential: "pfx" },
  { id: "cte_received", group: "Fiscal", title: "CT-e recebido", provider: "Portal Nacional CT-e", description: "Configuração preparada, mas sem marcar como ativa até a consulta/importação externa oficial estar implementada.", docs: "https://www.cte.fazenda.gov.br/portal/", credential: "pfx" },
  { id: "mdfe_received", group: "Fiscal", title: "MDF-e recebido", provider: "Portal MDF-e / SVRS", description: "Configuração preparada, mas sem marcar como ativa até a consulta/importação externa oficial estar implementada.", docs: "https://dfe-portal.svrs.rs.gov.br/Mdfe", credential: "pfx" },
  { id: "banrisul", group: "Bancos e cobrança", title: "Banrisul Cobrança", provider: "Banrisul Developers", description: "OAuth2 Client Credentials real. O teste solicita um Bearer Token ao endpoint configurado.", docs: "https://developers.banrisul.com.br/pages/docs/clientes-banrisul/api-cobranca-v1.html", credential: "oauth-client" },
  { id: "btg", group: "Bancos e cobrança", title: "BTG Pactual Empresas", provider: "BTG Developers", description: "Configuração de Banking/Pix/Boleto preparada para Authorization Code e consentimento; não fica ativa antes do fluxo externo real.", docs: "https://developers.empresas.btgpactual.com/docs/comecando", credential: "btg-oauth" },
  { id: "certificate_partner", group: "Certificados", title: "Parceiro de certificados digitais", provider: "AR / parceiro ICP-Brasil", description: "Credenciais e endpoint do parceiro. A ativação depende da API contratada e de autenticação real.", docs: "https://www.gov.br/iti/pt-br/assuntos/icp-brasil", credential: "partner" },
];

const baseConfig: Record<string, any> = {
  environment: "homologation", cnpj: "", stateRegistration: "", municipalRegistration: "", uf: "RS", cityCode: "", lastNsu: "0", maxNsu: "0", nextAllowedAt: null,
  enableNfce: false, cscId: "", statusServiceUrl: "", beneficiaryCode: "", oauthUrl: "", oauthAuthMethod: "basic", apiBaseUrl: "", scopes: "",
  redirectUri: "", accountId: "", partnerCode: "",
};

const labels: Record<string,string> = {
  active: "Conexão real ativa", external_connected: "Serviço externo respondeu", documents_received: "DF-e sincronizado", no_documents: "DF-e em dia",
  ready_for_external_sync: "Pronto para sincronizar", certificate_validated: "A1 validado neste PC", authorization_required: "Aguardando autorização",
  validation_failed: "Com pendências", external_auth_failed: "Autenticação recusada", external_unreachable: "Sem conexão externa",
  external_response_invalid: "Resposta externa inválida", implementation_required: "Integração ainda bloqueada", configuration_saved: "Teste necessário",
  certificate_required: "Importe o A1 neste PC", not_configured: "Não configurada", rate_limited: "Aguardando janela de consulta",
};

export default function IntegrationsModuleV7({ onClose }: { onClose: () => void }) {
  const bridge = (window as any).sevenDesktop;
  const [connections, setConnections] = useState<Connection[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [localInfo, setLocalInfo] = useState<Record<string,SecretInfo>>({});
  const [selected, setSelected] = useState<Definition|null>(null);
  const [config, setConfig] = useState<Record<string,any>>(baseConfig);
  const [certificateId, setCertificateId] = useState("");
  const [clientId, setClientId] = useState(""); const [clientSecret, setClientSecret] = useState("");
  const [cscToken, setCscToken] = useState(""); const [pfxPassword, setPfxPassword] = useState("");
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false);
  const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [group, setGroup] = useState<"Todos"|Definition["group"]>("Todos");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/integrations"); const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível carregar integrações.");
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
  const connectionFor = (id: string) => connections.find((item) => item.connector === id && (item.environment === config.environment || !selected || selected.id !== id)) || connections.find((item) => item.connector === id);
  const localFor = (id: string) => localInfo[id] || { stored: [] };

  const open = async (definition: Definition) => {
    const existing = connections.find((item) => item.connector === definition.id);
    const saved = existing?.configuration || {};
    let info = localFor(definition.id); if (bridge?.integrationSecretsStatus) info = await bridge.integrationSecretsStatus(definition.id);
    setSelected(definition); setConfig({ ...baseConfig, ...saved, environment: existing?.environment || saved.environment || "homologation" });
    setCertificateId(info.certificateId || ""); setClientId(""); setClientSecret(""); setCscToken(""); setPfxPassword(""); setError(""); setNotice("");
    setLocalInfo((current) => ({ ...current, [definition.id]: info }));
  };

  const importCertificate = async () => {
    if (!bridge?.certificateImport || !selected) return setError("Importação de certificado disponível somente no desktop.");
    setSaving(true); setError("");
    try {
      const result = await bridge.certificateImport({ passphrase: pfxPassword }); if (result?.canceled) return;
      const cert = result.certificate as Certificate; setCertificates((rows) => [...rows.filter((item) => item.id !== cert.id), cert]);
      setCertificateId(cert.id); setPfxPassword("");
      await bridge.integrationSecretsSet(selected.id, { certificateId: cert.id, localValidationStatus: "configuration_saved", localValidationMessage: "Novo A1 vinculado; valide a integração novamente.", localValidatedAt: new Date().toISOString() });
      const info = await bridge.integrationSecretsStatus(selected.id); setLocalInfo((current) => ({ ...current, [selected.id]: info }));
      setNotice(`Certificado ${cert.originalName} importado e protegido pelo sistema operacional.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível importar o certificado."); }
    finally { setSaving(false); }
  };

  const persistLocal = async () => {
    if (!selected || !bridge?.integrationSecretsSet) return localFor(selected?.id || "");
    const patch: Record<string, any> = {};
    if (selected.credential === "pfx") patch.certificateId = certificateId || null;
    if (selected.id === "nfe_sefaz" && cscToken) patch.cscToken = cscToken;
    if (["oauth-client","btg-oauth"].includes(selected.credential)) {
      if ((clientId && !clientSecret) || (!clientId && clientSecret)) throw new Error("Informe Client ID e Client Secret juntos para substituir as credenciais.");
      if (clientId && clientSecret) { patch.clientId = clientId; patch.clientSecret = clientSecret; }
    }
    await bridge.integrationSecretsSet(selected.id, patch);
    return bridge.integrationSecretsStatus(selected.id);
  };

  const saveGlobal = async (info: SecretInfo) => {
    if (!selected) return;
    const credentialReference = selected.credential === "pfx" ? "per-device-a1" : (info.stored?.includes("clientSecret") ? "per-device-secure-vault" : "");
    const configuration = { ...config, primaryReference: config.cnpj || config.accountId || config.beneficiaryCode || config.partnerCode || "configured", secondaryReference: config.stateRegistration || config.municipalRegistration || config.uf || config.environment || "configured" };
    const response = await fetch("/api/integrations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "save", connector: selected.id, environment: config.environment, credentialReference, configuration }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || "Não foi possível salvar a integração.");
  };

  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!selected) return; setSaving(true); setError(""); setNotice("");
    try {
      let info = await persistLocal(); await saveGlobal(info);
      info = await bridge.integrationSecretsSet(selected.id, { localValidationStatus: selected.credential === "pfx" && !info.certificateId ? "certificate_required" : "configuration_saved", localValidationMessage: selected.id === "nfe_distribution" ? "Configuração salva. Use Sincronizar DF-e para consultar o Ambiente Nacional." : "Configuração alterada; execute o teste externo.", localValidatedAt: new Date().toISOString() });
      setLocalInfo((current) => ({ ...current, [selected.id]: info })); setClientId(""); setClientSecret(""); setCscToken(""); await load();
      setNotice("Configuração salva. Salvar não significa ativar a integração.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Falha ao salvar integração."); }
    finally { setSaving(false); }
  };

  const test = async () => {
    if (!selected || !bridge?.integrationTest) return setError("Teste externo disponível somente no desktop.");
    setSaving(true); setError(""); setNotice("");
    try {
      let info = await persistLocal(); await saveGlobal(info);
      const result = await bridge.integrationTest({ connector: selected.id, environment: config.environment, configuration: { ...config, certificateId: info.certificateId || "" } });
      info = await bridge.integrationSecretsSet(selected.id, { localValidationStatus: result.status || "validation_failed", localValidationMessage: result.message || "Validação concluída.", localValidatedAt: result.checkedAt || new Date().toISOString() });
      setLocalInfo((current) => ({ ...current, [selected.id]: info })); await load();
      if (result.ok) setNotice(result.message || "Conexão externa validada."); else setError([result.message, ...(result.blockers || [])].filter(Boolean).join(" · "));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Falha no teste externo."); }
    finally { setSaving(false); }
  };

  const syncDfe = async () => {
    if (!selected || selected.id !== "nfe_distribution" || !bridge?.dfeSync) return;
    setSaving(true); setError(""); setNotice("");
    try {
      let info = await persistLocal(); await saveGlobal(info);
      const result = await bridge.dfeSync({ environment: config.environment, maxBatches: 6 });
      info = await bridge.integrationSecretsSet(selected.id, { localValidationStatus: "active", localValidationMessage: `Ambiente Nacional respondeu cStat ${result.cStat}. ${result.importedCount} documento(s) recebido(s).`, localValidatedAt: result.checkedAt || new Date().toISOString() });
      setLocalInfo((current) => ({ ...current, [selected.id]: info }));
      setConfig((current) => ({ ...current, lastNsu: result.lastNsu, maxNsu: result.maxNsu, nextAllowedAt: result.nextAllowedAt || null }));
      await load(); setNotice(`Sincronização real concluída: ${result.importedCount} documento(s), cStat ${result.cStat}.`);
    } catch (caught: any) {
      setError(`${caught instanceof Error ? caught.message : "Falha na distribuição DF-e."}${caught?.nextAllowedAt ? ` Próxima consulta: ${new Date(caught.nextAllowedAt).toLocaleString("pt-BR")}.` : ""}`);
    } finally { setSaving(false); }
  };

  const statusOf = (definition: Definition) => {
    const info = localFor(definition.id); if (info.localValidationStatus) return info.localValidationStatus;
    if (definition.credential === "pfx" && connections.some((item) => item.connector === definition.id) && !info.certificateId) return "certificate_required";
    return connections.some((item) => item.connector === definition.id) ? "configuration_saved" : "not_configured";
  };
  const tone = (status: string) => ["active","external_connected","documents_received","no_documents","certificate_validated"].includes(status) ? "active" : status.includes("failed") || status.includes("invalid") || ["external_unreachable","certificate_required","implementation_required","rate_limited"].includes(status) ? "error" : status === "not_configured" ? "off" : "saved";

  return <div className="enhanced-module integrations-v3">
    <header className="enhanced-header"><div><span className="enhanced-kicker">Administração · integrações de produção</span><h1>Central de integrações</h1><p>Uma integração só aparece como ativa depois de uma resposta externa real. Credenciais sensíveis permanecem no computador.</p></div><div className="enhanced-actions"><button className="enhanced-secondary" onClick={onClose}>Voltar ao ERP</button><button className="enhanced-secondary" onClick={() => void load()}>Atualizar</button></div></header>
    <div className="core-independence-banner"><strong>Sem falso positivo</strong><span>A1, senha, CSC e Client Secret usam o cofre do sistema operacional. Integrações ainda não concluídas ficam explicitamente bloqueadas.</span></div>
    {error && !selected && <div className="enhanced-alert error">{error}</div>}
    <div className="integration-tabs">{(["Todos","Fiscal","Bancos e cobrança","Certificados"] as const).map((item) => <button key={item} className={group === item ? "active" : ""} onClick={() => setGroup(item)}>{item}</button>)}</div>
    <section className="integration-catalog-v2">{visible.map((definition) => { const status = statusOf(definition); return <article className="integration-card-v2" key={definition.id}><div className="integration-card-top"><span className="integration-provider-mark">{definition.title.replace(/[^A-Za-zÀ-ÿ]/g,"").slice(0,2).toUpperCase()}</span><div><span className="integration-group">{definition.group}</span><h2>{definition.title}</h2><small>{definition.provider}</small></div><b className={`integration-state ${tone(status)}`}>{loading ? "Carregando" : labels[status] || status}</b></div><p>{definition.description}</p>{localFor(definition.id).localValidationMessage && <div className="integration-use"><strong>Status deste computador</strong><span>{localFor(definition.id).localValidationMessage}</span></div>}<footer><a href={definition.docs} target="_blank" rel="noreferrer">Documentação oficial</a><button onClick={() => void open(definition)}>{connections.some((item) => item.connector === definition.id) ? "Gerenciar" : "Configurar"}</button></footer></article>; })}</section>

    {selected && <div className="enhanced-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}><form className="enhanced-modal integration-config-v3" onSubmit={save}>
      <div className="enhanced-modal-title"><div><span>{selected.group.toUpperCase()}</span><h2>{selected.title}</h2><p>{selected.provider}</p></div><button type="button" onClick={() => setSelected(null)}>×</button></div>
      {error && <div className="enhanced-alert error modal-alert">{error}</div>}{notice && <div className="enhanced-alert success modal-alert">{notice}</div>}
      <div className="form-grid two">
        <label><span>Ambiente</span><select value={config.environment} onChange={(e) => setConfig({ ...config, environment: e.target.value })}><option value="homologation">Homologação / produção restrita</option><option value="production">Produção</option></select></label>
        {selected.credential === "pfx" && <><label><span>Certificado A1 deste computador</span><select value={certificateId} onChange={(e) => setCertificateId(e.target.value)}><option value="">Nenhum A1 vinculado</option>{certificates.map((cert) => <option key={cert.id} value={cert.id}>{cert.originalName} · {cert.sha256.slice(0,10)}</option>)}</select></label><label><span>Senha do novo PFX/P12</span><input type="password" value={pfxPassword} onChange={(e) => setPfxPassword(e.target.value)} placeholder="Somente para importar" /></label><label><span>Adicionar certificado</span><button type="button" className="enhanced-secondary" onClick={() => void importCertificate()} disabled={saving}>Selecionar PFX/P12</button></label><label><span>CNPJ</span><input value={config.cnpj || ""} onChange={(e) => setConfig({ ...config, cnpj: e.target.value })} placeholder="Vazio = cadastro da empresa" /></label></>}

        {selected.id === "nfe_sefaz" && <><label><span>Inscrição Estadual</span><input value={config.stateRegistration || ""} onChange={(e) => setConfig({ ...config, stateRegistration: e.target.value })}/></label><label><span>UF</span><input maxLength={2} value={config.uf || "RS"} onChange={(e) => setConfig({ ...config, uf: e.target.value.toUpperCase() })}/></label><label className="full"><span>URL NFeStatusServico4</span><input value={config.statusServiceUrl || ""} onChange={(e) => setConfig({ ...config, statusServiceUrl: e.target.value })} placeholder="https://.../NFeStatusServico4.asmx"/></label><label className="checkbox-line"><input type="checkbox" checked={Boolean(config.enableNfce)} onChange={(e) => setConfig({ ...config, enableNfce: e.target.checked })}/><span>Configurar NFC-e modelo 65</span></label>{config.enableNfce && <><label><span>ID CSC</span><input value={config.cscId || ""} onChange={(e) => setConfig({ ...config, cscId: e.target.value })}/></label><label className="full"><span>CSC/Token local</span><input type="password" value={cscToken} onChange={(e) => setCscToken(e.target.value)} placeholder={localFor(selected.id).stored?.includes("cscToken") ? "Já salvo — preencha para substituir" : "Token fornecido pela SEFAZ"}/></label></>}</>}

        {selected.id === "nfse_national" && <><label><span>Inscrição Municipal</span><input value={config.municipalRegistration || ""} onChange={(e) => setConfig({ ...config, municipalRegistration: e.target.value })}/></label><label><span>Código IBGE</span><input value={config.cityCode || ""} onChange={(e) => setConfig({ ...config, cityCode: e.target.value })}/></label><label className="full"><span>Base URL SEFIN (opcional)</span><input value={config.apiBaseUrl || ""} onChange={(e) => setConfig({ ...config, apiBaseUrl: e.target.value })} placeholder={config.environment === "production" ? "https://sefin.nfse.gov.br/SefinNacional" : "https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional"}/></label></>}

        {selected.id === "nfe_distribution" && <><label><span>UF</span><input maxLength={2} value={config.uf || "RS"} onChange={(e) => setConfig({ ...config, uf: e.target.value.toUpperCase() })}/></label><label><span>Último NSU</span><input value={config.lastNsu || "0"} onChange={(e) => setConfig({ ...config, lastNsu: e.target.value.replace(/\D/g, "") })}/></label><label className="full"><span>Endpoint NFeDistribuicaoDFe (opcional)</span><input value={config.apiBaseUrl || ""} onChange={(e) => setConfig({ ...config, apiBaseUrl: e.target.value })} placeholder={config.environment === "production" ? "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx" : "https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx"}/><small>Vazio = endpoint oficial do Ambiente Nacional. O cursor NSU é atualizado após cada resposta válida.</small></label>{config.nextAllowedAt && <div className="integration-validation full"><strong>Controle de consumo</strong><span>Próxima consulta permitida após {new Date(config.nextAllowedAt).toLocaleString("pt-BR")}</span></div>}</>}

        {["cte_received","mdfe_received"].includes(selected.id) && <><label><span>Último NSU conhecido</span><input value={config.lastNsu || "0"} onChange={(e) => setConfig({ ...config, lastNsu: e.target.value.replace(/\D/g, "") })}/></label><div className="enhanced-alert error full">Conector ainda bloqueado: nenhuma consulta externa será simulada.</div></>}

        {selected.credential === "oauth-client" && <><label><span>Client ID local</span><input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder={localFor(selected.id).stored?.includes("clientId") ? "Já salvo — preencha para substituir" : "Client ID"}/></label><label><span>Client Secret local</span><input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder={localFor(selected.id).stored?.includes("clientSecret") ? "Já salvo — preencha para substituir" : "Client Secret"}/></label><label><span>Beneficiário/convênio</span><input value={config.beneficiaryCode || ""} onChange={(e) => setConfig({ ...config, beneficiaryCode: e.target.value })}/></label><label><span>OAuth</span><select value={config.oauthAuthMethod || "basic"} onChange={(e) => setConfig({ ...config, oauthAuthMethod: e.target.value })}><option value="basic">HTTP Basic</option><option value="body">Credenciais no corpo</option></select></label><label className="full"><span>Endpoint OAuth2</span><input value={config.oauthUrl || ""} onChange={(e) => setConfig({ ...config, oauthUrl: e.target.value })}/></label><label className="full"><span>Base URL API</span><input value={config.apiBaseUrl || ""} onChange={(e) => setConfig({ ...config, apiBaseUrl: e.target.value })}/></label><label className="full"><span>Scopes</span><input value={config.scopes || ""} onChange={(e) => setConfig({ ...config, scopes: e.target.value })}/></label></>}

        {selected.credential === "btg-oauth" && <><label><span>Client ID local</span><input value={clientId} onChange={(e) => setClientId(e.target.value)}/></label><label><span>Client Secret local</span><input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)}/></label><label className="full"><span>Redirect URI</span><input value={config.redirectUri || ""} onChange={(e) => setConfig({ ...config, redirectUri: e.target.value })}/></label><label><span>Account ID</span><input value={config.accountId || ""} onChange={(e) => setConfig({ ...config, accountId: e.target.value })}/></label><label><span>Scopes</span><input value={config.scopes || ""} onChange={(e) => setConfig({ ...config, scopes: e.target.value })}/></label><div className="enhanced-alert error full">Authorization Code/consentimento ainda precisa ser concluído antes da ativação.</div></>}

        {selected.credential === "partner" && <><label><span>Código AR/parceiro</span><input value={config.partnerCode || ""} onChange={(e) => setConfig({ ...config, partnerCode: e.target.value })}/></label><label className="full"><span>Base URL API</span><input value={config.apiBaseUrl || ""} onChange={(e) => setConfig({ ...config, apiBaseUrl: e.target.value })}/></label><div className="enhanced-alert error full">A integração só será ativada após uma chamada autenticada definida pelo contrato do parceiro.</div></>}
      </div>

      {localFor(selected.id).localValidationMessage && <div className={`integration-validation ${tone(String(localFor(selected.id).localValidationStatus)) === "error" ? "bad" : "good"}`}><strong>Status deste computador</strong><span>{localFor(selected.id).localValidationMessage}</span>{localFor(selected.id).localValidatedAt && <small>{new Date(localFor(selected.id).localValidatedAt!).toLocaleString("pt-BR")}</small>}</div>}
      <div className="enhanced-modal-footer"><small>Salvar ≠ ativar. Ativo exige resposta externa real.</small><div>{selected.id === "nfe_distribution" ? <button type="button" className="enhanced-secondary" onClick={() => void syncDfe()} disabled={saving}>{saving ? "Consultando..." : "Sincronizar DF-e"}</button> : <button type="button" className="enhanced-secondary" onClick={() => void test()} disabled={saving}>Testar configuração</button>}<button className="enhanced-primary" disabled={saving}>{saving ? "Salvando..." : "Salvar configuração"}</button></div></div>
    </form></div>}
  </div>;
}
