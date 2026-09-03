"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

type Company = Record<string, any>;
type Branch = Company & { id: string; code?: string; status?: string; createdAt?: string; updatedAt?: string };
const emptyMatrix: Company = { state: "RS", taxRegime: "simples_nacional", nfeSeries: "1", nfceSeries: "1" };
const emptyBranch = (matrix: Company = {}): Branch => ({ id: "", code: "", legalName: "", tradeName: "", taxId: "", stateRegistration: "", municipalRegistration: "", taxRegime: matrix.taxRegime || "simples_nacional", cnae: "", postalCode: "", street: "", number: "", complement: "", district: "", city: "", cityCode: "", state: matrix.state || "RS", email: "", phone: "", invoiceEmail: "", nfeSeries: "1", nfeNextNumber: "", nfceSeries: "1", status: "active", notes: "" });
const taxIdText = (value: unknown) => String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const digits = (value: unknown) => String(value || "").replace(/\D/g, "");
const bridge = () => (window as any).sevenDesktop;

function formObject(form: HTMLFormElement) {
  return Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
}
function fmtCnpj(value: unknown) {
  const v = taxIdText(value); if (/^\d{14}$/.test(v)) return v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5"); return String(value || "");
}

export default function CompanyEstablishmentsModule({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"matrix" | "branches">("matrix");
  const [matrix, setMatrix] = useState<Company>(emptyMatrix);
  const [matrixSnapshot, setMatrixSnapshot] = useState<Company | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeId, setActiveId] = useState("matrix");
  const [activeCompany, setActiveCompany] = useState<Company>({});
  const [branch, setBranch] = useState<Branch>(() => emptyBranch(emptyMatrix));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const activeLabel = activeId === "matrix" ? "Matriz" : branches.find((item) => item.id === activeId)?.tradeName || branches.find((item) => item.id === activeId)?.legalName || "Filial";
  const selectedBranch = useMemo(() => branches.find((item) => item.id === branch.id) || null, [branches, branch.id]);

  async function postCompany(payload: Company) {
    const response = await fetch("/api/company", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Não foi possível atualizar o estabelecimento ativo.");
    return data.company || payload;
  }

  async function establishments(request: any) {
    const api = bridge();
    if (!api?.companyEstablishments) throw new Error("O bridge de matriz/filiais não está disponível nesta instalação.");
    const result = await api.companyEstablishments(request);
    if (!result?.ok) throw new Error(result?.error || "Falha ao acessar matriz/filiais.");
    return result;
  }

  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/company");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível carregar a empresa.");
      const current = { ...emptyMatrix, ...(data.company || {}) };
      const state = await establishments({ method: "GET", matrix: current });
      const matrixBase = state.matrixSnapshot || (state.activeId === "matrix" ? current : emptyMatrix);
      setMatrix({ ...emptyMatrix, ...matrixBase });
      setMatrixSnapshot(state.matrixSnapshot || null);
      setBranches(Array.isArray(state.branches) ? state.branches : []);
      setActiveId(state.activeId || "matrix");
      setActiveCompany(state.activeEstablishment || current);
      setBranch((currentBranch) => currentBranch.id ? currentBranch : emptyBranch(matrixBase));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Falha ao carregar cadastro de estabelecimentos."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  function validateCommon(payload: Record<string, string>, label: string) {
    const cnpj = taxIdText(payload.taxId);
    if (cnpj.length !== 14) return `${label}: CNPJ deve possuir 14 posições.`;
    if (!String(payload.legalName || "").trim()) return `${label}: razão social é obrigatória.`;
    if (!/^[A-Z]{2}$/.test(String(payload.state || "").toUpperCase())) return `${label}: UF deve possuir 2 letras.`;
    if (payload.cityCode && digits(payload.cityCode).length !== 7) return `${label}: código IBGE deve possuir 7 dígitos.`;
    const series = Number(digits(payload.nfeSeries));
    if (!Number.isInteger(series) || series < 0 || series > 999) return `${label}: série NF-e deve estar entre 0 e 999.`;
    const next = digits(payload.nfeNextNumber);
    if (next && (Number(next) < 1 || Number(next) > 999999999)) return `${label}: próximo número NF-e inválido.`;
    return "";
  }

  async function saveMatrix(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    const payload = formObject(event.currentTarget); payload.taxId = taxIdText(payload.taxId); payload.state = String(payload.state || "").toUpperCase();
    const invalid = validateCommon(payload, "Matriz"); if (invalid) { setSaving(false); setError(invalid); return; }
    try {
      let saved = payload;
      if (activeId === "matrix") saved = await postCompany(payload);
      const state = await establishments({ method: "POST", payload: { action: "capture_matrix", matrix: payload }, matrix: payload });
      setMatrix({ ...emptyMatrix, ...payload }); setMatrixSnapshot(state.matrixSnapshot || payload);
      if (activeId === "matrix") setActiveCompany(saved);
      setNotice(activeId === "matrix" ? "Dados da matriz salvos e aplicados ao ERP." : "Dados da matriz atualizados. A filial ativa permanece selecionada.");
      window.dispatchEvent(new CustomEvent("seven:company-updated"));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Falha ao salvar matriz."); }
    finally { setSaving(false); }
  }

  async function saveBranch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    const payload = { ...formObject(event.currentTarget), id: branch.id } as Branch;
    payload.taxId = taxIdText(payload.taxId); payload.state = String(payload.state || "").toUpperCase();
    const invalid = validateCommon(payload as Record<string, string>, "Filial"); if (invalid) { setSaving(false); setError(invalid); return; }
    try {
      const state = await establishments({ method: "POST", payload: { action: "save_branch", branch: payload }, matrix });
      const saved = state.branch as Branch;
      setBranches(state.branches || []); setBranch(saved);
      if (activeId === saved.id) { await postCompany(saved); setActiveCompany(saved); window.dispatchEvent(new CustomEvent("seven:company-updated")); }
      setNotice(activeId === saved.id ? "Filial salva e dados fiscais do estabelecimento ativo atualizados." : "Filial salva com sucesso.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Falha ao salvar filial."); }
    finally { setSaving(false); }
  }

  async function activate(id: string) {
    if (id === activeId) return;
    setSaving(true); setError(""); setNotice("");
    try {
      let target: Company;
      if (id === "matrix") {
        target = matrixSnapshot || matrix;
        if (!target?.legalName) throw new Error("Cadastre a matriz antes de selecioná-la.");
      } else {
        const next = branches.find((item) => item.id === id);
        if (!next) throw new Error("Filial não encontrada.");
        if (next.status === "inactive") throw new Error("Esta filial está inativa.");
        if (!matrixSnapshot) {
          const captured = await establishments({ method: "POST", payload: { action: "capture_matrix", matrix }, matrix });
          setMatrixSnapshot(captured.matrixSnapshot || matrix);
        }
        target = next;
      }
      const savedCompany = await postCompany(target);
      await establishments({ method: "POST", payload: { action: "set_active", id }, matrix });
      setActiveId(id); setActiveCompany(savedCompany);
      setNotice(`${id === "matrix" ? "Matriz" : "Filial"} selecionada como estabelecimento ativo do ERP e da NF-e.`);
      window.dispatchEvent(new CustomEvent("seven:company-updated"));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Falha ao trocar estabelecimento ativo."); }
    finally { setSaving(false); }
  }

  async function removeBranch(id: string) {
    if (id === activeId) { setError("Selecione a matriz ou outra filial antes de excluir a unidade ativa."); return; }
    if (!window.confirm("Excluir esta filial do cadastro? Esta ação não apaga documentos fiscais já emitidos.")) return;
    setSaving(true); setError("");
    try {
      const state = await establishments({ method: "POST", payload: { action: "delete_branch", id }, matrix });
      setBranches(state.branches || []); if (branch.id === id) setBranch(emptyBranch(matrix)); setNotice("Filial excluída do cadastro de estabelecimentos.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Falha ao excluir filial."); }
    finally { setSaving(false); }
  }

  const companyFields = (values: Company, prefix = "") => <>
    <section className="ce-panel"><div className="ce-panel-title"><b>01</b><div><h2>Identificação e tributação</h2><p>Dados oficiais do estabelecimento.</p></div></div><div className="ce-grid">
      {prefix && <label><span>Código interno</span><input name="code" defaultValue={values.code || ""} placeholder="Ex.: FILIAL-01" /></label>}
      <label className="span2"><span>Razão social *</span><input name="legalName" required defaultValue={values.legalName || ""} /></label>
      <label><span>Nome fantasia</span><input name="tradeName" defaultValue={values.tradeName || ""} /></label>
      <label><span>CNPJ *</span><input name="taxId" required maxLength={18} defaultValue={values.taxId || ""} /></label>
      <label><span>Inscrição Estadual</span><input name="stateRegistration" defaultValue={values.stateRegistration || ""} /></label>
      <label><span>Inscrição Municipal</span><input name="municipalRegistration" defaultValue={values.municipalRegistration || ""} /></label>
      <label><span>Regime tributário</span><select name="taxRegime" defaultValue={values.taxRegime || "simples_nacional"}><option value="mei">MEI</option><option value="simples_nacional">Simples Nacional</option><option value="simples_excesso">Simples Nacional - excesso</option><option value="lucro_presumido">Lucro Presumido</option><option value="lucro_real">Lucro Real</option></select></label>
      <label><span>CNAE principal</span><input name="cnae" defaultValue={values.cnae || ""} /></label>
      {prefix && <label><span>Situação da filial</span><select name="status" defaultValue={values.status || "active"}><option value="active">Ativa</option><option value="inactive">Inativa</option></select></label>}
    </div></section>
    <section className="ce-panel"><div className="ce-panel-title"><b>02</b><div><h2>Endereço fiscal</h2><p>Endereço que será usado nos documentos fiscais desta unidade.</p></div></div><div className="ce-grid">
      <label><span>CEP</span><input name="postalCode" defaultValue={values.postalCode || ""} /></label><label className="span2"><span>Logradouro</span><input name="street" defaultValue={values.street || ""} /></label><label><span>Número</span><input name="number" defaultValue={values.number || ""} /></label>
      <label><span>Complemento</span><input name="complement" defaultValue={values.complement || ""} /></label><label><span>Bairro</span><input name="district" defaultValue={values.district || ""} /></label><label><span>Cidade</span><input name="city" defaultValue={values.city || ""} /></label><label><span>Código IBGE</span><input name="cityCode" inputMode="numeric" defaultValue={values.cityCode || ""} /></label><label><span>UF *</span><input name="state" required maxLength={2} defaultValue={values.state || "RS"} /></label>
    </div></section>
    <section className="ce-panel"><div className="ce-panel-title"><b>03</b><div><h2>Contato e numeração fiscal</h2><p>Contato, séries e sequência por estabelecimento.</p></div></div><div className="ce-grid">
      <label><span>Telefone</span><input name="phone" defaultValue={values.phone || ""} /></label><label><span>E-mail</span><input name="email" type="email" defaultValue={values.email || ""} /></label><label><span>E-mail fiscal</span><input name="invoiceEmail" type="email" defaultValue={values.invoiceEmail || ""} /></label><label><span>Série NF-e</span><input name="nfeSeries" inputMode="numeric" defaultValue={values.nfeSeries || "1"} /></label><label><span>Próximo número NF-e</span><input name="nfeNextNumber" inputMode="numeric" defaultValue={values.nfeNextNumber || ""} /></label><label><span>Série NFC-e</span><input name="nfceSeries" inputMode="numeric" defaultValue={values.nfceSeries || "1"} /></label><label className="full"><span>Observações internas</span><textarea name="notes" rows={3} defaultValue={values.notes || ""} /></label>
    </div></section>
  </>;

  return <div className="company-establishments">
    <header className="ce-header"><div><span className="kicker">Configurações · organização empresarial</span><h1>Empresa e Filiais</h1><p>Cadastre a matriz, suas filiais e escolha qual estabelecimento está operando e emitindo documentos fiscais.</p></div><div className="ce-actions"><button className="ce-btn" onClick={() => void load()}>Atualizar</button><button className="ce-btn" onClick={onClose}>Voltar ao ERP</button></div></header>
    <div className="ce-active"><div className="main"><span>Estabelecimento ativo</span><strong>{activeLabel}</strong></div><div><span>CNPJ em uso</span><strong>{fmtCnpj(activeCompany.taxId)}</strong></div><div><span>UF / Município</span><strong>{[activeCompany.state, activeCompany.city].filter(Boolean).join(" · ") || "—"}</strong></div><div><span>NF-e</span><strong>Série {activeCompany.nfeSeries || "—"} · Próx. {activeCompany.nfeNextNumber || "não definido"}</strong></div></div>
    <nav className="ce-tabs"><button className={tab === "matrix" ? "active" : ""} onClick={() => setTab("matrix")}>Matriz</button><button className={tab === "branches" ? "active" : ""} onClick={() => setTab("branches")}>Filiais ({branches.length})</button></nav>
    {error && <div className="ce-alert error">{error}</div>}{notice && <div className="ce-alert success">{notice}</div>}
    {loading ? <div className="ce-panel ce-empty"><b>Carregando empresa...</b><span>Aguarde.</span></div> : tab === "matrix" ? <form onSubmit={saveMatrix} key={`matrix-${matrix.updatedAt || matrix.taxId || "new"}`}>
      {companyFields(matrix)}
      <div className="ce-form-footer"><span>{activeId === "matrix" ? "A matriz está ativa e alterações são aplicadas imediatamente." : "A matriz está preservada; a filial ativa continuará em uso."}</span><div className="ce-actions">{activeId !== "matrix" && <button type="button" className="ce-btn" disabled={saving} onClick={() => void activate("matrix")}>Usar matriz neste computador</button>}<button className="ce-btn primary" disabled={saving}>{saving ? "Salvando..." : "Salvar matriz"}</button></div></div>
    </form> : <div className="ce-branches-layout">
      <aside className="ce-branch-list"><div className="ce-branch-list-head"><strong>Unidades cadastradas</strong><button className="ce-btn primary" onClick={() => setBranch(emptyBranch(matrix))}>+ Nova</button></div>{branches.length ? branches.map((item) => <div key={item.id} className={`ce-branch-card ${branch.id === item.id ? "selected" : ""}`} onClick={() => setBranch(item)}><div className="top"><span className="code">{item.code || "FILIAL"}</span><span className={`ce-badge ${item.id === activeId ? "current" : item.status === "active" ? "active" : ""}`}>{item.id === activeId ? "EM USO" : item.status === "inactive" ? "INATIVA" : "ATIVA"}</span></div><h3>{item.tradeName || item.legalName}</h3><p>{fmtCnpj(item.taxId)} · {item.city || "—"}/{item.state || "—"}</p><p>NF-e série {item.nfeSeries || "—"} · próximo {item.nfeNextNumber || "não definido"}</p></div>) : <div className="ce-empty"><b>Nenhuma filial cadastrada</b><span>Crie uma unidade para começar.</span></div>}</aside>
      <section className="ce-branch-editor"><div className="ce-branch-toolbar"><div><h2>{selectedBranch ? `Editar ${selectedBranch.tradeName || selectedBranch.legalName}` : "Nova filial"}</h2><p>Cada filial possui CNPJ, inscrições, endereço e numeração fiscal próprios.</p></div><div>{selectedBranch && selectedBranch.id !== activeId && <button className="ce-btn danger" disabled={saving} onClick={() => void removeBranch(selectedBranch.id)}>Excluir</button>}{selectedBranch && selectedBranch.id !== activeId && selectedBranch.status !== "inactive" && <button className="ce-btn" disabled={saving} onClick={() => void activate(selectedBranch.id)}>Usar esta filial</button>}{selectedBranch?.id === activeId && <span className="ce-badge current">Estabelecimento em uso</span>}</div></div>
        <form onSubmit={saveBranch} key={`branch-${branch.id || "new"}-${branch.updatedAt || ""}`}>{companyFields(branch, "branch")}<div className="ce-form-footer"><span>Documentos fiscais existentes não são alterados ao trocar de estabelecimento.</span><button className="ce-btn primary" disabled={saving}>{saving ? "Salvando..." : branch.id ? "Salvar filial" : "Cadastrar filial"}</button></div></form>
      </section>
    </div>}
  </div>;
}
