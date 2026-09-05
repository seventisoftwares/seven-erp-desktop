import test from "node:test";
import assert from "node:assert/strict";
import { addItemAdditionalInfo } from "../src/nfe-xml.mjs";
import { buildDanfeHtml, extractClassicData } from "../src/nfe-danfe.mjs";
import { replaceCompanyLogoCache } from "../src/company-logo-store.mjs";

const ACCESS_KEY = "43260912345678000195550010000001231000001234";
const BASE_PROC = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
<NFe><infNFe Id="NFe${ACCESS_KEY}" versao="4.00">
<ide><cUF>43</cUF><natOp>VENDA DE VEÍCULO</natOp><mod>55</mod><serie>1</serie><nNF>123</nNF><dhEmi>2026-09-05T09:00:00-03:00</dhEmi><tpNF>1</tpNF><tpAmb>1</tpAmb></ide>
<emit><CNPJ>12345678000195</CNPJ><xNome>LOJA AUTOMOTIVA TESTE LTDA</xNome><xFant>LOJA TESTE</xFant><enderEmit><xLgr>Rua da Loja</xLgr><nro>100</nro><xBairro>Centro</xBairro><xMun>Bento Gonçalves</xMun><UF>RS</UF><CEP>95700000</CEP></enderEmit><IE>1234567890</IE></emit>
<dest><CPF>52998224725</CPF><xNome>COMPRADOR TESTE</xNome><enderDest><xLgr>Rua Cliente</xLgr><nro>200</nro><xBairro>Centro</xBairro><xMun>Bento Gonçalves</xMun><UF>RS</UF><CEP>95700001</CEP></enderDest><indIEDest>9</indIEDest></dest>
<det nItem="1"><prod><cProd>VEIC001</cProd><xProd>VOLKSWAGEN NIVUS HIGHLINE 2026</xProd><NCM>87032310</NCM><CFOP>5102</CFOP><uCom>UN</uCom><qCom>1.0000</qCom><vUnCom>150000.0000000000</vUnCom><vProd>150000.00</vProd></prod><imposto><ICMS><ICMSSN102><orig>0</orig><CSOSN>102</CSOSN></ICMSSN102></ICMS></imposto><infAdProd>CHASSI/VIN: 9BWZZZ377VT004251 | RENAVAM: 12345678901 | VERSÃO: HIGHLINE | OPCIONAIS: TETO SOLAR</infAdProd></det>
<total><ICMSTot><vBC>0.00</vBC><vICMS>0.00</vICMS><vProd>150000.00</vProd><vFrete>0.00</vFrete><vSeg>0.00</vSeg><vDesc>0.00</vDesc><vIPI>0.00</vIPI><vPIS>0.00</vPIS><vCOFINS>0.00</vCOFINS><vOutro>0.00</vOutro><vNF>150000.00</vNF></ICMSTot></total><transp><modFrete>9</modFrete></transp>
</infNFe></NFe><protNFe versao="4.00"><infProt><tpAmb>1</tpAmb><chNFe>${ACCESS_KEY}</chNFe><dhRecbto>2026-09-05T09:00:05-03:00</dhRecbto><nProt>143260000000001</nProt><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe>
</nfeProc>`;

test("adaptador automotivo grava infAdProd no item e escapa XML", () => {
  const source = `<NFe><infNFe><det nItem="1"><prod><cProd>V1</cProd></prod><imposto></imposto><vItem>1.00</vItem></det></infNFe></NFe>`;
  const output = addItemAdditionalInfo(source, [{ infAdProd: "CHASSI/VIN: ABC123 & OPCIONAIS: TETO <SOLAR>" }]);
  assert.match(output, /<infAdProd>CHASSI\/VIN: ABC123 &amp; OPCIONAIS: TETO &lt;SOLAR&gt;<\/infAdProd><vItem>1\.00<\/vItem>/);
  assert.equal((output.match(/<infAdProd>/g) || []).length, 1);
});

test("DANFE autorizado mostra dados técnicos imediatamente abaixo do veículo", () => {
  const data = extractClassicData(BASE_PROC);
  assert.equal(data.items[0].extra, "CHASSI/VIN: 9BWZZZ377VT004251 | RENAVAM: 12345678901 | VERSÃO: HIGHLINE | OPCIONAIS: TETO SOLAR");
  const html = buildDanfeHtml({ nfeProcXml: BASE_PROC });
  assert.match(html, /VOLKSWAGEN NIVUS HIGHLINE 2026/);
  assert.match(html, /CHASSI\/VIN: 9BWZZZ377VT004251 \| RENAVAM: 12345678901/);
  assert.match(html, /<small>CHASSI\/VIN:/);
});

test("DANFE resolve logo pelo CNPJ sem variável global ou busca em pastas", () => {
  replaceCompanyLogoCache({
    "12345678000195": { logoDataUrl: "data:image/png;base64,QUJDRA==", updatedAt: "2026-09-05T12:00:00Z" },
  });
  const html = buildDanfeHtml({ nfeProcXml: BASE_PROC });
  assert.match(html, /class="issuer-logo"/);
  assert.match(html, /data:image\/png;base64,QUJDRA==/);
  assert.match(html, /grid-template-columns:24mm/);
});
