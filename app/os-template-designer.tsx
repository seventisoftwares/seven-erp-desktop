"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  OS_TEMPLATE_ACTIVE_KEY,
  OS_TEMPLATE_STORAGE_KEY,
  OS_TOKENS,
  cloneTemplate,
  defaultOsTemplates,
  newBlankTemplate,
  pageDimensions,
  renderOsTemplateHtml,
  resolveElementText,
  sampleOsPrintData,
  type OsElementKind,
  type OsTemplate,
  type OsTemplateElement,
} from "./os-template-core";

const uid = (prefix = "el") => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const snap = (value: number, grid: number) => Math.round(value / Math.max(0.5, grid || 1)) * Math.max(0.5, grid || 1);

function loadTemplates(): OsTemplate[] {
  if (typeof window === "undefined") return defaultOsTemplates();
  try {
    const parsed = JSON.parse(localStorage.getItem(OS_TEMPLATE_STORAGE_KEY) || "[]");
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch {}
  const defaults = defaultOsTemplates();
  localStorage.setItem(OS_TEMPLATE_STORAGE_KEY, JSON.stringify(defaults));
  localStorage.setItem(OS_TEMPLATE_ACTIVE_KEY, defaults[0].id);
  return defaults;
}

function saveTemplates(templates: OsTemplate[]) {
  localStorage.setItem(OS_TEMPLATE_STORAGE_KEY, JSON.stringify(templates));
}

function newElement(kind: OsElementKind, template: OsTemplate): OsTemplateElement {
  const page = pageDimensions(template);
  const base: OsTemplateElement = {
    id: uid(kind), kind, x: template.margin, y: template.margin, w: 70, h: 10, fontSize: 10, fontWeight: "normal", align: "left",
    border: false, borderWidth: 0.35, radius: 1.5, padding: 2, background: "#ffffff", color: "#111827",
  };
  if (kind === "text") return { ...base, label: "Novo texto", w: 85, h: 9 };
  if (kind === "field") return { ...base, token: "customerName", label: "", w: 90, h: 9 };
  if (kind === "box") return { ...base, w: page.width - template.margin * 2, h: 28, border: true, background: "#f9fafb" };
  if (kind === "line") return { ...base, w: page.width - template.margin * 2, h: 1, padding: 0 };
  if (kind === "table") return { ...base, w: page.width - template.margin * 2, h: 42, border: true, columns: ["Descrição", "Qtd.", "Valor unit.", "Total"], rows: 4, padding: 0 };
  if (kind === "signature") return { ...base, w: 78, h: 22, label: "Assinatura", align: "center" };
  return base;
}

function elementLabel(element: OsTemplateElement) {
  if (element.kind === "field") return OS_TOKENS.find((item) => item.token === element.token)?.label || element.token || "Campo";
  if (element.kind === "text") return element.label || "Texto";
  if (element.kind === "box") return "Bloco / caixa";
  if (element.kind === "line") return "Linha divisória";
  if (element.kind === "table") return "Tabela";
  if (element.kind === "signature") return element.label || "Assinatura";
  return element.kind;
}

function StudioIcon({ children }: { children: string }) { return <span className="os-studio-icon" aria-hidden="true">{children}</span>; }

export default function OsTemplateDesigner({ onClose }: { onClose: () => void }) {
  const [templates, setTemplates] = useState<OsTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [zoom, setZoom] = useState(0.86);
  const [saved, setSaved] = useState(true);
  const [notice, setNotice] = useState("");
  const [showGrid, setShowGrid] = useState(true);
  const [drag, setDrag] = useState<{ id: string; mode: "move" | "resize"; startX: number; startY: number; ox: number; oy: number; ow: number; oh: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const rows = loadTemplates();
    const active = localStorage.getItem(OS_TEMPLATE_ACTIVE_KEY) || rows[0]?.id || "";
    setTemplates(rows);
    setTemplateId(rows.some((row) => row.id === active) ? active : rows[0]?.id || "");
  }, []);

  const template = useMemo(() => templates.find((row) => row.id === templateId) || templates[0], [templates, templateId]);
  const selected = useMemo(() => template?.elements.find((item) => item.id === selectedId) || null, [template, selectedId]);
  const sample = useMemo(() => sampleOsPrintData(), []);
  const page = template ? pageDimensions(template) : { width: 210, height: 297 };

  const commitTemplates = (next: OsTemplate[], message?: string) => {
    setTemplates(next); saveTemplates(next); setSaved(true); if (message) { setNotice(message); window.setTimeout(() => setNotice(""), 2600); }
  };

  const patchTemplate = (patch: Partial<OsTemplate>, persist = false) => {
    if (!template) return;
    const next = templates.map((row) => row.id === template.id ? { ...row, ...patch, updatedAt: new Date().toISOString() } : row);
    setTemplates(next); setSaved(false); if (persist) commitTemplates(next);
  };

  const patchElement = (id: string, patch: Partial<OsTemplateElement>) => {
    if (!template) return;
    patchTemplate({ elements: template.elements.map((item) => item.id === id ? { ...item, ...patch } : item) });
  };

  const addElement = (kind: OsElementKind) => {
    if (!template) return;
    const created = newElement(kind, template);
    patchTemplate({ elements: [...template.elements, created] });
    setSelectedId(created.id);
  };

  const addToken = (token: string) => {
    if (!template) return;
    const created = { ...newElement("field", template), id: uid("field"), token, label: "" };
    patchTemplate({ elements: [...template.elements, created] }); setSelectedId(created.id);
  };

  const deleteSelected = () => {
    if (!template || !selectedId) return;
    patchTemplate({ elements: template.elements.filter((item) => item.id !== selectedId) }); setSelectedId("");
  };

  const createTemplate = () => {
    const created = newBlankTemplate(`Modelo ${templates.length + 1}`);
    const next = [...templates, created]; setTemplates(next); setTemplateId(created.id); setSelectedId(""); setSaved(false);
  };

  const duplicateCurrent = () => {
    if (!template) return;
    const created = cloneTemplate(template); const next = [...templates, created]; setTemplates(next); setTemplateId(created.id); setSelectedId(""); setSaved(false);
  };

  const removeCurrent = () => {
    if (!template || templates.length <= 1) return;
    if (!window.confirm(`Excluir o modelo “${template.name}”?`)) return;
    const next = templates.filter((row) => row.id !== template.id);
    const nextId = next[0].id; setTemplateId(nextId); setSelectedId("");
    if (localStorage.getItem(OS_TEMPLATE_ACTIVE_KEY) === template.id) localStorage.setItem(OS_TEMPLATE_ACTIVE_KEY, nextId);
    commitTemplates(next, "Modelo excluído.");
  };

  const save = () => { if (template) commitTemplates(templates, "Modelo salvo neste computador."); };
  const setActive = () => { if (!template) return; localStorage.setItem(OS_TEMPLATE_ACTIVE_KEY, template.id); commitTemplates(templates.map((row) => ({ ...row, active: row.id === template.id })), "Este modelo será usado na impressão das OS."); };

  const exportTemplate = () => {
    if (!template) return;
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = `${template.name.replace(/[^a-zA-Z0-9_-]+/g, "-").toLowerCase() || "modelo-os"}.seven-os.json`; link.click(); URL.revokeObjectURL(url);
  };

  const importTemplate = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as OsTemplate;
      if (!parsed?.name || !Array.isArray(parsed.elements)) throw new Error("Arquivo não contém um modelo Seven OS válido.");
      const imported: OsTemplate = { ...parsed, id: uid("template"), name: `${parsed.name} - importado`, active: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), elements: parsed.elements.map((item) => ({ ...item, id: uid(item.kind || "el") })) };
      const next = [...templates, imported]; commitTemplates(next, "Modelo importado."); setTemplateId(imported.id); setSelectedId("");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Falha ao importar modelo."); }
  };

  const preview = () => {
    if (!template) return;
    const win = window.open("", "_blank", "width=980,height=900");
    if (!win) { setNotice("O navegador bloqueou a janela de pré-visualização."); return; }
    win.document.open(); win.document.write(renderOsTemplateHtml(template, sample)); win.document.close();
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!drag || !template || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const dx = (event.clientX - drag.startX) * page.width / rect.width;
    const dy = (event.clientY - drag.startY) * page.height / rect.height;
    if (drag.mode === "move") {
      const item = template.elements.find((el) => el.id === drag.id); if (!item) return;
      const nx = snap(clamp(drag.ox + dx, 0, page.width - item.w), template.grid);
      const ny = snap(clamp(drag.oy + dy, 0, page.height - item.h), template.grid);
      patchElement(drag.id, { x: nx, y: ny });
    } else {
      const nw = snap(clamp(drag.ow + dx, 4, page.width - drag.ox), template.grid);
      const nh = snap(clamp(drag.oh + dy, 2, page.height - drag.oy), template.grid);
      patchElement(drag.id, { w: nw, h: nh });
    }
  };

  if (!template) return <div className="os-studio os-studio-loading">Carregando Seven OS Studio...</div>;
  const activeId = typeof window !== "undefined" ? localStorage.getItem(OS_TEMPLATE_ACTIVE_KEY) : "";

  return <div className="os-studio" onPointerMove={onPointerMove} onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)}>
    <header className="os-studio-topbar">
      <div className="os-studio-brand"><button className="studio-back" onClick={onClose}>←</button><span className="studio-brand-mark">OS</span><div><strong>Seven OS Studio</strong><small>Editor profissional de modelos de Ordem de Serviço</small></div></div>
      <div className="os-studio-top-actions">
        <button onClick={createTemplate}><StudioIcon>＋</StudioIcon>Novo</button>
        <button onClick={duplicateCurrent}><StudioIcon>⧉</StudioIcon>Duplicar</button>
        <button onClick={() => fileInput.current?.click()}><StudioIcon>⇧</StudioIcon>Importar</button>
        <button onClick={exportTemplate}><StudioIcon>⇩</StudioIcon>Exportar</button>
        <button className="studio-preview" onClick={preview}><StudioIcon>⌕</StudioIcon>Prévia / imprimir</button>
        <button className="studio-save" onClick={save} disabled={saved}><StudioIcon>✓</StudioIcon>{saved ? "Salvo" : "Salvar"}</button>
      </div>
      <input ref={fileInput} type="file" accept=".json,.seven-os.json,application/json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importTemplate(file); event.currentTarget.value = ""; }} />
    </header>

    <div className="os-studio-body">
      <aside className="os-studio-left">
        <section className="studio-library-head"><span>Biblioteca</span><button title="Novo modelo" onClick={createTemplate}>＋</button></section>
        <div className="studio-template-list">{templates.map((row) => <button key={row.id} className={row.id === template.id ? "active" : ""} onClick={() => { setTemplateId(row.id); setSelectedId(""); }}><span className="template-thumb"><i /><i /><i /></span><span><strong>{row.name}</strong><small>{row.description || "Modelo personalizado"}</small></span>{row.id === activeId && <b>Padrão</b>}</button>)}</div>
        <section className="studio-palette-title"><span>Adicionar bloco</span></section>
        <div className="studio-palette-grid">
          <button onClick={() => addElement("text")}><StudioIcon>T</StudioIcon><span>Texto</span></button>
          <button onClick={() => addElement("field")}><StudioIcon>{`{ }`}</StudioIcon><span>Campo</span></button>
          <button onClick={() => addElement("box")}><StudioIcon>□</StudioIcon><span>Bloco</span></button>
          <button onClick={() => addElement("line")}><StudioIcon>—</StudioIcon><span>Linha</span></button>
          <button onClick={() => addElement("table")}><StudioIcon>▦</StudioIcon><span>Tabela</span></button>
          <button onClick={() => addElement("signature")}><StudioIcon>✎</StudioIcon><span>Assinatura</span></button>
        </div>
        <section className="studio-token-title"><span>Campos automáticos</span><small>Clique para inserir</small></section>
        <div className="studio-token-list">{OS_TOKENS.map((item) => <button key={item.token} onClick={() => addToken(item.token)}><span>{item.group}</span><strong>{item.label}</strong></button>)}</div>
      </aside>

      <main className="os-studio-workspace">
        <div className="studio-workbar">
          <div><label>Modelo <input value={template.name} onChange={(e) => patchTemplate({ name: e.target.value })} /></label><button className={activeId === template.id ? "is-active" : ""} onClick={setActive}>{activeId === template.id ? "✓ Modelo padrão" : "Usar como padrão"}</button></div>
          <div className="studio-view-controls"><button onClick={() => setShowGrid((v) => !v)} className={showGrid ? "active" : ""}># Grade</button><button onClick={() => setZoom((z) => clamp(z - 0.08, 0.45, 1.2))}>−</button><span>{Math.round(zoom * 100)}%</span><button onClick={() => setZoom((z) => clamp(z + 0.08, 0.45, 1.2))}>＋</button></div>
        </div>
        {notice && <div className="studio-toast">{notice}</div>}
        <div className="studio-canvas-scroll" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedId(""); }}>
          <div className="studio-page-stage" style={{ width: `${page.width * 3.78 * zoom}px`, height: `${page.height * 3.78 * zoom}px` }}>
            <div ref={canvasRef} className={`studio-page ${showGrid ? "show-grid" : ""}`} style={{ width: `${page.width}mm`, height: `${page.height}mm`, transform: `scale(${zoom})`, transformOrigin: "top left", ["--os-grid" as any]: `${template.grid}mm` }}>
              {template.elements.map((item) => {
                const isSelected = selectedId === item.id;
                const text = resolveElementText(item, sample);
                return <div key={item.id} className={`studio-element kind-${item.kind} ${isSelected ? "selected" : ""}`} style={{ left: `${item.x}mm`, top: `${item.y}mm`, width: `${item.w}mm`, height: `${item.h}mm`, fontSize: `${item.fontSize || 10}pt`, fontWeight: item.fontWeight || "normal", textAlign: item.align || "left", color: item.color || "#111827", background: item.kind === "line" ? "transparent" : item.background || "transparent", border: item.border ? `${item.borderWidth || 0.35}mm solid #111827` : "none", borderRadius: `${item.radius || 0}mm`, padding: item.kind === "line" ? 0 : `${item.padding || 0}mm` }} onPointerDown={(event) => { event.stopPropagation(); setSelectedId(item.id); (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId); setDrag({ id: item.id, mode: "move", startX: event.clientX, startY: event.clientY, ox: item.x, oy: item.y, ow: item.w, oh: item.h }); }}>
                  {item.kind === "line" ? <span className="studio-line" /> : item.kind === "signature" ? <div className="studio-signature"><span /><small>{item.label || "Assinatura"}</small>{item.token && <em>{sample[item.token as keyof typeof sample]}</em>}</div> : item.kind === "table" ? <table><thead><tr>{(item.columns || ["Descrição","Qtd.","Valor"]).map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{Array.from({ length: Math.max(2, item.rows || 4) }).map((_, row) => <tr key={row}>{(item.columns || ["Descrição","Qtd.","Valor"]).map((column) => <td key={column}>&nbsp;</td>)}</tr>)}</tbody></table> : <span className="studio-element-text">{text}</span>}
                  {isSelected && <button className="studio-resize" title="Redimensionar" onPointerDown={(event) => { event.stopPropagation(); (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId); setDrag({ id: item.id, mode: "resize", startX: event.clientX, startY: event.clientY, ox: item.x, oy: item.y, ow: item.w, oh: item.h }); }}>↘</button>}
                  {isSelected && <span className="studio-element-tag">{elementLabel(item)}</span>}
                </div>;
              })}
            </div>
          </div>
        </div>
      </main>

      <aside className="os-studio-right">
        <div className="studio-inspector-title"><div><span>Propriedades</span><strong>{selected ? elementLabel(selected) : "Página"}</strong></div>{selected && <button title="Excluir elemento" onClick={deleteSelected}>⌫</button>}</div>
        {!selected ? <div className="studio-properties">
          <label><span>Nome do modelo</span><input value={template.name} onChange={(e) => patchTemplate({ name: e.target.value })} /></label>
          <label><span>Descrição</span><textarea rows={3} value={template.description || ""} onChange={(e) => patchTemplate({ description: e.target.value })} /></label>
          <label><span>Orientação</span><select value={template.orientation} onChange={(e) => patchTemplate({ orientation: e.target.value as "portrait" | "landscape" })}><option value="portrait">A4 vertical</option><option value="landscape">A4 horizontal</option></select></label>
          <div className="studio-prop-row"><label><span>Margem (mm)</span><input type="number" min="0" max="30" step="1" value={template.margin} onChange={(e) => patchTemplate({ margin: Number(e.target.value) })} /></label><label><span>Grade (mm)</span><input type="number" min="0.5" max="10" step="0.5" value={template.grid} onChange={(e) => patchTemplate({ grid: Number(e.target.value) })} /></label></div>
          <div className="studio-page-info"><span>A4 {template.orientation === "portrait" ? "vertical" : "horizontal"}</span><strong>{page.width} × {page.height} mm</strong></div>
          <button className="studio-danger" disabled={templates.length <= 1} onClick={removeCurrent}>Excluir este modelo</button>
        </div> : <div className="studio-properties">
          <div className="studio-prop-row"><label><span>X (mm)</span><input type="number" step={template.grid} value={selected.x} onChange={(e) => patchElement(selected.id, { x: Number(e.target.value) })} /></label><label><span>Y (mm)</span><input type="number" step={template.grid} value={selected.y} onChange={(e) => patchElement(selected.id, { y: Number(e.target.value) })} /></label></div>
          <div className="studio-prop-row"><label><span>Largura</span><input type="number" step={template.grid} value={selected.w} onChange={(e) => patchElement(selected.id, { w: Number(e.target.value) })} /></label><label><span>Altura</span><input type="number" step={template.grid} value={selected.h} onChange={(e) => patchElement(selected.id, { h: Number(e.target.value) })} /></label></div>
          {(selected.kind === "text" || selected.kind === "signature") && <label><span>Texto / legenda</span><input value={selected.label || ""} onChange={(e) => patchElement(selected.id, { label: e.target.value })} /></label>}
          {selected.kind === "field" && <><label><span>Campo automático</span><select value={selected.token || "customerName"} onChange={(e) => patchElement(selected.id, { token: e.target.value })}>{OS_TOKENS.map((item) => <option key={item.token} value={item.token}>{item.group} · {item.label}</option>)}</select></label><label><span>Prefixo opcional</span><input value={selected.label || ""} onChange={(e) => patchElement(selected.id, { label: e.target.value })} placeholder="Ex.: Cliente" /></label></>}
          {selected.kind === "table" && <><label><span>Colunas (separe por ;)</span><input value={(selected.columns || []).join("; ")} onChange={(e) => patchElement(selected.id, { columns: e.target.value.split(";").map((v) => v.trim()).filter(Boolean) })} /></label><label><span>Linhas</span><input type="number" min="2" max="20" value={selected.rows || 4} onChange={(e) => patchElement(selected.id, { rows: Number(e.target.value) })} /></label></>}
          {!(["box","line","spacer"] as OsElementKind[]).includes(selected.kind) && <><div className="studio-prop-row"><label><span>Fonte (pt)</span><input type="number" min="5" max="40" step="1" value={selected.fontSize || 10} onChange={(e) => patchElement(selected.id, { fontSize: Number(e.target.value) })} /></label><label><span>Peso</span><select value={selected.fontWeight || "normal"} onChange={(e) => patchElement(selected.id, { fontWeight: e.target.value as any })}><option value="normal">Regular</option><option value="600">Semibold</option><option value="700">Negrito</option></select></label></div><label><span>Alinhamento</span><div className="studio-segmented">{(["left","center","right"] as const).map((align) => <button className={selected.align === align ? "active" : ""} key={align} onClick={() => patchElement(selected.id, { align })}>{align === "left" ? "←" : align === "center" ? "↔" : "→"}</button>)}</div></label></>}
          {selected.kind !== "line" && <><div className="studio-prop-row"><label><span>Texto</span><input type="color" value={selected.color || "#111827"} onChange={(e) => patchElement(selected.id, { color: e.target.value })} /></label><label><span>Fundo</span><input type="color" value={selected.background || "#ffffff"} onChange={(e) => patchElement(selected.id, { background: e.target.value })} /></label></div><label className="studio-check"><input type="checkbox" checked={Boolean(selected.border)} onChange={(e) => patchElement(selected.id, { border: e.target.checked })} /><span>Exibir borda</span></label><div className="studio-prop-row"><label><span>Padding</span><input type="number" min="0" max="10" step="0.5" value={selected.padding || 0} onChange={(e) => patchElement(selected.id, { padding: Number(e.target.value) })} /></label><label><span>Raio</span><input type="number" min="0" max="12" step="0.5" value={selected.radius || 0} onChange={(e) => patchElement(selected.id, { radius: Number(e.target.value) })} /></label></div></>}
          <div className="studio-layer-actions"><button onClick={() => patchTemplate({ elements: [...template.elements.filter((item) => item.id !== selected.id), selected] })}>Trazer para frente</button><button onClick={() => patchTemplate({ elements: [selected, ...template.elements.filter((item) => item.id !== selected.id)] })}>Enviar para trás</button></div>
        </div>}
      </aside>
    </div>
  </div>;
}
