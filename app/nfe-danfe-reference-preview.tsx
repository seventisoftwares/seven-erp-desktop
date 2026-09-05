"use client";

type Row = Record<string, any>;

const text = (value: unknown) => String(value ?? "").trim();
const numberValue = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const money = (value: unknown) => {
  const parsed = numberValue(value);
  return parsed === null ? "" : parsed.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const quantity = (value: unknown) => {
  const parsed = numberValue(value);
  return parsed === null ? "" : parsed.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 4 });
};
const digits = (value: unknown) => text(value).replace(/\D/g, "");
const taxId = (value: unknown) => {
  const raw = digits(value);
  if (raw.length === 14) return raw.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (raw.length === 11) return raw.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return text(value);
};
const cep = (value: unknown) => {
  const raw = digits(value);
  return raw.length === 8 ? raw.replace(/^(\d{5})(\d{3})$/, "$1-$2") : text(value);
};
const fmtDate = (value: unknown) => {
  if (!value) return "";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? text(value) : date.toLocaleDateString("pt-BR");
};
const fmtTime = (value: unknown) => {
  if (!value) return "";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
};
const groupedKey = (value: unknown) => text(value).toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/(.{4})/g, "$1 ").trim();
const choose = (source: Row, ...keys: string[]) => {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && String(source[key]) !== "") return source[key];
  }
  return "";
};
const cents = (value: unknown) => {
  const parsed = numberValue(value);
  return parsed === null ? null : parsed / 100;
};

const CODE128 = ["212222","222122","222221","121223","121322","131222","122213","122312","132212","221213","221312","231212","112232","122132","122231","113222","123122","123221","223211","221132","221231","213212","223112","312131","311222","321122","321221","312212","322112","322211","212123","212321","232121","111323","131123","131321","112313","132113","132311","211313","231113","231311","112133","112331","132131","113123","113321","133121","313121","211331","231131","213113","213311","213131","311123","311321","331121","312113","312311","332111","314111","221411","431111","111224","111422","121124","121421","141122","141221","112214","112412","122114","122411","142112","142211","241211","221114","413111","241112","134111","111242","121142","121241","114212","124112","124211","411212","421112","421211","212141","214121","412121","111143","111341","131141","114113","114311","411113","411311","113141","114131","311141","411131","211412","211214","211232","2331112"];

function numericRun(value: string, index: number) {
  let end = index;
  while (end < value.length && /\d/.test(value[end])) end += 1;
  return end - index;
}
function encode128(value: string) {
  const input = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!input) return [];
  let mode = numericRun(input, 0) >= 4 ? "C" : "B";
  const codes = [mode === "C" ? 105 : 104];
  let index = 0;
  while (index < input.length) {
    if (mode === "C") {
      const run = numericRun(input, index);
      if (run >= 2) {
        const usable = run - run % 2;
        for (let offset = 0; offset < usable; offset += 2) codes.push(Number(input.slice(index + offset, index + offset + 2)));
        index += usable;
        continue;
      }
      codes.push(100);
      mode = "B";
      continue;
    }
    const run = numericRun(input, index);
    if (run >= 4) {
      if (run % 2 === 1) {
        codes.push(input.charCodeAt(index) - 32);
        index += 1;
      }
      codes.push(99);
      mode = "C";
      continue;
    }
    const code = input.charCodeAt(index) - 32;
    if (code < 0 || code > 95) return [];
    codes.push(code);
    index += 1;
  }
  let checksum = codes[0];
  for (let index = 1; index < codes.length; index += 1) checksum += codes[index] * index;
  codes.push(checksum % 103, 106);
  return codes;
}
function Barcode({ value }: { value: string }) {
  const codes = encode128(value);
  if (!codes.length) return <div className="ref-no-barcode">CHAVE AINDA NÃO GERADA</div>;
  let cursor = 10;
  const rects: Array<{ x: number; width: number }> = [];
  for (const code of codes) {
    let bar = true;
    for (const digit of CODE128[code]) {
      const width = Number(digit);
      if (bar) rects.push({ x: cursor, width });
      cursor += width;
      bar = !bar;
    }
  }
  return <svg className="ref-barcode" viewBox={`0 0 ${cursor + 10} 50`} preserveAspectRatio="none">{rects.map((rect, index) => <rect key={index} x={rect.x} y="0" width={rect.width} height="50" />)}</svg>;
}
function Field({ label, value, className = "" }: { label: string; value: unknown; className?: string }) {
  return <div className={`ref-field ${className}`}><span>{label}</span><b>{text(value)}</b></div>;
}
function itemQty(item: Row) {
  if (item.quantity !== undefined) return numberValue(item.quantity) || 0;
  if (item.quantityMilli !== undefined) return (numberValue(item.quantityMilli) || 0) / 1000;
  return numberValue(item.qCom) || 0;
}
function itemUnit(item: Row) {
  if (item.unitPrice !== undefined) return numberValue(item.unitPrice) || 0;
  if (item.unitPriceCents !== undefined) return (numberValue(item.unitPriceCents) || 0) / 100;
  return numberValue(item.vUnCom) || 0;
}
function itemTotal(item: Row) {
  const direct = choose(item, "total", "productValue", "vProd");
  if (direct !== "") return numberValue(direct) || 0;
  if (item.totalCents !== undefined) return (numberValue(item.totalCents) || 0) / 100;
  return itemQty(item) * itemUnit(item);
}
function itemExtra(item: Row) {
  if (text(item.infAdProd || item.extra)) return text(item.infAdProd || item.extra);
  const vehicle = item.vehicle || {};
  const pairs = [
    ["CHASSI/VIN", vehicle.vin], ["RENAVAM", vehicle.renavam], ["PLACA", [vehicle.plate, vehicle.plateState].filter(Boolean).join("/")],
    ["VERSÃO", vehicle.version], ["ANO FAB/MOD", [vehicle.manufactureYear, vehicle.modelYear].filter(Boolean).join("/")],
    ["COR", vehicle.exteriorColor], ["MOTOR", vehicle.engineNumber || vehicle.engineCode], ["CÂMBIO", vehicle.transmission],
    ["COMBUSTÍVEL", vehicle.fuel], ["KM", vehicle.mileageKm], ["OPCIONAIS", vehicle.options], ["ACESSÓRIOS", vehicle.accessories],
  ].filter(([, value]) => text(value));
  return pairs.map(([label, value]) => `${label}: ${text(value)}`).join("\n");
}
function splitItems(items: Row[]) {
  const pages: Row[][] = [];
  let current: Row[] = [];
  let weight = 0;
  let capacity = 12.5;
  for (const item of items) {
    const content = `${text(item.description || item.xProd)} ${itemExtra(item)}`;
    const rowWeight = 1 + Math.max(0, Math.ceil(content.length / 48) - 1) * 0.6;
    if (current.length && weight + rowWeight > capacity) {
      pages.push(current);
      current = [];
      weight = 0;
      capacity = 31;
    }
    current.push(item);
    weight += rowWeight;
  }
  if (current.length || !pages.length) pages.push(current);
  return pages;
}
function freightLabel(value: unknown) {
  const labels: Record<string, string> = {
    sender: "0 - REMETENTE", recipient: "1 - DESTINATÁRIO", third_party: "2 - TERCEIROS", no_freight: "9 - SEM TRANSPORTE",
    "0": "0 - REMETENTE", "1": "1 - DESTINATÁRIO", "2": "2 - TERCEIROS", "9": "9 - SEM TRANSPORTE",
  };
  return labels[text(value)] || text(value);
}

export default function NfeDanfeReferencePreview({ draft, company, snapshot }: { draft: Row; company: Row; snapshot?: Row }) {
  const source = { ...draft, ...(snapshot || {}) };
  const items: Row[] = Array.isArray(snapshot?.items) ? snapshot!.items : Array.isArray(draft.items) ? draft.items : [];
  const pages = splitItems(items);
  const status = text(draft.transmissionStatus || draft.transmission?.status || "draft");
  const authorized = status === "authorized";
  const cancelled = status === "cancelled";
  const simulation = Boolean(source.simulation || draft.simulation || status === "simulation");
  const accessKey = text(draft.accessKey || draft.transmission?.accessKey);
  const protocol = simulation ? "" : text(draft.protocol || draft.transmission?.protocol);
  const number = draft.nfeNumber || draft.transmission?.number || "";
  const series = draft.nfeSeries || draft.transmission?.series || company.nfeSeries || "";
  const issueAt = draft.transmission?.issuedAt || draft.createdAt;
  const exitAt = choose(source, "exitAt", "departureAt", "dhSaiEnt");
  const products = cents(draft.productsTotalCents) ?? items.reduce((sum, item) => sum + itemTotal(item), 0);
  const freight = cents(draft.freightCents) ?? numberValue(source.freight) ?? 0;
  const insurance = cents(draft.insuranceCents) ?? numberValue(source.insurance) ?? 0;
  const discount = cents(draft.discountCents) ?? numberValue(source.discount) ?? 0;
  const other = cents(draft.otherCents) ?? numberValue(source.other) ?? 0;
  const total = cents(draft.totalCents) ?? Math.max(0, products + freight + insurance + other - discount);
  const issuerName = company.tradeName || company.legalName || "EMPRESA NÃO CADASTRADA";
  const logo = /^data:image\/(?:png|jpeg|webp);base64,/i.test(text(company.logoDataUrl)) ? text(company.logoDataUrl) : "";
  const watermark = cancelled ? "CANCELADA" : simulation ? "SEM VALOR FISCAL" : source.environment !== "production" ? "SEM VALOR FISCAL · HOMOLOGAÇÃO" : !authorized ? "ESPELHO · SEM VALOR FISCAL" : "";

  return <div className="ref-pages">{pages.map((pageItems, pageIndex) => {
    const first = pageIndex === 0;
    return <article className={`ref-sheet ${simulation ? "ref-simulation" : ""}`} key={pageIndex}>
      {watermark && <div className="ref-watermark">{watermark}</div>}
      {first && <section className="ref-receipt ref-frame"><div className="ref-receipt-main"><div className="ref-receipt-title">RECEBEMOS DE {issuerName} OS PRODUTOS CONSTANTES DA NOTA FISCAL INDICADA AO LADO</div><div className="ref-receipt-sign"><div><span>DATA DE RECEBIMENTO</span></div><div><span>IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR</span></div></div></div><div className="ref-receipt-nfe"><b>NF-e</b><strong>N. {number ? String(number).padStart(9, "0") : "000000000"}</strong><strong>SÉRIE {series || "—"}</strong></div></section>}

      <section className="ref-header ref-frame">
        <div className={`ref-issuer ${logo ? "ref-issuer-has-logo" : ""}`}>
          {logo && <img className="ref-issuer-logo" src={logo} alt="Logotipo do emitente" />}
          <div className="ref-issuer-copy"><span>Identificação do emitente</span><h1>{issuerName}</h1><h2>{company.legalName}</h2><p>{[company.street, company.number].filter(Boolean).join(", ")}</p><p>{[company.district, company.city, company.state].filter(Boolean).join(" - ")}</p><p>{company.postalCode ? `CEP ${cep(company.postalCode)}` : ""}</p><p>{company.phone ? `FONE ${company.phone}` : ""}</p><p>CNPJ {taxId(company.taxId)}</p><p>IE {company.stateRegistration}</p></div>
        </div>
        <div className="ref-danfe"><h2>DANFE</h2><p>DOCUMENTO AUXILIAR DA<br />NOTA FISCAL ELETRÔNICA</p><div className="ref-flow">0 - ENTRADA<br />1 - SAÍDA <b>{text(source.operationType || source.tpNF).startsWith("0") ? "0" : "1"}</b></div><strong>N. {number ? String(number).padStart(9, "0") : "000000000"}</strong><strong>SÉRIE {series || "—"}</strong><strong>FOLHA {String(pageIndex + 1).padStart(2, "0")}/{String(pages.length).padStart(2, "0")}</strong></div>
        <div className="ref-access"><div className="ref-barcode-wrap"><Barcode value={accessKey} /></div><div className="ref-access-key"><span>CHAVE DE ACESSO DA NF-e</span><b>{accessKey ? groupedKey(accessKey) : "CHAVE AINDA NÃO GERADA"}</b></div><p>Consulta de autenticidade no portal nacional da NF-e<br />www.nfe.fazenda.gov.br/portal ou no site da Sefaz Autorizadora</p></div>
      </section>

      <section className="ref-frame ref-compact"><div className="ref-row ref-nature"><Field label="NATUREZA DA OPERAÇÃO" value={source.natureOperation} /><Field label="PROTOCOLO DE AUTORIZAÇÃO DE USO" value={simulation ? "" : protocol || (!authorized ? "AINDA NÃO AUTORIZADA" : "")} /></div><div className="ref-row ref-thirds"><Field label="INSCRIÇÃO ESTADUAL" value={company.stateRegistration} /><Field label="INSCRIÇÃO ESTADUAL DO SUBST. TRIBUT." value={company.stateRegistrationSt} /><Field label="CNPJ / CPF" value={taxId(company.taxId)} /></div></section>

      {first && <>
        <h3 className="ref-caption">DESTINATÁRIO / REMETENTE</h3><section className="ref-frame ref-compact"><div className="ref-row ref-rec1"><Field label="NOME / RAZÃO SOCIAL" value={source.recipientName} /><Field label="CNPJ / CPF" value={taxId(source.recipientTaxId)} /><Field label="DATA EMISSÃO" value={fmtDate(issueAt)} /></div><div className="ref-row ref-rec2"><Field label="ENDEREÇO" value={[source.recipientStreet, source.recipientNumber, source.recipientComplement].filter(Boolean).join(", ")} /><Field label="BAIRRO / DISTRITO" value={source.recipientDistrict} /><Field label="CEP" value={cep(source.recipientPostalCode)} /><Field label="DATA ENTRADA / SAÍDA" value={fmtDate(exitAt)} /></div><div className="ref-row ref-rec3"><Field label="MUNICÍPIO" value={source.recipientCity} /><Field label="FONE / FAX" value={source.recipientPhone} /><Field label="UF" value={source.recipientState} /><Field label="INSCRIÇÃO ESTADUAL" value={source.recipientStateRegistration} /><Field label="HORA ENTRADA / SAÍDA" value={fmtTime(exitAt)} /></div></section>
        <h3 className="ref-caption">FATURA</h3><section className="ref-frame ref-single-line">{text(source.invoiceNumber || source.invoice?.number || "")}</section>
        <h3 className="ref-caption">CÁLCULO DO IMPOSTO</h3><section className="ref-frame ref-compact"><div className="ref-row ref-tax5"><Field label="BASE DE CÁLCULO DO ICMS" value={money(choose(source, "icmsBase", "baseIcms", "vBC"))} /><Field label="VALOR DO ICMS" value={money(choose(source, "icmsValue", "icms", "vICMS"))} /><Field label="BASE DE CÁLCULO DO ICMS SUBSTITUIÇÃO" value={money(choose(source, "icmsStBase", "baseIcmsSt", "vBCST"))} /><Field label="VALOR DO ICMS SUBSTITUIÇÃO" value={money(choose(source, "icmsStValue", "icmsSt", "vST"))} /><Field label="VALOR TOTAL DOS PRODUTOS" value={money(products)} /></div><div className="ref-row ref-tax6"><Field label="VALOR DO FRETE" value={money(freight)} /><Field label="VALOR DO SEGURO" value={money(insurance)} /><Field label="DESCONTO" value={money(discount)} /><Field label="OUTRAS DESPESAS ACESSÓRIAS" value={money(other)} /><Field label="VALOR DO IPI" value={money(choose(source, "ipiValue", "ipi", "vIPI"))} /><Field label="VALOR TOTAL DA NOTA" value={money(total)} className="ref-total" /></div></section>
        <h3 className="ref-caption">TRANSPORTADOR / VOLUMES TRANSPORTADOS</h3><section className="ref-frame ref-compact"><div className="ref-row ref-transp1"><Field label="RAZÃO SOCIAL" value={source.carrierName} /><Field label="FRETE POR CONTA" value={freightLabel(source.freightMode)} /><Field label="CÓDIGO ANTT" value={source.anttCode || source.rntc} /><Field label="PLACA DO VEÍCULO" value={source.vehiclePlate} /><Field label="UF" value={source.vehicleState} /><Field label="CNPJ / CPF" value={taxId(source.carrierTaxId)} /></div><div className="ref-row ref-transp2"><Field label="ENDEREÇO" value={source.carrierAddress} /><Field label="MUNICÍPIO" value={source.carrierCity} /><Field label="UF" value={source.carrierState} /><Field label="INSCRIÇÃO ESTADUAL" value={source.carrierStateRegistration} /></div><div className="ref-row ref-six"><Field label="QUANTIDADE" value={source.volumeQuantity} /><Field label="ESPÉCIE" value={source.volumeSpecies} /><Field label="MARCA" value={source.volumeBrand} /><Field label="NUMERAÇÃO" value={source.volumeNumbering} /><Field label="PESO BRUTO" value={source.grossWeight} /><Field label="PESO LÍQUIDO" value={source.netWeight} /></div></section>
      </>}

      <h3 className="ref-caption">DADOS DO PRODUTO / SERVIÇO</h3><section className="ref-products ref-frame"><table><thead><tr><th>CÓD. PROD.</th><th>DESCRIÇÃO DO PRODUTO / SERVIÇO</th><th>NCM / SH</th><th>CST</th><th>CFOP</th><th>UN</th><th>QUANT.</th><th>V. UNITÁRIO</th><th>V. TOTAL</th><th>BC ICMS</th><th>V. ICMS</th><th>V. IPI</th><th>ALÍQ. ICMS</th><th>ALÍQ. IPI</th></tr></thead><tbody>{pageItems.map((item, index) => <tr key={item.id || index}><td>{text(item.code)}</td><td className="ref-desc"><b>{text(item.description || item.xProd)}</b>{itemExtra(item) && <small>{itemExtra(item)}</small>}</td><td>{text(item.ncm)}</td><td>{text(item.cst || item.csosn)}</td><td>{text(item.cfop)}</td><td>{text(item.unit)}</td><td className="ref-num">{quantity(itemQty(item))}</td><td className="ref-num">{quantity(itemUnit(item))}</td><td className="ref-num">{money(itemTotal(item))}</td><td className="ref-num">{money(choose(item, "icmsBase", "baseIcms", "vBC"))}</td><td className="ref-num">{money(choose(item, "icmsValue", "icms", "vICMS"))}</td><td className="ref-num">{money(choose(item, "ipiValue", "ipi", "vIPI"))}</td><td className="ref-num">{text(item.icmsRate || item.pICMS)}</td><td className="ref-num">{text(item.ipiRate || item.pIPI)}</td></tr>)}</tbody></table><div className="ref-product-filler" /></section>

      {first && <><h3 className="ref-caption">CÁLCULO DO ISSQN</h3><section className="ref-frame ref-compact"><div className="ref-row ref-four"><Field label="INSCRIÇÃO MUNICIPAL" value={company.municipalRegistration} /><Field label="VALOR TOTAL DOS SERVIÇOS" value={money(choose(source, "issqnServices", "serviceTotal"))} /><Field label="BASE DE CÁLCULO DO ISSQN" value={money(choose(source, "issqnBase", "issBase"))} /><Field label="VALOR DO ISSQN" value={money(choose(source, "issqnValue", "issValue"))} /></div></section><h3 className="ref-caption">DADOS ADICIONAIS</h3><section className="ref-additional ref-frame"><div><span>INFORMAÇÕES COMPLEMENTARES</span><p>{text(source.notes)}</p>{!simulation && <p>{protocol ? `Protocolo: ${protocol}` : ""}</p>}</div><div><span>RESERVADO AO FISCO</span></div></section><footer className="ref-footer">gerado por <b>Seven ERP</b></footer></>}
    </article>;
  })}</div>;
}
