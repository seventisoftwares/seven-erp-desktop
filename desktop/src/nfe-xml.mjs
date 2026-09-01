import { randomInt } from "node:crypto";
import { UF_CODES } from "./fiscal-integrations.mjs";

const TAX_REGIME_CRT = Object.freeze({
  simples_nacional: "1",
  simples_excesso: "2",
  lucro_presumido: "3",
  lucro_real: "3",
  mei: "4",
});

const PURPOSE = Object.freeze({ normal: "1", complementary: "2", adjustment: "3", return: "4" });
const PRESENCE = Object.freeze({ not_applicable: "0", in_person: "1", internet: "2", delivery: "4" });
const FREIGHT = Object.freeze({ sender: "0", recipient: "1", third_party: "2", no_freight: "9" });
const PIS_COFINS_NT = new Set(["04", "05", "06", "07", "08", "09"]);
const SIMPLE_NO_CREDIT = new Set(["102", "103", "300", "400"]);
const NORMAL_UNTAXED = new Set(["40", "41", "50"]);

const clean = (value) => String(value ?? "").trim();
const digits = (value) => clean(value).replace(/\D/g, "");
const alphaNum = (value) => clean(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
const xml = (value) => clean(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const cents = (value) => Math.round((Number(value) || 0) * 100);
const money = (valueCents) => (Number(valueCents || 0) / 100).toFixed(2);
const rate = (value) => Number(value || 0).toFixed(4).replace(/0+$/, "").replace(/\.$/, ".0");
const qty = (value) => Number(value || 0).toFixed(4).replace(/0+$/, "").replace(/\.$/, "") || "0";
const unitValue = (value) => Number(value || 0).toFixed(10).replace(/0+$/, "").replace(/\.$/, "") || "0";

function characterValue(character) {
  const code = String(character || "").toUpperCase().charCodeAt(0);
  if (!Number.isInteger(code)) return NaN;
  return code - 48;
}

function modulo11(values, weights) {
  const sum = values.reduce((total, value, index) => total + value * weights[index], 0);
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

export function normalizeCnpj(value) {
  return alphaNum(value);
}

export function validateCnpj(value) {
  const cnpj = normalizeCnpj(value);
  if (!/^[A-Z0-9]{12}\d{2}$/.test(cnpj)) return false;
  const base = [...cnpj.slice(0, 12)].map(characterValue);
  if (base.some((value) => !Number.isFinite(value) || value < 0 || value > 42)) return false;
  const d1 = modulo11(base, [5,4,3,2,9,8,7,6,5,4,3,2]);
  const d2 = modulo11([...base, d1], [6,5,4,3,2,9,8,7,6,5,4,3,2]);
  return cnpj.endsWith(`${d1}${d2}`);
}

export function calculateAccessKeyDv(base43) {
  const base = alphaNum(base43);
  if (base.length !== 43 || !/^[0-9]{6}[A-Z0-9]{12}[0-9]{25}$/.test(base)) throw new Error("Base da chave de acesso NF-e deve possuir 43 posições válidas.");
  let weight = 2;
  let sum = 0;
  for (let index = base.length - 1; index >= 0; index -= 1) {
    const value = characterValue(base[index]);
    if (!Number.isFinite(value) || value < 0 || value > 42) throw new Error("Chave de acesso contém caractere inválido para cálculo do DV.");
    sum += value * weight;
    weight += 1;
    if (weight > 9) weight = 2;
  }
  const remainder = sum % 11;
  return remainder === 0 || remainder === 1 ? 0 : 11 - remainder;
}

export function buildAccessKey({ uf, issuedAt, cnpj, model = "55", series, number, emissionType = "1", numericCode }) {
  const cUF = UF_CODES[clean(uf).toUpperCase()];
  if (!cUF) throw new Error("UF do emitente inválida para chave de acesso.");
  const date = issuedAt instanceof Date ? issuedAt : new Date(issuedAt || Date.now());
  if (Number.isNaN(date.getTime())) throw new Error("Data de emissão inválida.");
  const taxId = normalizeCnpj(cnpj);
  if (!validateCnpj(taxId)) throw new Error("CNPJ do emitente inválido, inclusive para o padrão alfanumérico.");
  const aamm = `${String(date.getFullYear()).slice(-2)}${String(date.getMonth() + 1).padStart(2, "0")}`;
  const serie = digits(series).padStart(3, "0").slice(-3);
  const nNF = digits(number).padStart(9, "0").slice(-9);
  const cNF = digits(numericCode).padStart(8, "0").slice(-8);
  if (!/^\d{8}$/.test(cNF)) throw new Error("Código numérico cNF inválido.");
  const base = `${cUF}${aamm}${taxId}${digits(model).padStart(2, "0")}${serie}${nNF}${digits(emissionType).slice(-1)}${cNF}`;
  const dv = calculateAccessKeyDv(base);
  return { accessKey: `${base}${dv}`, cUF, cDV: String(dv), cNF, series: serie, number: nNF };
}

export function createRandomNumericCode() {
  return String(randomInt(0, 100000000)).padStart(8, "0");
}

function companyBlockers(company) {
  const blockers = [];
  if (!company?.legalName) blockers.push("Cadastro da empresa: razão social é obrigatória.");
  if (!validateCnpj(company?.taxId)) blockers.push("Cadastro da empresa: CNPJ inválido.");
  if (!clean(company?.stateRegistration)) blockers.push("Cadastro da empresa: Inscrição Estadual é obrigatória para NF-e.");
  if (!TAX_REGIME_CRT[company?.taxRegime]) blockers.push("Cadastro da empresa: regime tributário não mapeado para CRT da NF-e.");
  if (!UF_CODES[clean(company?.state).toUpperCase()]) blockers.push("Cadastro da empresa: UF inválida.");
  if (!/^\d{7}$/.test(digits(company?.cityCode))) blockers.push("Cadastro da empresa: código IBGE do município deve ter 7 dígitos.");
  if (!/^\d{8}$/.test(digits(company?.postalCode))) blockers.push("Cadastro da empresa: CEP fiscal deve ter 8 dígitos.");
  for (const [field, label] of [["street","logradouro"],["number","número"],["district","bairro"],["city","município"]]) if (!clean(company?.[field])) blockers.push(`Cadastro da empresa: ${label} é obrigatório.`);
  return blockers;
}

function recipientBlockers(draft) {
  const blockers = [];
  if (!clean(draft?.recipientName)) blockers.push("Destinatário: nome/razão social é obrigatório.");
  const id = alphaNum(draft?.recipientTaxId);
  const isCpf = /^\d{11}$/.test(id);
  const isCnpj = /^[A-Z0-9]{12}\d{2}$/.test(id) && validateCnpj(id);
  if (!isCpf && !isCnpj) blockers.push("Destinatário: informe CPF válido ou CNPJ válido, inclusive alfanumérico.");
  if (!^["1","2","9"].includes(String(draft?.recipientIeIndicator || ""))) blockers.push("Destinatário: informe o indicador de Inscrição Estadual (1, 2 ou 9).");
  if (String(draft?.recipientIeIndicator) === "1" && !clean(draft?.recipientStateRegistration)) blockers.push("Destinatário contribuinte: Inscrição Estadual é obrigatória.");
  if (!/^\d{7}$/.test(digits(draft?.recipientCityCode))) blockers.push("Destinatário: código IBGE do município deve ter 7 dígitos.");
  if (!/^\d{8}$/.test(digits(draft?.recipientPostalCode))) blockers.push("Destinatário: CEP deve ter 8 dígitos.");
  if (!UF_CODES[clean(draft?.recipientState).toUpperCase()]) blockers.push("Destinatário: UF inválida.");
  for (const [field, label] of [["recipientStreet","logradouro"],["recipientNumber","número"],["recipientDistrict","bairro"],["recipientCity","município"]]) if (!clean(draft?.[field])) blockers.push(`Destinatário: ${label} é obrigatório.`);
  if (!clean(draft?.paymentMethod)) blockers.push("Pagamento: selecione o meio de pagamento para o grupo pag/detPag.");
  return blockers;
}

function itemBlockers(item, index, crt) {
  const label = `Item ${index + 1}`;
  const blockers = [];
  if (!clean(item?.code)) blockers.push(`${label}: código do produto é obrigatório.`);
  if (!clean(item?.description)) blockers.push(`${label}: descrição é obrigatória.`);
  if (!/^\d{8}$/.test(digits(item?.ncm))) blockers.push(`${label}: NCM deve ter 8 dígitos.`);
  if (!/^\d{4}$/.test(digits(item?.cfop))) blockers.push(`${label}: CFOP deve ter 4 dígitos.`);
  const gtin = clean(item?.gtin).toUpperCase();
  if (!gtin) blockers.push(`${label}: informe GTIN ou explicitamente “SEM GTIN”.`);
  if (gtin && gtin !== "SEM GTIN" && !/^\d{8,14}$/.test(gtin)) blockers.push(`${label}: GTIN deve conter 8 a 14 dígitos ou “SEM GTIN”.`);
  if (!(Number(item?.quantity) > 0)) blockers.push(`${label}: quantidade deve ser maior que zero.`);
  if (!(Number(item?.unitPrice) > 0)) blockers.push(`${label}: valor unitário deve ser maior que zero.`);
  if (!/^[0-8]$/.test(clean(item?.origin))) blockers.push(`${label}: origem da mercadoria é obrigatória.`);

  if (["1", "2"].includes(crt)) {
    const csosn = clean(item?.csosn);
    if (!SIMPLE_NO_CREDIT.has(csosn) && csosn !== "101") blockers.push(`${label}: CSOSN ${csosn || "não informado"} ainda não está habilitado no emissor real. Use perfil fiscal suportado ou amplie a regra antes de transmitir.`);
    if (csosn === "101" && !(Number(item?.simpleCreditRate) >= 0)) blockers.push(`${label}: CSOSN 101 exige percentual de crédito do Simples.`);
  } else if (crt === "3") {
    const cst = clean(item?.cst).padStart(2, "0");
    if (!(cst === "00" || NORMAL_UNTAXED.has(cst))) blockers.push(`${label}: CST ICMS ${cst || "não informado"} ainda não está habilitado no emissor real.`);
    if (cst === "00" && (!(Number(item?.icmsBase) >= 0) || !(Number(item?.icmsRate) >= 0))) blockers.push(`${label}: CST 00 exige base e alíquota de ICMS explícitas.`);
  } else {
    blockers.push(`${label}: emissão NF-e com CRT ${crt || "não identificado"} ainda exige perfil fiscal específico antes de transmitir.`);
  }

  const pisCst = clean(item?.pisCst).padStart(2, "0");
  if (!["01", "02", "49", "99"].includes(pisCst) && !PIS_COFINS_NT.has(pisCst)) blockers.push(`${label}: CST PIS ${pisCst || "não informado"} não suportado pelo perfil atual.`);
  if (["01", "02", "49", "99"].includes(pisCst) && (!(Number(item?.pisBase) >= 0) || !(Number(item?.pisRate) >= 0))) blockers.push(`${label}: CST PIS ${pisCst} exige base e alíquota explícitas.`);
  const cofinsCst = clean(item?.cofinsCst).padStart(2, "0");
  if (!["01", "02", "49", "99"].includes(cofinsCst) && !PIS_COFINS_NT.has(cofinsCst)) blockers.push(`${label}: CST COFINS ${cofinsCst || "não informado"} não suportado pelo perfil atual.`);
  if (["01", "02", "49", "99"].includes(cofinsCst) && (!(Number(item?.cofinsBase) >= 0) || !(Number(item?.cofinsRate) >= 0))) blockers.push(`${label}: CST COFINS ${cofinsCst} exige base e alíquota explícitas.`);

  if (crt === "3") {
    if (!/^\d{3}$/.test(digits(item?.ibsCbsCst))) blockers.push(`${label}: CST IBS/CBS deve ter 3 dígitos.`);
    if (!/^\d{6}$/.test(digits(item?.cClassTrib))) blockers.push(`${label}: cClassTrib deve ter 6 dígitos e ser escolhido na tabela oficial vigente.`);
    if (!(Number(item?.ibsCbsBase) >= 0)) blockers.push(`${label}: base IBS/CBS é obrigatória.`);
    const year = new Date().getFullYear();
    if (year === 2026) {
      if (Number(item?.ibsUfRate) !== 0.1) blockers.push(`${label}: em 2026 a alíquota padrão pIBSUF deve ser 0,1%, salvo tratamento de cClassTrib que determine tributação regular específica.`);
      if (Number(item?.ibsMunRate) !== 0) blockers.push(`${label}: em 2026 a alíquota padrão pIBSMun deve ser 0%, salvo tratamento específico permitido pela legislação/tabela.`);
      if (Number(item?.cbsRate) !== 0.9) blockers.push(`${label}: em 2026 a alíquota padrão pCBS deve ser 0,9%, salvo tratamento específico permitido pela legislação/tabela.`);
    }
  }
  return blockers;
}

export function validateNfeDraft({ draft, company }) {
  const blockers = [...companyBlockers(company), ...recipientBlockers(draft)];
  const crt = TAX_REGIME_CRT[company?.taxRegime] || "";
  const items = Array.isArray(draft?.items) ? draft.items : [];
  if (!items.length) blockers.push("NF-e deve possuir ao menos um item.");
  items.forEach((item, index) => blockers.push(...itemBlockers(item, index, crt)));
  return blockers;
}

function buildIcms(item, crt) {
  const orig = xml(item.origin);
  if (["1", "2"].includes(crt)) {
    const csosn = clean(item.csosn);
    if (SIMPLE_NO_CREDIT.has(csosn)) return `<ICMS><ICMSSN102><orig>${orig}</orig><CSOSN>${csosn}</CSOSN></ICMSSN102></ICMS>`;
    if (csosn === "101") {
      const base = cents(item.icmsBase || (Number(item.quantity) * Number(item.unitPrice)));
      const credit = Math.round(base * Number(item.simpleCreditRate || 0) / 100);
      return `<ICMS><ICMSSN101><orig>${orig}</orig><CSOSN>101</CSOSN><pCredSN>${rate(item.simpleCreditRate)}</pCredSN><vCredICMSSN>${money(credit)}</vCredICMSSN></ICMSSN101></ICMS>`;
    }
  }
  const cst = clean(item.cst).padStart(2, "0");
  if (cst === "00") {
    const base = cents(item.icmsBase);
    const value = Math.round(base * Number(item.icmsRate || 0) / 100);
    return `<ICMS><ICMS00><orig>${orig}</orig><CST>00</CST><modBC>3</modBC><vBC>${money(base)}</vBC><pICMS>${rate(item.icmsRate)}</pICMS><vICMS>${money(value)}</vICMS></ICMS00></ICMS>`;
  }
  if (NORMAL_UNTAXED.has(cst)) return `<ICMS><ICMS40><orig>${orig}</orig><CST>${cst}</CST></ICMS40></ICMS>`;
  throw new Error(`Grupo ICMS não suportado: CRT ${crt}, CST/CSOSN ${cst || item.csosn}.`);
}

function buildPis(item) {
  const cst = clean(item.pisCst).padStart(2, "0");
  if (PIS_COFINS_NT.has(cst)) return { xml: `<PIS><PISNT><CST>${cst}</CST></PISNT></PIS>`, valueCents: 0 };
  const base = cents(item.pisBase);
  const value = Math.round(base * Number(item.pisRate || 0) / 100);
  const tag = ["01", "02"].includes(cst) ? "PISAliq" : "PISOutr";
  return { xml: `<PIS><${tag}><CST>${cst}</CST><vBC>${money(base)}</vBC><pPIS>${rate(item.pisRate)}</pPIS><vPIS>${money(value)}</vPIS></${tag}></PIS>`, valueCents: value };
}

function buildCofins(item) {
  const cst = clean(item.cofinsCst).padStart(2, "0");
  if (PIS_COFINS_NT.has(cst)) return { xml: `<COFINS><COFINSNT><CST>${cst}</CST></COFINSNT></COFINS>`, valueCents: 0 };
  const base = cents(item.cofinsBase);
  const value = Math.round(base * Number(item.cofinsRate || 0) / 100);
  const tag = ["01", "02"].includes(cst) ? "COFINSAliq" : "COFINSOutr";
  return { xml: `<COFINS><${tag}><CST>${cst}</CST><vBC>${money(base)}</vBC><pCOFINS>${rate(item.cofinsRate)}</pCOFINS><vCOFINS>${money(value)}</vCOFINS></${tag}></COFINS>`, valueCents: value };
}

function buildIbsCbs(item, crt) {
  if (crt !== "3") return { xml: "", baseCents: 0, ibsUfCents: 0, ibsMunCents: 0, ibsCents: 0, cbsCents: 0 };
  const base = cents(item.ibsCbsBase);
  const ibsUf = Math.round(base * Number(item.ibsUfRate || 0) / 100);
  const ibsMun = Math.round(base * Number(item.ibsMunRate || 0) / 100);
  const cbs = Math.round(base * Number(item.cbsRate || 0) / 100);
  const ibs = ibsUf + ibsMun;
  return {
    xml: `<IBSCBS><CST>${digits(item.ibsCbsCst).padStart(3, "0")}</CST><cClassTrib>${digits(item.cClassTrib)}</cClassTrib><gIBSCBS><vBC>${money(base)}</vBC><gIBSUF><pIBSUF>${rate(item.ibsUfRate)}</pIBSUF><vIBSUF>${money(ibsUf)}</vIBSUF></gIBSUF><gIBSMun><pIBSMun>${rate(item.ibsMunRate)}</pIBSMun><vIBSMun>${money(ibsMun)}</vIBSMun></gIBSMun><vIBS>${money(ibs)}</vIBS><gCBS><pCBS>${rate(item.cbsRate)}</pCBS><vCBS>${money(cbs)}</vCBS></gCBS></gIBSCBS></IBSCBS>`,
    baseCents: base, ibsUfCents: ibsUf, ibsMunCents: ibsMun, ibsCents: ibs, cbsCents: cbs,
  };
}

function buildAddress({ street, number, complement, district, cityCode, city, state, postalCode, countryCode = "1058", country = "BRASIL", phone = "" }) {
  return `<xLgr>${xml(street)}</xLgr><nro>${xml(number)}</nro>${clean(complement) ? `<xCpl>${xml(complement)}</xCpl>` : ""}<xBairro>${xml(district)}</xBairro><cMun>${digits(cityCode)}</cMun><xMun>${xml(city)}</xMun><UF>${xml(clean(state).toUpperCase())}</UF><CEP>${digits(postalCode)}</CEP><cPais>${countryCode}</cPais><xPais>${country}</xPais>${digits(phone) ? `<fone>${digits(phone)}</fone>` : ""}`;
}

export function buildNfeXml({ draft, company, number, series, numericCode, issuedAt = new Date(), appVersion = "1.0.0" }) {
  const blockers = validateNfeDraft({ draft, company });
  if (blockers.length) {
    const error = new Error("NF-e possui pendências fiscais e não pode ser preparada para assinatura.");
    error.blockers = blockers;
    throw error;
  }
  const crt = TAX_REGIME_CRT[company.taxRegime];
  const key = buildAccessKey({ uf: company.state, issuedAt, cnpj: company.taxId, series, number, numericCode });
  const tpAmb = draft.environment === "production" ? "1" : "2";
  const issueDate = issuedAt instanceof Date ? issuedAt : new Date(issuedAt);
  const dhEmi = issueDate.toISOString().replace("Z", "-03:00");
  const issuerCnpj = normalizeCnpj(company.taxId);
  const recipientTaxId = alphaNum(draft.recipientTaxId);
  const recipientIdTag = /^\d{11}$/.test(recipientTaxId) ? `<CPF>${recipientTaxId}</CPF>` : `<CNPJ>${recipientTaxId}</CNPJ>`;

  let productTotal = 0, icmsBaseTotal = 0, icmsTotal = 0, pisTotal = 0, cofinsTotal = 0;
  let ibsBaseTotal = 0, ibsUfTotal = 0, ibsMunTotal = 0, ibsTotal = 0, cbsTotal = 0;
  const itemXml = draft.items.map((item, index) => {
    const value = cents(Number(item.quantity) * Number(item.unitPrice));
    productTotal += value;
    const pis = buildPis(item); const cofins = buildCofins(item); const ibsCbs = buildIbsCbs(item, crt);
    pisTotal += pis.valueCents; cofinsTotal += cofins.valueCents;
    ibsBaseTotal += ibsCbs.baseCents; ibsUfTotal += ibsCbs.ibsUfCents; ibsMunTotal += ibsCbs.ibsMunCents; ibsTotal += ibsCbs.ibsCents; cbsTotal += ibsCbs.cbsCents;
    if (crt === "3" && clean(item.cst).padStart(2, "0") === "00") {
      const base = cents(item.icmsBase); icmsBaseTotal += base; icmsTotal += Math.round(base * Number(item.icmsRate || 0) / 100);
    }
    const gtin = clean(item.gtin).toUpperCase();
    return `<det nItem="${index + 1}"><prod><cProd>${xml(item.code)}</cProd><cEAN>${xml(gtin)}</cEAN><xProd>${xml(item.description)}</xProd><NCM>${digits(item.ncm)}</NCM>${digits(item.cest) ? `<CEST>${digits(item.cest)}</CEST>` : ""}<CFOP>${digits(item.cfop)}</CFOP><uCom>${xml(clean(item.unit).toUpperCase() || "UN")}</uCom><qCom>${qty(item.quantity)}</qCom><vUnCom>${unitValue(item.unitPrice)}</vUnCom><vProd>${money(value)}</vProd><cEANTrib>${xml(gtin)}</cEANTrib><uTrib>${xml(clean(item.unit).toUpperCase() || "UN")}</uTrib><qTrib>${qty(item.quantity)}</qTrib><vUnTrib>${unitValue(item.unitPrice)}</vUnTrib><indTot>1</indTot></prod><imposto>${buildIcms(item, crt)}${pis.xml}${cofins.xml}${ibsCbs.xml}</imposto></det>`;
  }).join("");

  const freightCents = Math.max(0, Number(draft.freightCents ?? cents(draft.freight)) || 0);
  const discountCents = Math.max(0, Number(draft.discountCents ?? cents(draft.discount)) || 0);
  const otherCents = Math.max(0, Number(draft.otherCents ?? cents(draft.other)) || 0);
  const total = Math.max(0, productTotal + freightCents + otherCents - discountCents + ibsTotal + cbsTotal);
  const ibsTotalsXml = crt === "3" ? `<IBSCBSTot><vBCIBSCBS>${money(ibsBaseTotal)}</vBCIBSCBS><gIBS><gIBSUF><vDif>0.00</vDif><vDevTrib>0.00</vDevTrib><vIBSUF>${money(ibsUfTotal)}</vIBSUF></gIBSUF><gIBSMun><vDif>0.00</vDif><vDevTrib>0.00</vDevTrib><vIBSMun>${money(ibsMunTotal)}</vIBSMun></gIBSMun><vIBS>${money(ibsTotal)}</vIBS><vCredPres>0.00</vCredPres><vCredPresCondSus>0.00</vCredPresCondSus></gIBS><gCBS><vCredPres>0.00</vCredPres><vCredPresCondSus>0.00</vCredPresCondSus><vDif>0.00</vDif><vDevTrib>0.00</vDevTrib><vCBS>${money(cbsTotal)}</vCBS></gCBS></IBSCBSTot>` : "";

  const body = `<NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe Id="NFe${key.accessKey}" versao="4.00"><ide><cUF>${key.cUF}</cUF><cNF>${key.cNF}</cNF><natOp>${xml(draft.natureOperation)}</natOp><mod>55</mod><serie>${Number(key.series)}</serie><nNF>${Number(key.number)}</nNF><dhEmi>${dhEmi}</dhEmi><tpNF>1</tpNF><idDest>${clean(draft.recipientState).toUpperCase() === clean(company.state).toUpperCase() ? "1" : "2"}</idDest><cMunFG>${digits(company.cityCode)}</cMunFG><tpImp>1</tpImp><tpEmis>1</tpEmis><cDV>${key.cDV}</cDV><tpAmb>${tpAmb}</tpAmb><finNFe>${PURPOSE[draft.purpose] || "1"}</finNFe><indFinal>${draft.finalConsumer ? "1" : "0"}</indFinal><indPres>${PRESENCE[draft.presenceIndicator] || "0"}</indPres><procEmi>0</procEmi><verProc>Seven ERP ${xml(appVersion)}</verProc></ide>` +
    `<emit><CNPJ>${issuerCnpj}</CNPJ><xNome>${xml(company.legalName)}</xNome>${clean(company.tradeName) ? `<xFant>${xml(company.tradeName)}</xFant>` : ""}<enderEmit>${buildAddress({ street: company.street, number: company.number, complement: company.complement, district: company.district, cityCode: company.cityCode, city: company.city, state: company.state, postalCode: company.postalCode, phone: company.phone })}</enderEmit><IE>${xml(company.stateRegistration)}</IE><CRT>${crt}</CRT></emit>` +
    `<dest>${recipientIdTag}<xNome>${xml(draft.recipientName)}</xNome><enderDest>${buildAddress({ street: draft.recipientStreet, number: draft.recipientNumber, complement: draft.recipientComplement, district: draft.recipientDistrict, cityCode: draft.recipientCityCode, city: draft.recipientCity, state: draft.recipientState, postalCode: draft.recipientPostalCode, phone: draft.recipientPhone })}</enderDest><indIEDest>${draft.recipientIeIndicator}</indIEDest>${clean(draft.recipientStateRegistration) && draft.recipientIeIndicator === "1" ? `<IE>${xml(draft.recipientStateRegistration)}</IE>` : ""}${clean(draft.recipientEmail) ? `<email>${xml(draft.recipientEmail)}</email>` : ""}</dest>` +
    itemXml +
    `<total><ICMSTot><vBC>${money(icmsBaseTotal)}</vBC><vICMS>${money(icmsTotal)}</vICMS><vICMSDeson>0.00</vICMSDeson><vFCPUFDest>0.00</vFCPUFDest><vICMSUFDest>0.00</vICMSUFDest><vICMSUFRemet>0.00</vICMSUFRemet><vFCP>0.00</vFCP><vBCST>0.00</vBCST><vST>0.00</vST><vFCPST>0.00</vFCPST><vFCPSTRet>0.00</vFCPSTRet><vProd>${money(productTotal)}</vProd><vFrete>${money(freightCents)}</vFrete><vSeg>0.00</vSeg><vDesc>${money(discountCents)}</vDesc><vII>0.00</vII><vIPI>0.00</vIPI><vIPIDevol>0.00</vIPIDevol><vPIS>${money(pisTotal)}</vPIS><vCOFINS>${money(cofinsTotal)}</vCOFINS><vOutro>${money(otherCents)}</vOutro><vNF>${money(total)}</vNF></ICMSTot>${ibsTotalsXml}</total>` +
    `<transp><modFrete>${FREIGHT[draft.freightMode] || "9"}</modFrete></transp><pag><detPag><tPag>${digits(draft.paymentMethod).padStart(2, "0")}</tPag><vPag>${money(total)}</vPag></detPag></pag>${clean(draft.notes) ? `<infAdic><infCpl>${xml(draft.notes)}</infCpl></infAdic>` : ""}</infNFe></NFe>`;

  return {
    xml: `<?xml version="1.0" encoding="UTF-8"?>${body}`,
    accessKey: key.accessKey,
    number: Number(key.number),
    series: Number(key.series),
    numericCode: key.cNF,
    totals: { productCents: productTotal, icmsCents: icmsTotal, pisCents: pisTotal, cofinsCents: cofinsTotal, ibsCents: ibsTotal, cbsCents: cbsTotal, totalCents: total },
    crt,
  };
}

export { TAX_REGIME_CRT };
