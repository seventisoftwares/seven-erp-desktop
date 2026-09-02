"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import NfeDanfeReferencePreview from "./nfe-danfe-reference-preview";

type AnyRow = Record<string, any>;
type SnapshotMap = Record<string, { payload: AnyRow; savedAt: string }>;
const STORAGE_KEY = "seven:nfe:mirror-snapshots:v1";
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const readSnapshots = (): SnapshotMap => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as SnapshotMap; } catch { return {}; } };
const saveSnapshot = (draftId: string, payload: AnyRow) => { if (!draftId || typeof localStorage === "undefined") return; const current = readSnapshots(); current[draftId] = { payload, savedAt: new Date().toISOString() }; localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(Object.entries(current).sort((a,b) => String(b[1].savedAt).localeCompare(String(a[1].savedAt))).slice(0,200)))); };
const centsMoney = (value: unknown) => money.format((Number(value) || 0) / 100);

export default function NfeMirrorCenterV2() {
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
    syncTarget(); const observer = new MutationObserver(syncTarget); observer.observe(document.body, { childList: true, subtree: true }); return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const previousFetch = window.fetch.bind(window);
    const wrappedFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const response = await previousFetch(input, init);
      if (rawUrl.startsWith("/api/nfe-drafts") && String(init?.method || "GET").toUpperCase() === "POST" && response.ok && typeof init?.body === "string") {
        try { const payload = JSON.parse(init.body); if (!payload.action || payload.action === "save") { const data = await response.clone().json(); if (data?.draft?.id) saveSnapshot(data.draft.id, payload); } } catch { /* espelho nunca bloqueia operação fiscal */ }
      }
      return response;
    };
    window.fetch = wrappedFetch; return () => { if (window.fetch === wrappedFetch) window.fetch = previousFetch; };
  }, []);

  const load = async (preferredId = "") => {
    setLoading(true); setError("");
    try {
      const [draftResponse, companyResponse] = await Promise.all([fetch("/api/nfe-drafts"), fetch("/api/company")]);
      const [draftData, companyData] = await Promise.all([draftResponse.json(), companyResponse.json()]);
      if (!draftResponse.ok) throw new Error(draftData.error || "Não foi possível carregar as NF-e.");
      const rows = Array.isArray(draftData.drafts) ? draftData.drafts : [];
      setDrafts(rows); setCompany(companyResponse.ok ? companyData.company || {} : {}); setSnapshots(readSnapshots());
      setSelectedId((current) => preferredId && rows.some((row: AnyRow) => row.id === preferredId) ? preferredId : current && rows.some((row: AnyRow) => row.id === current) ? current : rows[0]?.id || "");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Falha ao abrir o espelho da NF-e."); }
    finally { setLoading(false); }
  };

  const openMirror = () => { setOpen(true); void load(); };
  const selected = useMemo(() => drafts.find((draft) => draft.id === selectedId) || null, [drafts, selectedId]);
  const snapshot = selected ? snapshots[selected.id]?.payload : undefined;
  const launcher = portalTarget ? createPortal(<button type="button" className="outline-button nfe-mirror-launcher" onClick={openMirror}>▤ Espelho / DANFE</button>, portalTarget) : null;

  return <>{launcher}{open && <div className="nfe-mirror-overlay sefaz-mirror-mode" role="dialog" aria-modal="true" aria-label="Espelho da NF-e">
    <div className="nfe-mirror-topbar no-print">
      <div><span>SEVEN ERP 1.0.6 · FISCAL</span><h2>Espelho NF-e · modelo convencional</h2><p>Layout A4 reconstruído no padrão do modelo de referência. Código de barras real quando existir chave e dados fiscais sem preenchimento inventado.</p></div>
      <div className="nfe-mirror-controls"><label><span>Documento</span><select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}><option value="">Selecione...</option>{drafts.map((draft) => <option key={draft.id} value={draft.id}>{draft.nfeNumber ? `NF-e ${String(draft.nfeNumber).padStart(9,"0")}` : "Rascunho"} · {draft.recipientName || "Sem destinatário"} · {draft.totalCents !== undefined ? centsMoney(draft.totalCents) : ""}</option>)}</select></label><button onClick={() => window.print()} disabled={!selected}>Imprimir / Salvar PDF do espelho</button><button className="mirror-close" onClick={() => setOpen(false)}>Fechar</button></div>
    </div>
    <div className="nfe-mirror-stage">{error ? <div className="mirror-empty-state"><b>Não foi possível abrir o espelho</b><span>{error}</span></div> : loading ? <div className="mirror-empty-state"><b>Carregando...</b><span>Montando a folha A4.</span></div> : !selected ? <div className="mirror-empty-state"><b>Nenhuma NF-e disponível</b><span>Salve uma NF-e para visualizar.</span></div> : <><div className="mirror-snapshot-note no-print"><b>Modelo DANFE 1.0.6</b><span>{snapshot ? "Dados detalhados recuperados do snapshot individual desta NF-e." : "Campos sem dado persistido ficam em branco; o sistema não inventa informações fiscais."}</span></div><NfeDanfeReferencePreview draft={selected} company={company} snapshot={snapshot} /></>}</div>
  </div>}</>;
}
