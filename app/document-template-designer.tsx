"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DOCUMENT_FIELD_REGISTRY,
  blankDefinition,
  createBlankTemplate,
  defaultDocumentTemplates,
  pageSize,
  parseTemplate,
  resolveField,
  sampleDocumentData,
  serializeTemplate,
  type DocumentElementKind,
  type DocumentTemplate,
  type DocumentTemplateDefinition,
  type DocumentTemplateElement,
  type DocumentTemplateVersion,
  type DocumentType,
  type FieldCondition,
  type Orientation,
  type PagePreset,
} from "./document-template-core";
import { renderDocumentHtml } from "./document-template-renderer";
import "./document-template-designer.css";

const DOC_TYPES: Array<{ id: DocumentType; label: string }> = [
  { id: "service_order", label: "Ordem de Serviço" },
  { id: "quote", label: "Orçamento" },
  { id: "sales_order", label: "Pedido de Venda" },
  { id: "purchase_order", label: "Pedido de Compra" },
  { id: "receipt", label: "Recibo" },
  { id: "invoice", label: "Fatura" },
  { id: "vehicle_checklist", label: "Checklist de Veículo" },
  { id: "technical_report", label: "Relatório Técnico" },
];
const PAGE_PRESETS: Array<{ id: PagePreset; label: string }> = [
  { id: "A4", label: "A4" }, { id: "A5", label: "A5" }, { id: "LETTER", label: "Carta" },
  { id: "THERMAL_58", label: "Térmica 58 mm" }, { id: "THERMAL_80", label: "Térmica 80 mm" }, { id: "CUSTOM", label: "Personalizado" },
];
const KIND_LABEL: Record<DocumentElementKind, string> = {
  text: "Texto", field: "Campo do ERP", image: "Imagem / Logo", line: "Linha", rectangle: "Retângulo", table: "Tabela de itens",
  qrcode: "QR Code", barcode: "Código de barras", signature: "Assinatura", page_number: "Nº de páginas",
};
const uid = (prefix = "el") => typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const snap = (value: number, grid: number) => Math.round(value / Math.max(.5, grid || 1)) * Math.max(.5, grid || 1);

function desktop() { return typeof window !== "undefined" ? (window as any).sevenDesktop : null; }
async function storeRequest(method: string, payload?: any, query?: string) {
  const api = desktop();
  if (api?.documentTemplates) {
    const result = await api.documentTemplates({ method, payload, query });
    const parsed = typeof result?.body === "string" ? JSON.parse(result.body || "{}") : result;
    if (result?.ok === false || (result?.status && result.status >= 400)) throw new Error(parsed?.error || "Falha no armazenamento de modelos.");
    return parsed;
  }
  const key = "seven.erp.document.templates.dev.v1";
  const versionsKey = "seven.erp.document.template.versions.dev.v1";
  const rows: DocumentTemplate[] = JSON.parse(localStorage.getItem(key) || "[]");
  const versions: DocumentTemplateVersion[] = JSON.parse(localStorage.getItem(versionsKey) || "[]");
  if (method === "GET") {
    const id = new URLSearchParams(query || "").get("templateId");
    return id ? { template: rows.find((x) => x.id === id) || null, versions: versions.filter((x) => x.templateId === id).sort((a, b) => b.version - a.version) } : { templates: rows };
  }
  if (method === "POST" && payload?.action === "set_default") {
    const current = rows.find((x) => x.id === payload.id); if (!current) throw new Error("Modelo não encontrado.");
    rows.forEach((x) => { if (x.documentType === current.documentType) x.isDefault = x.id === current.id; }); localStorage.setItem(key, JSON.stringify(rows)); return { template: current };
  }
  if (method === "POST" && payload?.action === "duplicate") {
    const source = rows.find((x) => x.id === payload.id); if (!source) throw new Error("Modelo não encontrado.");
    const created = { ...clone(source), id: uid("template"), name: payload.name || `${source.name} - cópia`, isDefault: false, currentVersion: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    rows.push(created); versions.push({ id: uid("version"), templateId: created.id, version: 1, definition: clone(created.definition), note: `Duplicado de ${source.name}`, createdAt: created.createdAt });
    localStorage.setItem(key, JSON.stringify(rows)); localStorage.setItem(versionsKey, JSON.stringify(versions)); return { template: created };
  }
  if (method === "POST" && payload?.action === "restore") {
    const index = rows.findIndex((x) => x.id === payload.id); const source = versions.find((x) => x.templateId === payload.id && x.version === Number(payload.version)); if (index < 0 || !source) throw new Error("Versão não encontrada.");
    const nextVersion = rows[index].currentVersion + 1; rows[index] = { ...rows[index], definition: clone(source.definition), currentVersion: nextVersion, updatedAt: new Date().toISOString() };
    versions.push({ id: uid("version"), templateId: payload.id, version: nextVersion, definition: clone(source.definition), note: `Restaurado da versão ${source.version}`, createdAt: new Date().toISOString() });
    localStorage.setItem(key, JSON.stringify(rows)); localStorage.setItem(versionsKey, JSON.stringify(versions)); return { template: rows[index] };
  }
  if (method === "POST") {
    const created = { ...payload, id: payload.id || uid("template"), currentVersion: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as DocumentTemplate;
    if (created.isDefault) rows.forEach((x) => { if (x.documentType === created.documentType) x.isDefault = false; }); rows.push(created);
    versions.push({ id: uid("version"), templateId: created.id, version: 1, definition: clone(created.definition), note: payload.note || "Versão inicial", createdAt: created.createdAt });
    localStorage.setItem(key, JSON.stringify(rows)); localStorage.setItem(versionsKey, JSON.stringify(versions)); return { template: created };
  }
  if (method === "PATCH") {
    const index = rows.findIndex((x) => x.id === payload.id); if (index < 0) throw new Error("Modelo não encontrado.");
    const nextVersion = rows[index].currentVersion + 1; const next = { ...rows[index], ...payload, id: rows[index].id, currentVersion: nextVersion, updatedAt: new Date().toISOString() };
    rows[index] = next; versions.push({ id: uid("version"), templateId: next.id, version: nextVersion, definition: clone(next.definition), note: payload.note || "Alteração do modelo", createdAt: next.updatedAt });
    localStorage.setItem(key, JSON.stringify(rows)); localStorage.setItem(versionsKey, JSON.stringify(versions)); return { template: next };
  }
  if (method === "DELETE") { localStorage.setItem(key, JSON.stringify(rows.filter((x) => x.id !== payload.id))); return { removed: true }; }
  throw new Error("Operação não suportada.");
}

function newElement(kind: DocumentElementKind, definition: DocumentTemplateDefinition): DocumentTemplateElement {
  const common: DocumentTemplateElement = { id: uid(kind), kind, xMm: definition.marginLeftMm, yMm: definition.marginTopMm, widthMm: 70, heightMm: 10, fontSizePt: 9, fontWeight: "normal", align: "left", verticalAlign: "top", color: "#111111", background: "transparent", borderWidthMm: 0, borderColor: "#222222", radiusMm: 0, paddingMm: 1.5, section: "body" };
  if (kind === "text") return { ...common, text: "Novo texto", widthMm: 90, heightMm: 8 };
  if (kind === "field") return { ...common, field: "Cliente.Nome", widthMm: 90, heightMm: 8 };
  if (kind === "image") return { ...common, field: "Empresa.Logo", widthMm: 45, heightMm: 24 };
  if (kind === "line") return { ...common, widthMm: Math.max(20, definition.pageWidthMm - definition.marginLeftMm - definition.marginRightMm), heightMm: .4, borderWidthMm: .3 };
  if (kind === "rectangle") return { ...common, widthMm: 80, heightMm: 25, borderWidthMm: .25 };
  if (kind === "table") return { ...common, widthMm: Math.max(40, definition.pageWidthMm - definition.marginLeftMm - definition.marginRightMm), heightMm: 75, tableSource: "Itens", rowHeightMm: 7, maxRows: 10, borderWidthMm: .2, columns: [
    { id: uid("col"), label: "Código", field: "Item.Codigo", widthMm: 20 }, { id: uid("col"), label: "Descrição", field: "Item.Descricao", widthMm: 70 },
    { id: uid("col"), label: "Qtd.", field: "Item.Quantidade", widthMm: 20, align: "right", format: "number" }, { id: uid("col"), label: "Valor", field: "Item.ValorUnitario", widthMm: 30, align: "right", format: "money" },
    { id: uid("col"), label: "Total", field: "Item.Total", widthMm: 30, align: "right", format: "money" },
  ] };
  if (kind === "qrcode") return { ...common, field: "Documento.Numero", widthMm: 28, heightMm: 28 };
  if (kind === "barcode") return { ...common, field: "Documento.Numero", widthMm: 55, heightMm: 18, barcodeFormat: "CODE128" };
  if (kind === "signature") return { ...common, text: "Assinatura", widthMm: 75, heightMm: 20, align: "center", verticalAlign: "bottom" };
  return { ...common, text: "Página {page} de {pages}", widthMm: 42, heightMm: 6, align: "right", section: "footer" };
}

function elementCaption(element: DocumentTemplateElement) {
  if (element.kind === "field") return element.field || "Campo";
  if (element.kind === "image") return element.field || (element.source ? "Imagem" : "Logo / imagem");
  if (element.kind === "table") return "Itens / produtos e serviços";
  return element.text || KIND_LABEL[element.kind];
}

function CanvasElement({ element, sample, selected, onPointerDown }: { element: DocumentTemplateElement; sample: any; selected: boolean; onPointerDown: (event: React.PointerEvent, mode: "move" | "resize") => void }) {
  const value = element.field ? resolveField(sample, element.field) : (element.text || "");
  const style: React.CSSProperties = { left: `${element.xMm}mm`, top: `${element.yMm}mm`, width: `${Math.max(.5, element.widthMm)}mm`, height: `${Math.max(.5, element.heightMm)}mm`, fontSize: `${element.fontSizePt || 9}pt`, fontWeight: element.fontWeight === "700" ? 700 : element.fontWeight === "600" ? 600 : 400, textAlign: element.align || "left", color: element.color || "#111", background: element.background || "transparent", border: (element.borderWidthMm || 0) > 0 ? `${element.borderWidthMm}mm solid ${element.borderColor || "#222"}` : undefined, borderRadius: `${element.radiusMm || 0}mm`, padding: `${element.paddingMm || 0}mm`, alignItems: element.verticalAlign === "middle" ? "center" : element.verticalAlign === "bottom" ? "flex-end" : "flex-start", justifyContent: element.align === "center" ? "center" : element.align === "right" ? "flex-end" : "flex-start" };
  return <div className={`doc-canvas-element kind-${element.kind}${selected ? " selected" : ""}`} style={style} onPointerDown={(event) => { event.stopPropagation(); onPointerDown(event, "move"); }}>
    {element.kind === "table" ? <div className="doc-mini-table"><b>{(element.columns || []).map((c) => c.label).join("  |  ")}</b><span>{sample.Itens?.[0]?.Descricao || "Itens expansíveis"}</span><span>{sample.Itens?.[1]?.Descricao || ""}</span></div>
      : element.kind === "line" ? <div className="doc-line-preview" />
      : element.kind === "image" ? (element.source ? <img src={element.source} alt="Imagem" /> : <span>LOGO / IMAGEM<br/><small>{element.field || "arquivo"}</small></span>)
      : element.kind === "qrcode" ? <span className="doc-code-placeholder">▦<small>{value}</small></span>
      : element.kind === "barcode" ? <span className="doc-barcode-placeholder">|||| || |||||<small>{value}</small></span>
      : element.kind === "signature" ? <span className="doc-sign-preview">____________________<small>{element.text || "Assinatura"}</small></span>
      : <span>{value || elementCaption(element)}</span>}
    {selected && <button className="doc-resize-handle" title="Redimensionar" onPointerDown={(event) => { event.stopPropagation(); onPointerDown(event, "resize"); }} />}
  </div>;
}

export default function DocumentTemplateDesigner({ onClose }: { onClose: () => void }) {
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [draft, setDraft] = useState<DocumentTemplate | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [versions, setVersions] = useState<DocumentTemplateVersion[]>([]);
  const [typeFilter, setTypeFilter] = useState<DocumentType>("service_order");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [zoom, setZoom] = useState(.82);
  const [showGrid, setShowGrid] = useState(true);
  const [drag, setDrag] = useState<{ id: string; mode: "move" | "resize"; sx: number; sy: number; x: number; y: number; w: number; h: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const importRef = useRef<HTMLInputElement | null>(null);
  const imageRef = useRef<HTMLInputElement | null>(null);
  const sample = useMemo(() => sampleDocumentData(), []);

  const flash = (text: string) => { setNotice(text); window.setTimeout(() => setNotice(""), 2800); };
  const reload = async (preferredId?: string) => {
    let response = await storeRequest("GET"); let rows: DocumentTemplate[] = response.templates || [];
    if (!rows.length) {
      for (const template of defaultDocumentTemplates()) await storeRequest("POST", { ...template, note: "Modelo instalado pelo Seven ERP" });
      response = await storeRequest("GET"); rows = response.templates || [];
    }
    setTemplates(rows);
    const chosen = rows.find((row) => row.id === preferredId) || rows.find((row) => row.id === templateId) || rows.find((row) => row.documentType === typeFilter) || rows[0];
    if (chosen) { setTemplateId(chosen.id); setTypeFilter(chosen.documentType); setDraft(clone(chosen)); setDirty(false); await loadVersions(chosen.id); }
  };
  const loadVersions = async (id: string) => { const result = await storeRequest("GET", undefined, `templateId=${encodeURIComponent(id)}`); setVersions(result.versions || []); };
  useEffect(() => { void reload(); }, []);

  const selected = useMemo(() => draft?.definition.elements.find((item) => item.id === selectedId) || null, [draft, selectedId]);
  const visibleTemplates = useMemo(() => templates.filter((item) => item.documentType === typeFilter), [templates, typeFilter]);

  const patchDraft = (patch: Partial<DocumentTemplate>) => { if (!draft) return; setDraft({ ...draft, ...patch }); setDirty(true); };
  const patchDefinition = (patch: Partial<DocumentTemplateDefinition>) => { if (!draft) return; patchDraft({ definition: { ...draft.definition, ...patch } }); };
  const patchElement = (id: string, patch: Partial<DocumentTemplateElement>) => { if (!draft) return; patchDefinition({ elements: draft.definition.elements.map((item) => item.id === id ? { ...item, ...patch } : item) }); };

  const chooseTemplate = async (id: string) => {
    if (dirty && !window.confirm("Há alterações não salvas. Deseja descartá-las?")) return;
    const row = templates.find((item) => item.id === id); if (!row) return;
    setTemplateId(id); setDraft(clone(row)); setSelectedId(""); setDirty(false); await loadVersions(id);
  };
  const chooseType = (type: DocumentType) => { setTypeFilter(type); const row = templates.find((item) => item.documentType === type); if (row) void chooseTemplate(row.id); };

  const add = (kind: DocumentElementKind) => {
    if (!draft) return; const created = newElement(kind, draft.definition);
    patchDefinition({ elements: [...draft.definition.elements, created] }); setSelectedId(created.id);
  };
  const addField = (field: string) => { if (!draft) return; const created = { ...newElement("field", draft.definition), id: uid("field"), field }; patchDefinition({ elements: [...draft.definition.elements, created] }); setSelectedId(created.id); };
  const removeSelected = () => { if (!draft || !selectedId) return; patchDefinition({ elements: draft.definition.elements.filter((item) => item.id !== selectedId) }); setSelectedId(""); };
  const duplicateSelected = () => { if (!draft || !selected) return; const copy = { ...clone(selected), id: uid(selected.kind), xMm: selected.xMm + 3, yMm: selected.yMm + 3 }; patchDefinition({ elements: [...draft.definition.elements, copy] }); setSelectedId(copy.id); };

  const save = async () => {
    if (!draft) return; setBusy(true);
    try { const result = await storeRequest("PATCH", { id: draft.id, name: draft.name, description: draft.description, documentType: draft.documentType, definition: draft.definition, note: "Alteração pelo designer visual" }); await reload(result.template.id); flash(`Modelo salvo como versão ${result.template.currentVersion}.`); }
    catch (error) { flash(error instanceof Error ? error.message : "Falha ao salvar."); } finally { setBusy(false); }
  };
  const createNew = async () => {
    const base = createBlankTemplate(typeFilter, `Novo ${DOC_TYPES.find((x) => x.id === typeFilter)?.label || "documento"}`);
    setBusy(true); try { const result = await storeRequest("POST", { ...base, note: "Novo modelo" }); await reload(result.template.id); flash("Novo modelo criado."); } finally { setBusy(false); }
  };
  const duplicateTemplate = async () => { if (!draft) return; setBusy(true); try { const result = await storeRequest("POST", { action: "duplicate", id: draft.id, name: `${draft.name} - cópia` }); await reload(result.template.id); flash("Modelo duplicado."); } finally { setBusy(false); } };
  const deleteTemplate = async () => { if (!draft || !window.confirm(`Excluir o modelo “${draft.name}”? O histórico será preservado.`)) return; setBusy(true); try { await storeRequest("DELETE", { id: draft.id }); await reload(); flash("Modelo excluído."); } finally { setBusy(false); } };
  const setDefault = async () => { if (!draft) return; setBusy(true); try { await storeRequest("POST", { action: "set_default", id: draft.id }); await reload(draft.id); flash("Modelo definido como padrão."); } finally { setBusy(false); } };
  const restore = async (version: number) => { if (!draft || !window.confirm(`Restaurar a versão ${version}? A restauração criará uma nova versão, sem apagar o histórico.`)) return; setBusy(true); try { const result = await storeRequest("POST", { action: "restore", id: draft.id, version }); await reload(result.template.id); flash(`Versão ${version} restaurada.`); } finally { setBusy(false); } };

  const changePage = (preset: PagePreset, orientation: Orientation = draft?.definition.orientation || "portrait") => {
    if (!draft) return; const size = pageSize(preset, orientation, draft.definition.pageWidthMm, draft.definition.pageHeightMm);
    patchDefinition({ pagePreset: preset, orientation, pageWidthMm: size.widthMm, pageHeightMm: size.heightMm });
  };
  const updateCustomPage = (width: number, height: number) => { if (!draft) return; patchDefinition({ pagePreset: "CUSTOM", pageWidthMm: clamp(width, 30, 1000), pageHeightMm: clamp(height, 30, 2000) }); };

  const preview = () => { if (!draft) return; const win = window.open("", "_blank", "width=1050,height=900"); if (!win) return flash("A pré-visualização foi bloqueada pelo sistema."); win.document.open(); win.document.write(renderDocumentHtml(draft, sample)); win.document.close(); };
  const generatePdf = async () => {
    if (!draft) return; const api = desktop(); if (!api?.documentRenderPdf) return flash("Geração PDF pelo Majorsilence está disponível no aplicativo desktop.");
    setBusy(true); try { const result = await api.documentRenderPdf({ templateName: draft.name, definition: draft.definition, data: sample, fileName: `${draft.name}.pdf` }); if (!result?.canceled) flash(result?.saved ? `PDF gerado: ${result.filePath || "arquivo salvo"}` : "Não foi possível gerar o PDF."); } catch (error) { flash(error instanceof Error ? error.message : "Falha ao gerar PDF."); } finally { setBusy(false); }
  };
  const exportTemplate = () => { if (!draft) return; const blob = new Blob([serializeTemplate(draft)], { type: "application/json" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${draft.name.replace(/[^a-z0-9]+/gi, "-")}.seven-document.json`; anchor.click(); URL.revokeObjectURL(url); };
  const importTemplate = async (file: File) => { try { const parsed = parseTemplate(await file.text()); parsed.id = uid("template"); parsed.name = `${parsed.name} - importado`; parsed.isDefault = false; const result = await storeRequest("POST", { ...parsed, note: "Modelo importado" }); await reload(result.template.id); flash("Modelo importado."); } catch (error) { flash(error instanceof Error ? error.message : "Arquivo inválido."); } };
  const loadImage = async (file: File) => { if (!selected || selected.kind !== "image") return; if (file.size > 4 * 1024 * 1024) return flash("Imagem maior que 4 MB."); const reader = new FileReader(); reader.onload = () => patchElement(selected.id, { source: String(reader.result || ""), field: undefined }); reader.readAsDataURL(file); };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!drag || !draft || !canvasRef.current) return; const rect = canvasRef.current.getBoundingClientRect();
    const dx = (event.clientX - drag.sx) * draft.definition.pageWidthMm / rect.width; const dy = (event.clientY - drag.sy) * draft.definition.pageHeightMm / rect.height;
    const grid = draft.definition.gridMm || 1;
    if (drag.mode === "move") { const item = draft.definition.elements.find((x) => x.id === drag.id); if (!item) return; patchElement(drag.id, { xMm: snap(clamp(drag.x + dx, 0, draft.definition.pageWidthMm - item.widthMm), grid), yMm: snap(clamp(drag.y + dy, 0, draft.definition.pageHeightMm - item.heightMm), grid) }); }
    else patchElement(drag.id, { widthMm: snap(clamp(drag.w + dx, 3, draft.definition.pageWidthMm - drag.x), grid), heightMm: snap(clamp(drag.h + dy, 2, draft.definition.pageHeightMm - drag.y), grid) });
  };

  if (!draft) return <div className="document-studio loading">Carregando Modelos de Documentos...</div>;
  const d = draft.definition;

  return <div className="document-studio" onPointerMove={onPointerMove} onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)}>
    <header className="document-studio-topbar">
      <div className="document-studio-brand"><button onClick={onClose}>←</button><span>DOC</span><div><strong>Modelos de Documentos</strong><small>Designer visual · versionamento · PDF open source</small></div></div>
      <div className="document-top-actions">
        <button onClick={createNew} disabled={busy}>+ Novo</button><button onClick={duplicateTemplate} disabled={busy}>Duplicar</button><button onClick={() => importRef.current?.click()}>Importar</button><button onClick={exportTemplate}>Exportar</button>
        <button onClick={preview}>Pré-visualizar</button><button onClick={generatePdf} disabled={busy} className="primary-outline">Gerar PDF</button><button onClick={save} disabled={!dirty || busy} className="primary">{busy ? "Processando..." : dirty ? "Salvar nova versão" : "Salvo"}</button>
      </div>
      <input ref={importRef} hidden type="file" accept=".json,.seven-document.json,application/json" onChange={(e) => { const file = e.target.files?.[0]; if (file) void importTemplate(file); e.currentTarget.value = ""; }} />
      <input ref={imageRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { const file = e.target.files?.[0]; if (file) void loadImage(file); e.currentTarget.value = ""; }} />
    </header>

    <div className="document-studio-body">
      <aside className="document-library">
        <h3>TIPO DE DOCUMENTO</h3>
        <div className="document-type-list">{DOC_TYPES.map((item) => <button key={item.id} className={typeFilter === item.id ? "active" : ""} onClick={() => chooseType(item.id)}>{item.label}</button>)}</div>
        <div className="document-library-title"><h3>MODELOS</h3><button onClick={createNew}>＋</button></div>
        <div className="document-template-list">{visibleTemplates.map((row) => <button key={row.id} className={row.id === draft.id ? "active" : ""} onClick={() => void chooseTemplate(row.id)}><span className="doc-thumb"><i/><i/><i/></span><span><strong>{row.name}</strong><small>v{row.currentVersion} · {row.isDefault ? "Padrão" : "Personalizado"}</small></span></button>)}</div>
        <h3>INSERIR</h3>
        <div className="document-palette">{(["text","field","image","line","rectangle","table","qrcode","barcode","signature","page_number"] as DocumentElementKind[]).map((kind) => <button key={kind} onClick={() => add(kind)}><b>{kind === "text" ? "T" : kind === "field" ? "{}" : kind === "table" ? "▦" : kind === "image" ? "▧" : kind === "qrcode" ? "QR" : kind === "barcode" ? "|||" : kind === "signature" ? "✎" : kind === "page_number" ? "#" : kind === "line" ? "—" : "□"}</b><span>{KIND_LABEL[kind]}</span></button>)}</div>
        <h3>CAMPOS DO ERP</h3>
        <div className="document-field-list">{DOCUMENT_FIELD_REGISTRY.filter((field) => !field.collection).map((field) => <button key={field.path} onClick={() => addField(field.path)}><span>{field.group}</span><strong>{field.label}</strong></button>)}</div>
      </aside>

      <main className="document-workspace">
        <div className="document-workbar">
          <div className="document-name"><input value={draft.name} onChange={(e) => patchDraft({ name: e.target.value })}/><span>v{draft.currentVersion}</span>{draft.isDefault ? <b>Padrão</b> : <button onClick={setDefault}>Definir padrão</button>}</div>
          <div><button className={showGrid ? "active" : ""} onClick={() => setShowGrid((x) => !x)}># Grade</button><button onClick={() => setZoom((x) => clamp(x - .08, .35, 1.25))}>−</button><span>{Math.round(zoom * 100)}%</span><button onClick={() => setZoom((x) => clamp(x + .08, .35, 1.25))}>＋</button></div>
        </div>
        {notice && <div className="document-toast">{notice}</div>}
        <div className="document-page-scroll" onPointerDown={(e) => { if (e.target === e.currentTarget) setSelectedId(""); }}>
          <div className="document-page-wrap" style={{ width: `${d.pageWidthMm * 3.7795 * zoom}px`, height: `${d.pageHeightMm * 3.7795 * zoom}px` }}>
            <div ref={canvasRef} className={`document-page${showGrid ? " grid" : ""}`} style={{ width: `${d.pageWidthMm}mm`, height: `${d.pageHeightMm}mm`, transform: `scale(${zoom})`, transformOrigin: "top left", ["--doc-grid" as any]: `${d.gridMm || 2}mm` }} onPointerDown={() => setSelectedId("")}>
              {d.elements.map((element) => <CanvasElement key={element.id} element={element} sample={sample} selected={selectedId === element.id} onPointerDown={(event, mode) => { setSelectedId(element.id); setDrag({ id: element.id, mode, sx: event.clientX, sy: event.clientY, x: element.xMm, y: element.yMm, w: element.widthMm, h: element.heightMm }); }} />)}
            </div>
          </div>
        </div>
      </main>

      <aside className="document-inspector">
        <section><h3>DOCUMENTO</h3><label>Descrição<textarea value={draft.description || ""} onChange={(e) => patchDraft({ description: e.target.value })}/></label><div className="row"><label>Página<select value={d.pagePreset} onChange={(e) => changePage(e.target.value as PagePreset)}>{PAGE_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label><label>Orientação<select value={d.orientation} onChange={(e) => changePage(d.pagePreset, e.target.value as Orientation)}><option value="portrait">Retrato</option><option value="landscape">Paisagem</option></select></label></div>{d.pagePreset === "CUSTOM" && <div className="row"><label>Largura mm<input type="number" value={d.pageWidthMm} onChange={(e) => updateCustomPage(Number(e.target.value), d.pageHeightMm)}/></label><label>Altura mm<input type="number" value={d.pageHeightMm} onChange={(e) => updateCustomPage(d.pageWidthMm, Number(e.target.value))}/></label></div>}<div className="row"><label>Margem sup.<input type="number" step=".5" value={d.marginTopMm} onChange={(e) => patchDefinition({ marginTopMm: Number(e.target.value) })}/></label><label>Grade mm<input type="number" step=".5" value={d.gridMm} onChange={(e) => patchDefinition({ gridMm: Math.max(.5, Number(e.target.value)) })}/></label></div></section>

        {selected ? <section className="element-inspector"><div className="inspector-title"><div><small>ELEMENTO</small><strong>{KIND_LABEL[selected.kind]}</strong></div><div><button onClick={duplicateSelected} title="Duplicar">⧉</button><button onClick={removeSelected} title="Excluir">×</button></div></div>
          {(selected.kind === "text" || selected.kind === "signature" || selected.kind === "page_number") && <label>Texto<input value={selected.text || ""} onChange={(e) => patchElement(selected.id, { text: e.target.value })}/></label>}
          {(selected.kind === "field" || selected.kind === "qrcode" || selected.kind === "barcode" || selected.kind === "image") && <label>Campo vinculado<select value={selected.field || ""} onChange={(e) => patchElement(selected.id, { field: e.target.value || undefined, source: selected.kind === "image" ? undefined : selected.source })}><option value="">Sem campo</option>{DOCUMENT_FIELD_REGISTRY.filter((x) => !x.collection).map((x) => <option key={x.path} value={x.path}>{x.group} · {x.label}</option>)}</select></label>}
          {selected.kind === "image" && <button className="wide-action" onClick={() => imageRef.current?.click()}>Selecionar imagem do computador</button>}
          <div className="coord-grid"><label>X<input type="number" step=".5" value={selected.xMm} onChange={(e) => patchElement(selected.id, { xMm: Number(e.target.value) })}/></label><label>Y<input type="number" step=".5" value={selected.yMm} onChange={(e) => patchElement(selected.id, { yMm: Number(e.target.value) })}/></label><label>Largura<input type="number" step=".5" value={selected.widthMm} onChange={(e) => patchElement(selected.id, { widthMm: Math.max(1, Number(e.target.value)) })}/></label><label>Altura<input type="number" step=".5" value={selected.heightMm} onChange={(e) => patchElement(selected.id, { heightMm: Math.max(1, Number(e.target.value)) })}/></label></div>
          {selected.kind !== "image" && selected.kind !== "line" && selected.kind !== "rectangle" && selected.kind !== "table" && <div className="row"><label>Fonte pt<input type="number" min="5" max="48" value={selected.fontSizePt || 9} onChange={(e) => patchElement(selected.id, { fontSizePt: Number(e.target.value) })}/></label><label>Peso<select value={selected.fontWeight || "normal"} onChange={(e) => patchElement(selected.id, { fontWeight: e.target.value as any })}><option value="normal">Normal</option><option value="600">Semibold</option><option value="700">Negrito</option></select></label></div>}
          <div className="row"><label>Alinhamento<select value={selected.align || "left"} onChange={(e) => patchElement(selected.id, { align: e.target.value as any })}><option value="left">Esquerda</option><option value="center">Centro</option><option value="right">Direita</option></select></label><label>Seção<select value={selected.section || "body"} onChange={(e) => patchElement(selected.id, { section: e.target.value as any, repeatOnEveryPage: e.target.value !== "body" })}><option value="body">Corpo</option><option value="header">Cabeçalho</option><option value="footer">Rodapé</option></select></label></div>
          <div className="row"><label>Borda mm<input type="number" min="0" step=".1" value={selected.borderWidthMm || 0} onChange={(e) => patchElement(selected.id, { borderWidthMm: Number(e.target.value) })}/></label><label>Padding mm<input type="number" min="0" step=".5" value={selected.paddingMm || 0} onChange={(e) => patchElement(selected.id, { paddingMm: Number(e.target.value) })}/></label></div>
          {selected.kind === "table" && <><div className="row"><label>Altura linha mm<input type="number" step=".5" value={selected.rowHeightMm || 7} onChange={(e) => patchElement(selected.id, { rowHeightMm: Number(e.target.value) })}/></label><label>Máx. linhas/pág.<input type="number" min="1" value={selected.maxRows || 10} onChange={(e) => patchElement(selected.id, { maxRows: Math.max(1, Number(e.target.value)) })}/></label></div><div className="table-column-list">{(selected.columns || []).map((column, index) => <div key={column.id}><input value={column.label} onChange={(e) => patchElement(selected.id, { columns: (selected.columns || []).map((c, i) => i === index ? { ...c, label: e.target.value } : c) })}/><select value={column.field} onChange={(e) => patchElement(selected.id, { columns: (selected.columns || []).map((c, i) => i === index ? { ...c, field: e.target.value } : c) })}>{DOCUMENT_FIELD_REGISTRY.filter((x) => x.collection).map((x) => <option key={x.path} value={x.path}>{x.label}</option>)}</select></div>)}</div></>}
          <div className="condition-box"><label>Exibição condicional<select value={selected.condition?.field || ""} onChange={(e) => patchElement(selected.id, { condition: e.target.value ? { field: e.target.value, operator: selected.condition?.operator || "not_empty", value: selected.condition?.value } : undefined })}><option value="">Sempre mostrar</option>{DOCUMENT_FIELD_REGISTRY.filter((x) => !x.collection).map((x) => <option key={x.path} value={x.path}>{x.group} · {x.label}</option>)}</select></label>{selected.condition && <div className="row"><label>Condição<select value={selected.condition.operator} onChange={(e) => patchElement(selected.id, { condition: { ...selected.condition!, operator: e.target.value as FieldCondition["operator"] } })}><option value="not_empty">Preenchido</option><option value="empty">Vazio</option><option value="eq">Igual a</option><option value="neq">Diferente de</option><option value="contains">Contém</option><option value="gt">Maior</option><option value="gte">Maior/igual</option><option value="lt">Menor</option><option value="lte">Menor/igual</option></select></label>{!["not_empty","empty"].includes(selected.condition.operator) && <label>Valor<input value={String(selected.condition.value ?? "")} onChange={(e) => patchElement(selected.id, { condition: { ...selected.condition!, value: e.target.value } })}/></label>}</div>}</div>
        </section> : <section className="empty-inspector"><strong>Selecione um elemento</strong><p>Clique em qualquer bloco da folha para editar posição, tamanho, vínculo, estilo e condição.</p></section>}

        <section className="versions-panel"><div className="versions-title"><h3>VERSÕES</h3><span>{versions.length}</span></div><div>{versions.map((version) => <article key={version.id}><div><strong>v{version.version}</strong><small>{version.note}</small></div><button disabled={version.version === draft.currentVersion || busy} onClick={() => void restore(version.version)}>Restaurar</button></article>)}</div></section>
        <button className="danger-wide" onClick={deleteTemplate} disabled={busy}>Excluir modelo</button>
      </aside>
    </div>
  </div>;
}
