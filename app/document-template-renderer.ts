import { DOCUMENT_FIELD_REGISTRY, evaluateCondition, formatBoundValue, getPath, type DocumentTemplate, type DocumentTemplateElement, type TableColumn } from "./document-template-core";

const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] || char));
const cssColor = (value?: string) => value && /^#?[0-9a-f]{3,8}$/i.test(value) ? (value.startsWith("#") ? value : `#${value}`) : (value === "transparent" ? "transparent" : "#111111");

function fieldValue(data: unknown, field?: string) {
  if (!field) return "";
  const meta = DOCUMENT_FIELD_REGISTRY.find((entry) => entry.path === field);
  return formatBoundValue(getPath(data, field), meta?.type);
}

function columnValue(row: unknown, column: TableColumn) {
  const path = column.field.startsWith("Item.") ? column.field.slice(5) : column.field;
  const raw = getPath(row, path);
  return formatBoundValue(raw, column.format === "money" ? "money" : column.format === "number" ? "number" : "text");
}

function styleOf(element: DocumentTemplateElement) {
  const border = Number(element.borderWidthMm || 0) > 0 ? `${element.borderWidthMm}mm solid ${cssColor(element.borderColor || "#222222")}` : "none";
  return [
    "position:absolute",
    `left:${element.xMm}mm`, `top:${element.yMm}mm`, `width:${Math.max(0.5, element.widthMm)}mm`, `height:${Math.max(0.5, element.heightMm)}mm`,
    `font-size:${Math.max(5, Number(element.fontSizePt || 9))}pt`,
    `font-weight:${element.fontWeight || "normal"}`, `text-align:${element.align || "left"}`,
    `color:${cssColor(element.color || "#111111")}`, `background:${element.background === "transparent" ? "transparent" : cssColor(element.background || "transparent")}`,
    `border:${border}`, `border-radius:${Math.max(0, Number(element.radiusMm || 0))}mm`,
    `padding:${Math.max(0, Number(element.paddingMm || 0))}mm`, "box-sizing:border-box", "overflow:hidden", "white-space:pre-wrap", "word-break:break-word",
    `display:flex`, `align-items:${element.verticalAlign === "middle" ? "center" : element.verticalAlign === "bottom" ? "flex-end" : "flex-start"}`,
    `justify-content:${element.align === "center" ? "center" : element.align === "right" ? "flex-end" : "flex-start"}`,
  ].join(";");
}

function renderTable(element: DocumentTemplateElement, data: any) {
  const rows = Array.isArray(data?.Itens) ? data.Itens : [];
  const columns = element.columns || [];
  const maxRows = Math.max(1, Number(element.maxRows || rows.length || 1));
  const body = rows.slice(0, maxRows).map((row: unknown) => `<tr>${columns.map((column) => `<td style="text-align:${column.align || "left"}">${esc(columnValue(row, column))}</td>`).join("")}</tr>`).join("");
  return `<div style="${styleOf(element)};display:block;padding:0;overflow:hidden"><table class="doc-table"><thead><tr>${columns.map((column) => `<th style="width:${column.widthMm}mm;text-align:${column.align || "left"}">${esc(column.label)}</th>`).join("")}</tr></thead><tbody>${body || `<tr><td colspan="${Math.max(1, columns.length)}">&nbsp;</td></tr>`}</tbody></table></div>`;
}

function renderElement(element: DocumentTemplateElement, data: unknown, page: number, pages: number) {
  if (!evaluateCondition(data, element.condition)) return "";
  let value = element.field ? fieldValue(data, element.field) : (element.text || "");
  value = value.replaceAll("{page}", String(page)).replaceAll("{pages}", String(pages));
  if (element.kind === "table") return renderTable(element, data as any);
  if (element.kind === "line") return `<div style="${styleOf(element)};height:0;border:none;border-top:${Math.max(.15, Number(element.borderWidthMm || .25))}mm solid ${cssColor(element.borderColor || "#222")}"></div>`;
  if (element.kind === "rectangle") return `<div style="${styleOf(element)}"></div>`;
  if (element.kind === "signature") return `<div style="${styleOf(element)};align-items:flex-end;justify-content:center"><div style="width:90%;border-top:.25mm solid #222;padding-top:1.5mm;text-align:center">${esc(value || "Assinatura")}</div></div>`;
  if (element.kind === "image") {
    const src = element.source || value;
    return src ? `<div style="${styleOf(element)};padding:0"><img src="${esc(src)}" style="width:100%;height:100%;object-fit:contain" /></div>` : `<div style="${styleOf(element)};border:.25mm dashed #aaa;align-items:center;justify-content:center;color:#888">Imagem</div>`;
  }
  if (element.kind === "qrcode") return `<div style="${styleOf(element)};align-items:center;justify-content:center;border:.2mm dashed #999;font-size:7pt">QR CODE<br>${esc(value)}</div>`;
  if (element.kind === "barcode") return `<div style="${styleOf(element)};align-items:center;justify-content:center;border:.2mm dashed #999;font-family:monospace;font-size:7pt">|||| ||| ||||<br>${esc(value)}</div>`;
  return `<div style="${styleOf(element)}">${esc(value || (element.kind === "field" ? element.field : ""))}</div>`;
}

export function renderDocumentHtml(template: DocumentTemplate, data: unknown) {
  const d = template.definition;
  const body = d.elements.map((element) => renderElement(element, data, 1, 1)).join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(template.name)}</title><style>@page{size:${d.pageWidthMm}mm ${d.pageHeightMm}mm;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#dadde3;font-family:Arial,Helvetica,sans-serif}.page{position:relative;width:${d.pageWidthMm}mm;height:${d.pageHeightMm}mm;margin:8mm auto;background:white;box-shadow:0 2mm 8mm #0003;overflow:hidden}.doc-table{border-collapse:collapse;width:100%;font-size:7pt}.doc-table th,.doc-table td{border:.18mm solid #555;padding:1mm 1.2mm;vertical-align:top}.doc-table th{background:#eee;font-weight:700}@media print{html,body{background:white}.page{margin:0;box-shadow:none}}</style></head><body><div class="page">${body}</div><script>window.addEventListener('load',()=>{document.title=${JSON.stringify(template.name)}})</script></body></html>`;
}
