"use client";

import { useEffect, useMemo, useState } from "react";
import NfeClassicModule from "./nfe-classic-module";
import NfeDanfeReferencePreview from "./nfe-danfe-reference-preview";
import { readCatalog, type CatalogItem, type VehicleData } from "./catalog-core";

type AnyRow = Record<string, any>;
type Summary = {
  environment: string; blockers: string[]; transmissionEnabled: boolean; certificateReady: boolean;
  series: string; nextNumber: string; drafts: AnyRow[]; companyName: string; companyTaxId: string; companyCity: string;
  company: AnyRow; logoDataUrl: string;
};
type StepHint = { id: string; label: string; icon: string; match: string[]; selector?: string };

const emptySummary: Summary = {
  environment: "homologation", blockers: [], transmissionEnabled: false, certificateReady: false,
  series: "—", nextNumber: "—", drafts: [], companyName: "Estabelecimento não identificado", companyTaxId: "—", companyCity: "—",
  company: {}, logoDataUrl: "",
};
const stepHints: StepHint[] = [
  { id: "identificacao", label: "Identificação", icon: "01", match: ["identifica", "operação", "operacao"] },
  { id: "destinatario", label: "Destinatário", icon: "02", match: ["destinat", "cliente"] },
  { id: "itens", label: "Produtos e veículos", icon: "03", match: ["produto", "itens", "serviço", "servico"] },
  { id: "tributacao", label: "Tributação dos itens", icon: "04", match: ["tribut", "imposto", "icms"], selector: ".classic-tax-panel" },
  { id: "totais", label: "Totais e adicionais", icon: "05", match: ["totais", "adicionais"] },
  { id: "revisao", label: "Revisar e transmitir", icon: "06", match: ["revis"], selector: ".nfe-classic-footer-actions" },
];
const VEHICLE_MARK = "=== DADOS DOS VEÍCULOS ===";

function statusOf(row: AnyRow) { return String(row.transmissionStatus || row.transmission?.status || "draft"); }
function cnpj(value: unknown) {
  const v = String(value || "").replace(/\D/g, "");
  return v.length === 14 ? v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : String(value || "—");
}
function vehiclePairs(v: VehicleData) {
  const year = [v.manufactureYear, v.modelYear].filter(Boolean).join("/");
  return [
    ["MARCA", v.make], ["MODELO", v.model], ["VERSÃO", v.version], ["CÓD. MODELO", v.modelCode],
    ["CHASSI/VIN", v.vin], ["RENAVAM", v.renavam], ["PLACA", [v.plate, v.plateState].filter(Boolean).join("/")], ["ANO FAB/MOD", year],
    ["COR EXTERNA", v.exteriorColor], ["CÓD. COR", v.colorCode], ["COR INTERNA", v.interiorColor], ["CARROCERIA", v.bodyType],
    ["MOTOR", v.engineNumber], ["CÓD. MOTOR", v.engineCode], ["CILINDRADA", v.displacementCc ? `${v.displacementCc} cc` : ""],
    ["POTÊNCIA", v.powerCv ? `${v.powerCv} cv` : ""], ["TORQUE", v.torqueNm ? `${v.torqueNm} Nm` : ""], ["CÂMBIO", v.transmission],
    ["COMBUSTÍVEL", v.fuel], ["TRAÇÃO", v.traction], ["KM", v.mileageKm !== undefined ? String(v.mileageKm) : ""],
    ["PORTAS", v.doors !== undefined ? String(v.doors) : ""], ["LUGARES", v.seats !== undefined ? String(v.seats) : ""],
    ["OPCIONAIS", v.options], ["ACESSÓRIOS", v.accessories], ["FIPE", v.fipeCode], ["GRAVAME", v.gravame],
    ["RESTRIÇÕES", v.restrictions], ["GARANTIA", [v.warrantyStart, v.warrantyEnd].filter(Boolean).join(" a ")], ["OBS. VEÍCULO", v.notes],
  ].filter(([, value]) => String(value ?? "").trim());
}
function vehicleText(v: VehicleData, separator = " · ") { return vehiclePairs(v).map(([label, value]) => `${label}: ${String(value)}`).join(separator); }
function findVehicle(item: AnyRow, catalog: CatalogItem[]) {
  const code = String(item.code || "").trim().toUpperCase(); const description = String(item.description || "").trim().toUpperCase();
  return catalog.find((row) => row.category === "vehicle" && row.vehicle && (
    String(row.sku || "").trim().toUpperCase() === code || row.id.slice(0, 8).toUpperCase() === code || String(row.name || "").trim().toUpperCase() === description
  ));
}
function enrichNfePayload(payload: AnyRow) {
  const catalog = readCatalog().filter((row) => row.status === "active" && row.category === "vehicle" && row.vehicle);
  if (!catalog.length || !Array.isArray(payload.items)) return payload;
  const blocks: string[] = [];
  const items = payload.items.map((item: AnyRow, index: number) => {
    const found = findVehicle(item, catalog); if (!found?.vehicle) return item;
    const details = vehicleText(found.vehicle);
    blocks.push(`VEÍCULO ${index + 1} — ${found.name}\n${vehicleText(found.vehicle, " | ")}`);
    return { ...item, vehicle: found.vehicle, infAdProd: `VEÍCULO — ${details}`.slice(0, 480) };
  });
  if (!blocks.length) return { ...payload, items };
  const baseNotes = String(payload.notes || "").split(VEHICLE_MARK)[0].trim();
  const vehicleNotes = `${VEHICLE_MARK}\n${blocks.join("\n\n")}`;
  const notes = `${baseNotes}${baseNotes ? "\n\n" : ""}${vehicleNotes}`.slice(0, 4800);
  return { ...payload, items, notes, hasVehicleData: true };
}
function makeInvalidSimulationKey() {
  const bytes = new Uint8Array(43); crypto.getRandomValues(bytes);
  const base = Array.from(bytes, (value) => String(value % 10)).join("");
  let weight = 2, sum = 0;
  for (let index = base.length - 1; index >= 0; index -= 1) { sum += Number(base[index]) * weight; weight = weight === 9 ? 2 : weight + 1; }
  const remainder = sum % 11; const validDv = remainder === 0 || remainder === 1 ? 0 : 11 - remainder;
  return `${base}${(validDv + 1) % 10}`;
}
function makeSimulationNumber() { const bytes = new Uint32Array(1); crypto.getRandomValues(bytes); return (bytes[0] % 999999999) + 1; }

export default function NfeProfessionalModule() {
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [loading, setLoading] = useState(true);
  const [activeStep, setActiveStep] = useState("identificacao");
  const [simulationOpen, setSimulationOpen] = useState(false);
  const [simulationDraftId, setSimulationDraftId] = useState("");
  const [simulationKey, setSimulationKey] = useState("");
  const [simulationNumber, setSimulationNumber] = useState(1);

  const refreshSummary = async () => {
    setLoading(true);
    try {
      const [draftResponse, companyResponse] = await Promise.all([fetch("/api/nfe-drafts"), fetch("/api/company")]);
      const [draftData, companyData] = await Promise.all([draftResponse.json().catch(() => ({})), companyResponse.json().catch(() => ({}))]);
      let certificateReady = false; let logoDataUrl = "";
      const bridge = (window as any).sevenDesktop;
      if (bridge?.integrationSecretsStatus) {
        const secret = await bridge.integrationSecretsStatus("nfe_sefaz").catch(() => null); certificateReady = Boolean(secret?.certificateId);
      }
      const readiness = draftData?.readiness || {}; const company = companyData?.company || {};
      if (bridge?.companyLogo && company.taxId) {
        const logo = await bridge.companyLogo({ action: "get", taxId: company.taxId }).catch(() => null); logoDataUrl = String(logo?.logoDataUrl || "");
      }
      setSummary({
        environment: readiness.environment || "homologation", blockers: Array.isArray(readiness.blockers) ? readiness.blockers : [],
        transmissionEnabled: Boolean(readiness.transmissionEnabled), certificateReady,
        series: String(company.nfeSeries || "—"), nextNumber: String(company.nfeNextNumber || "—"), drafts: Array.isArray(draftData?.drafts) ? draftData.drafts : [],
        companyName: String(company.tradeName || company.legalName || "Estabelecimento não identificado"), companyTaxId: cnpj(company.taxId),
        companyCity: [company.city, company.state].filter(Boolean).join("/") || "—", company, logoDataUrl,
      });
    } catch { setSummary(emptySummary); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    void refreshSummary(); const handler = () => void refreshSummary();
    window.addEventListener("seven:nfe-updated", handler); window.addEventListener("seven:company-updated", handler); window.addEventListener("seven:company-logo-updated", handler);
    return () => { window.removeEventListener("seven:nfe-updated", handler); window.removeEventListener("seven:company-updated", handler); window.removeEventListener("seven:company-logo-updated", handler); };
  }, []);

  useEffect(() => {
    const previousFetch = window.fetch.bind(window);
    const wrappedFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      let nextInit = init;
      if (rawUrl.startsWith("/api/nfe-drafts") && String(init?.method || "GET").toUpperCase() === "POST" && typeof init?.body === "string") {
        try {
          const payload = JSON.parse(init.body);
          if (!payload.action) nextInit = { ...init, body: JSON.stringify(enrichNfePayload(payload)) };
        } catch {}
      }
      return previousFetch(input, nextInit);
    };
    window.fetch = wrappedFetch;
    return () => { if (window.fetch === wrappedFetch) window.fetch = previousFetch; };
  }, []);

  const stats = useMemo(() => ({
    authorized: summary.drafts.filter((row) => statusOf(row) === "authorized").length,
    rejected: summary.drafts.filter((row) => statusOf(row) === "rejected").length,
    pending: summary.drafts.filter((row) => !["authorized", "cancelled"].includes(statusOf(row))).length,
  }), [summary.drafts]);
  const ready = summary.transmissionEnabled && summary.certificateReady;
  const environmentLabel = summary.environment === "production" ? "Produção" : "Homologação";
  const environmentClass = summary.environment === "production" ? "production" : "homologation";

  const scrollToStep = (step: StepHint) => {
    setActiveStep(step.id); const root = document.querySelector(".nfe-professional-module .nfe-classic-workspace"); if (!root) return;
    let target: HTMLElement | null = null; if (step.selector) target = root.querySelector<HTMLElement>(step.selector);
    if (!target) {
      const headings = Array.from(root.querySelectorAll<HTMLElement>(".classic-section h2"));
      target = headings.find((heading) => { const value = (heading.textContent || "").toLowerCase(); return step.match.some((pattern) => value.includes(pattern)); })?.closest<HTMLElement>(".classic-section") || null;
    }
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const openNewInvoice = () => {
    const button = document.querySelector<HTMLButtonElement>(".nfe-pro-editor-surface .nfe-classic-list-head .classic-button.primary, .nfe-pro-editor-surface .nfe-classic-heading .classic-button.primary");
    button?.click(); setActiveStep("identificacao"); window.setTimeout(() => scrollToStep(stepHints[0]), 80);
  };
  const regenerateSimulation = () => { setSimulationKey(makeInvalidSimulationKey()); setSimulationNumber(makeSimulationNumber()); };
  const openSimulation = () => {
    setSimulationDraftId((current) => current && summary.drafts.some((row) => row.id === current) ? current : summary.drafts[0]?.id || "");
    regenerateSimulation(); setSimulationOpen(true);
  };

  const rawSimulationDraft = useMemo(() => summary.drafts.find((row) => row.id === simulationDraftId) || summary.drafts[0] || null, [summary.drafts, simulationDraftId]);
  const simulationPayload = useMemo(() => rawSimulationDraft ? enrichNfePayload({ ...rawSimulationDraft, items: Array.isArray(rawSimulationDraft.items) ? rawSimulationDraft.items : [] }) : null, [rawSimulationDraft]);
  const simulationDraft = simulationPayload ? {
    ...simulationPayload, environment: "production", simulation: true, transmissionStatus: "simulation", accessKey: simulationKey,
    protocol: "SEM PROTOCOLO — SIMULAÇÃO", nfeNumber: simulationNumber, nfeSeries: Number(String(summary.series).replace(/\D/g, "")) || 1,
    createdAt: new Date().toISOString(), transmission: { status: "simulation", accessKey: simulationKey, number: simulationNumber, series: Number(String(summary.series).replace(/\D/g, "")) || 1 },
  } : null;

  return <div className="nfe-professional-module">
    <div className="nfe-pro-app">
      <header className="nfe-pro-topbar">
        <div className="nfe-pro-brand"><div className="nfe-pro-brand-mark">NF</div><div className="nfe-pro-brand-copy"><span>Seven ERP 1.1.1 · Fiscal</span><strong>Emissão de NF-e</strong><small>Modelo 55 · SEFAZ real + simulador local claramente separado</small></div></div>
        <div className="nfe-pro-top-actions">
          <div className={`nfe-pro-chip ${environmentClass}`}><i />{environmentLabel}</div><div className="nfe-pro-chip"><i />Série {summary.series} · Próx. {summary.nextNumber}</div>
          <button type="button" className="nfe-pro-top-button simulator" onClick={openSimulation}>▤ Simular NF-e</button>
          <button type="button" className="nfe-pro-top-button" onClick={() => void refreshSummary()}>Atualizar</button><button type="button" className="nfe-pro-top-button primary" onClick={openNewInvoice}>+ Nova NF-e</button>
        </div>
      </header>

      <div className="nfe-pro-body">
        <aside className="nfe-pro-sidebar">
          <span className="nfe-pro-side-label">Estabelecimento</span><div className="nfe-pro-establishment-card"><div className="icon">🏢</div><b>{summary.companyName}</b><small>{summary.companyTaxId}<br />{summary.companyCity}</small><em>EMITENTE ATIVO</em></div>
          <span className="nfe-pro-side-label">Preenchimento da nota</span><nav className="nfe-pro-side-nav" aria-label="Etapas da NF-e">{stepHints.map((step) => <button type="button" key={step.id} className={activeStep === step.id ? "active" : ""} onClick={() => scrollToStep(step)}><b>{step.icon}</b><span>{step.label}</span><i>›</i></button>)}</nav>
          <div className="nfe-pro-side-status"><span className="nfe-pro-side-label">Status fiscal</span><div className="status-row"><i className={`dot ${summary.certificateReady ? "ok" : "warn"}`} /><span><b>Certificado A1</b>{summary.certificateReady ? "Configurado" : "Pendente"}</span></div><div className="status-row"><i className={`dot ${summary.transmissionEnabled ? "ok" : "warn"}`} /><span><b>Integração SEFAZ</b>{summary.transmissionEnabled ? "Disponível" : "Requer atenção"}</span></div><div className="status-row"><i className={`dot ${ready ? "ok" : "warn"}`} /><span><b>Emissão</b>{ready ? "Pronta para transmitir" : "Há pendências"}</span></div></div>
        </aside>

        <main className="nfe-pro-main">
          <div className="nfe-pro-commandbar"><div className="nfe-pro-command-title"><strong>Central de notas fiscais</strong><small>Veículos do catálogo levam automaticamente seus dados cadastrais para as informações da NF-e.</small></div><div className="nfe-pro-command-meta"><div className="nfe-pro-mini-stat"><span>Logo DANFE</span><b className={summary.logoDataUrl ? "ok" : "warn"}>{summary.logoDataUrl ? "Configurado" : "Opcional"}</b></div><div className="nfe-pro-mini-stat"><span>Autorizadas</span><b>{stats.authorized}</b></div><div className="nfe-pro-mini-stat"><span>Pendentes</span><b className={stats.pending ? "warn" : ""}>{stats.pending}</b></div><div className="nfe-pro-mini-stat"><span>Rejeitadas</span><b className={stats.rejected ? "danger" : ""}>{stats.rejected}</b></div></div></div>
          <div className={`nfe-pro-readiness-modern ${ready ? "ready" : "blocked"}`}><div className="state"><span>{ready ? "✓" : "!"}</span><div><b>{ready ? "Ambiente fiscal pronto para transmissão" : "Antes de transmitir, revise a configuração fiscal"}</b><small>{loading ? "Atualizando diagnóstico..." : summary.blockers[0] || (summary.certificateReady ? "Serviços fiscais disponíveis para o estabelecimento ativo." : "Configure o certificado digital A1 para habilitar a transmissão.")}</small></div></div><button type="button" onClick={() => void refreshSummary()}>Revalidar ambiente</button></div>
          <div className="nfe-pro-editor-surface"><NfeClassicModule /></div>
        </main>
      </div>
    </div>

    {simulationOpen && <div className="nfe-simulation-overlay" role="dialog" aria-modal="true" aria-label="Simulação de NF-e">
      <div className="nfe-simulation-window">
        <header className="nfe-simulation-toolbar no-print"><div><span>LABORATÓRIO FISCAL · SEVEN ERP 1.1.1</span><h2>Simulação de NF-e</h2><p>Visualize uma NF-e completa sem assinatura digital e sem qualquer comunicação com a SEFAZ.</p></div><div className="nfe-simulation-actions"><select value={rawSimulationDraft?.id || ""} onChange={(e) => { setSimulationDraftId(e.target.value); regenerateSimulation(); }}><option value="">Selecione um rascunho...</option>{summary.drafts.map((row) => <option key={row.id} value={row.id}>{row.recipientName || "Sem destinatário"} · {row.natureOperation || "NF-e"}</option>)}</select><button onClick={regenerateSimulation}>Nova chave</button><button onClick={() => window.print()} disabled={!simulationDraft}>Imprimir / PDF</button><button className="close" onClick={() => setSimulationOpen(false)}>Fechar</button></div></header>
        <div className="nfe-simulation-warning no-print"><b>SIMULAÇÃO LOCAL — SEM VALOR FISCAL</b><span>A chave abaixo é gerada com dígito verificador propositalmente incorreto. Não há assinatura, protocolo, autorização ou transmissão para a SEFAZ.</span></div>
        <div className="nfe-simulation-stage">
          {!simulationDraft ? <div className="nfe-simulation-empty"><b>Nenhum rascunho disponível</b><span>Salve uma NF-e como rascunho e volte ao simulador para gerar o documento de teste.</span></div> : <div className={`nfe-simulation-paper ${summary.logoDataUrl ? "has-logo" : ""}`} style={summary.logoDataUrl ? ({ "--nfe-company-logo": `url("${summary.logoDataUrl}")` } as any) : undefined}><div className="nfe-simulation-stamp">SIMULAÇÃO · SEM VALOR FISCAL</div><NfeDanfeReferencePreview draft={simulationDraft} company={summary.company} snapshot={simulationPayload || undefined} /></div>}
        </div>
      </div>
    </div>}
  </div>;
}
