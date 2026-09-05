import { buildReferenceDanfeFitHtml, extractReferenceDanfeData } from "./nfe-danfe-reference-fit.mjs";
import { resolveCompanyLogo } from "./company-logo-bootstrap.mjs";

export { encodeCode128, code128Svg, parseNfeProc } from "./nfe-danfe-core.mjs";
export { extractReferenceDanfeData };

const validLogo = (value) => {
  const raw = String(value || "").trim();
  return raw.length <= 900_000 && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(raw) ? raw : "";
};

function applyIssuerLogo(html, logoDataUrl) {
  const logo = validLogo(logoDataUrl);
  if (!logo) return html;
  let output = html.replace(
    '<div class="issuer">',
    `<div class="issuer issuer-with-logo"><img class="issuer-logo" src="${logo}" alt="Logotipo do emitente"><div class="issuer-copy">`,
  );
  output = output.replace('</div><div class="danfe">', '</div></div><div class="danfe">');
  const css = `<style>
.issuer.issuer-with-logo{display:grid!important;grid-template-columns:24mm minmax(0,1fr)!important;align-items:center!important;column-gap:2mm!important;padding:1mm 1.4mm!important;text-align:left!important;background:none!important}
.issuer-logo{display:block;max-width:24mm;max-height:10mm;width:100%;height:auto;object-fit:contain;margin:0}
.issuer-copy{min-width:0;display:flex;flex-direction:column;justify-content:center}
.issuer-with-logo .issuer-copy>span{font-size:5pt!important;margin:0 0 .15mm!important}.issuer-with-logo .issuer-copy h1{font-size:8.1pt!important;line-height:1.05!important;margin:.08mm 0!important;text-align:left!important}.issuer-with-logo .issuer-copy h2{font-size:5.55pt!important;line-height:1.05!important;margin:.08mm 0 .2mm!important;text-align:left!important}.issuer-with-logo .issuer-copy p{font-size:4.45pt!important;line-height:1.08!important;margin:.05mm 0!important;text-align:left!important}
</style>`;
  return output.replace("</head>", `${css}</head>`);
}

export function buildDanfeHtml(options) {
  const data = extractReferenceDanfeData(options.nfeProcXml);
  const logo = validLogo(options.logoDataUrl) || resolveCompanyLogo(data?.issuer?.taxId);
  return applyIssuerLogo(buildReferenceDanfeFitHtml(options), logo);
}

export function extractClassicData(xml) {
  const data = extractReferenceDanfeData(xml);
  return {
    ...data,
    operationType: data.tpNF === "0" ? "0 - ENTRADA" : "1 - SAÍDA",
    exit: { ...data.exit, d: data.exit.date, t: data.exit.time },
    issue: { ...data.issue, d: data.issue.date, t: data.issue.time },
    received: { ...data.received, d: data.received.date, t: data.received.time },
  };
}
