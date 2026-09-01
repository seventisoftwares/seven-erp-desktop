"use client";

import { useEffect, useMemo, useState } from "react";

type ReceivedDfe = {
  accessKey: string; nsu?: string | null; schema?: string | null; model?: string | null;
  issuerTaxId?: string | null; issuerName?: string | null; issueDate?: string | null;
  totalCents?: number; environment?: string; storedAt?: string; bytes?: number;
  manifestationStatus?: string;
};

type SyncResult = {
  importedCount: number; batches: number; cStat: string; message?: string; lastNsu: string; maxNsu: string;
  moreAvailable?: boolean; nextAllowedAt?: string | null; checkedAt?: string;
};

const money = (cents = 0) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((Number(cents) || 0) / 100);
const shortKey = (value = "") => value.length === 44 ? `${value.slice(0, 8)}…${value.slice(-8)}` : value;

export default function DfeReceivedModule({ onClose }: { onClose: () => void }) {
  const bridge = (window as any).sevenDesktop;
  const [documents, setDocuments] = useState<ReceivedDfe[]>([]);
  const [environment, setEnvironment] = useState<"homologation" | "production">("homologation");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lastSync, setLastSync] = useState<SyncResult | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      if (!bridge?.dfeList) throw new Error("Atualize o aplicativo desktop: o módulo DF-e local não está disponível.");
      const data = await bridge.dfeList();
      setDocuments(Array.isArray(data?.documents) ? data.documents : []);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível abrir os documentos fiscais recebidos."); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const sync = async () => {
    if (!bridge?.dfeSync) return setError("Sincronização DF-e disponível somente no aplicativo desktop atualizado.");
    setSyncing(true); setError(""); setNotice("");
    try {
      const result = await bridge.dfeSync({ environment, maxBatches: 6 }) as SyncResult;
      setLastSync(result);
      await load();
      const detail = result.importedCount ? `${result.importedCount} documento(s) recebido(s) e armazenado(s).` : "Nenhum documento novo foi recebido.";
      setNotice(`${detail} Ambiente Nacional: cStat ${result.cStat}${result.message ? ` · ${result.message}` : ""}`);
    } catch (caught: any) {
      const extra = caught?.nextAllowedAt ? ` Próxima consulta permitida após ${new Date(caught.nextAllowedAt).toLocaleString("pt-BR")}.` : "";
      setError(`${caught instanceof Error ? caught.message : "Falha na consulta ao Ambiente Nacional."}${extra}`);
    } finally { setSyncing(false); }
  };

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return documents;
    return documents.filter((doc) => [doc.accessKey, doc.issuerName, doc.issuerTaxId, doc.nsu].some((value) => String(value || "").toLowerCase().includes(needle)));
  }, [documents, query]);

  const stats = useMemo(() => ({
    count: documents.length,
    production: documents.filter((doc) => doc.environment === "production").length,
    totalCents: documents.reduce((sum, doc) => sum + (Number(doc.totalCents) || 0), 0),
  }), [documents]);

  return <div className="enhanced-module">
    <header className="enhanced-header">
      <div><span className="enhanced-kicker">Fiscal recebido · Ambiente Nacional NF-e</span><h1>Distribuição DF-e</h1><p>Consulta real por NSU com certificado A1. Os XMLs retornados pelo Ambiente Nacional são descompactados e armazenados localmente neste computador.</p></div>
      <div className="enhanced-actions"><button className="enhanced-secondary" onClick={onClose}>Voltar ao ERP</button><button className="enhanced-secondary" onClick={() => void load()} disabled={loading}>Atualizar lista</button></div>
    </header>

    <div className="core-independence-banner"><strong>Consulta oficial, sem simulação</strong><span>O ERP usa NFeDistribuicaoDFe 1.01, mTLS e o último NSU confirmado. Quando o Ambiente Nacional exige intervalo, o sistema bloqueia novas consultas até o horário permitido.</span></div>

    {error && <div className="enhanced-alert error">{error}</div>}
    {notice && <div className="enhanced-alert success">{notice}</div>}

    <section className="erp-kpi-grid" style={{ marginBottom: 20 }}>
      <article><span>XMLs recebidos</span><strong>{stats.count}</strong><small>armazenados neste computador</small></article>
      <article><span>Produção</span><strong>{stats.production}</strong><small>documentos do ambiente produtivo</small></article>
      <article><span>Valor identificado</span><strong>{money(stats.totalCents)}</strong><small>somatório dos XMLs com vNF</small></article>
      <article><span>Último NSU</span><strong style={{ fontSize: 18 }}>{lastSync?.lastNsu || "—"}</strong><small>{lastSync ? `máximo ${lastSync.maxNsu}` : "após a primeira sincronização"}</small></article>
    </section>

    <section className="enhanced-panel" style={{ marginBottom: 20 }}>
      <div className="enhanced-panel-heading"><div><span>Sincronização</span><h2>Consultar documentos destinados ao CNPJ</h2></div></div>
      <div className="form-grid two">
        <label><span>Ambiente</span><select value={environment} onChange={(event) => setEnvironment(event.target.value as any)}><option value="homologation">Homologação</option><option value="production">Produção</option></select></label>
        <label><span>Operação</span><button type="button" className="enhanced-primary" onClick={() => void sync()} disabled={syncing}>{syncing ? "Consultando Ambiente Nacional..." : "Sincronizar DF-e agora"}</button></label>
      </div>
      {lastSync && <div className="integration-validation good"><strong>Última resposta oficial</strong><span>cStat {lastSync.cStat} · {lastSync.message || "Consulta concluída"}</span><small>{lastSync.checkedAt ? new Date(lastSync.checkedAt).toLocaleString("pt-BR") : ""}{lastSync.nextAllowedAt ? ` · Próxima consulta após ${new Date(lastSync.nextAllowedAt).toLocaleString("pt-BR")}` : ""}</small></div>}
    </section>

    <section className="enhanced-panel">
      <div className="enhanced-panel-heading"><div><span>Documentos locais</span><h2>NF-e recebidas</h2></div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar chave, emitente, CNPJ ou NSU" style={{ minWidth: 300 }} /></div>
      <div style={{ overflowX: "auto" }}>
        <table className="enhanced-table"><thead><tr><th>Emissão</th><th>Emitente</th><th>NF-e</th><th>NSU</th><th>Valor</th><th>Ambiente</th><th>XML</th></tr></thead>
        <tbody>{filtered.length ? filtered.map((doc) => <tr key={`${doc.environment}-${doc.accessKey}`}><td>{doc.issueDate ? new Date(doc.issueDate).toLocaleString("pt-BR") : "—"}</td><td><strong>{doc.issuerName || "Emitente"}</strong><small>{doc.issuerTaxId || ""}</small></td><td title={doc.accessKey}>{shortKey(doc.accessKey)}</td><td>{doc.nsu || "—"}</td><td>{money(doc.totalCents)}</td><td>{doc.environment === "production" ? "Produção" : "Homologação"}</td><td><b className="integration-state active">Armazenado</b></td></tr>) : <tr><td colSpan={7}>{loading ? "Carregando..." : "Nenhum XML recebido neste computador."}</td></tr>}</tbody></table>
      </div>
    </section>
  </div>;
}
