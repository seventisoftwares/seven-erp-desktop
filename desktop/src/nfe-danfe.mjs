import { buildReferenceDanfeFitHtml, extractReferenceDanfeData } from "./nfe-danfe-reference-fit.mjs";
export { encodeCode128, code128Svg, parseNfeProc } from "./nfe-danfe-core.mjs";
export { extractReferenceDanfeData };
export const buildDanfeHtml = buildReferenceDanfeFitHtml;
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
