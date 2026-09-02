import { code128Svg, parseNfeProc } from "./nfe-danfe.mjs";

const clean = (value) => String(value ?? "").trim();
const esc = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const alphaNum = (value) => clean(value).toUpperCase().replace(/[^A-Z0-9]/g, "");

function decodeXml(value) {
  return String(value || "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
}
function element(source, name) {
  const match = String(source || "").match(new RegExp(`<(?:\\w+:)?${name}\\b[^>]*>[\\s\\S]*?<\\/(?:\\w+:)?${name}>`, "i"));
  return match ? match[0] : "";
}
function tag(source, name) {
  const match = String(source || "").match(new RegExp(`<(?:\\w+:)?${name}\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${name}>`, "i"));
  return match ? decodeXml(match[1].replace(/<[^>]+>/g, "")).trim() : "";
}
function allElements(source, name) {
  return [...String(source || "").matchAll(new RegExp(`<(?:\\w+:)?${name}\\b[^>]*>[\\s\\S]*?<\\/(?:\\w+:)?${name}>`, "gi"))].map((match) => match[0]);
}
function numberText(value, decimals = 2) {
  const parsed = Number(String(value || "0").replace(",", "."));
  return Number.isFinite(parsed) ? parsed.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : "0,00";
}
function formatTaxId(value) {
  const raw = alphaNum(value);
  if (/^\d{14}$/.test(raw)) return raw.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (/^\d{11}$/.test(raw)) return raw.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return raw;
}
function formatCep(value) {
  const raw = String(value || "").replace(/\D/g, "");
  return /^\d{8}$/.test(raw) ? raw.replace(/^(\d{5})(\d{3})$/, "$1-$2") : raw;
}
function groupedKey(key) { return alphaNum(key).replace(/(.{4})/g, "$1 ").trim(); }
function dateParts(value) {
  if (!value) return { date: "", time: "" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: String(value), time: "" };
  return {
    date: date.toLocaleDateString("pt-BR"),
    time: date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
  };
}
function addressLine(party) {
  return [party.street, party.number, party.complement].filter(Boolean).join(", ");
}
function labelValue(label, value, classes = "") {
  return `<div class="field ${classes}"><span>${esc(label)}</span><b>${esc(value || "")}</b></div>`;
}

function extractClassicData(nfeProcXml) {
  const base = parseNfeProc(nfeProcXml);
  const source = clean(nfeProcXml);
  const nfe = element(source, "NFe");
  const inf = element(nfe, "infNFe");
  const ide = element(inf, "ide");
  const emit = element(inf, "emit");
  const dest = element(inf, "dest");
  const total = element(inf, "ICMSTot");
  const transp = element(inf, "transp");
  const carrier = element(transp, "transporta");
  const vehicle = element(transp, "veicTransp");
  const volume = element(transp, "vol");
  const cobr = element(inf, "cobr");
  const fat = element(cobr, "fat");
  const issue = dateParts(base.issueDate);

  const items = allElements(inf, "det").map((det, index) => {
    const prod = element(det, "prod");
    const imposto = element(det, "imposto");
    const icms = element(imposto, "ICMS");
    const ipi = element(imposto, "IPI");
    return {
      number: index + 1,
      code: tag(prod, "cProd"),
      description: tag(prod, "xProd"),
      ncm: tag(prod, "NCM"),
      cst: tag(icms, "CST") || tag(icms, "CSOSN"),
      cfop: tag(prod, "CFOP"),
      unit: tag(prod, "uCom"),
      quantity: tag(prod, "qCom"),
      unitValue: tag(prod, "vUnCom"),
      productValue: tag(prod, "vProd"),
      baseIcms: tag(icms, "vBC"),
      icms: tag(icms, "vICMS"),
      ipi: tag(ipi, "vIPI"),
      icmsRate: tag(icms, "pICMS"),
      ipiRate: tag(ipi, "pIPI"),
    };
  });

  return {
    ...base,
    operationType: tag(ide, "tpNF") === "0" ? "0 - ENTRADA" : "1 - SAÍDA",
    issueDateOnly: issue.date,
    issueTime: issue.time,
    issuerIeSt: tag(emit, "IEST"),
    recipientEmail: tag(dest, "email"),
    recipientCity: base.recipient.city,
    recipientState: base.recipient.state,
    totalsClassic: {
      ...base.totals,
      baseIcmsSt: tag(total, "vBCST"),
      icmsSt: tag(total, "vST"),
      importTax: tag(total, "vII"),
    },
    transport: {
      mode: tag(transp, "modFrete"),
      name: tag(carrier, "xNome"),
      taxId: tag(carrier, "CNPJ") || tag(carrier, "CPF"),
      ie: tag(carrier, "IE"),
      address: tag(carrier, "xEnder"),
      city: tag(carrier, "xMun"),
      state: tag(carrier, "UF"),
      vehiclePlate: tag(vehicle, "placa"),
      vehicleState: tag(vehicle, "UF"),
      quantity: tag(volume, "qVol"),
      species: tag(volume, "esp"),
      brand: tag(volume, "marca"),
      numbering: tag(volume, "nVol"),
      grossWeight: tag(volume, "pesoB"),
      netWeight: tag(volume, "pesoL"),
    },
    invoice: {
      number: tag(fat, "nFat"),
      original: tag(fat, "vOrig"),
      discount: tag(fat, "vDesc"),
      net: tag(fat, "vLiq"),
      duplicates: allElements(cobr, "dup").map((dup) => ({ number: tag(dup, "nDup"), due: tag(dup, "dVenc"), value: tag(dup, "vDup") })),
    },
    items,
  };
}

function freightLabel(mode) {
  const labels = {
    "0": "0 - Remetente (CIF)",
    "1": "1 - Destinatário (FOB)",
    "2": "2 - Terceiros",
    "3": "3 - Próprio remetente",
    "4": "4 - Próprio destinatário",
    "9": "9 - Sem frete",
  };
  return labels[String(mode || "")] || "";
}

function itemsRows(items) {
  return items.map((item) => `<tr>
    <td>${esc(item.code)}</td><td class="description">${esc(item.description)}</td><td>${esc(item.ncm)}</td><td>${esc(item.cst)}</td><td>${esc(item.cfop)}</td><td>${esc(item.unit)}</td>
    <td class="num">${esc(numberText(item.quantity, 4))}</td><td class="num">${esc(numberText(item.unitValue, 4))}</td><td class="num">${esc(numberText(item.productValue))}</td>
    <td class="num">${esc(numberText(item.baseIcms))}</td><td class="num">${esc(numberText(item.icms))}</td><td class="num">${esc(numberText(item.ipi))}</td>
    <td class="num">${esc(numberText(item.icmsRate))}</td><td class="num">${esc(numberText(item.ipiRate))}</td>
  </tr>`).join("");
}

export function buildClassicDanfeHtml({ nfeProcXml, cancelled = false, cancellationProtocol = "" }) {
  const data = extractClassicData(nfeProcXml);
  const barcode = code128Svg(data.accessKey, { height: 48, moduleWidth: 0.42 });
  const watermark = cancelled ? "CANCELADA" : data.environment === "homologation" ? "SEM VALOR FISCAL<br><small>AMBIENTE DE HOMOLOGAÇÃO</small>" : "";
  const receiptText = `RECEBEMOS DE ${data.issuer.name} OS PRODUTOS E/OU SERVIÇOS CONSTANTES DA NOTA FISCAL ELETRÔNICA INDICADA AO LADO. EMISSÃO: ${data.issueDateOnly} VALOR TOTAL: R$ ${numberText(data.totals.invoice)} DESTINATÁRIO: ${data.recipient.name} - ${addressLine(data.recipient)}.`;
  const dup = data.invoice.duplicates.slice(0, 6).map((row) => `<div><span>${esc(row.number || "Duplicata")}</span><b>${esc(row.due || "")}</b><strong>R$ ${esc(numberText(row.value))}</strong></div>`).join("");

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>DANFE NF-e ${esc(data.number)}</title><style>
  @page{size:A4 portrait;margin:5mm 7mm 6mm}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif;font-size:6.7pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{width:196mm;min-height:284mm;margin:0 auto;position:relative}.block{border:.32mm solid #000;margin-top:1.15mm;background:#fff;position:relative;z-index:2}.field{min-height:8mm;padding:.55mm 1mm;border-right:.26mm solid #000;overflow:hidden}.field:last-child{border-right:0}.field span,.micro-label{display:block;font-size:4.7pt;line-height:1.1;text-transform:uppercase}.field b{display:block;font-size:7pt;line-height:1.25;margin-top:.4mm}.row{display:grid}.row+.row{border-top:.26mm solid #000}.section-label{font-weight:700;font-size:5.7pt;text-transform:uppercase;margin-top:1.2mm;margin-bottom:-.7mm}.receipt{display:grid;grid-template-columns:1fr 31mm;min-height:18mm}.receipt-main{padding:1mm 1.3mm;border-right:.32mm solid #000;display:flex;flex-direction:column;justify-content:space-between}.receipt-main p{font-size:5.6pt;line-height:1.25;margin:0}.receipt-sign{display:grid;grid-template-columns:34mm 1fr;border-top:.26mm solid #000;margin-top:1mm}.receipt-sign div{min-height:5mm;padding:.5mm;border-right:.26mm solid #000}.receipt-sign div:last-child{border-right:0}.receipt-nfe{text-align:center;padding:1.4mm .6mm}.receipt-nfe strong{font-size:12pt}.receipt-nfe b{display:block;font-size:8pt;margin-top:1.5mm}.header{display:grid;grid-template-columns:42% 18% 40%;min-height:36mm}.issuer{border-right:.32mm solid #000;padding:1.7mm 2mm;text-align:center}.issuer .brand{font-size:7pt}.issuer h1{font-size:11.5pt;margin:1.6mm 0 1mm}.issuer p{margin:.35mm 0;font-size:6.2pt;line-height:1.22}.danfe-box{border-right:.32mm solid #000;text-align:center;padding:1mm .7mm}.danfe-box h2{font-size:14pt;margin:.3mm 0}.danfe-box p{font-size:5.6pt;line-height:1.15;margin:.4mm 0}.danfe-box .flow{display:grid;grid-template-columns:1fr 7mm;align-items:center;text-align:left;margin-top:1mm}.danfe-box .flow b{font-size:7pt}.danfe-box .flow strong{border:.32mm solid #000;font-size:10pt;padding:1mm 0;text-align:center}.danfe-box .number{font-size:9pt;line-height:1.25;margin-top:1mm}.key-box{padding:1mm;text-align:center}.key-box svg{display:block;width:100%;height:13mm;margin:0 auto .8mm}.key-box .key-label{text-align:left;font-size:4.8pt;text-transform:uppercase}.key-box .digits{font-family:"Courier New",monospace;font-size:6.2pt;font-weight:700;white-space:nowrap;margin:.4mm 0 1mm}.key-box p{font-size:5.2pt;line-height:1.2;margin:.5mm 0}.key-box .protocol{border-top:.26mm solid #000;padding-top:.6mm;text-align:left}.id-grid{grid-template-columns:1.65fr .8fr .8fr 1fr}.recipient-1{grid-template-columns:2.1fr .85fr .78fr}.recipient-2{grid-template-columns:1.65fr .62fr .82fr .45fr .75fr}.recipient-3{grid-template-columns:1.35fr .8fr .62fr .85fr}.tax-1,.tax-2{grid-template-columns:repeat(6,1fr)}.transport-1{grid-template-columns:1.5fr .8fr .72fr .75fr .45fr .8fr}.transport-2{grid-template-columns:1.55fr .8fr .45fr .8fr}.transport-3{grid-template-columns:.55fr .8fr .8fr .8fr .8fr .8fr}.invoice-row{display:grid;grid-template-columns:repeat(3,1fr)}.invoice-row .field{min-height:7mm}.dups{display:grid;grid-template-columns:repeat(3,1fr)}.dups>div{border-right:.26mm solid #000;padding:1mm;display:grid;grid-template-columns:1fr 1fr 1fr;gap:1mm}.dups>div:nth-child(3n){border-right:0}.dups span{font-size:5pt}.dups b,.dups strong{font-size:6pt;text-align:right}.products-title{font-weight:700;font-size:5.7pt;text-transform:uppercase;margin-top:1.2mm}.products{width:100%;border-collapse:collapse;table-layout:fixed;position:relative;z-index:2;background:#fff}.products th,.products td{border:.24mm solid #000;padding:.48mm .38mm;vertical-align:top;overflow-wrap:anywhere}.products th{font-size:4.25pt;line-height:1.06;text-transform:uppercase;font-weight:700;text-align:center}.products td{font-size:5.15pt;height:6.4mm}.products th:nth-child(1){width:8%}.products th:nth-child(2){width:28%}.products th:nth-child(3){width:7%}.products th:nth-child(4){width:4.5%}.products th:nth-child(5){width:5%}.products th:nth-child(6){width:4%}.products th:nth-child(7){width:6%}.products th:nth-child(8){width:7%}.products th:nth-child(9){width:7%}.products th:nth-child(10){width:6%}.products th:nth-child(11){width:6%}.products th:nth-child(12){width:5.5%}.products th:nth-child(13),.products th:nth-child(14){width:4.5%}.products .description{text-align:left}.num{text-align:right;white-space:nowrap}.products-space{height:70mm;border-left:.24mm solid #000;border-right:.24mm solid #000;border-bottom:.24mm solid #000;background:repeating-linear-gradient(to right,transparent 0,transparent calc(8% - .12mm),rgba(0,0,0,.18) calc(8% - .12mm),rgba(0,0,0,.18) 8%)}.additional{display:grid;grid-template-columns:2fr .72fr;min-height:24mm}.additional>div{padding:1mm 1.2mm}.additional>div:first-child{border-right:.26mm solid #000}.additional p{font-size:5.2pt;line-height:1.2;margin:.8mm 0;white-space:pre-wrap}.watermark{position:fixed;left:7mm;right:7mm;top:128mm;z-index:8;text-align:center;font-family:Georgia,"Times New Roman",serif;font-weight:700;font-size:38pt;line-height:.95;color:rgba(0,0,0,.58);pointer-events:none}.watermark small{font-size:21pt}.cancelled{color:rgba(120,0,0,.58)}.footer{font-size:4.8pt;margin-top:1.5mm;display:flex;justify-content:space-between}.strong-total b{font-size:9.5pt}.no-break{break-inside:avoid}.products thead{display:table-header-group}@media print{.page{width:auto;min-height:auto}.products-space{height:60mm}}
  </style></head><body><main class="page">${watermark ? `<div class="watermark${cancelled ? " cancelled" : ""}">${watermark}</div>` : ""}
  <section class="block receipt no-break"><div class="receipt-main"><p>${esc(receiptText)}</p><div class="receipt-sign"><div><span class="micro-label">Data de recebimento</span></div><div><span class="micro-label">Identificação e assinatura do recebedor</span></div></div></div><div class="receipt-nfe"><strong>NF-e</strong><b>Nº ${esc(String(data.number).padStart(9, "0"))}<br>Série ${esc(String(data.series).padStart(3, "0"))}</b></div></section>

  <section class="block header no-break"><div class="issuer"><span class="micro-label">Identificação do emitente</span><div class="brand">${esc(data.issuer.tradeName || "")}</div><h1>${esc(data.issuer.name)}</h1><p>${esc(addressLine(data.issuer))}</p><p>${esc(data.issuer.district)} · ${esc(data.issuer.city)} - ${esc(data.issuer.state)} · CEP ${esc(formatCep(data.issuer.postalCode))}</p><p>Fone: ${esc(data.issuer.phone)}</p></div><div class="danfe-box"><h2>DANFE</h2><p>Documento Auxiliar da<br>Nota Fiscal Eletrônica</p><div class="flow"><b>0 - ENTRADA<br>1 - SAÍDA</b><strong>${data.operationType.startsWith("0") ? "0" : "1"}</strong></div><div class="number"><b>Nº ${esc(String(data.number).padStart(9, "0"))}</b><br><b>Série ${esc(String(data.series).padStart(3, "0"))}</b><br>Folha 1/1</div></div><div class="key-box">${barcode}<div class="key-label">Chave de acesso</div><div class="digits">${esc(groupedKey(data.accessKey))}</div><p>Consulta de autenticidade no portal nacional da NF-e<br>www.nfe.fazenda.gov.br/portal ou no site da Sefaz Autorizadora</p><div class="protocol"><span class="micro-label">Protocolo de autorização de uso</span><b>${esc(data.protocol)} - ${esc(data.issueDateOnly)} ${esc(data.issueTime)}</b></div></div></section>

  <section class="block no-break"><div class="row id-grid">${labelValue("Natureza da operação", data.nature)}${labelValue("Inscrição estadual", data.issuer.ie)}${labelValue("Inscrição estadual subst. tribut.", data.issuerIeSt)}${labelValue("CNPJ / CPF", formatTaxId(data.issuer.taxId))}</div></section>

  <div class="section-label">Destinatário / Remetente</div><section class="block no-break"><div class="row recipient-1">${labelValue("Nome / Razão social", data.recipient.name)}${labelValue("CNPJ / CPF", formatTaxId(data.recipient.taxId))}${labelValue("Data da emissão", data.issueDateOnly)}</div><div class="row recipient-2">${labelValue("Endereço", addressLine(data.recipient))}${labelValue("Bairro / Distrito", data.recipient.district)}${labelValue("CEP", formatCep(data.recipient.postalCode))}${labelValue("UF", data.recipient.state)}${labelValue("Data entrada / saída", data.issueDateOnly)}</div><div class="row recipient-3">${labelValue("Município", data.recipient.city)}${labelValue("Fone / Fax", data.recipient.phone)}${labelValue("Inscrição estadual", data.recipient.ie)}${labelValue("Hora da saída", data.issueTime)}</div></section>

  <div class="section-label">Cálculo do imposto</div><section class="block no-break"><div class="row tax-1">${labelValue("Base de cálculo ICMS", numberText(data.totalsClassic.baseIcms))}${labelValue("Valor do ICMS", numberText(data.totalsClassic.icms))}${labelValue("Base de cálculo ICMS ST", numberText(data.totalsClassic.baseIcmsSt))}${labelValue("Valor do ICMS ST", numberText(data.totalsClassic.icmsSt))}${labelValue("Valor do IPI", numberText(data.totalsClassic.ipi))}${labelValue("Valor total dos produtos", numberText(data.totalsClassic.products))}</div><div class="row tax-2">${labelValue("Valor do frete", numberText(data.totalsClassic.freight))}${labelValue("Valor do seguro", numberText(data.totalsClassic.insurance))}${labelValue("Desconto", numberText(data.totalsClassic.discount))}${labelValue("Outras despesas", numberText(data.totalsClassic.other))}${labelValue("Valor do II", numberText(data.totalsClassic.importTax))}${labelValue("Valor total da nota", numberText(data.totalsClassic.invoice), "strong-total")}</div></section>

  ${data.invoice.number || data.invoice.duplicates.length ? `<div class="section-label">Fatura / Duplicatas</div><section class="block no-break"><div class="invoice-row">${labelValue("Número da fatura", data.invoice.number)}${labelValue("Valor original", numberText(data.invoice.original))}${labelValue("Valor líquido", numberText(data.invoice.net))}</div>${dup ? `<div class="dups">${dup}</div>` : ""}</section>` : ""}

  <div class="section-label">Transportador / Volumes transportados</div><section class="block no-break"><div class="row transport-1">${labelValue("Nome / Razão social", data.transport.name)}${labelValue("Frete por conta", freightLabel(data.transport.mode))}${labelValue("Código ANTT", "")}${labelValue("Placa do veículo", data.transport.vehiclePlate)}${labelValue("UF", data.transport.vehicleState)}${labelValue("CNPJ / CPF", formatTaxId(data.transport.taxId))}</div><div class="row transport-2">${labelValue("Endereço", data.transport.address)}${labelValue("Município", data.transport.city)}${labelValue("UF", data.transport.state)}${labelValue("Inscrição estadual", data.transport.ie)}</div><div class="row transport-3">${labelValue("Quantidade", data.transport.quantity)}${labelValue("Espécie", data.transport.species)}${labelValue("Marca", data.transport.brand)}${labelValue("Numeração", data.transport.numbering)}${labelValue("Peso bruto", numberText(data.transport.grossWeight, 3))}${labelValue("Peso líquido", numberText(data.transport.netWeight, 3))}</div></section>

  <div class="products-title">Dados dos produtos / serviços</div><table class="products"><thead><tr><th>Código produto</th><th>Descrição do produto / serviço</th><th>NCM/SH</th><th>CST</th><th>CFOP</th><th>UN</th><th>Quant.</th><th>Valor unit.</th><th>Valor total</th><th>BC ICMS</th><th>Valor ICMS</th><th>Valor IPI</th><th>Alíq. ICMS</th><th>Alíq. IPI</th></tr></thead><tbody>${itemsRows(data.items)}</tbody></table><div class="products-space"></div>

  <div class="section-label">Dados adicionais</div><section class="block additional no-break"><div><span class="micro-label">Informações complementares</span><p>${esc(data.additionalInfo || "")}${cancelled ? `\n\nNF-e CANCELADA${cancellationProtocol ? ` · Protocolo do evento: ${esc(cancellationProtocol)}` : ""}` : ""}</p></div><div><span class="micro-label">Reservado ao fisco</span></div></section>
  <div class="footer"><span>Impresso pelo Seven ERP</span><span>NF-e modelo 55 · Chave ${esc(data.accessKey)}</span></div></main></body></html>`;
}

export { extractClassicData };
