import { code128Svg, parseNfeProc } from "./nfe-danfe-core.mjs";

const clean = (value) => String(value ?? "").trim();
const esc = (value) => String(value ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function decodeXml(value) {
  return String(value || "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&amp;/g, "&");
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
  return [...String(source || "").matchAll(new RegExp(`<(?:\\w+:)?${name}\\b[^>]*>[\\s\\S]*?<\\/(?:\\w+:)?${name}>`, "gi"))]
    .map((match) => match[0]);
}

function numberValue(value, decimals = 2) {
  const parsed = Number(String(value ?? "0").replace(",", "."));
  return Number.isFinite(parsed)
    ? parsed.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : (0).toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function moneyValue(value) { return numberValue(value, 2); }

function digits(value) { return String(value || "").replace(/\D/g, ""); }

function formatTaxId(value) {
  const raw = digits(value);
  if (raw.length === 14) return raw.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (raw.length === 11) return raw.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return clean(value);
}

function formatCep(value) {
  const raw = digits(value);
  return raw.length === 8 ? raw.replace(/^(\d{5})(\d{3})$/, "$1-$2") : clean(value);
}

function formatPhone(value) {
  const raw = digits(value);
  if (raw.length === 11) return raw.replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3");
  if (raw.length === 10) return raw.replace(/^(\d{2})(\d{4})(\d{4})$/, "($1) $2-$3");
  return clean(value);
}

function dateTime(value) {
  if (!value) return { date: "", time: "" };
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return { date: clean(value), time: "" };
  return {
    date: parsed.toLocaleDateString("pt-BR"),
    time: parsed.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
  };
}

function accessKeyText(value) {
  return clean(value).toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/(.{4})/g, "$1 ").trim();
}

function fullAddress(party) {
  const first = [party.street, party.number, party.complement].filter(Boolean).join(", ");
  const second = [party.district, party.city, party.state].filter(Boolean).join(" - ");
  const third = party.postalCode ? `CEP ${formatCep(party.postalCode)}` : "";
  return [first, second, third].filter(Boolean).join(" · ");
}

function freightLabel(mode) {
  return ({
    "0": "0 - Remetente (CIF)",
    "1": "1 - Destinatário (FOB)",
    "2": "2 - Terceiros",
    "3": "3 - Transporte próprio remetente",
    "4": "4 - Transporte próprio destinatário",
    "9": "9 - Sem transporte",
  })[String(mode || "")] || clean(mode);
}

function field(label, value, className = "") {
  return `<div class="danfe-field ${className}"><span>${esc(label)}</span><strong>${esc(value || "")}</strong></div>`;
}

function itemWeight(item) {
  const description = clean(item.description);
  const lines = Math.max(1, Math.ceil(description.length / 54));
  return 1 + Math.max(0, lines - 1) * 0.55;
}

function splitItems(items) {
  const pages = [];
  let current = [];
  let used = 0;
  let capacity = 10.5;
  for (const item of items) {
    const weight = itemWeight(item);
    if (current.length && used + weight > capacity) {
      pages.push(current);
      current = [];
      used = 0;
      capacity = 31;
    }
    current.push(item);
    used += weight;
  }
  if (current.length || !pages.length) pages.push(current);
  return pages;
}

export function extractSevenDanfeData(nfeProcXml) {
  const base = parseNfeProc(nfeProcXml);
  const source = clean(nfeProcXml);
  const nfe = element(source, "NFe");
  const inf = element(nfe, "infNFe");
  const ide = element(inf, "ide");
  const emit = element(inf, "emit");
  const dest = element(inf, "dest");
  const totals = element(inf, "ICMSTot");
  const transp = element(inf, "transp");
  const carrier = element(transp, "transporta");
  const vehicle = element(transp, "veicTransp");
  const volume = element(transp, "vol");
  const cobr = element(inf, "cobr");
  const fat = element(cobr, "fat");
  const additional = element(inf, "infAdic");
  const protocol = element(source, "protNFe");
  const issue = dateTime(base.issueDate);
  const received = dateTime(base.receivedAt);

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
      cest: tag(prod, "CEST"),
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
    receivedDate: received.date,
    receivedTime: received.time,
    issuerIeSt: tag(emit, "IEST"),
    issuerCrt: tag(emit, "CRT"),
    recipientEmail: tag(dest, "email"),
    recipientIeIndicator: tag(dest, "indIEDest"),
    recipientIssueDate: issue.date,
    totalsSeven: {
      ...base.totals,
      baseIcmsSt: tag(totals, "vBCST"),
      icmsSt: tag(totals, "vST"),
      importTax: tag(totals, "vII"),
      fcp: tag(totals, "vFCP"),
      fcpSt: tag(totals, "vFCPST"),
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
      rntc: tag(vehicle, "RNTC"),
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
      duplicates: allElements(cobr, "dup").map((dup) => ({
        number: tag(dup, "nDup"), due: tag(dup, "dVenc"), value: tag(dup, "vDup"),
      })),
    },
    additionalInfo: tag(additional, "infCpl") || base.additionalInfo,
    protocolReason: tag(protocol, "xMotivo") || base.protocolReason,
    items,
  };
}

function receiptBlock(data) {
  const receipt = `RECEBEMOS DE ${data.issuer.name} OS PRODUTOS E/OU SERVIÇOS CONSTANTES DA NF-e INDICADA AO LADO. EMISSÃO: ${data.issueDateOnly} · VALOR TOTAL: R$ ${moneyValue(data.totalsSeven.invoice)} · DESTINATÁRIO: ${data.recipient.name}.`;
  return `<section class="receipt-box">
    <div class="receipt-left"><p>${esc(receipt)}</p><div class="receipt-sign"><div><span>DATA DE RECEBIMENTO</span></div><div><span>IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR</span></div></div></div>
    <div class="receipt-number"><b>NF-e</b><strong>Nº ${esc(String(data.number).padStart(9, "0"))}</strong><span>Série ${esc(String(data.series).padStart(3, "0"))}</span></div>
  </section><div class="cut-line"><span>✂</span></div>`;
}

function identityBlock(data, pageNumber, pageCount) {
  const barcode = code128Svg(data.accessKey, { height: 48, moduleWidth: 0.42 });
  const issuerContact = [formatPhone(data.issuer.phone)].filter(Boolean).join(" · ");
  return `<section class="identity-box">
    <div class="issuer-box"><span class="micro">IDENTIFICAÇÃO DO EMITENTE</span><h1>${esc(data.issuer.tradeName || data.issuer.name)}</h1><b>${esc(data.issuer.name)}</b><p>${esc(fullAddress(data.issuer))}</p><p>${esc(issuerContact)}</p></div>
    <div class="danfe-title"><h2>DANFE</h2><p>Documento Auxiliar da<br>Nota Fiscal Eletrônica</p><div class="flow"><span>${esc(data.operationType)}</span><b>${data.operationType.startsWith("0") ? "0" : "1"}</b></div><strong>Nº ${esc(String(data.number).padStart(9, "0"))}</strong><strong>Série ${esc(String(data.series).padStart(3, "0"))}</strong><small>Folha ${pageNumber}/${pageCount}</small></div>
    <div class="key-box">${barcode}<span class="micro">CHAVE DE ACESSO</span><b class="access-key">${esc(accessKeyText(data.accessKey))}</b><p>Consulta de autenticidade no portal nacional da NF-e<br>www.nfe.fazenda.gov.br/portal ou no site da Sefaz autorizadora</p></div>
  </section>
  <section class="grid border-top nature-row">${field("NATUREZA DA OPERAÇÃO", data.nature, "span-5")}${field("PROTOCOLO DE AUTORIZAÇÃO DE USO", `${data.protocol}${data.receivedDate ? ` · ${data.receivedDate} ${data.receivedTime}` : ""}`, "span-4")}</section>
  <section class="grid border-top issuer-id-row">${field("INSCRIÇÃO ESTADUAL", data.issuer.ie, "span-3")}${field("INSCRIÇÃO ESTADUAL DO SUBST. TRIBUT.", data.issuerIeSt, "span-3")}${field("CNPJ / CPF", formatTaxId(data.issuer.taxId), "span-3")}</section>`;
}

function recipientBlock(data) {
  return `<div class="section-caption">DESTINATÁRIO / REMETENTE</div><section class="recipient-box">
    <div class="grid">${field("NOME / RAZÃO SOCIAL", data.recipient.name, "span-5")}${field("CNPJ / CPF", formatTaxId(data.recipient.taxId), "span-2")}${field("DATA DA EMISSÃO", data.issueDateOnly, "span-2")}</div>
    <div class="grid border-top">${field("ENDEREÇO", [data.recipient.street, data.recipient.number, data.recipient.complement].filter(Boolean).join(", "), "span-4")}${field("BAIRRO / DISTRITO", data.recipient.district, "span-2")}${field("CEP", formatCep(data.recipient.postalCode), "span-1")}${field("DATA DA SAÍDA / ENTRADA", "", "span-2")}</div>
    <div class="grid border-top">${field("MUNICÍPIO", data.recipient.city, "span-3")}${field("FONE / FAX", formatPhone(data.recipient.phone), "span-2")}${field("UF", data.recipient.state, "span-1")}${field("INSCRIÇÃO ESTADUAL", data.recipient.ie, "span-2")}${field("HORA DA SAÍDA", "", "span-1")}</div>
  </section>`;
}

function totalsBlock(data) {
  const t = data.totalsSeven;
  return `<div class="section-caption">CÁLCULO DO IMPOSTO</div><section class="totals-box">
    <div class="grid">${field("BASE DE CÁLCULO DO ICMS", moneyValue(t.baseIcms), "span-2 num")}${field("VALOR DO ICMS", moneyValue(t.icms), "span-1 num")}${field("BASE DE CÁLC. ICMS ST", moneyValue(t.baseIcmsSt), "span-2 num")}${field("VALOR DO ICMS ST", moneyValue(t.icmsSt), "span-1 num")}${field("VALOR TOTAL DOS PRODUTOS", moneyValue(t.products), "span-3 num")}</div>
    <div class="grid border-top">${field("VALOR DO FRETE", moneyValue(t.freight), "span-1 num")}${field("VALOR DO SEGURO", moneyValue(t.insurance), "span-1 num")}${field("DESCONTO", moneyValue(t.discount), "span-1 num")}${field("OUTRAS DESPESAS", moneyValue(t.other), "span-1 num")}${field("VALOR DO IPI", moneyValue(t.ipi), "span-1 num")}${field("VALOR DO PIS", moneyValue(t.pis), "span-1 num")}${field("VALOR DA COFINS", moneyValue(t.cofins), "span-1 num")}${field("VALOR TOTAL DA NOTA", moneyValue(t.invoice), "span-2 total num")}</div>
  </section>`;
}

function transportBlock(data) {
  const t = data.transport;
  return `<div class="section-caption">TRANSPORTADOR / VOLUMES TRANSPORTADOS</div><section class="transport-box">
    <div class="grid">${field("NOME / RAZÃO SOCIAL", t.name, "span-3")}${field("FRETE POR CONTA", freightLabel(t.mode), "span-2")}${field("CÓDIGO ANTT / RNTC", t.rntc, "span-1")}${field("PLACA DO VEÍCULO", t.vehiclePlate, "span-1")}${field("UF", t.vehicleState, "span-1")}${field("CNPJ / CPF", formatTaxId(t.taxId), "span-1")}</div>
    <div class="grid border-top">${field("ENDEREÇO", t.address, "span-4")}${field("MUNICÍPIO", t.city, "span-2")}${field("UF", t.state, "span-1")}${field("INSCRIÇÃO ESTADUAL", t.ie, "span-2")}</div>
    <div class="grid border-top">${field("QUANTIDADE", t.quantity, "span-1 num")}${field("ESPÉCIE", t.species, "span-2")}${field("MARCA", t.brand, "span-2")}${field("NUMERAÇÃO", t.numbering, "span-2")}${field("PESO BRUTO", t.grossWeight ? numberValue(t.grossWeight, 3) : "", "span-1 num")}${field("PESO LÍQUIDO", t.netWeight ? numberValue(t.netWeight, 3) : "", "span-1 num")}</div>
  </section>`;
}

function invoiceBlock(data) {
  if (!data.invoice.number && !data.invoice.duplicates.length) return "";
  const duplicates = data.invoice.duplicates.slice(0, 8).map((row) => `<div><span>${esc(row.number || "Duplicata")}</span><b>${esc(row.due || "")}</b><strong>R$ ${esc(moneyValue(row.value))}</strong></div>`).join("");
  return `<div class="section-caption">FATURA / DUPLICATAS</div><section class="invoice-box"><div class="grid">${field("NÚMERO DA FATURA", data.invoice.number, "span-3")}${field("VALOR ORIGINAL", data.invoice.original ? moneyValue(data.invoice.original) : "", "span-2 num")}${field("DESCONTO", data.invoice.discount ? moneyValue(data.invoice.discount) : "", "span-2 num")}${field("VALOR LÍQUIDO", data.invoice.net ? moneyValue(data.invoice.net) : "", "span-2 num")}</div>${duplicates ? `<div class="duplicate-grid">${duplicates}</div>` : ""}</section>`;
}

function productTable(items, continuation = false) {
  const rows = items.map((item) => `<tr>
    <td>${esc(item.code)}</td><td class="desc">${esc(item.description)}</td><td>${esc(item.ncm)}</td><td>${esc(item.cst)}</td><td>${esc(item.cfop)}</td><td>${esc(item.unit)}</td>
    <td class="number">${esc(numberValue(item.quantity, 4))}</td><td class="number">${esc(numberValue(item.unitValue, 4))}</td><td class="number">${esc(moneyValue(item.productValue))}</td><td class="number">${item.baseIcms ? esc(moneyValue(item.baseIcms)) : ""}</td><td class="number">${item.icms ? esc(moneyValue(item.icms)) : ""}</td><td class="number">${item.ipi ? esc(moneyValue(item.ipi)) : ""}</td><td class="number">${item.icmsRate ? esc(numberValue(item.icmsRate, 2)) : ""}</td><td class="number">${item.ipiRate ? esc(numberValue(item.ipiRate, 2)) : ""}</td>
  </tr>`).join("");
  return `<div class="section-caption">DADOS DOS PRODUTOS / SERVIÇOS</div><section class="products-area ${continuation ? "continuation" : ""}"><table class="products-table"><colgroup><col class="c-code"><col class="c-desc"><col class="c-ncm"><col class="c-cst"><col class="c-cfop"><col class="c-un"><col class="c-qtd"><col class="c-vu"><col class="c-vt"><col class="c-bc"><col class="c-icms"><col class="c-ipi"><col class="c-ai"><col class="c-ap"></colgroup><thead><tr><th>CÓDIGO</th><th>DESCRIÇÃO DO PRODUTO / SERVIÇO</th><th>NCM/SH</th><th>CST</th><th>CFOP</th><th>UN</th><th>QTD.</th><th>V. UNIT.</th><th>V. TOTAL</th><th>BC ICMS</th><th>V. ICMS</th><th>V. IPI</th><th>ALÍQ. ICMS</th><th>ALÍQ. IPI</th></tr></thead><tbody>${rows || `<tr><td colspan="14" class="empty-products">SEM ITENS</td></tr>`}</tbody></table></section>`;
}

function additionalBlock(data, cancelled, cancellationProtocol) {
  const cancellation = cancelled ? `NF-e CANCELADA${cancellationProtocol ? ` · Protocolo do evento: ${cancellationProtocol}` : ""}. ` : "";
  return `<div class="section-caption">DADOS ADICIONAIS</div><section class="additional-box"><div><span>INFORMAÇÕES COMPLEMENTARES</span><p>${esc(`${cancellation}${data.additionalInfo || ""}`)}</p></div><div><span>RESERVADO AO FISCO</span></div></section>`;
}

function continuationHeader(data, pageNumber, pageCount) {
  return `<section class="continuation-header"><div><b>${esc(data.issuer.tradeName || data.issuer.name)}</b><span>${esc(formatTaxId(data.issuer.taxId))}</span></div><div><strong>DANFE</strong><span>NF-e nº ${esc(String(data.number).padStart(9, "0"))} · Série ${esc(String(data.series).padStart(3, "0"))}</span></div><div><span>CHAVE DE ACESSO</span><b>${esc(accessKeyText(data.accessKey))}</b><small>Folha ${pageNumber}/${pageCount}</small></div></section>`;
}

function watermark(data, cancelled) {
  if (cancelled) return `<div class="watermark cancelled">CANCELADA</div>`;
  if (data.environment === "homologation") return `<div class="watermark">SEM VALOR FISCAL<small>AMBIENTE DE HOMOLOGAÇÃO</small></div>`;
  return "";
}

const CSS = `
@page{size:A4 portrait;margin:5mm}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif;font-size:6.25pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}body{padding:0}.danfe-page{width:200mm;height:287mm;margin:0 auto;position:relative;overflow:hidden;page-break-after:always;background:#fff}.danfe-page:last-child{page-break-after:auto}.danfe-content{position:relative;z-index:2}.receipt-box{height:17.5mm;border:.35mm solid #000;display:grid;grid-template-columns:1fr 33mm}.receipt-left{border-right:.35mm solid #000;padding:1mm 1.2mm;display:flex;flex-direction:column;justify-content:space-between}.receipt-left p{font-size:5.25pt;line-height:1.25;margin:0}.receipt-sign{height:5.2mm;border-top:.25mm solid #000;display:grid;grid-template-columns:38mm 1fr;margin:1mm -1.2mm -1mm}.receipt-sign div{padding:.5mm 1mm}.receipt-sign div:first-child{border-right:.25mm solid #000}.receipt-sign span,.danfe-field span,.micro,.section-caption,.additional-box span{font-size:4.55pt;line-height:1;text-transform:uppercase}.receipt-number{display:flex;flex-direction:column;align-items:center;justify-content:center}.receipt-number b{font-size:12pt}.receipt-number strong{font-size:8.5pt;margin-top:1mm}.receipt-number span{font-size:7pt}.cut-line{height:3.1mm;border-bottom:.25mm dashed #777;position:relative;margin-bottom:1.2mm}.cut-line span{position:absolute;left:1mm;bottom:-2.1mm;background:#fff;padding-right:1mm}.identity-box{height:38mm;border:.35mm solid #000;display:grid;grid-template-columns:41% 19% 40%}.issuer-box{border-right:.3mm solid #000;padding:1.5mm 2mm;text-align:center;overflow:hidden}.issuer-box h1{font-size:12pt;line-height:1.05;margin:1.2mm 0 .7mm}.issuer-box>b{font-size:7pt}.issuer-box p{font-size:5.7pt;line-height:1.25;margin:.6mm 0}.danfe-title{border-right:.3mm solid #000;text-align:center;padding:1.1mm .8mm;display:flex;flex-direction:column;align-items:center}.danfe-title h2{font-size:15pt;margin:0}.danfe-title p{font-size:5.5pt;line-height:1.08;margin:.5mm 0}.danfe-title .flow{display:flex;align-items:center;justify-content:space-between;width:100%;margin:.8mm 0}.danfe-title .flow span{font-size:6.2pt;font-weight:700}.danfe-title .flow b{border:.3mm solid #000;width:7mm;height:7mm;display:grid;place-items:center;font-size:10pt}.danfe-title>strong{font-size:8pt;line-height:1.25}.danfe-title small{margin-top:auto;font-size:5.4pt}.key-box{padding:1mm 1.3mm;text-align:center;overflow:hidden}.key-box svg{width:100%;height:13mm;display:block;margin:0 auto .6mm}.key-box .access-key{display:block;font-family:"Courier New",monospace;font-size:5.9pt;letter-spacing:.01em;white-space:nowrap;margin:.5mm 0 .8mm}.key-box p{font-size:5pt;line-height:1.15;margin:.4mm 0}.grid{display:grid;grid-template-columns:repeat(9,1fr)}.border-top{border-top:.25mm solid #000}.nature-row,.issuer-id-row{border-left:.35mm solid #000;border-right:.35mm solid #000;border-bottom:.35mm solid #000}.danfe-field{min-height:7.2mm;padding:.65mm .9mm;border-right:.25mm solid #000;overflow:hidden}.danfe-field:last-child{border-right:0}.danfe-field strong{display:block;font-size:6.35pt;line-height:1.22;margin-top:.5mm;overflow-wrap:anywhere}.danfe-field.num strong{text-align:right}.danfe-field.total strong{font-size:8pt}.span-1{grid-column:span 1}.span-2{grid-column:span 2}.span-3{grid-column:span 3}.span-4{grid-column:span 4}.span-5{grid-column:span 5}.section-caption{height:3.4mm;display:flex;align-items:flex-end;font-weight:700;padding:0 .5mm .5mm}.recipient-box,.totals-box,.transport-box,.invoice-box{border:.35mm solid #000}.recipient-box .danfe-field{min-height:6.8mm}.totals-box .danfe-field{min-height:7.2mm}.transport-box .danfe-field{min-height:6.5mm}.duplicate-grid{border-top:.25mm solid #000;display:grid;grid-template-columns:repeat(4,1fr)}.duplicate-grid>div{min-height:7mm;padding:.6mm .8mm;border-right:.25mm solid #000;display:grid;grid-template-columns:1fr 1fr;gap:.5mm}.duplicate-grid>div:nth-child(4n){border-right:0}.duplicate-grid span{grid-column:span 2;font-size:4.5pt}.duplicate-grid b,.duplicate-grid strong{font-size:5.5pt}.products-area{height:76mm;border:.35mm solid #000;overflow:hidden}.products-area.continuation{height:257mm}.products-table{width:100%;border-collapse:collapse;table-layout:fixed}.products-table th,.products-table td{border-right:.2mm solid #000;border-bottom:.2mm solid #000;padding:.5mm .35mm;vertical-align:top;overflow-wrap:anywhere}.products-table th:last-child,.products-table td:last-child{border-right:0}.products-table th{font-size:4pt;line-height:1.05;text-align:center;height:7mm}.products-table td{font-size:4.9pt;line-height:1.18}.products-table td.number{text-align:right;white-space:nowrap}.products-table td.desc{font-size:5.2pt}.c-code{width:12mm}.c-desc{width:45mm}.c-ncm{width:13mm}.c-cst{width:8mm}.c-cfop{width:9mm}.c-un{width:6mm}.c-qtd{width:12mm}.c-vu{width:14mm}.c-vt{width:14mm}.c-bc{width:13mm}.c-icms{width:11mm}.c-ipi{width:10mm}.c-ai{width:10mm}.c-ap{width:10mm}.empty-products{text-align:center;padding:5mm!important}.additional-box{height:27mm;border:.35mm solid #000;display:grid;grid-template-columns:65% 35%}.additional-box>div{padding:1mm 1.2mm;overflow:hidden}.additional-box>div:first-child{border-right:.25mm solid #000}.additional-box p{font-size:5.2pt;line-height:1.23;margin:.8mm 0 0;white-space:pre-wrap}.page-footer{height:4.5mm;display:flex;align-items:flex-end;justify-content:space-between;font-size:4.5pt;color:#333;padding:0 .7mm}.continuation-header{height:22mm;border:.35mm solid #000;display:grid;grid-template-columns:32% 25% 43%;margin-bottom:1mm}.continuation-header>div{padding:1.2mm;border-right:.25mm solid #000;display:flex;flex-direction:column;justify-content:center}.continuation-header>div:last-child{border-right:0}.continuation-header strong{font-size:13pt}.continuation-header b{font-size:7.5pt}.continuation-header span{font-size:5.2pt}.continuation-header small{font-size:5pt;margin-top:.7mm}.watermark{position:absolute;z-index:1;left:50%;top:54%;transform:translate(-50%,-50%) rotate(-26deg);font-size:38pt;font-weight:700;color:rgba(0,0,0,.12);white-space:nowrap;text-align:center;pointer-events:none}.watermark small{display:block;font-size:17pt;margin-top:2mm}.watermark.cancelled{font-size:52pt;color:rgba(120,0,0,.15)}@media screen{body{background:#d7d7d7;padding:8mm 0}.danfe-page{box-shadow:0 1mm 5mm rgba(0,0,0,.18);margin-bottom:8mm}}@media print{body{padding:0;background:#fff}.danfe-page{box-shadow:none;margin:0}}
`;

export function buildSevenDanfeHtml({ nfeProcXml, cancelled = false, cancellationProtocol = "" }) {
  const data = extractSevenDanfeData(nfeProcXml);
  const itemPages = splitItems(data.items);
  const pageCount = itemPages.length;
  const pageHtml = itemPages.map((pageItems, index) => {
    const pageNumber = index + 1;
    const first = index === 0;
    if (first) {
      return `<article class="danfe-page">${watermark(data, cancelled)}<div class="danfe-content">${receiptBlock(data)}${identityBlock(data, pageNumber, pageCount)}${recipientBlock(data)}${invoiceBlock(data)}${totalsBlock(data)}${transportBlock(data)}${productTable(pageItems, false)}${additionalBlock(data, cancelled, cancellationProtocol)}<footer class="page-footer"><span>Seven ERP · DANFE modelo 55</span><span>Folha ${pageNumber}/${pageCount}</span></footer></div></article>`;
    }
    return `<article class="danfe-page">${watermark(data, cancelled)}<div class="danfe-content">${continuationHeader(data, pageNumber, pageCount)}${productTable(pageItems, true)}<footer class="page-footer"><span>Continuação dos produtos / serviços · NF-e ${esc(String(data.number).padStart(9, "0"))}</span><span>Folha ${pageNumber}/${pageCount}</span></footer></div></article>`;
  }).join("");

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DANFE NF-e ${esc(data.number)}</title><style>${CSS}</style></head><body>${pageHtml}</body></html>`;
}
