const MAX_LOGO_LENGTH = 900_000;
const cleanTaxId = (value) => String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const validLogo = (value) => {
  const raw = String(value || "").trim();
  return raw.length <= MAX_LOGO_LENGTH && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(raw) ? raw : "";
};

let cache = {};

export function replaceCompanyLogoCache(logos = {}) {
  cache = logos && typeof logos === "object" ? { ...logos } : {};
}

export function resolveCompanyLogo(taxId) {
  return validLogo(cache[cleanTaxId(taxId)]?.logoDataUrl);
}

export function companyLogoEntry(taxId) {
  const key = cleanTaxId(taxId);
  return { taxId: key, logoDataUrl: resolveCompanyLogo(key), updatedAt: cache[key]?.updatedAt || null };
}

export { cleanTaxId, validLogo };
