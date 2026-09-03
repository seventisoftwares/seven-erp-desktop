"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import NfeDanfeReferencePreview from "./nfe-danfe-reference-preview";

type AnyRow = Record<string, any>;
type SnapshotMap = Record<string, { payload: AnyRow; savedAt: string }>;
const STORAGE_KEY = "seven:nfe:mirror-snapshots:v1";
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const readSnapshots = (): SnapshotMap => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as SnapshotMap; } catch { return {}; } };
const saveSnapshot = (draftId: string, payload: AnyRow) => { if (!draftId || typeof localStorage === "undefined") return; const current = readSnapshots(); current[draftId] = { payload, savedAt: new Date().toISOString() }; localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(Object.entries(current).sort((a,b) => String(b[1].savedAt).localeCompare(String(a[1].savedAt))).slice(0,200)))); };
const centsMoney = (value: unknown) => money.format((Number(value) || 0) / 100);

function fitZoom() {
  if (typeof window === "undefined") return 100;
  const usable = Math.max(720, window.innerWidth - 80);
  const pagePx = 794;
  return Math.max(75, Math.min(125, Math.floor((usable / pagePx) * 100)));
}

export default function NfeMirrorCenterV2() {
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [drafts, setDrafts] = useState<AnyRow[]>([]);
  const [company, setCompany] = useState<AnyRow>({});
  const [snapshots, setSnapshots] = useState<SnapshotMap>({});
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(110);
  const stageRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => stageRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" }));
  }, [open, selectedId]);

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

  const openMirror = () => { setZoom(Math.min(115, fitZoom())); setOpen(true); void load(); };
  const selected = useMemo(() => drafts.find((draft) => draft.id === selectedId) || null, [drafts, selectedId]);
  const snapshot = selected ? snapshots[selected.id]?.payload : undefined;
  const launcher = portalTarget ? createPortal(<button type="button" className="outline-button nfe-mirror-launcher" onClick={openMirror}>▤ Espelho / DANFE</button>, portalTarget) : null;
  const setSafeZoom = (value: number) => setZoom(Math.max(60, Math.min(150, value)));

  return <>{launcher}{open && <div className="nfe-mirror-overlay sefaz-mirror-mode" role="dialog" aria-modal="true" aria-label="Espelho da NF-e">
    <div className="nfe-mirror-topbar no-print">
      <div><span>SEVEN ERP 1.0.7 · FISCAL</span><h2>Espelho NF-e · modelo convencional</h2><p>Pré-visualização A4 com escala ajustável. O DANFE autorizado continua sendo gerado a partir do XML fiscal autorizado.</p></div>
      <div className="nfe-mirror-controls">
        <label><span>Documento</span><select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}><option value="">Selecione...</option>{drafts.map((draft) => <option key={draft.id} value={draft.id}>{draft.nfeNumber ? `NF-e ${String(draft.nfeNumber).padStart(9,"0")}` : "Rascunho"} · {draft.recipientName || "Sem destinatário"} · {draft.totalCents !== undefined ? centsMoney(draft.totalCents) : ""}</option>)}</select></label>
        <div className="mirror-zoom-group" aria-label="Zoom do documento"><button type="button" onClick={() => setSafeZoom(zoom - 10)}>−</button><span className="mirror-zoom-value">{zoom}%</span><button type="button" onClick={() => setSafeZoom(zoom + 10)}>+</button><button type="button" className={zoom === 100 ? "active" : ""} onClick={() => setZoom(100)}>100</button><button type="button" onClick={() => setSafeZoom(fitZoom())} title="Ajustar à largura">↔</button></div>
        <button onClick={() => window.print()} disabled={!selected}>Imprimir / Salvar PDF</button><button className="mirror-close" onClick={() => setOpen(false)}>Fechar</button>
      </div>
    </div>
    <div className="nfe-mirror-stage" ref={stageRef}>{error ? <div className="mirror-empty-state"><b>Não foi possível abrir o espelho</b><span>{error}</span></div> : loading ? <div className="mirror-empty-state"><b>Carregando...</b><span>Montando a folha A4.</span></div> : !selected ? <div className="mirror-empty-state"><b>Nenhuma NF-e disponível</b><span>Salve uma NF-e para visualizar.</span></div> : <><div className="mirror-snapshot-note no-print"><b>Modelo DANFE 1.0.7</b><span>{snapshot ? "Dados detalhados recuperados do snapshot individual desta NF-e." : "Campos sem dado persistido ficam em branco; o sistema não inventa informações fiscais."}</span></div><div className="nfe-mirror-zoom-layer" style={{ zoom: zoom / 100 } as any}><NfeDanfeReferencePreview draft={selected} company={company} snapshot={snapshot} /></div></>}</div>
  </div>}</>;
}
