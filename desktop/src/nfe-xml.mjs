import { buildNfeXml as buildCoreNfeXml } from "./nfe-xml-core.mjs";
export * from "./nfe-xml-core.mjs";

const clean = (value) => String(value ?? "").trim();
const escapeXml = (value) => clean(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/\"/g, "&quot;")
  .replace(/'/g, "&#39;");

function addItemAdditionalInfo(xml, items = []) {
  if (!Array.isArray(items) || !items.some((item) => clean(item?.infAdProd))) return xml;
  return String(xml || "").replace(/<det\s+nItem="(\d+)"([\s\S]*?)<\/det>/g, (det, rawIndex) => {
    const item = items[Number(rawIndex) - 1];
    const additional = clean(item?.infAdProd).slice(0, 500);
    if (!additional || /<infAdProd>[\s\S]*?<\/infAdProd>/.test(det)) return det;
    const node = `<infAdProd>${escapeXml(additional)}</infAdProd>`;
    if (det.includes("<vItem>")) return det.replace("<vItem>", `${node}<vItem>`);
    if (det.includes("</imposto>")) return det.replace("</imposto>", `</imposto>${node}`);
    return det.replace("</det>", `${node}</det>`);
  });
}

export function buildNfeXml(options) {
  const result = buildCoreNfeXml(options);
  return { ...result, xml: addItemAdditionalInfo(result.xml, options?.draft?.items || []) };
}

export { addItemAdditionalInfo };
