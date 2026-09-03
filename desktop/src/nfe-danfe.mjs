import { buildReferenceDanfeFitHtml, extractReferenceDanfeData } from "./nfe-danfe-reference-fit.mjs";
export { encodeCode128, code128Svg, parseNfeProc } from "./nfe-danfe-core.mjs";
export { extractReferenceDanfeData };

const VEHICLE_MARK = "=== DADOS DOS VEÍCULOS ===";
const esc = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");

function vehicleBlocks(additional) {
  const raw = String(additional || "");
  if (!raw.includes(VEHICLE_MARK)) return { base: raw, details: new Map() };
  const [base, marked = ""] = raw.split(VEHICLE_MARK, 2);
  const details = new Map();
  const rx = /VEÍCULO\s+(\d+)\s+—[^\n]*\n([\s\S]*?)(?=\n\nVEÍCULO\s+\d+\s+—|$)/gi;
  for (const match of marked.matchAll(rx)) {
    const index = Number(match[1]);
    const text = String(match[2] || "").trim().replace(/\s*\|\s*/g, "  •  ");
    if (index > 0 && text) details.set(index, text);
  }
  return { base: base.trim(), details };
}

function applyVehicleItemDetails(html, data) {
  const parsed = vehicleBlocks(data.additional);
  let output = html;
  if (data.additional && parsed.base !== data.additional) output = output.replace(esc(data.additional), esc(parsed.base));
  if (!parsed.details.size) return output;
  let row = 0;
  output = output.replace(/<td class="desc">[\s\S]*?<\/td>/g, (cell) => {
    row += 1;
    const detail = parsed.details.get(row);
    if (!detail) return cell;
    return cell.replace("</td>", `<small class="vehicle-item-details">${esc(detail)}</small></td>`);
  });
  return output.replace("</head>", `<style>.products td.desc .vehicle-item-details{display:block;white-space:pre-line;margin-top:.55mm;padding-top:.55mm;border-top:.16mm solid #8b949e;font-size:4.25pt;line-height:1.25;font-weight:600}.products td.desc{white-space:normal!important}</style></head>`);
}

function applyIssuerLogo(html, data) {
  const resolver = globalThis.__sevenCompanyLogoResolver;
  const logo = typeof resolver === "function" ? String(resolver(data?.issuer?.taxId) || "") : "";
  if (!/^data:image\/(?:png|jpeg|webp);base64,/i.test(logo)) return html;
  const css = `<style>.issuer{background-image:url('${logo}');background-repeat:no-repeat;background-position:2mm center;background-size:12mm auto;padding:1.2mm 1.6mm 1.2mm 16.5mm!important;text-align:left!important;display:flex!important;flex-direction:column!important;justify-content:center!important}.issuer>span{font-size:5pt!important;color:#444}.issuer h1{font-size:8.9pt!important;margin:.2mm 0 .1mm!important;text-align:left!important}.issuer h2{font-size:5.8pt!important;margin:0 0 .35mm!important;text-align:left!important}.issuer p{font-size:4.55pt!important;line-height:1.12!important;margin:.06mm 0!important;text-align:left!important}</style>`;
  return html.replace("</head>", `${css}</head>`);
}

export function buildDanfeHtml(options) {
  const data = extractReferenceDanfeData(options.nfeProcXml);
  let html = buildReferenceDanfeFitHtml(options);
  html = applyVehicleItemDetails(html, data);
  html = applyIssuerLogo(html, data);
  return html;
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
