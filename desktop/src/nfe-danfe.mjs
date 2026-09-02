import { buildStableDanfeHtml, extractStableDanfeData } from "./nfe-danfe-stable.mjs";
export { encodeCode128, code128Svg, parseNfeProc } from "./nfe-danfe-core.mjs";
export { extractStableDanfeData };
export const buildDanfeHtml = buildStableDanfeHtml;
export function extractClassicData(xml) {
  const data = extractStableDanfeData(xml);
  return { ...data, operationType: data.tpNF === "0" ? "0 - ENTRADA" : "1 - SAÍDA" };
}
