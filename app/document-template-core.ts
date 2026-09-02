export type DocumentType = "service_order" | "quote" | "sales_order" | "purchase_order" | "receipt" | "invoice" | "vehicle_checklist" | "technical_report";
export type PagePreset = "A4" | "A5" | "LETTER" | "THERMAL_58" | "THERMAL_80" | "CUSTOM";
export type Orientation = "portrait" | "landscape";
export type DocumentElementKind = "text" | "field" | "image" | "line" | "rectangle" | "table" | "qrcode" | "barcode" | "signature" | "page_number";

export type FieldCondition = {
  field: string;
  operator: "eq" | "neq" | "contains" | "not_empty" | "empty" | "gt" | "gte" | "lt" | "lte";
  value?: string | number | boolean;
};

export type TableColumn = {
  id: string;
  label: string;
  field: string;
  widthMm: number;
  align?: "left" | "center" | "right";
  format?: "text" | "money" | "number";
};

export type DocumentTemplateElement = {
  id: string;
  kind: DocumentElementKind;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  text?: string;
  field?: string;
  source?: string;
  fontSizePt?: number;
  fontWeight?: "normal" | "600" | "700";
  align?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  color?: string;
  background?: string;
  borderWidthMm?: number;
  borderColor?: string;
  radiusMm?: number;
  paddingMm?: number;
  repeatOnEveryPage?: boolean;
  section?: "body" | "header" | "footer";
  condition?: FieldCondition;
  tableSource?: "Itens";
  columns?: TableColumn[];
  rowHeightMm?: number;
  maxRows?: number;
  barcodeFormat?: "CODE128" | "EAN13" | "CODE39";
};

export type DocumentTemplateDefinition = {
  schemaVersion: 1;
  pagePreset: PagePreset;
  orientation: Orientation;
  pageWidthMm: number;
  pageHeightMm: number;
  marginTopMm: number;
  marginRightMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  gridMm: number;
  elements: DocumentTemplateElement[];
};

export type DocumentTemplate = {
  id: string;
  documentType: DocumentType;
  name: string;
  description: string;
  isDefault: boolean;
  currentVersion: number;
  definition: DocumentTemplateDefinition;
  createdAt: string;
  updatedAt: string;
};

export type DocumentTemplateVersion = {
  id: string;
  templateId: string;
  version: number;
  definition: DocumentTemplateDefinition;
  note: string;
  createdAt: string;
};

export type FieldRegistryEntry = {
  path: string;
  label: string;
  group: string;
  type: "text" | "money" | "number" | "date" | "image";
  collection?: boolean;
};

export const DOCUMENT_FIELD_REGISTRY: FieldRegistryEntry[] = [
  { path: "Empresa.RazaoSocial", label: "Razão Social", group: "Empresa", type: "text" },
  { path: "Empresa.NomeFantasia", label: "Nome Fantasia", group: "Empresa", type: "text" },
  { path: "Empresa.CNPJ", label: "CNPJ", group: "Empresa", type: "text" },
  { path: "Empresa.Endereco", label: "Endereço", group: "Empresa", type: "text" },
  { path: "Empresa.Telefone", label: "Telefone", group: "Empresa", type: "text" },
  { path: "Empresa.Email", label: "E-mail", group: "Empresa", type: "text" },
  { path: "Empresa.Logo", label: "Logo", group: "Empresa", type: "image" },
  { path: "Cliente.Nome", label: "Nome", group: "Cliente", type: "text" },
  { path: "Cliente.CpfCnpj", label: "CPF/CNPJ", group: "Cliente", type: "text" },
  { path: "Cliente.Telefone", label: "Telefone", group: "Cliente", type: "text" },
  { path: "Cliente.WhatsApp", label: "WhatsApp", group: "Cliente", type: "text" },
  { path: "Cliente.Email", label: "E-mail", group: "Cliente", type: "text" },
  { path: "Cliente.Endereco", label: "Endereço", group: "Cliente", type: "text" },
  { path: "Veiculo.Placa", label: "Placa", group: "Veículo", type: "text" },
  { path: "Veiculo.Marca", label: "Marca", group: "Veículo", type: "text" },
  { path: "Veiculo.Modelo", label: "Modelo", group: "Veículo", type: "text" },
  { path: "Veiculo.Versao", label: "Versão", group: "Veículo", type: "text" },
  { path: "Veiculo.Ano", label: "Ano", group: "Veículo", type: "text" },
  { path: "Veiculo.Cor", label: "Cor", group: "Veículo", type: "text" },
  { path: "Veiculo.Chassi", label: "Chassi", group: "Veículo", type: "text" },
  { path: "Veiculo.Renavam", label: "RENAVAM", group: "Veículo", type: "text" },
  { path: "Veiculo.Km", label: "Km", group: "Veículo", type: "number" },
  { path: "Documento.Numero", label: "Número", group: "Documento", type: "text" },
  { path: "Documento.Data", label: "Data", group: "Documento", type: "date" },
  { path: "Documento.Validade", label: "Validade", group: "Documento", type: "date" },
  { path: "Documento.Observacoes", label: "Observações", group: "Documento", type: "text" },
  { path: "OS.Numero", label: "Número", group: "OS", type: "text" },
  { path: "OS.DataEntrada", label: "Data de entrada", group: "OS", type: "date" },
  { path: "OS.Previsao", label: "Previsão", group: "OS", type: "date" },
  { path: "OS.DefeitoRelatado", label: "Defeito relatado", group: "OS", type: "text" },
  { path: "OS.Diagnostico", label: "Diagnóstico", group: "OS", type: "text" },
  { path: "OS.ServicoExecutado", label: "Serviço executado", group: "OS", type: "text" },
  { path: "OS.Observacoes", label: "Observações", group: "OS", type: "text" },
  { path: "OS.Tecnico", label: "Técnico", group: "OS", type: "text" },
  { path: "OS.KmEntrada", label: "Km entrada", group: "OS", type: "number" },
  { path: "OS.KmSaida", label: "Km saída", group: "OS", type: "number" },
  { path: "Item.Codigo", label: "Código", group: "Itens", type: "text", collection: true },
  { path: "Item.Descricao", label: "Descrição", group: "Itens", type: "text", collection: true },
  { path: "Item.Unidade", label: "Unidade", group: "Itens", type: "text", collection: true },
  { path: "Item.Quantidade", label: "Quantidade", group: "Itens", type: "number", collection: true },
  { path: "Item.ValorUnitario", label: "Valor unitário", group: "Itens", type: "money", collection: true },
  { path: "Item.Desconto", label: "Desconto", group: "Itens", type: "money", collection: true },
  { path: "Item.Total", label: "Total", group: "Itens", type: "money", collection: true },
  { path: "Totais.Produtos", label: "Produtos", group: "Totais", type: "money" },
  { path: "Totais.Servicos", label: "Serviços", group: "Totais", type: "money" },
  { path: "Totais.Desconto", label: "Desconto", group: "Totais", type: "money" },
  { path: "Totais.Frete", label: "Frete", group: "Totais", type: "money" },
  { path: "Totais.Total", label: "Total", group: "Totais", type: "money" },
];

const uid = (prefix = "doc") => typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const now = () => new Date().toISOString();

export function pageSize(preset: PagePreset, orientation: Orientation, customWidthMm = 210, customHeightMm = 297) {
  const base = preset === "A4" ? [210, 297] : preset === "A5" ? [148, 210] : preset === "LETTER" ? [215.9, 279.4] : preset === "THERMAL_58" ? [58, 180] : preset === "THERMAL_80" ? [80, 200] : [customWidthMm, customHeightMm];
  return orientation === "landscape" ? { widthMm: base[1], heightMm: base[0] } : { widthMm: base[0], heightMm: base[1] };
}

export function blankDefinition(preset: PagePreset = "A4", orientation: Orientation = "portrait"): DocumentTemplateDefinition {
  const size = pageSize(preset, orientation);
  return { schemaVersion: 1, pagePreset: preset, orientation, pageWidthMm: size.widthMm, pageHeightMm: size.heightMm, marginTopMm: 8, marginRightMm: 8, marginBottomMm: 8, marginLeftMm: 8, gridMm: 2, elements: [] };
}

export function createBlankTemplate(documentType: DocumentType, name = "Novo modelo"): DocumentTemplate {
  const stamp = now();
  return { id: uid("template"), documentType, name, description: "", isDefault: false, currentVersion: 1, definition: blankDefinition(), createdAt: stamp, updatedAt: stamp };
}

export function cloneDefinition(definition: DocumentTemplateDefinition): DocumentTemplateDefinition {
  return JSON.parse(JSON.stringify(definition));
}

export function newVersion(template: DocumentTemplate, definition: DocumentTemplateDefinition, note = "Alteração do modelo"): { template: DocumentTemplate; version: DocumentTemplateVersion } {
  const versionNumber = Math.max(1, Number(template.currentVersion) || 1) + 1;
  const stamp = now();
  return {
    template: { ...template, currentVersion: versionNumber, definition: cloneDefinition(definition), updatedAt: stamp },
    version: { id: uid("version"), templateId: template.id, version: versionNumber, definition: cloneDefinition(definition), note, createdAt: stamp },
  };
}

export function initialVersion(template: DocumentTemplate): DocumentTemplateVersion {
  return { id: uid("version"), templateId: template.id, version: 1, definition: cloneDefinition(template.definition), note: "Versão inicial", createdAt: template.createdAt };
}

export function restoreVersion(template: DocumentTemplate, source: DocumentTemplateVersion) {
  return newVersion(template, source.definition, `Restaurado da versão ${source.version}`);
}

export function getPath(data: unknown, path: string): unknown {
  if (!path) return undefined;
  return path.split(".").reduce<unknown>((current, part) => current && typeof current === "object" ? (current as Record<string, unknown>)[part] : undefined, data);
}

export function formatBoundValue(value: unknown, type?: FieldRegistryEntry["type"]) {
  if (value === null || value === undefined) return "";
  if (type === "money") return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) || 0);
  if (type === "number") return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(Number(value) || 0);
  if (type === "date") {
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("pt-BR").format(date);
  }
  return String(value);
}

export function resolveField(data: unknown, path: string) {
  const entry = DOCUMENT_FIELD_REGISTRY.find((item) => item.path === path);
  return formatBoundValue(getPath(data, path), entry?.type);
}

export function evaluateCondition(data: unknown, condition?: FieldCondition) {
  if (!condition) return true;
  const actual = getPath(data, condition.field);
  const expected = condition.value;
  switch (condition.operator) {
    case "eq": return String(actual ?? "") === String(expected ?? "");
    case "neq": return String(actual ?? "") !== String(expected ?? "");
    case "contains": return String(actual ?? "").toLowerCase().includes(String(expected ?? "").toLowerCase());
    case "not_empty": return actual !== null && actual !== undefined && String(actual).trim() !== "";
    case "empty": return actual === null || actual === undefined || String(actual).trim() === "";
    case "gt": return Number(actual) > Number(expected);
    case "gte": return Number(actual) >= Number(expected);
    case "lt": return Number(actual) < Number(expected);
    case "lte": return Number(actual) <= Number(expected);
    default: return true;
  }
}

const element = (kind: DocumentElementKind, xMm: number, yMm: number, widthMm: number, heightMm: number, extra: Partial<DocumentTemplateElement> = {}): DocumentTemplateElement => ({ id: uid(kind), kind, xMm, yMm, widthMm, heightMm, fontSizePt: 9, fontWeight: "normal", align: "left", verticalAlign: "top", color: "#111111", background: "transparent", borderWidthMm: 0, borderColor: "#111111", radiusMm: 0, paddingMm: 1.5, section: "body", ...extra });

function baseHeader(title: string): DocumentTemplateElement[] {
  return [
    element("field", 10, 10, 115, 8, { field: "Empresa.NomeFantasia", fontSizePt: 16, fontWeight: "700", section: "header" }),
    element("field", 10, 19, 115, 5, { field: "Empresa.CNPJ", fontSizePt: 8, section: "header" }),
    element("text", 132, 10, 68, 7, { text: title, fontSizePt: 13, fontWeight: "700", align: "right", section: "header" }),
    element("field", 145, 19, 55, 6, { field: "Documento.Numero", fontSizePt: 11, fontWeight: "700", align: "right", section: "header" }),
    element("line", 10, 28, 190, 0.4, { section: "header", borderWidthMm: 0.4 }),
  ];
}

const itemColumns: TableColumn[] = [
  { id: "code", label: "Código", field: "Item.Codigo", widthMm: 22 },
  { id: "description", label: "Descrição", field: "Item.Descricao", widthMm: 75 },
  { id: "unit", label: "UN", field: "Item.Unidade", widthMm: 12, align: "center" },
  { id: "qty", label: "Qtd.", field: "Item.Quantidade", widthMm: 19, align: "right", format: "number" },
  { id: "unitPrice", label: "V. Unit.", field: "Item.ValorUnitario", widthMm: 28, align: "right", format: "money" },
  { id: "total", label: "Total", field: "Item.Total", widthMm: 30, align: "right", format: "money" },
];

function standardTemplate(documentType: DocumentType, name: string, title: string): DocumentTemplate {
  const template = createBlankTemplate(documentType, name);
  template.description = "Modelo padrão instalado com o Seven ERP.";
  template.definition.elements = [
    ...baseHeader(title),
    element("text", 10, 35, 35, 5, { text: "CLIENTE", fontSizePt: 8, fontWeight: "700" }),
    element("field", 10, 41, 120, 7, { field: "Cliente.Nome", fontSizePt: 11, fontWeight: "600" }),
    element("field", 132, 41, 68, 6, { field: "Cliente.CpfCnpj", align: "right" }),
    element("field", 10, 50, 95, 5, { field: "Cliente.Endereco", fontSizePt: 8 }),
    element("field", 110, 50, 90, 5, { field: "Cliente.Telefone", fontSizePt: 8, align: "right" }),
    element("table", 10, 62, 190, 105, { tableSource: "Itens", columns: itemColumns, rowHeightMm: 7, maxRows: 12, borderWidthMm: 0.25 }),
    element("text", 140, 174, 25, 5, { text: "TOTAL", fontSizePt: 9, fontWeight: "700", align: "right" }),
    element("field", 166, 172, 34, 8, { field: "Totais.Total", fontSizePt: 14, fontWeight: "700", align: "right" }),
    element("field", 10, 188, 190, 30, { field: "Documento.Observacoes", borderWidthMm: 0.25, paddingMm: 2 }),
    element("signature", 10, 240, 80, 22, { text: "Assinatura do cliente", align: "center" }),
    element("signature", 120, 240, 80, 22, { text: "Responsável", align: "center" }),
    element("page_number", 160, 282, 40, 5, { text: "Página {page} de {pages}", align: "right", fontSizePt: 7, section: "footer" }),
  ];
  return template;
}

function serviceOrderTemplate(name: string, mode: "standard" | "mechanic" | "complete" | "checklist" | "two_copies"): DocumentTemplate {
  const template = standardTemplate("service_order", name, "ORDEM DE SERVIÇO");
  if (mode !== "standard") {
    template.definition.elements.splice(5, 0,
      element("text", 10, 58, 35, 5, { text: "VEÍCULO", fontSizePt: 8, fontWeight: "700" }),
      element("field", 10, 63, 45, 6, { field: "Veiculo.Placa", fontWeight: "700" }),
      element("field", 58, 63, 72, 6, { field: "Veiculo.Modelo" }),
      element("field", 132, 63, 68, 6, { field: "Veiculo.Km", align: "right" }),
    );
    const table = template.definition.elements.find((item) => item.kind === "table"); if (table) table.yMm = 75;
  }
  if (mode === "complete" || mode === "mechanic") {
    template.definition.elements.push(
      element("text", 10, 183, 45, 5, { text: "DEFEITO RELATADO", fontSizePt: 8, fontWeight: "700" }),
      element("field", 10, 189, 92, 24, { field: "OS.DefeitoRelatado", borderWidthMm: 0.25 }),
      element("text", 108, 183, 40, 5, { text: "DIAGNÓSTICO", fontSizePt: 8, fontWeight: "700" }),
      element("field", 108, 189, 92, 24, { field: "OS.Diagnostico", borderWidthMm: 0.25 }),
    );
  }
  if (mode === "checklist") template.definition.elements.push(element("text", 10, 220, 190, 8, { text: "CHECKLIST DO VEÍCULO: pneus · iluminação · níveis · avarias · acessórios", borderWidthMm: 0.25, fontSizePt: 8 }));
  if (mode === "two_copies") {
    template.definition.pagePreset = "A4";
    template.description = "Duas vias compactas na mesma folha A4.";
  }
  return template;
}

export function defaultDocumentTemplates(): DocumentTemplate[] {
  const templates: DocumentTemplate[] = [
    serviceOrderTemplate("OS Padrão", "standard"),
    serviceOrderTemplate("OS Oficina Mecânica", "mechanic"),
    serviceOrderTemplate("OS Completa", "complete"),
    serviceOrderTemplate("OS com Checklist", "checklist"),
    serviceOrderTemplate("OS 2 Vias", "two_copies"),
    standardTemplate("quote", "Orçamento Padrão", "ORÇAMENTO"),
    standardTemplate("quote", "Orçamento Moderno", "ORÇAMENTO"),
    standardTemplate("quote", "Orçamento Oficina", "ORÇAMENTO DE SERVIÇOS"),
    standardTemplate("sales_order", "Pedido Padrão", "PEDIDO DE VENDA"),
    standardTemplate("sales_order", "Pedido Completo", "PEDIDO DE VENDA"),
    standardTemplate("receipt", "Recibo Padrão", "RECIBO"),
    standardTemplate("receipt", "Recibo 2 Vias", "RECIBO"),
    standardTemplate("purchase_order", "Pedido de Compra Padrão", "PEDIDO DE COMPRA"),
    standardTemplate("invoice", "Fatura Padrão", "FATURA"),
    standardTemplate("vehicle_checklist", "Checklist de Veículo Padrão", "CHECKLIST DE VEÍCULO"),
    standardTemplate("technical_report", "Relatório Técnico Padrão", "RELATÓRIO TÉCNICO"),
  ];
  const firstPerType = new Set<DocumentType>();
  for (const template of templates) {
    template.id = `builtin-${template.documentType}-${template.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
    template.isDefault = !firstPerType.has(template.documentType);
    firstPerType.add(template.documentType);
  }
  return templates;
}

export function sampleDocumentData() {
  return {
    Empresa: { RazaoSocial: "EMPRESA DE EXEMPLO LTDA", NomeFantasia: "EMPRESA", CNPJ: "00.000.000/0001-00", Endereco: "Rua Exemplo, 100 - Centro", Telefone: "(00) 0000-0000", Email: "contato@empresa.com.br", Logo: "" },
    Cliente: { Nome: "CLIENTE PARA PRÉ-VISUALIZAÇÃO", CpfCnpj: "000.000.000-00", Telefone: "(00) 99999-9999", WhatsApp: "(00) 99999-9999", Email: "cliente@exemplo.com", Endereco: "Av. Cliente, 200" },
    Veiculo: { Placa: "ABC1D23", Marca: "Marca", Modelo: "Modelo", Versao: "Versão", Ano: "2026/2027", Cor: "Prata", Chassi: "9BWZZZ00000000000", Renavam: "00000000000", Km: 12500 },
    Documento: { Numero: "000123", Data: new Date().toISOString(), Validade: new Date(Date.now() + 7 * 86400000).toISOString(), Observacoes: "Pré-visualização do modelo. Os dados reais são vinculados no momento da emissão." },
    OS: { Numero: "000123", DataEntrada: new Date().toISOString(), Previsao: "", DefeitoRelatado: "Ruído informado pelo cliente.", Diagnostico: "Diagnóstico de exemplo apenas para pré-visualização.", ServicoExecutado: "", Observacoes: "", Tecnico: "Técnico", KmEntrada: 12500, KmSaida: 12510 },
    Itens: [
      { Codigo: "P001", Descricao: "Produto de pré-visualização", Unidade: "UN", Quantidade: 2, ValorUnitario: 50, Desconto: 0, Total: 100 },
      { Codigo: "S001", Descricao: "Serviço de pré-visualização", Unidade: "SV", Quantidade: 1, ValorUnitario: 150, Desconto: 0, Total: 150 },
    ],
    Totais: { Produtos: 100, Servicos: 150, Desconto: 0, Frete: 0, Total: 250 },
  };
}

export function serializeTemplate(template: DocumentTemplate) { return JSON.stringify(template, null, 2); }
export function parseTemplate(raw: string): DocumentTemplate {
  const value = JSON.parse(raw);
  if (!value || value.definition?.schemaVersion !== 1 || !value.id || !value.documentType || !Array.isArray(value.definition?.elements)) throw new Error("Arquivo de modelo inválido ou incompatível.");
  return value as DocumentTemplate;
}
