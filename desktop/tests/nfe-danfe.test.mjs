import test from "node:test";
import assert from "node:assert/strict";
import { buildDanfeHtml, code128Svg, encodeCode128, extractClassicData, parseNfeProc } from "../src/nfe-danfe.mjs";

const ACCESS_KEY = "43260912345678000195550010000001231000001234";
const NFE_PROC = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe><infNFe Id="NFe${ACCESS_KEY}" versao="4.00">
    <ide><cUF>43</cUF><natOp>VENDA DE MERCADORIA</natOp><mod>55</mod><serie>1</serie><nNF>123</nNF><dhEmi>2026-09-01T10:00:00-03:00</dhEmi><tpNF>1</tpNF><tpAmb>2</tpAmb></ide>
    <emit><CNPJ>12345678000195</CNPJ><xNome>SEVEN EMPRESA TESTE LTDA</xNome><xFant>SEVEN TESTE</xFant><enderEmit><xLgr>Rua Emitente</xLgr><nro>100</nro><xBairro>Centro</xBairro><xMun>Porto Alegre</xMun><UF>RS</UF><CEP>90000000</CEP><fone>51999999999</fone></enderEmit><IE>1234567890</IE></emit>
    <dest><CPF>52998224725</CPF><xNome>CLIENTE TESTE &amp; CIA</xNome><enderDest><xLgr>Rua Cliente</xLgr><nro>200</nro><xBairro>Centro</xBairro><xMun>Porto Alegre</xMun><UF>RS</UF><CEP>90000001</CEP></enderDest><indIEDest>9</indIEDest></dest>
    <det nItem="1"><prod><cProd>P001</cProd><xProd>Produto de Teste</xProd><NCM>84713012</NCM><CFOP>5102</CFOP><uCom>UN</uCom><qCom>2.0000</qCom><vUnCom>50.0000000000</vUnCom><vProd>100.00</vProd></prod><imposto><ICMS><ICMSSN102><orig>0</orig><CSOSN>102</CSOSN></ICMSSN102></ICMS></imposto></det>
    <total><ICMSTot><vBC>0.00</vBC><vICMS>0.00</vICMS><vProd>100.00</vProd><vFrete>0.00</vFrete><vSeg>0.00</vSeg><vDesc>0.00</vDesc><vIPI>0.00</vIPI><vPIS>0.00</vPIS><vCOFINS>0.00</vCOFINS><vOutro>0.00</vOutro><vNF>100.00</vNF></ICMSTot></total>
    <transp><modFrete>9</modFrete></transp>
    <infAdic><infCpl>Pedido interno 123</infCpl></infAdic>
  </infNFe></NFe>
  <protNFe versao="4.00"><infProt><tpAmb>2</tpAmb><chNFe>${ACCESS_KEY}</chNFe><dhRecbto>2026-09-01T10:00:05-03:00</dhRecbto><nProt>143260000000001</nProt><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe>
</nfeProc>`;

test("DANFE parser requires an authorized nfeProc and extracts fiscal data", () => {
  const parsed = parseNfeProc(NFE_PROC);
  assert.equal(parsed.accessKey, ACCESS_KEY);
  assert.equal(parsed.number, "123");
  assert.equal(parsed.series, "1");
  assert.equal(parsed.environment, "homologation");
  assert.equal(parsed.issuer.tradeName, "SEVEN TESTE");
  assert.equal(parsed.recipient.name, "CLIENTE TESTE & CIA");
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].productValue, "100.00");
  assert.equal(parsed.protocol, "143260000000001");
});

test("DANFE parser rejects XML without authorization cStat 100", () => {
  assert.throws(() => parseNfeProc(NFE_PROC.replace("<cStat>100</cStat>", "<cStat>110</cStat>")), /cStat 100/);
  assert.throws(() => parseNfeProc("<NFe></NFe>"), /nfeProc autorizado/);
});

test("Code 128 encoder supports numeric/alphanumeric NF-e keys and produces SVG bars", () => {
  const numericCodes = encodeCode128(ACCESS_KEY);
  assert.equal(numericCodes[0], 105);
  assert.equal(numericCodes.at(-1), 106);
  const alphaKey = "43260912ABC34500DE35550010000001231000001234";
  assert.equal(alphaKey.length, 44);
  const alphaCodes = encodeCode128(alphaKey);
  assert.ok(alphaCodes.includes(100), "must switch to Code Set B for letters");
  assert.ok(alphaCodes.includes(99), "must switch back to Code Set C for long numeric runs");
  const svg = code128Svg(alphaKey);
  assert.match(svg, /^<svg/);
  assert.match(svg, /<rect /);
});

test("DANFE Seven traz a estrutura fiscal convencional do modelo 55", () => {
  const data = extractClassicData(NFE_PROC);
  assert.equal(data.operationType, "1 - SAÍDA");
  assert.equal(data.transport.mode, "9");
  const html = buildDanfeHtml({ nfeProcXml: NFE_PROC });
  assert.match(html, /RECEBEMOS DE/i);
  assert.match(html, /DANFE/);
  assert.match(html, /chave de acesso/i);
  assert.match(html, /destinatário \/ remetente/i);
  assert.match(html, /cálculo do imposto/i);
  assert.match(html, /transportador \/ volumes transportados/i);
  assert.match(html, /dados dos produtos \/ serviços/i);
  assert.match(html, /SEM VALOR FISCAL/);
  assert.match(html, /AMBIENTE DE HOMOLOGAÇÃO/);
  assert.match(html, /143260000000001/);
  assert.match(html, /CLIENTE TESTE &amp; CIA/);
  assert.match(html, /danfe-page/);
});

test("DANFE Seven marca cancelamento e protocolo do evento", () => {
  const cancelled = buildDanfeHtml({ nfeProcXml: NFE_PROC, cancelled: true, cancellationProtocol: "143260000000099" });
  assert.match(cancelled, /CANCELADA/);
  assert.match(cancelled, /Protocolo do evento: 143260000000099/);
});

test("DANFE Seven pagina automaticamente notas com muitos itens", () => {
  const extraItems = Array.from({ length: 34 }, (_, index) => `<det nItem="${index + 2}"><prod><cProd>P${String(index + 2).padStart(3, "0")}</cProd><xProd>Produto adicional ${index + 2} com descrição suficiente para validar quebra de linha e paginação controlada</xProd><NCM>84713012</NCM><CFOP>5102</CFOP><uCom>UN</uCom><qCom>1.0000</qCom><vUnCom>10.0000000000</vUnCom><vProd>10.00</vProd></prod><imposto><ICMS><ICMSSN102><orig>0</orig><CSOSN>102</CSOSN></ICMSSN102></ICMS></imposto></det>`).join("");
  const manyItemsXml = NFE_PROC.replace("    <total><ICMSTot>", `${extraItems}\n    <total><ICMSTot>`);
  const html = buildDanfeHtml({ nfeProcXml: manyItemsXml });
  assert.match(html, /Folha 1\/\d+/);
  assert.match(html, /Folha 2\/\d+/);
  assert.match(html, /Continuação dos produtos \/ serviços/);
});
