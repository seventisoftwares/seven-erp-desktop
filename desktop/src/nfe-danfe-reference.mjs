import { code128Svg, parseNfeProc } from "./nfe-danfe-core.mjs";

const clean = (v) => String(v ?? "").trim();
const esc = (v) => clean(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
const decode = (v) => clean(v).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
function element(src, name) { const m = clean(src).match(new RegExp(`<(?:\\w+:)?${name}\\b[^>]*>[\\s\\S]*?<\\/(?:\\w+:)?${name}>`, "i")); return m?.[0] || ""; }
function tag(src, name) { const m = clean(src).match(new RegExp(`<(?:\\w+:)?${name}\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${name}>`, "i")); return m ? decode(m[1].replace(/<[^>]+>/g, "")) : ""; }
function all(src, name) { return [...clean(src).matchAll(new RegExp(`<(?:\\w+:)?${name}\\b[^>]*>[\\s\\S]*?<\\/(?:\\w+:)?${name}>`, "gi"))].map((m) => m[0]); }
function numberBr(v, decimals = 2) { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : ""; }
function dateParts(v) { if (!v) return { date: "", time: "" }; const d = new Date(v); if (Number.isNaN(d.getTime())) return { date: clean(v), time: "" }; return { date: d.toLocaleDateString("pt-BR"), time: d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) }; }
function taxId(v) { const r = clean(v).replace(/\D/g, ""); if (r.length === 14) return r.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5"); if (r.length === 11) return r.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4"); return clean(v); }
function cep(v) { const r = clean(v).replace(/\D/g, ""); return r.length === 8 ? r.replace(/^(\d{5})(\d{3})$/, "$1-$2") : clean(v); }
function groupedKey(v) { return clean(v).toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/(.{4})/g, "$1 ").trim(); }
function field(label, value, cls = "") { return `<div class="field ${cls}"><span>${esc(label)}</span><b>${esc(value)}</b></div>`; }
function freightLabel(v) { return ({ "0": "0 - REMETENTE", "1": "1 - DESTINATÁRIO", "2": "2 - TERCEIROS", "3": "3 - PRÓPRIO REMETENTE", "4": "4 - PRÓPRIO DESTINATÁRIO", "9": "9 - SEM TRANSPORTE" })[String(v)] || clean(v); }

export function extractReferenceDanfeData(nfeProcXml) {
  const base = parseNfeProc(nfeProcXml);
  const nfe = element(nfeProcXml, "NFe");
  const inf = element(nfe, "infNFe");
  const ide = element(inf, "ide");
  const emit = element(inf, "emit");
  const dest = element(inf, "dest");
  const total = element(inf, "ICMSTot");
  const issqn = element(inf, "ISSQNtot");
  const transp = element(inf, "transp");
  const carrier = element(transp, "transporta");
  const vehicle = element(transp, "veicTransp");
  const cobr = element(inf, "cobr");
  const fat = element(cobr, "fat");
  const infAdic = element(inf, "infAdic");
  const issue = dateParts(tag(ide, "dhEmi") || tag(ide, "dEmi"));
  const exit = dateParts(tag(ide, "dhSaiEnt") || tag(ide, "dSaiEnt"));
  const received = dateParts(base.receivedAt);
  const volumes = all(transp, "vol");
  const items = all(inf, "det").map((det, index) => {
    const prod = element(det, "prod");
    const imposto = element(det, "imposto");
    const icms = element(imposto, "ICMS");
    const ipi = element(imposto, "IPI");
    const ad = tag(det, "infAdProd");
    return {
      index: index + 1,
      code: tag(prod, "cProd"),
      description: tag(prod, "xProd"),
      extra: ad,
      ncm: tag(prod, "NCM"),
      cst: tag(icms, "CST") || tag(icms, "CSOSN"),
      cfop: tag(prod, "CFOP"),
      unit: tag(prod, "uCom"),
      quantity: tag(prod, "qCom"),
      unitValue: tag(prod, "vUnCom"),
      total: tag(prod, "vProd"),
      baseIcms: tag(icms, "vBC"),
      icms: tag(icms, "vICMS"),
      ipi: tag(ipi, "vIPI"),
      icmsRate: tag(icms, "pICMS"),
      ipiRate: tag(ipi, "pIPI"),
    };
  });
  const sum = (name) => volumes.reduce((acc, v) => acc + (Number(tag(v, name)) || 0), 0);
  return {
    ...base,
    issue,
    exit,
    received,
    tpNF: tag(ide, "tpNF"),
    issuerIeSt: tag(emit, "IEST"),
    issuerMunicipal: tag(emit, "IM"),
    totals: {
      baseIcms: tag(total, "vBC"), icms: tag(total, "vICMS"), baseIcmsSt: tag(total, "vBCST"), icmsSt: tag(total, "vST"),
      products: tag(total, "vProd"), freight: tag(total, "vFrete"), insurance: tag(total, "vSeg"), discount: tag(total, "vDesc"),
      other: tag(total, "vOutro"), ipi: tag(total, "vIPI"), invoice: tag(total, "vNF"),
    },
    issqn: { municipal: tag(emit, "IM"), services: tag(issqn, "vServ"), base: tag(issqn, "vBC"), value: tag(issqn, "vISS") },
    transport: {
      mode: tag(transp, "modFrete"), name: tag(carrier, "xNome"), taxId: tag(carrier, "CNPJ") || tag(carrier, "CPF"), ie: tag(carrier, "IE"),
      address: tag(carrier, "xEnder"), city: tag(carrier, "xMun"), state: tag(carrier, "UF"), rntc: tag(vehicle, "RNTC"), plate: tag(vehicle, "placa"), plateUf: tag(vehicle, "UF"),
      quantity: sum("qVol") || "", species: [...new Set(volumes.map(v => tag(v, "esp")).filter(Boolean))].join(", "), brand: [...new Set(volumes.map(v => tag(v, "marca")).filter(Boolean))].join(", "),
      numbering: [...new Set(volumes.map(v => tag(v, "nVol")).filter(Boolean))].join(", "), gross: sum("pesoB") || "", net: sum("pesoL") || "",
    },
    invoice: {
      number: tag(fat, "nFat"), original: tag(fat, "vOrig"), discount: tag(fat, "vDesc"), net: tag(fat, "vLiq"),
      duplicates: all(cobr, "dup").map((dup) => ({ number: tag(dup, "nDup"), due: tag(dup, "dVenc"), value: tag(dup, "vDup") })),
    },
    additional: tag(infAdic, "infCpl") || base.additionalInfo,
    items,
  };
}

function splitItems(items) {
  const pages = [];
  let current = [], weight = 0, capacity = 12.5;
  for (const item of items) {
    const textLen = `${item.description} ${item.extra}`.length;
    const w = 1 + Math.max(0, Math.ceil(textLen / 48) - 1) * 0.6;
    if (current.length && weight + w > capacity) { pages.push(current); current = []; weight = 0; capacity = 31; }
    current.push(item); weight += w;
  }
  if (current.length || !pages.length) pages.push(current);
  return pages;
}

function receipt(d) {
  return `<section class="receipt frame"><div class="receipt-main"><div class="receipt-title">RECEBEMOS DE ${esc(d.issuer.name)} OS PRODUTOS CONSTANTES DA NOTA FISCAL INDICADA AO LADO</div><div class="receipt-sign"><div><span>DATA DE RECEBIMENTO</span></div><div><span>IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR</span></div></div></div><div class="receipt-nfe"><b>NF-e</b><strong>N. ${esc(String(d.number).padStart(9, "0"))}</strong><strong>SÉRIE ${esc(String(d.series))}</strong></div></section>`;
}
function header(d, page, totalPages) {
  const issuer = d.issuer;
  return `<section class="header frame"><div class="issuer"><span>Identificação do emitente</span><h1>${esc(issuer.tradeName || issuer.name)}</h1><h2>${esc(issuer.name)}</h2><p>${esc([issuer.street, issuer.number].filter(Boolean).join(", "))}</p><p>${esc([issuer.district, issuer.city, issuer.state].filter(Boolean).join(" - "))}</p><p>${issuer.postalCode ? `CEP ${esc(cep(issuer.postalCode))}` : ""}</p><p>${issuer.phone ? `FONE ${esc(issuer.phone)}` : ""}</p><p>CNPJ ${esc(taxId(issuer.taxId))}</p><p>IE ${esc(issuer.ie)}</p></div><div class="danfe"><h2>DANFE</h2><p>DOCUMENTO AUXILIAR DA<br>NOTA FISCAL ELETRÔNICA</p><div class="flow">0 - ENTRADA<br>1 - SAÍDA <b>${d.tpNF === "0" ? "0" : "1"}</b></div><strong>N. ${esc(String(d.number).padStart(9, "0"))}</strong><strong>SÉRIE ${esc(String(d.series))}</strong><strong>FOLHA ${String(page).padStart(2, "0")}/${String(totalPages).padStart(2, "0")}</strong></div><div class="access"><div class="barcode">${code128Svg(d.accessKey, { height: 52, moduleWidth: 0.42 })}</div><div class="access-key"><span>CHAVE DE ACESSO DA NF-e</span><b>${esc(groupedKey(d.accessKey))}</b></div><p>Consulta de autenticidade no portal nacional da NF-e<br>www.nfe.fazenda.gov.br/portal ou no site da Sefaz Autorizadora</p></div></section>`;
}
function identification(d) {
  return `<section class="frame compact"><div class="row nature">${field("NATUREZA DA OPERAÇÃO", d.nature)}${field("PROTOCOLO DE AUTORIZAÇÃO DE USO", `${d.protocol}${d.received.date ? ` ${d.received.date} ${d.received.time}` : ""}`)}</div><div class="row thirds">${field("INSCRIÇÃO ESTADUAL", d.issuer.ie)}${field("INSCRIÇÃO ESTADUAL DO SUBST. TRIBUT.", d.issuerIeSt)}${field("CNPJ / CPF", taxId(d.issuer.taxId))}</div></section>`;
}
function recipient(d) {
  const r = d.recipient;
  return `<h3>DESTINATÁRIO / REMETENTE</h3><section class="frame compact"><div class="row rec1">${field("NOME / RAZÃO SOCIAL", r.name)}${field("CNPJ / CPF", taxId(r.taxId))}${field("DATA EMISSÃO", d.issue.date)}</div><div class="row rec2">${field("ENDEREÇO", [r.street, r.number, r.complement].filter(Boolean).join(", "))}${field("BAIRRO / DISTRITO", r.district)}${field("CEP", cep(r.postalCode))}${field("DATA ENTRADA / SAÍDA", d.exit.date)}</div><div class="row rec3">${field("MUNICÍPIO", r.city)}${field("FONE / FAX", r.phone)}${field("UF", r.state)}${field("INSCRIÇÃO ESTADUAL", r.ie)}${field("HORA ENTRADA / SAÍDA", d.exit.time)}</div></section>`;
}
function invoice(d) {
  if (!d.invoice.number && !d.invoice.duplicates.length) return `<h3>FATURA</h3><section class="frame single-line"><span></span></section>`;
  const parts = [];
  if (d.invoice.number) parts.push(`${d.invoice.number}${d.invoice.net ? ` · R$ ${numberBr(d.invoice.net)}` : ""}`);
  for (const dup of d.invoice.duplicates) parts.push(`${dup.number || "Parcela"} ${dup.due || ""} R$ ${numberBr(dup.value)}`.trim());
  return `<h3>FATURA</h3><section class="frame single-line"><span>${esc(parts.join("   |   "))}</span></section>`;
}
function taxes(d) {
  const t = d.totals;
  return `<h3>CÁLCULO DO IMPOSTO</h3><section class="frame compact"><div class="row tax5">${field("BASE DE CÁLCULO DO ICMS", numberBr(t.baseIcms))}${field("VALOR DO ICMS", numberBr(t.icms))}${field("BASE DE CÁLCULO DO ICMS SUBSTITUIÇÃO", numberBr(t.baseIcmsSt))}${field("VALOR DO ICMS SUBSTITUIÇÃO", numberBr(t.icmsSt))}${field("VALOR TOTAL DOS PRODUTOS", numberBr(t.products))}</div><div class="row tax6">${field("VALOR DO FRETE", numberBr(t.freight))}${field("VALOR DO SEGURO", numberBr(t.insurance))}${field("DESCONTO", numberBr(t.discount))}${field("OUTRAS DESPESAS ACESSÓRIAS", numberBr(t.other))}${field("VALOR DO IPI", numberBr(t.ipi))}${field("VALOR TOTAL DA NOTA", numberBr(t.invoice), "total")}</div></section>`;
}
function transport(d) {
  const t = d.transport;
  return `<h3>TRANSPORTADOR / VOLUMES TRANSPORTADOS</h3><section class="frame compact"><div class="row transp1">${field("RAZÃO SOCIAL", t.name)}${field("FRETE POR CONTA", freightLabel(t.mode))}${field("CÓDIGO ANTT", t.rntc)}${field("PLACA DO VEÍCULO", t.plate)}${field("UF", t.plateUf)}${field("CNPJ / CPF", taxId(t.taxId))}</div><div class="row transp2">${field("ENDEREÇO", t.address)}${field("MUNICÍPIO", t.city)}${field("UF", t.state)}${field("INSCRIÇÃO ESTADUAL", t.ie)}</div><div class="row six">${field("QUANTIDADE", t.quantity)}${field("ESPÉCIE", t.species)}${field("MARCA", t.brand)}${field("NUMERAÇÃO", t.numbering)}${field("PESO BRUTO", t.gross ? numberBr(t.gross, 3) : "")}${field("PESO LÍQUIDO", t.net ? numberBr(t.net, 3) : "")}</div></section>`;
}
function products(items, filler = true) {
  return `<h3>DADOS DO PRODUTO / SERVIÇO</h3><section class="products frame"><table><thead><tr><th>CÓD. PROD.</th><th>DESCRIÇÃO DO PRODUTO / SERVIÇO</th><th>NCM / SH</th><th>CST</th><th>CFOP</th><th>UN</th><th>QUANT.</th><th>V. UNITÁRIO</th><th>V. TOTAL</th><th>BC ICMS</th><th>V. ICMS</th><th>V. IPI</th><th>ALÍQ. ICMS</th><th>ALÍQ. IPI</th></tr></thead><tbody>${items.map(i => `<tr><td>${esc(i.code)}</td><td class="desc"><b>${esc(i.description)}</b>${i.extra ? `<small>${esc(i.extra)}</small>` : ""}</td><td>${esc(i.ncm)}</td><td>${esc(i.cst)}</td><td>${esc(i.cfop)}</td><td>${esc(i.unit)}</td><td class="num">${numberBr(i.quantity, 4)}</td><td class="num">${numberBr(i.unitValue, 4)}</td><td class="num">${numberBr(i.total)}</td><td class="num">${numberBr(i.baseIcms)}</td><td class="num">${numberBr(i.icms)}</td><td class="num">${numberBr(i.ipi)}</td><td class="num">${i.icmsRate ? `${numberBr(i.icmsRate)}%` : ""}</td><td class="num">${i.ipiRate ? `${numberBr(i.ipiRate)}%` : ""}</td></tr>`).join("")}</tbody></table>${filler ? `<div class="product-filler"></div>` : ""}</section>`;
}
function issqn(d) {
  const i = d.issqn;
  return `<h3>CÁLCULO DO ISSQN</h3><section class="frame compact"><div class="row four">${field("INSCRIÇÃO MUNICIPAL", i.municipal)}${field("VALOR TOTAL DOS SERVIÇOS", numberBr(i.services))}${field("BASE DE CÁLCULO DO ISSQN", numberBr(i.base))}${field("VALOR DO ISSQN", numberBr(i.value))}</div></section>`;
}
function additional(d, cancelled, cancellationProtocol) {
  return `<h3>DADOS ADICIONAIS</h3><section class="additional frame"><div><span>INFORMAÇÕES COMPLEMENTARES</span><p>${esc(d.additional)}</p><p>Protocolo: ${esc(d.protocol)}</p>${cancelled ? `<p><b>NF-e CANCELADA · Protocolo do evento: ${esc(cancellationProtocol)}</b></p>` : ""}</div><div><span>RESERVADO AO FISCO</span></div></section><footer>gerado por <b>Seven ERP</b></footer>`;
}

const css = `@page{size:A4 portrait;margin:0}*{box-sizing:border-box}body{margin:0;background:#e7e7e7;color:#000;font-family:"Times New Roman",Times,serif}.page{width:210mm;min-height:297mm;margin:0 auto;background:#fff;padding:5mm 6mm 5mm;page-break-after:always;position:relative;font-size:6.2pt}.page:last-child{page-break-after:auto}.frame{border:.28mm solid #000}.receipt{height:17mm;display:grid;grid-template-columns:1fr 31mm}.receipt-main{border-right:.28mm solid #000}.receipt-title{height:6mm;padding:.8mm 1mm;font-size:5pt;font-weight:700}.receipt-sign{height:10.4mm;border-top:.22mm solid #000;display:grid;grid-template-columns:34mm 1fr}.receipt-sign>div{padding:.7mm 1mm;border-right:.22mm solid #000}.receipt-sign>div:last-child{border-right:0}.receipt-sign span,.field span,.access-key span,.additional span{display:block;font-size:4.5pt;font-weight:700}.receipt-nfe{padding:1mm 2mm;display:flex;flex-direction:column;justify-content:center}.receipt-nfe b{font-size:8pt}.receipt-nfe strong{font-size:6.5pt}.header{height:43mm;margin-top:1.4mm;display:grid;grid-template-columns:41% 19% 40%}.issuer,.danfe{border-right:.28mm solid #000}.issuer{text-align:center;padding:1.3mm 1.8mm}.issuer>span{font-size:7pt;font-weight:700}.issuer h1{font-size:10pt;margin:.7mm 0 .2mm}.issuer h2{font-size:7.1pt;margin:0 0 .7mm}.issuer p{margin:.3mm 0;font-size:5.5pt}.danfe{padding:1.1mm 1.3mm;display:flex;flex-direction:column}.danfe h2{font-size:15pt;text-align:center;margin:0 0 .6mm}.danfe p{font-size:5.2pt;line-height:1.25;margin:.3mm 0}.danfe .flow{font-size:5.8pt;line-height:1.5;position:relative;margin:.5mm 0}.danfe .flow b{position:absolute;right:1mm;top:2mm;border:.28mm solid #000;padding:.6mm 1.2mm;font-size:9pt}.danfe strong{font-size:7.2pt;line-height:1.35}.access{display:flex;flex-direction:column}.barcode{height:17mm;border-bottom:.22mm solid #000;padding:1.2mm 1.5mm .8mm}.barcode svg{width:100%;height:100%;display:block}.access-key{height:10.5mm;padding:.8mm 1.2mm;border-bottom:.22mm solid #000}.access-key b{font-family:monospace;font-size:6.2pt;display:block;margin-top:.7mm;white-space:nowrap}.access p{font-size:5.4pt;line-height:1.25;margin:1.3mm 1.3mm}.compact{margin-top:1mm}.row{display:grid}.row+.row{border-top:.22mm solid #000}.field{min-height:7.4mm;padding:.55mm .8mm;border-right:.22mm solid #000;overflow:hidden}.field:last-child{border-right:0}.field b{display:block;font-size:6.2pt;line-height:1.15;margin-top:.35mm;overflow-wrap:anywhere}.nature{grid-template-columns:1.25fr 1fr}.thirds{grid-template-columns:1fr 1fr .9fr}.rec1{grid-template-columns:1.65fr .72fr .52fr}.rec2{grid-template-columns:1.25fr .72fr .45fr .52fr}.rec3{grid-template-columns:.9fr .58fr .3fr .85fr .52fr}.tax5{grid-template-columns:repeat(5,1fr)}.tax6{grid-template-columns:repeat(6,1fr)}.transp1{grid-template-columns:1.45fr .72fr .52fr .55fr .25fr .78fr}.transp2{grid-template-columns:1.45fr .75fr .25fr .75fr}.six{grid-template-columns:repeat(6,1fr)}.four{grid-template-columns:repeat(4,1fr)}.total b{font-size:7pt}.single-line{height:7mm;padding:1.3mm 1.5mm;font-size:6pt}h3{font-size:5.6pt;margin:1.1mm 0 -.2mm;text-transform:uppercase}.products{min-height:94mm;display:flex;flex-direction:column}.products table{width:100%;border-collapse:collapse;table-layout:fixed}.products th,.products td{border-right:.18mm solid #000;border-bottom:.18mm solid #000;padding:.45mm .35mm;vertical-align:top;overflow-wrap:anywhere}.products th:last-child,.products td:last-child{border-right:0}.products th{font-size:4.15pt;line-height:1.05;text-align:center}.products td{font-size:4.9pt;height:7mm}.products th:nth-child(1){width:7.5%}.products th:nth-child(2){width:28%}.products th:nth-child(3){width:7.5%}.products th:nth-child(4){width:4.5%}.products th:nth-child(5){width:5%}.products th:nth-child(6){width:4%}.products th:nth-child(7){width:6%}.products th:nth-child(8){width:7.5%}.products th:nth-child(9){width:7%}.products th:nth-child(10){width:6.5%}.products th:nth-child(11){width:6.5%}.products th:nth-child(12){width:5.5%}.products th:nth-child(13),.products th:nth-child(14){width:5%}.products td.desc b{display:block;font-size:5.3pt}.products td.desc small{display:block;font-size:4.5pt;white-space:pre-line;margin-top:.4mm}.num{text-align:right}.product-filler{flex:1;min-height:42mm;background:linear-gradient(to right,transparent 7.45%,#000 7.45%,#000 7.62%,transparent 7.62%,transparent 35.45%,#000 35.45%,#000 35.62%,transparent 35.62%,transparent 42.95%,#000 42.95%,#000 43.12%,transparent 43.12%,transparent 47.45%,#000 47.45%,#000 47.62%,transparent 47.62%,transparent 52.45%,#000 52.45%,#000 52.62%,transparent 52.62%,transparent 56.45%,#000 56.45%,#000 56.62%,transparent 56.62%,transparent 62.45%,#000 62.45%,#000 62.62%,transparent 62.62%,transparent 69.95%,#000 69.95%,#000 70.12%,transparent 70.12%,transparent 76.95%,#000 76.95%,#000 77.12%,transparent 77.12%,transparent 83.45%,#000 83.45%,#000 83.62%,transparent 83.62%,transparent 89.95%,#000 89.95%,#000 90.12%,transparent 90.12%,transparent 95.45%,#000 95.45%,#000 95.62%,transparent 95.62%);opacity:.25}.additional{height:39mm;display:grid;grid-template-columns:57% 43%}.additional>div{padding:1mm 1.2mm;border-right:.22mm solid #000}.additional>div:last-child{border-right:0}.additional p{font-size:5.3pt;line-height:1.25;margin:.8mm 0}.additional span{font-size:4.7pt}footer{text-align:right;font-size:5pt;margin-top:1mm}footer b{font-size:7pt}.watermark{position:absolute;z-index:5;left:50%;top:50%;transform:translate(-50%,-50%) rotate(-24deg);font-size:30pt;font-family:Arial,sans-serif;font-weight:700;color:rgba(0,0,0,.09);pointer-events:none;white-space:nowrap}@media print{body{background:#fff}.page{margin:0;box-shadow:none}}`;

export function buildReferenceDanfeHtml({ nfeProcXml, cancelled = false, cancellationProtocol = "" }) {
  const d = extractReferenceDanfeData(nfeProcXml);
  const pages = splitItems(d.items);
  const pageHtml = pages.map((items, index) => {
    const pageNo = index + 1;
    const first = index === 0;
    const watermark = cancelled ? "CANCELADA" : d.environment === "homologation" ? "SEM VALOR FISCAL · HOMOLOGAÇÃO" : "";
    return `<main class="page">${watermark ? `<div class="watermark">${esc(watermark)}</div>` : ""}${first ? receipt(d) : ""}${header(d, pageNo, pages.length)}${first ? `${identification(d)}${recipient(d)}${invoice(d)}${taxes(d)}${transport(d)}` : ""}${products(items, true)}${first ? `${issqn(d)}${additional(d, cancelled, cancellationProtocol)}` : `<footer>Continuação dos produtos/serviços · <b>Seven ERP</b></footer>`}</main>`;
  }).join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>DANFE NF-e ${esc(d.number)}</title><style>${css}</style></head><body>${pageHtml}</body></html>`;
}
