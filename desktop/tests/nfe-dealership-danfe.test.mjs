import test from "node:test";
import assert from "node:assert/strict";
import { buildDanfeHtml } from "../src/nfe-danfe.mjs";
import { replaceCompanyLogoCache } from "../src/company-logo-store.mjs";

const key = "43260912345678000190550010000001231234567890";
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe><infNFe Id="NFe${key}" versao="4.00">
    <ide><cUF>43</cUF><natOp>VENDA DE VEICULO</natOp><mod>55</mod><serie>1</serie><nNF>123</nNF><dhEmi>2026-09-03T14:00:00-03:00</dhEmi><tpNF>1</tpNF><tpAmb>1</tpAmb></ide>
    <emit><CNPJ>12345678000190</CNPJ><xNome>LOJA TESTE LTDA</xNome><xFant>LOJA TESTE</xFant><enderEmit><xLgr>Rua Teste</xLgr><nro>100</nro><xBairro>Centro</xBairro><xMun>Bento Goncalves</xMun><UF>RS</UF><CEP>95700000</CEP></enderEmit><IE>1234567890</IE></emit>
    <dest><CPF>12345678909</CPF><xNome>CLIENTE TESTE</xNome><enderDest><xLgr>Rua Cliente</xLgr><nro>10</nro><xBairro>Centro</xBairro><xMun>Bento Goncalves</xMun><UF>RS</UF><CEP>95700000</CEP></enderDest></dest>
    <det nItem="1"><prod><cProd>CAR001</cProd><xProd>VOLKSWAGEN NIVUS HIGHLINE 200 TSI</xProd><NCM>87032310</NCM><CFOP>5102</CFOP><uCom>UN</uCom><qCom>1.0000</qCom><vUnCom>145000.0000</vUnCom><vProd>145000.00</vProd></prod><imposto><ICMS><ICMS40><orig>0</orig><CST>40</CST></ICMS40></ICMS></imposto><infAdProd>CHASSI/VIN: 9BWZZZ377VT004251\nRENAVAM: 12345678901\nPLACA: ABC1D23/RS\nVERSÃO: HIGHLINE 200 TSI\nANO FAB/MOD: 2025/2026\nCOR: PRETO\nCÂMBIO: AUTOMATICO\nCOMBUSTÍVEL: FLEX\nOPCIONAIS: TETO SOLAR, BANCOS EM COURO</infAdProd></det>
    <total><ICMSTot><vBC>0.00</vBC><vICMS>0.00</vICMS><vBCST>0.00</vBCST><vST>0.00</vST><vProd>145000.00</vProd><vFrete>0.00</vFrete><vSeg>0.00</vSeg><vDesc>0.00</vDesc><vIPI>0.00</vIPI><vOutro>0.00</vOutro><vNF>145000.00</vNF></ICMSTot></total>
    <transp><modFrete>9</modFrete></transp>
    <infAdic><infCpl>OBSERVACAO COMERCIAL</infCpl></infAdic>
  </infNFe></NFe>
  <protNFe><infProt><tpAmb>1</tpAmb><chNFe>${key}</chNFe><dhRecbto>2026-09-03T14:01:00-03:00</dhRecbto><nProt>143260000000001</nProt><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe>
</nfeProc>`;

test("DANFE automotivo coloca dados do veiculo abaixo do item e usa logo do CNPJ", () => {
  const logo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2xGQAAAAASUVORK5CYII=";
  replaceCompanyLogoCache({ "12345678000190": { logoDataUrl: logo } });
  const html = buildDanfeHtml({ nfeProcXml: xml });
  assert.match(html, /<td class="desc"><b>VOLKSWAGEN NIVUS HIGHLINE 200 TSI<\/b><small>CHASSI\/VIN:/);
  assert.match(html, /CHASSI\/VIN: 9BWZZZ377VT004251/);
  assert.match(html, /RENAVAM: 12345678901/);
  assert.match(html, /OPCIONAIS: TETO SOLAR, BANCOS EM COURO/);
  assert.match(html, /class="issuer-logo"/);
  assert.match(html, /data:image\/png;base64/);
  assert.doesNotMatch(html, /__sevenCompanyLogoResolver/);
  assert.doesNotMatch(html, /=== DADOS DOS VEÍCULOS ===/);
  assert.match(html, /OBSERVACAO COMERCIAL/);
});
