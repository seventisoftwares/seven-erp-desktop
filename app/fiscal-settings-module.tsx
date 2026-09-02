"use client";

import { useEffect, useMemo, useState } from "react";
import "./fiscal-settings.css";

type Tab = "certificate" | "nfe" | "nfce" | "nfse" | "danfe" | "audit";
type Cert = { id: string; originalName?: string; importedAt?: string; validatedLocally?: boolean; sha256?: string; type?: string };

const tabs: Array<{ id: Tab; label: string; subtitle: string }> = [
  { id: "certificate", label: "Certificado Digital", subtitle: "A1 e cofre local" },
  { id: "nfe", label: "Configurações NF-e", subtitle: "Modelo 55 · SEFAZ" },
  { id: "nfce", label: "Configurações NFC-e", subtitle: "Modelo 65 · CSC" },
  { id: "nfse", label: "Configurações NFS-e", subtitle: "Providers e município" },
  { id: "danfe", label: "DANFE", subtitle: "Impressão e visualização" },
  { id: "audit", label: "Auditoria", subtitle: "Alterações fiscais" },
];

function api() { return typeof window !== "undefined" ? (window as any).sevenDesktop : null; }
const cleanError = (error: unknown) => error instanceof Error ? error.message : "Operação não concluída.";

export default function FiscalSettingsModule({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("certificate");
  const [configs, setConfigs] = useState<any>({ nfe: {}, nfce: {}, nfse: {}, danfe: {} });
  const [certs, setCerts] = useState<Cert[]>([]);
  const [certificateId, setCertificateId] = useState("");
  const [company, setCompany] = useState<any>({ state: "RS", taxId: "", stateRegistration: "", cityCode: "", taxRegime: "simples_nacional" });
  const [audit, setAudit] = useState<any[]>([]);
  const [sidecar, setSidecar] = useState<any>(null);
  const [csc, setCsc] = useState("");
  const [nfseToken, setNfseToken] = useState("");
  const [secretStatus, setSecretStatus] = useState<any>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const flash = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(""), 3200); };
  const load = async () => {
    const bridge = api(); if (!bridge) return;
    try {
      const [nfe, nfce, nfse, danfe, certificates, status, logs] = await Promise.all([
        bridge.fiscalConfigGet?.("nfe"), bridge.fiscalConfigGet?.("nfce"), bridge.fiscalConfigGet?.("nfse"), bridge.fiscalConfigGet?.("danfe"), bridge.certificatesList?.(), bridge.reportingStatus?.(), bridge.fiscalConfigAudit?.(100),
      ]);
      setConfigs({ nfe: nfe || {}, nfce: nfce || {}, nfse: nfse || {}, danfe: danfe || {} });
      setCerts(Array.isArray(certificates) ? certificates : []); if (!certificateId && certificates?.[0]?.id) setCertificateId(certificates[0].id);
      setSidecar(status || null); setAudit(Array.isArray(logs) ? logs : []);
      if (bridge.apiRequest) {
        const response = await bridge.apiRequest("/api/company", { method: "GET" });
        if (response?.ok) { const data = JSON.parse(response.body || "{}"); const c = data.company || data.organization || data; setCompany({ state: c.state || "RS", taxId: c.taxId || "", stateRegistration: c.stateRegistration || "", cityCode: c.cityCode || "", taxRegime: c.taxRegime || "simples_nacional" }); }
      }
      const [nfceSecret, nfseSecret] = await Promise.all([bridge.integrationSecretsStatus?.("fiscal_nfce_csc"), bridge.integrationSecretsStatus?.("fiscal_nfse")]);
      setSecretStatus({ nfce: nfceSecret, nfse: nfseSecret });
    } catch (error) { flash(cleanError(error)); }
  };
  useEffect(() => { void load(); }, []);

  const patch = (section: "nfe" | "nfce" | "nfse" | "danfe", key: string, value: any) => setConfigs((current: any) => ({ ...current, [section]: { ...current[section], [key]: value } }));
  const saveSection = async (section: "nfe" | "nfce" | "nfse" | "danfe") => {
    const bridge = api(); if (!bridge?.fiscalConfigSet) return flash("Configurações fiscais disponíveis apenas no aplicativo desktop.");
    setBusy(true); try { const saved = await bridge.fiscalConfigSet(section, configs[section], "desktop-user"); setConfigs((current: any) => ({ ...current, [section]: saved })); await load(); flash("Configuração fiscal salva e registrada na auditoria."); } catch (error) { flash(cleanError(error)); } finally { setBusy(false); }
  };
  const importCertificate = async () => {
    const bridge = api(); if (!bridge?.certificateImport) return; const passphrase = window.prompt("Digite a senha do certificado A1. Ela será protegida pelo cofre do sistema operacional e não será salva em texto puro.", ""); if (passphrase === null) return;
    setBusy(true); try { const result = await bridge.certificateImport({ passphrase }); if (!result?.canceled) { await load(); if (result?.certificate?.id) setCertificateId(result.certificate.id); flash("Certificado importado e protegido no cofre local."); } } catch (error) { flash(cleanError(error)); } finally { setBusy(false); }
  };
  const removeCertificate = async (id: string) => { if (!window.confirm("Remover este certificado do cofre deste computador?")) return; setBusy(true); try { await api()?.certificateRemove?.(id); await load(); flash("Certificado removido deste computador."); } catch (error) { flash(cleanError(error)); } finally { setBusy(false); } };
  const saveCsc = async () => { if (!csc.trim()) return flash("Informe o CSC."); setBusy(true); try { await api()?.integrationSecretsSet?.("fiscal_nfce_csc", { csc: csc.trim() }); setCsc(""); await load(); flash("CSC protegido no cofre do sistema operacional."); } catch (error) { flash(cleanError(error)); } finally { setBusy(false); } };
  const saveNfseSecret = async () => { if (!nfseToken.trim()) return flash("Informe a credencial/token do provedor NFS-e."); setBusy(true); try { await api()?.integrationSecretsSet?.("fiscal_nfse", { token: nfseToken.trim() }); setNfseToken(""); await load(); flash("Credencial NFS-e protegida no cofre."); } catch (error) { flash(cleanError(error)); } finally { setBusy(false); } };
  const testSefaz = async (model: "55" | "65") => {
    if (!certificateId) return flash("Selecione um certificado A1."); const bridge = api(); if (!bridge?.fiscalZeus) return flash("Sidecar fiscal indisponível.");
    const section = model === "55" ? configs.nfe : configs.nfce;
    setBusy(true); try {
      const result = await bridge.fiscalZeus(model === "55" ? "nfe.status" : "nfce.status", { certificateId, environment: section.environment === "production" ? 1 : 2, model, series: Number(section.series || 1), timeoutMilliseconds: 60000, company });
      flash(result?.success ? `SEFAZ operacional: ${result.message || "cStat 107"}` : `SEFAZ respondeu: ${result?.code || ""} ${result?.message || result?.status || ""}`);
    } catch (error) { flash(cleanError(error)); } finally { setBusy(false); }
  };
  const testNfseProvider = async () => {
    const cfg = configs.nfse; if (!cfg.baseUrl) return flash("Informe a URL do ambiente do provider NFS-e antes do teste.");
    flash("Configuração do provider salva. A transmissão real exige dados de uma NFS-e/RPS válida e credencial do município/ambiente.");
  };

  const statusText = useMemo(() => sidecar?.installed ? `Sidecar .NET ativo · ${sidecar.runtime || "runtime integrado"}` : `Sidecar .NET: ${sidecar?.error || "não detectado"}`, [sidecar]);

  return <div className="fiscal-settings">
    <header className="fiscal-settings-head"><div><button onClick={onClose}>←</button><span className="fiscal-mark">FISCAL</span><div><strong>Configurações Fiscais</strong><small>Seven ERP · Zeus DFe.NET · credenciais protegidas</small></div></div><div className={sidecar?.installed ? "runtime ok" : "runtime warning"}>{statusText}</div></header>
    <div className="fiscal-settings-body">
      <aside>{tabs.map((item) => <button key={item.id} onClick={() => setTab(item.id)} className={tab === item.id ? "active" : ""}><strong>{item.label}</strong><small>{item.subtitle}</small></button>)}</aside>
      <main>{notice && <div className="fiscal-notice">{notice}</div>}
        {tab === "certificate" && <section><Title title="Certificado Digital" text="O PFX e a senha ficam criptografados pelo cofre do Windows/macOS. O banco guarda apenas referência e metadados."/><div className="fiscal-actions"><button className="primary" onClick={importCertificate} disabled={busy}>Importar certificado A1 (.pfx/.p12)</button></div><div className="certificate-grid">{certs.length ? certs.map((cert) => <article key={cert.id}><div className="cert-icon">A1</div><div><strong>{cert.originalName || "Certificado A1"}</strong><small>{cert.type || "PKCS#12"} · importado {cert.importedAt ? new Date(cert.importedAt).toLocaleDateString("pt-BR") : "localmente"}</small><code>{cert.sha256?.slice(0, 18)}…</code></div><div><label><input type="radio" checked={certificateId === cert.id} onChange={() => setCertificateId(cert.id)}/> Usar</label><button onClick={() => void removeCertificate(cert.id)}>Remover</button></div></article>) : <Empty text="Nenhum certificado A1 importado neste computador."/>}</div><div className="info-card"><strong>A3</strong><p>O fluxo foi preparado para suporte via repositório/provedor do sistema operacional quando o dispositivo A3 e o driver do fabricante expuserem a chave privada de forma compatível. Não há fallback silencioso para certificado inválido.</p></div></section>}

        {tab === "nfe" && <section><Title title="NF-e · Modelo 55" text="Numeração, ambiente e parâmetros básicos. XML/XSD, assinatura e transmissão são tratados pelo motor fiscal; nenhuma senha é armazenada aqui."/><FormGrid>
          <Field label="Ambiente"><select value={configs.nfe.environment || "homologation"} onChange={(e) => patch("nfe", "environment", e.target.value)}><option value="homologation">Homologação</option><option value="production">Produção</option></select></Field>
          <Field label="UF"><input maxLength={2} value={configs.nfe.uf || "RS"} onChange={(e) => patch("nfe", "uf", e.target.value.toUpperCase())}/></Field><Field label="Série"><input value={configs.nfe.series || "1"} onChange={(e) => patch("nfe", "series", e.target.value)}/></Field><Field label="Próximo número"><input type="number" min="1" value={configs.nfe.nextNumber || 1} onChange={(e) => patch("nfe", "nextNumber", Number(e.target.value))}/></Field>
          <Field label="CRT"><select value={configs.nfe.crt || "1"} onChange={(e) => patch("nfe", "crt", e.target.value)}><option value="1">1 · Simples Nacional</option><option value="2">2 · Simples excesso</option><option value="3">3 · Regime Normal</option><option value="4">4 · MEI</option></select></Field><Field label="CFOP padrão"><input value={configs.nfe.defaultCfop || ""} onChange={(e) => patch("nfe", "defaultCfop", e.target.value)}/></Field><Field wide label="Natureza da operação"><input value={configs.nfe.natureOperation || ""} onChange={(e) => patch("nfe", "natureOperation", e.target.value)}/></Field>
          <Field label="Indicador de presença"><input value={configs.nfe.presenceIndicator || "9"} onChange={(e) => patch("nfe", "presenceIndicator", e.target.value)}/></Field><Field label="Contingência"><select value={configs.nfe.contingency || "normal"} onChange={(e) => patch("nfe", "contingency", e.target.value)}><option value="normal">Normal</option><option value="svc_an">SVC-AN</option><option value="svc_rs">SVC-RS</option><option value="epec">EPEC</option></select></Field>
        </FormGrid><FooterActions><button onClick={() => void testSefaz("55")} disabled={busy}>Testar Status SEFAZ</button><button className="primary" onClick={() => void saveSection("nfe")} disabled={busy}>Salvar NF-e</button></FooterActions></section>}

        {tab === "nfce" && <section><Title title="NFC-e · Modelo 65" text="Configuração para impressão térmica, CSC e contingência offline quando legalmente aplicável. O CSC é guardado separadamente no cofre."/><FormGrid>
          <Field label="Ambiente"><select value={configs.nfce.environment || "homologation"} onChange={(e) => patch("nfce", "environment", e.target.value)}><option value="homologation">Homologação</option><option value="production">Produção</option></select></Field><Field label="UF"><input maxLength={2} value={configs.nfce.uf || "RS"} onChange={(e) => patch("nfce", "uf", e.target.value.toUpperCase())}/></Field><Field label="Série"><input value={configs.nfce.series || "1"} onChange={(e) => patch("nfce", "series", e.target.value)}/></Field><Field label="Próximo número"><input type="number" min="1" value={configs.nfce.nextNumber || 1} onChange={(e) => patch("nfce", "nextNumber", Number(e.target.value))}/></Field><Field label="ID Token / cIdToken"><input value={configs.nfce.cscId || ""} onChange={(e) => patch("nfce", "cscId", e.target.value)}/></Field><Field label="Papel"><select value={configs.nfce.printWidthMm || 80} onChange={(e) => patch("nfce", "printWidthMm", Number(e.target.value))}><option value={80}>80 mm</option><option value={58}>58 mm</option></select></Field><Field wide label={`CSC ${secretStatus.nfce?.configured ? "· já protegido no cofre" : ""}`}><div className="secret-row"><input type="password" autoComplete="new-password" value={csc} onChange={(e) => setCsc(e.target.value)} placeholder="Digite apenas para gravar/substituir"/><button onClick={saveCsc}>Salvar no cofre</button></div></Field><Field wide label="Contingência"><select value={configs.nfce.contingency || "offline_when_legal"} onChange={(e) => patch("nfce", "contingency", e.target.value)}><option value="offline_when_legal">Offline quando legalmente aplicável</option><option value="normal">Somente normal</option></select></Field>
        </FormGrid><FooterActions><button onClick={() => void testSefaz("65")} disabled={busy}>Testar Status NFC-e</button><button className="primary" onClick={() => void saveSection("nfce")} disabled={busy}>Salvar NFC-e</button></FooterActions></section>}

        {tab === "nfse" && <section><Title title="NFS-e" text="Regras municipais ficam encapsuladas nos providers. O ERP não espalha regras de prefeitura pelas telas."/><FormGrid>
          <Field label="Provider"><select value={configs.nfse.provider || "padrao_nacional"} onChange={(e) => patch("nfse", "provider", e.target.value)}><option value="padrao_nacional">Padrão Nacional</option><option value="acbr">ACBrLib compilada dos fontes</option><option value="municipal">Provider Municipal</option></select></Field><Field label="Ambiente"><select value={configs.nfse.environment || "homologation"} onChange={(e) => patch("nfse", "environment", e.target.value)}><option value="homologation">Homologação</option><option value="production">Produção</option></select></Field><Field label="Código IBGE município"><input value={configs.nfse.municipalityCode || ""} onChange={(e) => patch("nfse", "municipalityCode", e.target.value)}/></Field><Field label="CNAE"><input value={configs.nfse.cnae || ""} onChange={(e) => patch("nfse", "cnae", e.target.value)}/></Field><Field label="Código de serviço"><input value={configs.nfse.serviceCode || ""} onChange={(e) => patch("nfse", "serviceCode", e.target.value)}/></Field><Field label="Série RPS"><input value={configs.nfse.rpsSeries || "1"} onChange={(e) => patch("nfse", "rpsSeries", e.target.value)}/></Field><Field label="Alíquota ISS %"><input type="number" step="0.01" value={configs.nfse.issRate || 0} onChange={(e) => patch("nfse", "issRate", Number(e.target.value))}/></Field><Field wide label="URL do ambiente/provider"><input value={configs.nfse.baseUrl || ""} onChange={(e) => patch("nfse", "baseUrl", e.target.value)} placeholder="Endpoint configurado para o município/Padrão Nacional"/></Field><Field wide label={`Credencial do provider ${secretStatus.nfse?.configured ? "· protegida" : ""}`}><div className="secret-row"><input type="password" value={nfseToken} onChange={(e) => setNfseToken(e.target.value)} placeholder="Token/chave, quando exigido"/><button onClick={saveNfseSecret}>Salvar no cofre</button></div></Field>
        </FormGrid><FooterActions><button onClick={testNfseProvider}>Validar configuração</button><button className="primary" onClick={() => void saveSection("nfse")} disabled={busy}>Salvar NFS-e</button></FooterActions></section>}

        {tab === "danfe" && <section><Title title="DANFE" text="O DANFE é sempre derivado do XML fiscal autorizado. O usuário pode configurar impressão, mas não mover campos fiscais obrigatórios."/><FormGrid><Field label="Orientação"><select value={configs.danfe.orientation || "portrait"} onChange={(e) => patch("danfe", "orientation", e.target.value)}><option value="portrait">Retrato</option><option value="landscape">Paisagem</option></select></Field><Field label="Número de vias"><input type="number" min="1" max="5" value={configs.danfe.copies || 1} onChange={(e) => patch("danfe", "copies", Number(e.target.value))}/></Field><Field wide label="Impressora padrão"><input value={configs.danfe.printer || ""} onChange={(e) => patch("danfe", "printer", e.target.value)} placeholder="Vazio = impressora padrão do sistema"/></Field><Check label="Visualizar antes de imprimir" checked={configs.danfe.previewBeforePrint !== false} onChange={(value) => patch("danfe", "previewBeforePrint", value)}/><Check label="Imprimir automaticamente após autorização" checked={Boolean(configs.danfe.autoPrintAfterAuthorization)} onChange={(value) => patch("danfe", "autoPrintAfterAuthorization", value)}/><Field wide label="Informações adicionais permitidas"><textarea value={configs.danfe.additionalInfo || ""} onChange={(e) => patch("danfe", "additionalInfo", e.target.value)}/></Field></FormGrid><div className="info-card"><strong>Proteção fiscal</strong><p>XML autorizado é o documento principal e permanece imutável. O PDF/DANFE é uma representação auxiliar e pode ser regenerado a partir do XML.</p></div><FooterActions><span/><button className="primary" onClick={() => void saveSection("danfe")} disabled={busy}>Salvar DANFE</button></FooterActions></section>}

        {tab === "audit" && <section><Title title="Auditoria Fiscal" text="Alterações das configurações ficam registradas com data, seção e origem. Eventos de documentos fiscais permanecem no armazenamento fiscal dedicado."/><div className="audit-list">{audit.length ? audit.map((item) => <article key={item.id}><span>{new Date(item.createdAt).toLocaleString("pt-BR")}</span><strong>{item.section?.toUpperCase()}</strong><p>{item.event === "fiscal_configuration_changed" ? "Configuração fiscal alterada" : item.event}</p><small>{item.actor}</small></article>) : <Empty text="Nenhuma alteração fiscal registrada."/>}</div></section>}
      </main>
    </div>
  </div>;
}

function Title({ title, text }: { title: string; text: string }) { return <div className="fiscal-title"><span>CONFIGURAÇÕES</span><h2>{title}</h2><p>{text}</p></div>; }
function FormGrid({ children }: { children: React.ReactNode }) { return <div className="fiscal-form-grid">{children}</div>; }
function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) { return <label className={wide ? "wide" : ""}><span>{label}</span>{children}</label>; }
function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <label className="fiscal-check"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}/><span>{label}</span></label>; }
function FooterActions({ children }: { children: React.ReactNode }) { return <div className="fiscal-footer-actions">{children}</div>; }
function Empty({ text }: { text: string }) { return <div className="fiscal-empty">{text}</div>; }
