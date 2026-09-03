"use client";

import { useEffect, useRef, useState } from "react";

type Company = Record<string, any>;
const bridge = () => (window as any).sevenDesktop;
const fmtCnpj = (value: unknown) => {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length === 14 ? digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : String(value || "—");
};

async function optimizeLogo(file: File) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Use uma imagem PNG, JPG/JPEG ou WebP.");
  if (file.size > 5 * 1024 * 1024) throw new Error("A imagem original deve ter no máximo 5 MB.");
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || "")); reader.onerror = () => reject(new Error("Não foi possível ler a imagem.")); reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error("Imagem inválida.")); img.src = source;
  });
  const maxW = 900, maxH = 320;
  const scale = Math.min(1, maxW / image.naturalWidth, maxH / image.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Não foi possível preparar o logotipo.");
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  let output = canvas.toDataURL("image/webp", .88);
  if (output.length > 880000) output = canvas.toDataURL("image/webp", .68);
  if (output.length > 900000) throw new Error("O logotipo ficou grande demais mesmo após otimização. Use uma imagem menor.");
  return output;
}

export default function CompanyLogoManager() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [company, setCompany] = useState<Company>({});
  const [logo, setLogo] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/company"); const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível carregar o estabelecimento ativo.");
      const current = data.company || {}; setCompany(current);
      const api = bridge();
      if (!api?.companyLogo) throw new Error("Atualize o Seven ERP para usar logotipo no DANFE.");
      const result = await api.companyLogo({ action: "get", taxId: current.taxId });
      if (!result?.ok) throw new Error(result?.error || "Não foi possível carregar o logotipo.");
      setLogo(String(result.logoDataUrl || ""));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Falha ao carregar logotipo."); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    void load(); const handler = () => void load(); window.addEventListener("seven:company-updated", handler);
    return () => window.removeEventListener("seven:company-updated", handler);
  }, []);

  const choose = async (file?: File) => {
    if (!file) return; setError(""); setNotice("");
    try {
      if (!company.taxId) throw new Error("Cadastre o CNPJ do estabelecimento antes de incluir o logotipo.");
      const logoDataUrl = await optimizeLogo(file);
      const result = await bridge().companyLogo({ action: "set", taxId: company.taxId, logoDataUrl });
      if (!result?.ok) throw new Error(result?.error || "Não foi possível salvar o logotipo.");
      setLogo(logoDataUrl); setNotice("Logotipo salvo para este CNPJ. Ele será usado no espelho, simulação e DANFE.");
      window.dispatchEvent(new CustomEvent("seven:company-logo-updated", { detail: { taxId: company.taxId } }));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Falha ao salvar logotipo."); }
    finally { if (inputRef.current) inputRef.current.value = ""; }
  };

  const remove = async () => {
    if (!company.taxId || !logo) return;
    const result = await bridge().companyLogo({ action: "remove", taxId: company.taxId });
    if (!result?.ok) return setError(result?.error || "Não foi possível remover o logotipo.");
    setLogo(""); setNotice("Logotipo removido deste estabelecimento.");
    window.dispatchEvent(new CustomEvent("seven:company-logo-updated", { detail: { taxId: company.taxId } }));
  };

  return <aside className="company-logo-manager no-print">
    <div className="clm-head"><div><span>IDENTIDADE NO DOCUMENTO</span><b>Logo na NF-e / DANFE</b></div><span className="clm-badge">CNPJ</span></div>
    <div className="clm-company"><strong>{company.tradeName || company.legalName || "Estabelecimento ativo"}</strong><small>{fmtCnpj(company.taxId)}</small></div>
    <div className={`clm-preview ${logo ? "has-logo" : ""}`}>{logo ? <img src={logo} alt="Logotipo do emitente" /> : <span>{loading ? "Carregando..." : "Nenhum logo cadastrado"}</span>}</div>
    <input ref={inputRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => void choose(e.target.files?.[0])} />
    <div className="clm-actions"><button type="button" onClick={() => inputRef.current?.click()}>{logo ? "Trocar logo" : "+ Adicionar logo"}</button>{logo && <button type="button" className="danger" onClick={() => void remove()}>Remover</button>}</div>
    <small className="clm-help">PNG, JPG ou WebP. O sistema otimiza a imagem automaticamente para impressão.</small>
    {notice && <div className="clm-notice">{notice}</div>}{error && <div className="clm-error">{error}</div>}
  </aside>;
}
