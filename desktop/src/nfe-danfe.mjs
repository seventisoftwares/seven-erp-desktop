import { buildReferenceDanfeHtml, extractReferenceDanfeData } from "./nfe-danfe-reference.mjs";
export { encodeCode128, code128Svg, parseNfeProc } from "./nfe-danfe-core.mjs";
export { extractReferenceDanfeData };
export const buildDanfeHtml = buildReferenceDanfeHtml;
export function extractClassicData(xml) {
  const data = extractReferenceDanfeData(xml);
  return { ...data, operationType: data.tpNF === "0" ? "0 - ENTRADA" : "1 - SAÍDA" };
}
