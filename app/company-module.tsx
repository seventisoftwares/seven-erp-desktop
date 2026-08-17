"use client";

import { useEffect, useState, type FormEvent } from "react";

type CompanyProfile = {
  legalName?: string; tradeName?: string; taxId?: string; stateRegistration?: string; municipalRegistration?: string;
  taxRegime?: string; cnae?: string; postalCode?: string; street?: string; number?: string; complement?: string;
  district?: string; city?: string; cityCode?: string; state?: string; email?: string; phone?: string; website?: string;
  nfeSeries?: string; nfceSeries?: string; invoiceEmail?: string; notes?: string; updatedAt?: string;
};

const empty: CompanyProfile = { state: "RS", taxRegime: "simples_nacional", nfeSeries: "1", nfceSeries: "1" };
const digits = (value: string) => value.replace(/\D/g, "");

export default function CompanyModule({ onClose }: { onClose: () => void }) {
  const [profile, setProfile] = useState<CompanyProfile>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/company");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível carregar o cadastro da empresa.");
      setProfile({ ...empty, ...(data.company || {}) });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Falha ao carregar empresa."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries()) as Record<string, string>;
    const cnpj = digits(payload.taxId || "");
    if (cnpj.length !== 14) { setSaving(false); setError("Informe um CNPJ válido com 14 dígitos."); return; }
    if (!payload.legalName?.trim()) { setSaving(false); setError("Razão social é obrigatória."); return; }
    if (!/^[A-Z]{2}$/.test((payload.state || "").toUpperCase())) { setSaving(false); setError("Informe a UF com 2 letras."); return; }
    if (payload.cityCode && digits(payload.cityCode).length !== 7) { setSaving(false); setError("Código IBGE do município deve ter 7 dígitos."); return; }
    try {
      const response = await fetch("/api/company", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar o cadastro da empresa.");
      setProfile(data.company || payload); setNotice("Cadastro da empresa salvo e disponível para OS, documentos fiscais e integrações.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Falha ao salvar empresa."); }
    finally { setSaving(false); }
  };

  return <div className="enhanced-module company-module">
    <header className="enhanced-header"><div><span className="enhanced-kicker">Administração · dados oficiais</span><h1>Cadastro da empresa</h1><p>Dados usados em ordens de serviço, documentos fiscais, cobranças e configurações das integrações.</p></div><div className="enhanced-actions"><button className="enhanced-secondary" onClick={onClose}>Voltar ao ERP</button></div></header>
    <div className="core-independence-banner"><strong>Cadastro central</strong><span>Preencha uma vez. Os módulos do Seven ERP passam a reutilizar estes dados automaticamente.</span></div>
    {error && <div className="enhanced-alert error">{error}</div>}{notice && <div className="enhanced-alert success">{notice}</div>}
    {loading ? <div className="enhanced-panel enhanced-empty">Carregando cadastro...</div> : <form className="enhanced-panel company-form" onSubmit={save}>
      <section className="company-section"><div className="company-section-title"><span>01</span><div><h2>Identificação</h2><p>Dados cadastrais e tributários da pessoa jurídica.</p></div></div><div className="form-grid two">
        <label className="full"><span>Razão social *</span><input name="legalName" required defaultValue={profile.legalName || ""} /></label>
        <label><span>Nome fantasia</span><input name="tradeName" defaultValue={profile.tradeName || ""} /></label>
        <label><span>CNPJ *</span><input name="taxId" required inputMode="numeric" defaultValue={profile.taxId || ""} placeholder="00.000.000/0000-00" /></label>
        <label><span>Inscrição Estadual</span><input name="stateRegistration" defaultValue={profile.stateRegistration || ""} /></label>
        <label><span>Inscrição Municipal</span><input name="municipalRegistration" defaultValue={profile.municipalRegistration || ""} /></label>
        <label><span>Regime tributário *</span><select name="taxRegime" defaultValue={profile.taxRegime || "simples_nacional"}><option value="mei">MEI</option><option value="simples_nacional">Simples Nacional</option><option value="simples_excesso">Simples Nacional - excesso sublimite</option><option value="lucro_presumido">Lucro Presumido</option><option value="lucro_real">Lucro Real</option></select></label>
        <label><span>CNAE principal</span><input name="cnae" defaultValue={profile.cnae || ""} placeholder="0000-0/00" /></label>
      </div></section>
      <section className="company-section"><div className="company-section-title"><span>02</span><div><h2>Endereço fiscal</h2><p>Endereço do estabelecimento emitente.</p></div></div><div className="form-grid two">
        <label><span>CEP</span><input name="postalCode" defaultValue={profile.postalCode || ""} /></label><label><span>Logradouro</span><input name="street" defaultValue={profile.street || ""} /></label>
        <label><span>Número</span><input name="number" defaultValue={profile.number || ""} /></label><label><span>Complemento</span><input name="complement" defaultValue={profile.complement || ""} /></label>
        <label><span>Bairro</span><input name="district" defaultValue={profile.district || ""} /></label><label><span>Cidade</span><input name="city" defaultValue={profile.city || ""} /></label>
        <label><span>Código IBGE do município</span><input name="cityCode" inputMode="numeric" defaultValue={profile.cityCode || ""} placeholder="7 dígitos" /></label><label><span>UF *</span><input name="state" required maxLength={2} defaultValue={profile.state || "RS"} /></label>
      </div></section>
      <section className="company-section"><div className="company-section-title"><span>03</span><div><h2>Contato e documentos</h2><p>Dados exibidos em impressões e comunicações.</p></div></div><div className="form-grid two">
        <label><span>E-mail</span><input name="email" type="email" defaultValue={profile.email || ""} /></label><label><span>Telefone</span><input name="phone" defaultValue={profile.phone || ""} /></label>
        <label><span>Site</span><input name="website" defaultValue={profile.website || ""} /></label><label><span>E-mail fiscal</span><input name="invoiceEmail" type="email" defaultValue={profile.invoiceEmail || ""} /></label>
        <label><span>Série padrão NF-e</span><input name="nfeSeries" inputMode="numeric" defaultValue={profile.nfeSeries || "1"} /></label><label><span>Série padrão NFC-e</span><input name="nfceSeries" inputMode="numeric" defaultValue={profile.nfceSeries || "1"} /></label>
        <label className="full"><span>Observações internas</span><textarea name="notes" rows={3} defaultValue={profile.notes || ""} /></label>
      </div></section>
      <footer className="company-save-bar"><div><strong>{profile.updatedAt ? "Cadastro existente" : "Cadastro inicial"}</strong><span>{profile.updatedAt ? `Última alteração: ${new Date(profile.updatedAt).toLocaleString("pt-BR")}` : "Preencha os dados oficiais da empresa."}</span></div><button className="enhanced-primary" disabled={saving}>{saving ? "Salvando..." : "Salvar cadastro da empresa"}</button></footer>
    </form>}
  </div>;
}
