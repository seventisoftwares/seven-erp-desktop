const clean = (value) => String(value ?? "").trim();
const alphaNum = (value) => clean(value).toUpperCase().replace(/[^A-Z0-9]/g, "");

function decodeXml(value) {
  return String(value || "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
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
