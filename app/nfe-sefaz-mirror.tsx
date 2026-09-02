"use client";

type AnyRow = Record<string, any>;

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const decimal = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 4 });
const txt = (value: unknown, fallback = "—") => String(value ?? "").trim() || fallback;
const onlyDigits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const groupedKey = (value: unknown) => String(value ?? "").replace(/\s/g, "").replace(/(.{4})/g, "$1 ").trim();
const fmtDate = (value: unknown) => {
  if (!value) return "—";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? txt(value) : date.toLocaleDateString("pt-BR");
};
const fmtTime = (value: unknown) => {
  if (!value) return "—";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};
const fmtCep = (value: unknown) => {
  const raw = onlyDigits(value);
  return /^\d{8}$/.test(raw) ? raw.replace(/^(\d{5})(\d{3})$/, "$1-$2") : txt(value);
};

function itemQty(item: AnyRow) {
  if (item.quantity !== undefined) return Number(item.quantity) || 0;
  if (item.quantityMilli !== undefined) return (Number(item.quantityMilli) || 0) / 1000;
  return 0;
}
function itemUnit(item: AnyRow) {
  if (item.unitPrice !== undefined) return Number(item.unitPrice) || 0;
  if (item.unitPriceCents !== undefined) return (Number(item.unitPriceCents) || 0) / 100;
  return 0;
}
function itemTotal(item: AnyRow) {
  if (item.totalCents !== undefined && item.quantity === undefined) return (Number(item.totalCents) || 0) / 100;
  return itemQty(item) * itemUnit(item);
}

function Field({ label, value, className = "" }: { label: string; value: unknown; className?: string }) {
  return <div className={`sefaz-field ${className}`}><span>{label}</span><b>{txt(value)}</b></div>;
}

export default function NfeSefazMirror({ draft, company, snapshot }: { draft: AnyRow; company: AnyRow; snapshot?: AnyRow }) {
  const source = { ...draft, ...(snapshot || {}) };
  const items: AnyRow[] = Array.isArray(snapshot?.items) ? snapshot!.items : Array.isArray(draft.items) ? draft.items : [];
  const products = draft.productsTotalCents !== undefined ? (Number(draft.productsTotalCents) || 0) / 100 : items.reduce((sum, item) => sum + itemTotal(item), 0);
  const freight = snapshot?.freight !== undefined ? Number(snapshot.freight) || 0 : (Number(draft.freightCents) || 0) / 100;
  const discount = snapshot?.discount !== undefined ? Number(snapshot.discount) || 0 : (Number(draft.discountCents) || 0) / 100;
  const other = snapshot?.other !== undefined ? Number(snapshot.other) || 0 : (Number(draft.otherCents) || 0) / 100;
  const total = draft.totalCents !== undefined ? (Number(draft.totalCents) || 0) / 100 : Math.max(0, products + freight + other - discount);
  const accessKey = draft.accessKey || draft.transmission?.accessKey || "";
  const protocol = draft.protocol || draft.transmission?.protocol || "";
  const series = draft.nfeSeries || draft.transmission?.series || company.nfeSeries || "—";
  const number = draft.nfeNumber || draft.transmission?.number || "—";
  const status = String(draft.transmissionStatus || draft.transmission?.status || "draft");
  const isAuthorized = status === "authorized";
  const isCancelled = status === "cancelled";
  const homologation = source.environment !== "production";
  const issuerName = company.tradeName || company.legalName || "EMPRESA NÃO CADASTRADA";
  const issuerAddress = [company.street, company.number, company.complement].filter(Boolean).join(", ");
  const issuerCity = [company.district, company.city, company.state].filter(Boolean).join(" - ");
  const recipientAddress = [source.recipientStreet, source.recipientNumber, source.recipientComplement].filter(Boolean).join(", ");
  const issueAt = draft.transmission?.issuedAt || draft.createdAt;
  const watermark = isCancelled ? "CANCELADA" : homologation ? "SEM VALOR FISCAL\nAMBIENTE DE HOMOLOGAÇÃO" : !isAuthorized ? "ESPELHO\nSEM VALOR FISCAL" : "ESPELHO";
  const freightLabel: Record<string, string> = { sender: "0 - Remetente (CIF)", recipient: "1 - Destinatário (FOB)", third_party: "2 - Terceiros", no_freight: "9 - Sem frete" };

  return <article className="sefaz-danfe-sheet">
    <div className="sefaz-watermark">{watermark.split("\n").map((line, index) => <div key={index}>{line}</div>)}</div>

    <section className="sefaz-receipt sefaz-box">
      <div className="sefaz-receipt-text">
        <p>RECEBEMOS DE {issuerName} OS PRODUTOS E/OU SERVIÇOS CONSTANTES DA NOTA FISCAL ELETRÔNICA INDICADA AO LADO. EMISSÃO: {fmtDate(issueAt)} VALOR TOTAL: {money.format(total)} DESTINATÁRIO: {txt(source.recipientName)}.</p>
        <div className="sefaz-receipt-sign"><Field label="DATA DE RECEBIMENTO" value="" /><Field label="IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR" value="" /></div>
      </div>
      <div className="sefaz-receipt-nfe"><strong>NF-e</strong><b>Nº {number === "—" ? "000.000.000" : String(number).padStart(9, "0")}</b><b>SÉRIE {series}</b><small>ESPELHO</small></div>
    </section>

    <section className="sefaz-main-head sefaz-box">
      <div className="sefaz-issuer">
        <small>IDENTIFICAÇÃO DO EMITENTE</small>
        <h1>{issuerName}</h1>
        <p>{issuerAddress || "—"}</p><p>{issuerCity || "—"} · CEP {fmtCep(company.postalCode)}</p>
        <p>{[company.phone, company.email].filter(Boolean).join(" · ") || "—"}</p>
      </div>
      <div className="sefaz-danfe-title">
        <h2>DANFE</h2><p>Documento Auxiliar da<br/>Nota Fiscal Eletrônica</p>
        <div className="sefaz-flow"><span>0 - ENTRADA<br/><b>1 - SAÍDA</b></span><strong>1</strong></div>
        <b>Nº {number === "—" ? "000.000.000" : String(number).padStart(9, "0")}</b><b>SÉRIE {series}</b><small>FOLHA 1/1</small>
      </div>
      <div className="sefaz-key-area">
        <div className={accessKey ? "sefaz-barcode has-key" : "sefaz-barcode no-key"} aria-label={accessKey ? "Representação visual da área do código de barras" : "Código de barras indisponível antes da chave de acesso"}></div>
        <span>CHAVE DE ACESSO</span><b className="sefaz-key-digits">{accessKey ? groupedKey(accessKey) : "CHAVE AINDA NÃO GERADA"}</b>
        <p>Consulta de autenticidade no portal nacional da NF-e<br/>www.nfe.fazenda.gov.br/portal</p>
        <div className="sefaz-protocol"><span>PROTOCOLO DE AUTORIZAÇÃO DE USO</span><b>{protocol || "AINDA NÃO AUTORIZADA"}</b></div>
      </div>
    </section>

    <section className="sefaz-box sefaz-row nature-row"><Field label="NATUREZA DA OPERAÇÃO" value={source.natureOperation} className="span2" /><Field label="INSCRIÇÃO ESTADUAL" value={company.stateRegistration} /><Field label="INSCRIÇÃO ESTADUAL DO SUBST. TRIBUT." value={company.stateRegistrationSt} /><Field label="CNPJ / CPF" value={company.taxId} /></section>

    <div className="sefaz-section-label">DESTINATÁRIO / REMETENTE</div>
    <section className="sefaz-box">
      <div className="sefaz-row recipient-a"><Field label="NOME / RAZÃO SOCIAL" value={source.recipientName} /><Field label="CNPJ / CPF" value={source.recipientTaxId} /><Field label="DATA DA EMISSÃO" value={fmtDate(issueAt)} /></div>
      <div className="sefaz-row recipient-b"><Field label="ENDEREÇO" value={recipientAddress} /><Field label="BAIRRO / DISTRITO" value={source.recipientDistrict} /><Field label="CEP" value={fmtCep(source.recipientPostalCode)} /><Field label="DATA DA SAÍDA" value="—" /></div>
      <div className="sefaz-row recipient-c"><Field label="MUNICÍPIO" value={source.recipientCity} /><Field label="FONE / FAX" value={source.recipientPhone} /><Field label="UF" value={source.recipientState} /><Field label="INSCRIÇÃO ESTADUAL" value={source.recipientStateRegistration} /><Field label="HORA DA SAÍDA" value="—" /></div>
    </section>

    <div className="sefaz-section-label">CÁLCULO DO IMPOSTO</div>
    <section className="sefaz-box">
      <div className="sefaz-row tax-row"><Field label="BASE DE CÁLCULO DO ICMS" value={money.format(0)} /><Field label="VALOR DO ICMS" value={money.format(0)} /><Field label="BASE DE CÁLCULO DO ICMS ST" value={money.format(0)} /><Field label="VALOR DO ICMS ST" value={money.format(0)} /><Field label="VALOR DO II" value={money.format(0)} /><Field label="VALOR TOTAL DOS PRODUTOS" value={money.format(products)} /></div>
      <div className="sefaz-row tax-row"><Field label="VALOR DO FRETE" value={money.format(freight)} /><Field label="VALOR DO SEGURO" value={money.format(0)} /><Field label="DESCONTO" value={money.format(discount)} /><Field label="OUTRAS DESPESAS" value={money.format(other)} /><Field label="VALOR DO IPI" value={money.format(0)} /><Field label="VALOR TOTAL DA NOTA" value={money.format(total)} className="total-field" /></div>
    </section>

    <div className="sefaz-section-label">TRANSPORTADOR / VOLUMES TRANSPORTADOS</div>
    <section className="sefaz-box">
      <div className="sefaz-row transport-a"><Field label="NOME / RAZÃO SOCIAL" value={source.carrierName} /><Field label="FRETE POR CONTA" value={freightLabel[source.freightMode] || txt(source.freightMode)} /><Field label="CÓDIGO ANTT" value={source.anttCode} /><Field label="PLACA DO VEÍCULO" value={source.vehiclePlate} /><Field label="UF" value={source.vehicleState} /><Field label="CNPJ / CPF" value={source.carrierTaxId} /></div>
      <div className="sefaz-row transport-b"><Field label="ENDEREÇO" value={source.carrierAddress} /><Field label="MUNICÍPIO" value={source.carrierCity} /><Field label="UF" value={source.carrierState} /><Field label="INSCRIÇÃO ESTADUAL" value={source.carrierStateRegistration} /></div>
      <div className="sefaz-row volumes"><Field label="QUANTIDADE" value={source.volumeQuantity} /><Field label="ESPÉCIE" value={source.volumeSpecies} /><Field label="MARCA" value={source.volumeBrand} /><Field label="NUMERAÇÃO" value={source.volumeNumbering} /><Field label="PESO BRUTO" value={source.grossWeight} /><Field label="PESO LÍQUIDO" value={source.netWeight} /></div>
    </section>

    <div className="sefaz-section-label">DADOS DOS PRODUTOS / SERVIÇOS</div>
    <section className="sefaz-products-box sefaz-box">
      <table className="sefaz-products"><thead><tr><th>CÓDIGO</th><th>DESCRIÇÃO DO PRODUTO / SERVIÇO</th><th>NCM/SH</th><th>CST</th><th>CFOP</th><th>UN</th><th>QUANT.</th><th>VALOR UNIT.</th><th>VALOR TOTAL</th><th>BC ICMS</th><th>VALOR ICMS</th><th>VALOR IPI</th><th>ALÍQ. ICMS</th><th>ALÍQ. IPI</th></tr></thead><tbody>
        {items.map((item, index) => <tr key={item.id || index}><td>{txt(item.code)}</td><td className="desc">{txt(item.description)}{item.gtin ? <small>GTIN {item.gtin}</small> : null}</td><td>{txt(item.ncm)}</td><td>{txt(item.cst || item.csosn)}</td><td>{txt(item.cfop)}</td><td>{txt(item.unit)}</td><td className="num">{decimal.format(itemQty(item))}</td><td className="num">{itemUnit(item).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td><td className="num">{itemTotal(item).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td><td className="num">{item.icmsBase === "" || item.icmsBase === undefined ? "" : Number(item.icmsBase).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td><td className="num"></td><td className="num"></td><td className="num">{item.icmsRate ? `${item.icmsRate}` : ""}</td><td className="num"></td></tr>)}
        {items.length === 0 && <tr><td colSpan={14} className="sefaz-empty-products">NENHUM PRODUTO INFORMADO</td></tr>}
      </tbody></table>
      <div className="sefaz-products-fill"></div>
    </section>

    <div className="sefaz-section-label">DADOS ADICIONAIS</div>
    <section className="sefaz-additional sefaz-box"><div><span>INFORMAÇÕES COMPLEMENTARES</span><p>{txt(source.notes)}</p><small>ESPELHO DE CONFERÊNCIA — SEM VALOR FISCAL.</small></div><div><span>RESERVADO AO FISCO</span></div></section>

    <footer className="sefaz-footer"><span>Seven ERP · Espelho NF-e modelo 55</span><b>{isAuthorized ? "NF-e AUTORIZADA — ESPelho de conferência" : "SEM VALOR FISCAL"}</b><span>Gerado em {new Date().toLocaleString("pt-BR")}</span></footer>
  </article>;
}
