export type OsElementKind = "text" | "field" | "box" | "line" | "table" | "signature" | "spacer";

export type OsTemplateElement = {
  id: string;
  kind: OsElementKind;
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  token?: string;
  fontSize?: number;
  fontWeight?: "normal" | "600" | "700";
  align?: "left" | "center" | "right";
  border?: boolean;
  borderWidth?: number;
  radius?: number;
  padding?: number;
  background?: string;
  color?: string;
  columns?: string[];
  rows?: number;
};

export type OsTemplate = {
  id: string;
  name: string;
  description?: string;
  page: "A4";
  orientation: "portrait" | "landscape";
  margin: number;
  grid: number;
  active?: boolean;
  createdAt: string;
  updatedAt: string;
  elements: OsTemplateElement[];
};

export type OsPrintData = {
  osNumber: string;
  openedAt: string;
  status: string;
  priority: string;
  customerName: string;
  customerTaxId: string;
  customerPhone: string;
  customerEmail: string;
  equipment: string;
  serialNumber: string;
  reportedIssue: string;
  diagnosis: string;
  solution: string;
  technician: string;
  labor: string;
  parts: string;
  total: string;
  companyName: string;
  companyTaxId: string;
  companyPhone: string;
  companyEmail: string;
  companyAddress: string;
};

export const OS_TEMPLATE_STORAGE_KEY = "seven.erp.os.templates.v1";
export const OS_TEMPLATE_ACTIVE_KEY = "seven.erp.os.template.active.v1";

const now = () => new Date().toISOString();
const uid = (prefix = "el") => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export const OS_TOKENS: Array<{ token: keyof OsPrintData; label: string; group: string }> = [
  { token: "osNumber", label: "Número da OS", group: "OS" },
  { token: "openedAt", label: "Data de abertura", group: "OS" },
  { token: "status", label: "Status", group: "OS" },
  { token: "priority", label: "Prioridade", group: "OS" },
  { token: "customerName", label: "Cliente", group: "Cliente" },
  { token: "customerTaxId", label: "CPF/CNPJ", group: "Cliente" },
  { token: "customerPhone", label: "Telefone", group: "Cliente" },
  { token: "customerEmail", label: "E-mail", group: "Cliente" },
  { token: "equipment", label: "Equipamento/Veículo", group: "Equipamento" },
  { token: "serialNumber", label: "Série/Placa", group: "Equipamento" },
  { token: "reportedIssue", label: "Relato / serviço solicitado", group: "Serviço" },
  { token: "diagnosis", label: "Diagnóstico", group: "Serviço" },
  { token: "solution", label: "Solução / serviço executado", group: "Serviço" },
  { token: "technician", label: "Técnico responsável", group: "Serviço" },
  { token: "labor", label: "Mão de obra", group: "Valores" },
  { token: "parts", label: "Peças / materiais", group: "Valores" },
  { token: "total", label: "Total", group: "Valores" },
  { token: "companyName", label: "Empresa", group: "Empresa" },
  { token: "companyTaxId", label: "CNPJ da empresa", group: "Empresa" },
  { token: "companyPhone", label: "Telefone da empresa", group: "Empresa" },
  { token: "companyEmail", label: "E-mail da empresa", group: "Empresa" },
  { token: "companyAddress", label: "Endereço da empresa", group: "Empresa" },
];

const e = (kind: OsElementKind, x: number, y: number, w: number, h: number, extra: Partial<OsTemplateElement> = {}): OsTemplateElement => ({
  id: uid(kind), kind, x, y, w, h, fontSize: 10, fontWeight: "normal", align: "left", border: false, borderWidth: 0.35, radius: 1.5, padding: 2, background: "#ffffff", color: "#111827", ...extra,
});

function modernTemplate(): OsTemplate {
  const stamp = now();
  return {
    id: "os-modern-a4",
    name: "Oficina Moderna",
    description: "Cabeçalho forte, blocos bem separados e leitura rápida.",
    page: "A4", orientation: "portrait", margin: 8, grid: 2, active: true, createdAt: stamp, updatedAt: stamp,
    elements: [
      e("box", 8, 8, 194, 27, { background: "#111827", border: false, radius: 3 }),
      e("field", 13, 13, 110, 8, { token: "companyName", fontSize: 18, fontWeight: "700", color: "#ffffff" }),
      e("field", 13, 23, 118, 5, { token: "companyAddress", fontSize: 8, color: "#d1d5db" }),
      e("text", 145, 13, 52, 5, { label: "ORDEM DE SERVIÇO", fontSize: 9, fontWeight: "700", align: "right", color: "#d1d5db" }),
      e("field", 145, 20, 52, 10, { token: "osNumber", fontSize: 21, fontWeight: "700", align: "right", color: "#ffffff" }),
      e("text", 8, 41, 194, 6, { label: "CLIENTE", fontSize: 9, fontWeight: "700" }),
      e("box", 8, 48, 194, 24, { border: true, background: "#f9fafb", radius: 2 }),
      e("field", 12, 52, 92, 7, { token: "customerName", fontSize: 12, fontWeight: "700" }),
      e("field", 108, 52, 42, 6, { token: "customerTaxId", fontSize: 9 }),
      e("field", 154, 52, 44, 6, { token: "customerPhone", fontSize: 9, align: "right" }),
      e("field", 12, 62, 90, 5, { token: "customerEmail", fontSize: 8 }),
      e("text", 8, 78, 194, 6, { label: "EQUIPAMENTO / VEÍCULO", fontSize: 9, fontWeight: "700" }),
      e("box", 8, 85, 194, 20, { border: true, radius: 2 }),
      e("field", 12, 90, 126, 7, { token: "equipment", fontSize: 12, fontWeight: "600" }),
      e("field", 145, 90, 52, 7, { token: "serialNumber", fontSize: 10, align: "right" }),
      e("text", 8, 112, 194, 6, { label: "RELATO / SERVIÇO SOLICITADO", fontSize: 9, fontWeight: "700" }),
      e("field", 8, 120, 194, 30, { token: "reportedIssue", fontSize: 10, border: true, radius: 2, padding: 3 }),
      e("text", 8, 156, 94, 6, { label: "DIAGNÓSTICO", fontSize: 9, fontWeight: "700" }),
      e("text", 108, 156, 94, 6, { label: "SERVIÇO EXECUTADO", fontSize: 9, fontWeight: "700" }),
      e("field", 8, 164, 94, 39, { token: "diagnosis", fontSize: 9, border: true, radius: 2, padding: 3 }),
      e("field", 108, 164, 94, 39, { token: "solution", fontSize: 9, border: true, radius: 2, padding: 3 }),
      e("box", 8, 211, 194, 26, { background: "#f3f4f6", border: true, radius: 2 }),
      e("text", 12, 216, 42, 5, { label: "MÃO DE OBRA", fontSize: 8, fontWeight: "700" }),
      e("field", 12, 223, 42, 7, { token: "labor", fontSize: 11, fontWeight: "700" }),
      e("text", 65, 216, 42, 5, { label: "PEÇAS / MATERIAIS", fontSize: 8, fontWeight: "700" }),
      e("field", 65, 223, 42, 7, { token: "parts", fontSize: 11, fontWeight: "700" }),
      e("text", 145, 216, 52, 5, { label: "TOTAL", fontSize: 8, fontWeight: "700", align: "right" }),
      e("field", 130, 222, 67, 9, { token: "total", fontSize: 17, fontWeight: "700", align: "right" }),
      e("signature", 8, 249, 82, 23, { label: "Assinatura do cliente", align: "center" }),
      e("signature", 120, 249, 82, 23, { label: "Técnico responsável", token: "technician", align: "center" }),
      e("field", 8, 279, 55, 5, { token: "openedAt", fontSize: 8 }),
      e("field", 145, 279, 57, 5, { token: "status", fontSize: 8, align: "right", fontWeight: "600" }),
    ],
  };
}

function technicalTemplate(): OsTemplate {
  const stamp = now();
  return {
    id: "os-technical-a4", name: "Técnico Completo", description: "Mais espaço para diagnóstico, laudo e execução.", page: "A4", orientation: "portrait", margin: 7, grid: 2, createdAt: stamp, updatedAt: stamp,
    elements: [
      e("text", 8, 9, 130, 8, { label: "ORDEM DE SERVIÇO TÉCNICA", fontSize: 18, fontWeight: "700" }),
      e("field", 145, 8, 57, 10, { token: "osNumber", fontSize: 20, fontWeight: "700", align: "right" }),
      e("line", 8, 22, 194, 1, {}),
      e("field", 8, 27, 120, 7, { token: "companyName", fontSize: 12, fontWeight: "700" }),
      e("field", 8, 36, 120, 5, { token: "companyAddress", fontSize: 8 }),
      e("field", 145, 28, 57, 5, { token: "companyPhone", fontSize: 8, align: "right" }),
      e("field", 145, 36, 57, 5, { token: "companyEmail", fontSize: 8, align: "right" }),
      e("box", 8, 48, 194, 31, { border: true, radius: 0 }),
      e("text", 11, 51, 40, 5, { label: "CLIENTE", fontSize: 8, fontWeight: "700" }),
      e("field", 11, 58, 110, 7, { token: "customerName", fontSize: 11, fontWeight: "600" }),
      e("field", 126, 58, 72, 6, { token: "customerTaxId", fontSize: 9, align: "right" }),
      e("field", 11, 68, 80, 5, { token: "customerPhone", fontSize: 8 }),
      e("field", 95, 68, 103, 5, { token: "customerEmail", fontSize: 8, align: "right" }),
      e("box", 8, 84, 194, 26, { border: true, radius: 0 }),
      e("text", 11, 87, 55, 5, { label: "EQUIPAMENTO / VEÍCULO", fontSize: 8, fontWeight: "700" }),
      e("field", 11, 95, 120, 7, { token: "equipment", fontSize: 11, fontWeight: "600" }),
      e("field", 140, 95, 58, 7, { token: "serialNumber", fontSize: 9, align: "right" }),
      e("text", 8, 116, 194, 5, { label: "SOLICITAÇÃO / SINTOMA INFORMADO", fontSize: 8, fontWeight: "700" }),
      e("field", 8, 123, 194, 27, { token: "reportedIssue", fontSize: 9, border: true, radius: 0, padding: 3 }),
      e("text", 8, 156, 194, 5, { label: "DIAGNÓSTICO TÉCNICO", fontSize: 8, fontWeight: "700" }),
      e("field", 8, 163, 194, 42, { token: "diagnosis", fontSize: 9, border: true, radius: 0, padding: 3 }),
      e("text", 8, 211, 194, 5, { label: "PROCEDIMENTOS / SERVIÇO EXECUTADO", fontSize: 8, fontWeight: "700" }),
      e("field", 8, 218, 194, 32, { token: "solution", fontSize: 9, border: true, radius: 0, padding: 3 }),
      e("field", 8, 257, 55, 8, { token: "labor", label: "Mão de obra", fontSize: 10, fontWeight: "700" }),
      e("field", 73, 257, 55, 8, { token: "parts", label: "Peças", fontSize: 10, fontWeight: "700" }),
      e("field", 145, 255, 57, 11, { token: "total", fontSize: 16, fontWeight: "700", align: "right" }),
      e("signature", 8, 270, 88, 18, { label: "Cliente", align: "center" }),
      e("signature", 114, 270, 88, 18, { label: "Responsável técnico", token: "technician", align: "center" }),
    ],
  };
}

function twoCopiesTemplate(): OsTemplate {
  const base = modernTemplate();
  const scaleY = 0.47;
  const top = base.elements.filter((item) => item.y < 237).map((item) => ({ ...item, id: uid("top"), y: 7 + (item.y - 8) * scaleY, h: Math.max(3, item.h * scaleY), fontSize: Math.max(6, (item.fontSize || 10) * 0.78), padding: Math.min(item.padding || 2, 1.4) }));
  const bottom = top.map((item) => ({ ...item, id: uid("bottom"), y: item.y + 145 }));
  const stamp = now();
  return { id: "os-two-copies", name: "Duas vias A4", description: "Duas vias da OS na mesma folha A4.", page: "A4", orientation: "portrait", margin: 5, grid: 1, createdAt: stamp, updatedAt: stamp, elements: [...top, e("line", 5, 147, 200, 1, {}), e("text", 83, 143, 44, 5, { label: "✂ corte aqui", align: "center", fontSize: 7, color: "#6b7280" }), ...bottom] };
}

export function defaultOsTemplates(): OsTemplate[] { return [modernTemplate(), technicalTemplate(), twoCopiesTemplate()]; }

export function newBlankTemplate(name = "Novo modelo"): OsTemplate {
  const stamp = now();
  return { id: uid("template"), name, description: "Modelo personalizado", page: "A4", orientation: "portrait", margin: 8, grid: 2, createdAt: stamp, updatedAt: stamp, elements: [] };
}

export function cloneTemplate(template: OsTemplate): OsTemplate {
  const stamp = now();
  return { ...template, id: uid("template"), name: `${template.name} - cópia`, active: false, createdAt: stamp, updatedAt: stamp, elements: template.elements.map((item) => ({ ...item, id: uid(item.kind) })) };
}

export function sampleOsPrintData(): OsPrintData {
  return {
    osNumber: "OS #00142", openedAt: "01/09/2026 14:35", status: "Em execução", priority: "Alta",
    customerName: "CLIENTE EXEMPLO LTDA", customerTaxId: "12.345.678/0001-90", customerPhone: "(54) 99999-0000", customerEmail: "cliente@exemplo.com.br",
    equipment: "Volkswagen Polo Highline 1.0 TSI 2027", serialNumber: "ABC1D23", reportedIssue: "Cliente relata ruído na suspensão dianteira e solicita revisão preventiva de 30.000 km.",
    diagnosis: "Folga identificada na bieleta dianteira direita. Pastilhas com aproximadamente 35% de vida útil.", solution: "Substituição da bieleta, reaperto do conjunto dianteiro e revisão preventiva conforme checklist.", technician: "Técnico Responsável",
    labor: "R$ 280,00", parts: "R$ 390,00", total: "R$ 670,00", companyName: "SEVEN AUTO CENTER", companyTaxId: "12.345.678/0001-90", companyPhone: "(54) 3456-7890", companyEmail: "contato@empresa.com.br", companyAddress: "Av. Exemplo, 1000 · Centro · Bento Gonçalves/RS",
  };
}

const esc = (value: unknown) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function resolveElementText(element: OsTemplateElement, data: OsPrintData) {
  const value = element.token ? data[element.token as keyof OsPrintData] : "";
  if (element.kind === "field" && element.label && value) return `${element.label}: ${value}`;
  return value || element.label || "";
}

export function pageDimensions(template: OsTemplate) {
  return template.orientation === "landscape" ? { width: 297, height: 210 } : { width: 210, height: 297 };
}

export function renderOsTemplateHtml(template: OsTemplate, data: OsPrintData) {
  const page = pageDimensions(template);
  const body = template.elements.map((item) => {
    const base = `position:absolute;left:${item.x}mm;top:${item.y}mm;width:${item.w}mm;height:${item.h}mm;box-sizing:border-box;color:${item.color || "#111827"};font-size:${item.fontSize || 10}pt;font-weight:${item.fontWeight || "normal"};text-align:${item.align || "left"};padding:${item.padding || 0}mm;border:${item.border ? `${item.borderWidth || 0.35}mm solid #111827` : "none"};border-radius:${item.radius || 0}mm;background:${item.background || "transparent"};overflow:hidden;`;
    if (item.kind === "line") return `<div style="${base}height:0;border-top:0.3mm solid #111827;padding:0"></div>`;
    if (item.kind === "signature") return `<div style="${base};overflow:visible"><div style="position:absolute;left:0;right:0;bottom:5mm;border-top:0.3mm solid #111827"></div><div style="position:absolute;left:0;right:0;bottom:0;text-align:center;font-size:${Math.max(7, (item.fontSize || 9) - 1)}pt">${esc(item.label || "Assinatura")}${item.token ? `<br><span style="font-size:7pt">${esc(data[item.token as keyof OsPrintData])}</span>` : ""}</div></div>`;
    if (item.kind === "box" || item.kind === "spacer") return `<div style="${base}">${item.label ? esc(item.label) : ""}</div>`;
    if (item.kind === "table") {
      const cols = item.columns?.length ? item.columns : ["Descrição", "Qtd.", "Valor"];
      const rows = Math.max(2, item.rows || 4);
      return `<div style="${base};padding:0"><table style="width:100%;height:100%;border-collapse:collapse;font-size:inherit"><thead><tr>${cols.map((c) => `<th style="border:0.2mm solid #111827;padding:1mm;text-align:left">${esc(c)}</th>`).join("")}</tr></thead><tbody>${Array.from({ length: rows }).map(() => `<tr>${cols.map(() => `<td style="border:0.2mm solid #9ca3af;padding:1mm">&nbsp;</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    }
    return `<div style="${base};white-space:pre-wrap">${esc(resolveElementText(item, data))}</div>`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(template.name)}</title><style>@page{size:${template.orientation === "landscape" ? "A4 landscape" : "A4 portrait"};margin:0}html,body{margin:0;padding:0;background:#fff;font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{position:relative;width:${page.width}mm;height:${page.height}mm;overflow:hidden;background:#fff}</style></head><body><div class="page">${body}</div><script>window.onload=()=>setTimeout(()=>window.print(),120)</script></body></html>`;
}
