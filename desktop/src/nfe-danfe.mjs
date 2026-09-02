const clean = (value) => String(value ?? "").trim();
const alphaNum = (value) => clean(value).toUpperCase().replace(/[^A-Z0-9]/g, "");

function decodeXml(value) {
  return String(value || "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
}
function esc(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function element(source, tag) {
  const match = String(source || "").match(new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>[\\s\\S]*?<\\/(?:\\w+:)?${tag}>`, "i"));
  return match ? match[0] : "";
}
function tag(source, name) {
  const match = String(source || "").match(new RegExp(`<(?:\\w+:)?${name}\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${name}>`, "i"));
  return match ? decodeXml(match[1].replace(/<[^>]+>/g, "")).trim() : "";
}
function allElements(source, name) {
  return [...String(source || "").matchAll(new RegExp(`<(?:\\w+:)?${name}\\b[^>]*>[\\s\\S]*?<\\/(?:\\w+:)?${name}>`, "gi"))].map((match) => match[0]);
}
function formatTaxId(value) {
  const raw = alphaNum(value);
  if (/^\d{14}$/.test(raw)) return raw.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (/^\d{11}$/.test(raw)) return raw.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return raw;
}
function numberText(value, decimals = 2) {
  const parsed = Number(String(value || "0").replace(",", "."));
  return Number.isFinite(parsed) ? parsed.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : "0,00";
}
function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("pt-BR");
}
function groupedKey(key) { return alphaNum(key).replace(/(.{4})/g, "$1 ").trim(); }

const CODE128 = [
  "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213","221312","231212","112232","122132","122231","113222","123122","123221","223211","221132","221231","213212","223112","312131","311222","321122","321221","312212","322112","322211","212123","212321","232121","111323","131123","131321","112313","132113","132311","211313","231113","231311","112133","112331","132131","113123","113321","133121","313121","211331","231131","213113","213311","213131","311123","311321","331121","312113","312311","332111","314111","221411","431111","111224","111422","121124","121421","141122","141221","112214","112412","122114","122411","142112","142211","241211","221114","413111","241112","134111","111242","121142","121241","114212","124112","124211","411212","421112","421211","212141","214121","412121","111143","111341","131141","114113","114311","411113","411311","113141","114131","311141","411131","211412","211214","211232","2331112",
];
function numericRun(value, index) {
  let end = index;
  while (end < value.length && /\d/.test(value[end])) end += 1;
  return end - index;
}
export function encodeCode128(value) {
  const input = alphaNum(value);
  if (!input) throw new Error("Conteúdo vazio para código de barras.");
  let mode = numericRun(input, 0) >= 4 ? "C" : "B";
  const codes = [mode === "C" ? 105 : 104];
  let index = 0;
  while (index < input.length) {
    if (mode === "C") {
      const run = numericRun(input, index);
      if (run >= 2) {
        const usable = run - (run % 2);
        for (let offset = 0; offset < usable; offset += 2) codes.push(Number(input.slice(index + offset, index + offset + 2)));
        index += usable;
        continue;
      }
      codes.push(100); mode = "B"; continue;
    }
    const run = numericRun(input, index);
    if (run >= 4) {
      if (run % 2 === 1) { codes.push(input.charCodeAt(index) - 32); index += 1; }
      codes.push(99); mode = "C"; continue;
    }
    const code = input.charCodeAt(index) - 32;
    if (code < 0 || code > 95) throw new Error("Caractere não suportado no Code 128.");
    codes.push(code); index += 1;
  }
  let checksum = codes[0];
  for (let i = 1; i < codes.length; i += 1) checksum += codes[i] * i;
  codes.push(checksum % 103, 106);
  return codes;
}
export function code128Svg(value, { height = 52, moduleWidth = 0.42 } = {}) {
  const codes = encodeCode128(value);
  const quiet = 10;
  const totalModules = codes.reduce((sum, code) => sum + [...CODE128[code]].reduce((n, digit) => n + Number(digit), 0), quiet * 2);
  let cursor = quiet;
  const bars = [];
  for (const code of codes) {
    const pattern = CODE128[code];
    let bar = true;
    for (const digit of pattern) {
      const width = Number(digit);
      if (bar) bars.push(`<rect x="${(cursor * moduleWidth).toFixed(2)}" y="0" width="${(width * moduleWidth).toFixed(2)}" height="${height}"/>`);
      cursor += width; bar = !bar;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${(totalModules * moduleWidth).toFixed(2)} ${height}" preserveAspectRatio="none" role="img" aria-label="Código de barras da chave de acesso">${bars.join("")}</svg>`;
}

export function parseNfeProc(nfeProcXml) {
  const source = clean(nfeProcXml);
  if (!/<(?:\w+:)?nfeProc\b/i.test(source)) throw new Error("DANFE exige o XML nfeProc autorizado.");
  const nfe = element(source, "NFe");
  const inf = element(nfe, "infNFe");
  const protocol = element(source, "protNFe");
  if (!inf || !protocol) throw new Error("nfeProc incompleto: NF-e e protocolo são obrigatórios.");
  const id = (inf.match(/\bId=["']NFe([A-Z0-9]{44})["']/i) || [])[1] || tag(protocol, "chNFe");
  const accessKey = alphaNum(id);
  if (!/^[A-Z0-9]{44}$/.test(accessKey)) throw new Error("Chave de acesso inválida no nfeProc.");
  const cStat = tag(protocol, "cStat");
  if (cStat !== "100") throw new Error(`DANFE só pode ser gerado a partir de autorização cStat 100; recebido ${cStat || "sem cStat"}.`);

  const ide = element(inf, "ide");
  const emit = element(inf, "emit");
  const dest = element(inf, "dest");
  const emitAddr = element(emit, "enderEmit");
  const destAddr = element(dest, "enderDest");
  const totals = element(inf, "ICMSTot");
  const additional = element(inf, "infAdic");
  const items = allElements(inf, "det").map((det, index) => {
    const prod = element(det, "prod");
    const imposto = element(det, "imposto");
    return {
      number: index + 1,
      code: tag(prod, "cProd"), description: tag(prod, "xProd"), ncm: tag(prod, "NCM"), cest: tag(prod, "CEST"), cfop: tag(prod, "CFOP"),
      unit: tag(prod, "uCom"), quantity: tag(prod, "qCom"), unitValue: tag(prod, "vUnCom"), productValue: tag(prod, "vProd"),
      icms: tag(imposto, "vICMS"), ipi: tag(imposto, "vIPI"),
    };
  });
  return {
    accessKey,
    environment: tag(ide, "tpAmb") === "1" ? "production" : "homologation",
    number: tag(ide, "nNF"), series: tag(ide, "serie"), issueDate: tag(ide, "dhEmi") || tag(ide, "dEmi"), nature: tag(ide, "natOp"),
    issuer: {
      name: tag(emit, "xNome"), tradeName: tag(emit, "xFant"), taxId: tag(emit, "CNPJ") || tag(emit, "CPF"), ie: tag(emit, "IE"),
      street: tag(emitAddr, "xLgr"), number: tag(emitAddr, "nro"), complement: tag(emitAddr, "xCpl"), district: tag(emitAddr, "xBairro"), city: tag(emitAddr, "xMun"), state: tag(emitAddr, "UF"), postalCode: tag(emitAddr, "CEP"), phone: tag(emitAddr, "fone"),
    },
    recipient: {
      name: tag(dest, "xNome"), taxId: tag(dest, "CNPJ") || tag(dest, "CPF"), ie: tag(dest, "IE"),
      street: tag(destAddr, "xLgr"), number: tag(destAddr, "nro"), complement: tag(destAddr, "xCpl"), district: tag(destAddr, "xBairro"), city: tag(destAddr, "xMun"), state: tag(destAddr, "UF"), postalCode: tag(destAddr, "CEP"), phone: tag(destAddr, "fone"),
    },
    totals: {
      baseIcms: tag(totals, "vBC"), icms: tag(totals, "vICMS"), products: tag(totals, "vProd"), freight: tag(totals, "vFrete"), insurance: tag(totals, "vSeg"), discount: tag(totals, "vDesc"), ipi: tag(totals, "vIPI"), pis: tag(totals, "vPIS"), cofins: tag(totals, "vCOFINS"), other: tag(totals, "vOutro"), invoice: tag(totals, "vNF"),
    },
    protocol: tag(protocol, "nProt"), receivedAt: tag(protocol, "dhRecbto"), protocolReason: tag(protocol, "xMotivo"),
    additionalInfo: tag(additional, "infCpl"), items,
  };
}

function addressLine(party) {
  return [party.street, party.number, party.complement, party.district, [party.city, party.state].filter(Boolean).join("/")].filter(Boolean).join(" · ");
}
export function buildDanfeHtml({ nfeProcXml, cancelled = false, cancellationProtocol = "" }) {
  const data = parseNfeProc(nfeProcXml);
  const watermark = cancelled ? "CANCELADA" : data.environment === "homologation" ? "SEM VALOR FISCAL · HOMOLOGAÇÃO" : "";
  const rows = data.items.map((item) => `<tr><td>${esc(item.code)}</td><td class="desc">${esc(item.description)}</td><td>${esc(item.ncm)}</td><td>${esc(item.cest)}</td><td>${esc(item.cfop)}</td><td>${esc(item.unit)}</td><td class="num">${esc(numberText(item.quantity, 4))}</td><td class="num">${esc(numberText(item.unitValue, 4))}</td><td class="num">${esc(numberText(item.productValue))}</td><td class="num">${esc(numberText(item.icms))}</td><td class="num">${esc(numberText(item.ipi))}</td></tr>`).join("");
  const barcode = code128Svg(data.accessKey);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>DANFE NF-e ${esc(data.number)}</title><style>
    @page{size:A4 portrait;margin:7mm}*{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#111;font-size:8.2pt}.sheet{position:relative;width:100%}.watermark{position:fixed;left:8%;right:8%;top:43%;z-index:0;transform:rotate(-28deg);font-size:46pt;font-weight:800;text-align:center;color:rgba(0,0,0,.09);letter-spacing:2px;pointer-events:none}.box{border:1px solid #111;margin-bottom:2mm;position:relative;z-index:1;background:rgba(255,255,255,.94)}.grid{display:grid}.head{grid-template-columns:1.4fr .72fr 1.7fr;min-height:35mm}.cell{padding:2mm;border-right:1px solid #111}.cell:last-child{border-right:0}.issuer h1{font-size:13pt;margin:0 0 1mm}.issuer b{font-size:9pt}.issuer div{line-height:1.35}.danfe{text-align:center}.danfe h2{font-size:15pt;margin:2mm 0 .5mm}.danfe strong{display:block;font-size:9pt}.danfe .number{font-size:10pt;margin-top:2mm}.key{text-align:center}.key svg{width:100%;height:16mm;margin:1mm 0}.key .digits{font-family:monospace;font-size:8pt;letter-spacing:.25px}.label{font-size:6.2pt;text-transform:uppercase;font-weight:700;color:#333;display:block;margin-bottom:.5mm}.value{font-size:8.4pt;font-weight:600}.row{display:grid;border-top:1px solid #111}.row:first-child{border-top:0}.r4{grid-template-columns:2fr 1fr 1fr 1fr}.r3{grid-template-columns:2fr 1fr 1fr}.r2{grid-template-columns:1fr 1fr}.row>div{padding:1.2mm 1.7mm;border-right:1px solid #111;min-height:9mm}.row>div:last-child{border-right:0}.section-title{font-size:7pt;font-weight:800;text-transform:uppercase;padding:1mm 1.5mm;border-bottom:1px solid #111;background:#eee}.items{width:100%;border-collapse:collapse;position:relative;z-index:1;background:#fff}.items th,.items td{border:1px solid #111;padding:1mm .8mm;vertical-align:top}.items th{font-size:5.7pt;background:#eee;text-transform:uppercase}.items td{font-size:6.4pt}.items .desc{width:28%}.num{text-align:right;white-space:nowrap}.totals{grid-template-columns:repeat(6,1fr)}.totals>div{padding:1.2mm;border-right:1px solid #111}.totals>div:last-child{border-right:0}.total-nfe{font-size:10pt}.additional{min-height:18mm;padding:1.8mm;white-space:pre-wrap}.footer{font-size:6pt;color:#444;text-align:center;margin-top:2mm}.cancel-info{font-weight:700;color:#111}.no-break{break-inside:avoid}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style></head><body><main class="sheet">${watermark ? `<div class="watermark">${esc(watermark)}</div>` : ""}
    <section class="box grid head no-break"><div class="cell issuer"><span class="label">Emitente</span><h1>${esc(data.issuer.tradeName || data.issuer.name)}</h1><b>${esc(data.issuer.name)}</b><div>${esc(addressLine(data.issuer))}</div><div>CEP ${esc(data.issuer.postalCode)} · Fone ${esc(data.issuer.phone)}</div><div>CNPJ/CPF ${esc(formatTaxId(data.issuer.taxId))} · IE ${esc(data.issuer.ie)}</div></div>
    <div class="cell danfe"><h2>DANFE</h2><strong>Documento Auxiliar da Nota Fiscal Eletrônica</strong><div class="number">NF-e Nº <b>${esc(data.number)}</b><br>Série <b>${esc(data.series)}</b><br>Folha 1/1</div></div>
    <div class="cell key"><span class="label">Chave de acesso</span>${barcode}<div class="digits">${esc(groupedKey(data.accessKey))}</div><div style="margin-top:1.5mm"><span class="label">Protocolo de autorização</span><span class="value">${esc(data.protocol)} · ${esc(formatDate(data.receivedAt))}</span></div></div></section>
    <section class="box no-break"><div class="row r2"><div><span class="label">Natureza da operação</span><span class="value">${esc(data.nature)}</span></div><div><span class="label">Data de emissão</span><span class="value">${esc(formatDate(data.issueDate))}</span></div></div></section>
    <section class="box no-break"><div class="section-title">Destinatário / Remetente</div><div class="row r3"><div><span class="label">Nome / Razão social</span><span class="value">${esc(data.recipient.name)}</span></div><div><span class="label">CNPJ / CPF</span><span class="value">${esc(formatTaxId(data.recipient.taxId))}</span></div><div><span class="label">Inscrição estadual</span><span class="value">${esc(data.recipient.ie)}</span></div></div><div class="row r2"><div><span class="label">Endereço</span><span class="value">${esc(addressLine(data.recipient))}</span></div><div><span class="label">CEP / Telefone</span><span class="value">${esc(data.recipient.postalCode)} · ${esc(data.recipient.phone)}</span></div></div></section>
    <section class="box no-break"><div class="section-title">Cálculo do imposto</div><div class="grid totals"><div><span class="label">Base ICMS</span><span class="value">R$ ${esc(numberText(data.totals.baseIcms))}</span></div><div><span class="label">Valor ICMS</span><span class="value">R$ ${esc(numberText(data.totals.icms))}</span></div><div><span class="label">Produtos</span><span class="value">R$ ${esc(numberText(data.totals.products))}</span></div><div><span class="label">Frete</span><span class="value">R$ ${esc(numberText(data.totals.freight))}</span></div><div><span class="label">Desconto</span><span class="value">R$ ${esc(numberText(data.totals.discount))}</span></div><div class="total-nfe"><span class="label">Valor total NF-e</span><strong>R$ ${esc(numberText(data.totals.invoice))}</strong></div></div><div class="grid totals" style="border-top:1px solid #111"><div><span class="label">Seguro</span><span class="value">R$ ${esc(numberText(data.totals.insurance))}</span></div><div><span class="label">IPI</span><span class="value">R$ ${esc(numberText(data.totals.ipi))}</span></div><div><span class="label">PIS</span><span class="value">R$ ${esc(numberText(data.totals.pis))}</span></div><div><span class="label">COFINS</span><span class="value">R$ ${esc(numberText(data.totals.cofins))}</span></div><div><span class="label">Outras despesas</span><span class="value">R$ ${esc(numberText(data.totals.other))}</span></div><div></div></div></section>
    <div class="section-title" style="border:1px solid #111;border-bottom:0">Dados dos produtos / serviços</div><table class="items"><thead><tr><th>Cód.</th><th>Descrição</th><th>NCM</th><th>CEST</th><th>CFOP</th><th>UN</th><th>Qtd.</th><th>V. Unit.</th><th>V. Total</th><th>ICMS</th><th>IPI</th></tr></thead><tbody>${rows}</tbody></table>
    <section class="box" style="margin-top:2mm"><div class="section-title">Dados adicionais</div><div class="additional">${esc(data.additionalInfo || "")}${cancelled ? `\n\n<span class="cancel-info">NF-e CANCELADA${cancellationProtocol ? ` · Protocolo do evento: ${esc(cancellationProtocol)}` : ""}</span>` : ""}</div></section>
    <div class="footer">DANFE gerado pelo Seven ERP a partir do nfeProc autorizado · Chave ${esc(data.accessKey)}</div>
  </main></body></html>`;
}
