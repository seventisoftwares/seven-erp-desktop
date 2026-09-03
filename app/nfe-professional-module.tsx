"use client";

import { useEffect, useMemo, useState } from "react";
import NfeClassicModule from "./nfe-classic-module";
import NfeDanfeReferencePreview from "./nfe-danfe-reference-preview";
import { readCatalog, type CatalogItem, type VehicleData } from "./catalog-core";

type AnyRow = Record<string, any>;
type Summary = {
  environment: string;
  blockers: string[];
  transmissionEnabled: boolean;
  certificateReady: boolean;
  series: string;
  nextNumber: string;
  drafts: AnyRow[];
  companyName: string;
  companyTaxId: string;
  companyCity: string;
  company: AnyRow;
  logoDataUrl: string;
};
type StepHint = { id: string; label: string; icon: string; match: string[]; selector?: string };

const VEHICLE_MARK = "=== DADOS DOS VEÍCULOS ===";
const emptySummary: Summary = {
  environment: "homologation",
  blockers: [],
  transmissionEnabled: false,
  certificateReady: false,
  series: "—",
  nextNumber: "—",
  drafts: [],
  companyName: "Estabelecimento não identificado",
  companyTaxId: "—",
  companyCity: "—",
  company: {},
  logoDataUrl: "",
};
const steps: StepHint[] = [
  { id: "identificacao", label: "Identificação", icon: "01", match: ["identifica", "operação", "operacao"] },
  { id: "destinatario", label: "Cliente / comprador", icon: "02", match: ["destinat", "cliente"] },
  { id: "itens", label: "Veículos / produtos", icon: "03", match: ["produto", "itens", "serviço", "servico"] },
  { id: "tributacao", label: "Tributação", icon: "04", match: ["tribut", "imposto", "icms"], selector: ".classic-tax-panel" },
  { id: "totais", label: "Totais e adicionais", icon: "05", match: ["totais", "adicionais"] },
  { id: "revisao", label: "Revisar e transmitir", icon: "06", match: ["revis"], selector: ".nfe-classic-footer-actions" },
];

function statusOf(row: AnyRow) {
  return String(row.transmissionStatus || row.transmission?.status || "draft");
}
function formatCnpj(value: unknown) {
  const raw = String(value || "").replace(/\D/g, "");
  return raw.length === 14 ? raw.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : String(value || "—");
}
function findVehicle(item: AnyRow, catalog: CatalogItem[]) {
  const code = String(item.code || "").trim().toUpperCase();
  const description = String(item.description || "").trim().toUpperCase();
  return catalog.find((row) => row.category === "vehicle" && row.vehicle && (
    String(row.sku || "").trim().toUpperCase() === code ||
    row.id.slice(0, 8).toUpperCase() === code ||
    String(row.name || "").trim().toUpperCase() === description
  ));
}
function pair(label: string, value: unknown) {
  const clean = String(value ?? "").trim();
  return clean ? `${label}: ${clean}` : "";
}
function vehicleLines(v: VehicleData) {
  const year = [v.manufactureYear, v.modelYear].filter(Boolean).join("/");
  const plate = [v.plate, v.plateState].filter(Boolean).join("/");
  const line1 = [pair("CHASSI/VIN", v.vin), pair("RENAVAM", v.renavam), pair("PLACA", plate)].filter(Boolean).join("  •  ");
  const line2 = [pair("VERSÃO", v.version), pair("ANO FAB/MOD", year), pair("COR", v.exteriorColor)].filter(Boolean).join("  •  ");
  const line3 = [pair("MOTOR", v.engineNumber || v.engineCode), pair("CÂMBIO", v.transmission), pair("COMBUSTÍVEL", v.fuel), pair("KM", v.mileageKm)].filter(Boolean).join("  •  ");
  const line4 = [pair("POTÊNCIA", v.powerCv ? `${v.powerCv} cv` : ""), pair("CILINDRADA", v.displacementCc ? `${v.displacementCc} cc` : ""), pair("TRAÇÃO", v.traction)].filter(Boolean).join("  •  ");
  const lines = [line1, line2, line3, line4];
  if (v.options) lines.push(`OPCIONAIS: ${v.options}`);
  if (v.accessories) lines.push(`ACESSÓRIOS: ${v.accessories}`);
  if (v.gravame) lines.push(`GRAVAME: ${v.gravame}`);
  if (v.restrictions) lines.push(`RESTRIÇÕES: ${v.restrictions}`);
  if (v.notes) lines.push(`OBS.: ${v.notes}`);
  return lines.filter(Boolean);
}
function vehiclePersistenceBlock(v: VehicleData, title: string, index: number) {
  const extra = [
    pair("MARCA", v.make), pair("MODELO", v.model), pair("CÓD. MODELO", v.modelCode),
    pair("COR INTERNA", v.interiorColor), pair("CÓD. COR", v.colorCode), pair("CARROCERIA", v.bodyType),
    pair("TORQUE", v.torqueNm ? `${v.torqueNm} Nm` : ""), pair("PORTAS", v.doors), pair("LUGARES", v.seats),
    pair("FIPE", v.fipeCode), pair("GARANTIA", [v.warrantyStart, v.warrantyEnd].filter(Boolean).join(" a ")),
  ].filter(Boolean).join(" | ");
  return [`VEÍCULO ${index + 1} — ${title}`, ...vehicleLines(v), extra].filter(Boolean).join("\n");
}
function enrichNfePayload(payload: AnyRow) {
  const catalog = readCatalog().filter((row) => row.status === "active" && row.category === "vehicle" && row.vehicle);
  if (!Array.isArray(payload.items) || !catalog.length) return payload;
  const blocks: string[] = [];
  const items = payload.items.map((item: AnyRow, index: number) => {
    const found = findVehicle(item, catalog);
    if (!found?.vehicle) return item;
    const lines = vehicleLines(found.vehicle);
    blocks.push(vehiclePersistenceBlock(found.vehicle, found.name, index));
    return { ...item, vehicle: found.vehicle, infAdProd: lines.join("\n").slice(0, 500) };
  });
  if (!blocks.length) return { ...payload, items };
  const baseNotes = String(payload.notes || "").split(VEHICLE_MARK)[0].trim();
  const notes = `${baseNotes}${baseNotes ? "\n\n" : ""}${VEHICLE_MARK}\n${blocks.join("\n\n")}`.slice(0, 4800);
  return { ...payload, items, notes, hasVehicleData: true };
}
function invalidSimulationKey() {
  const bytes = new Uint8Array(43);
  crypto.getRandomValues(bytes);
  const base = Array.from(bytes, (value) => String(value % 10)).join("");
  let weight = 2;
  let sum = 0;
  for (let index = base.length - 1; index >= 0; index -= 1) {
    sum += Number(base[index]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const remainder = sum % 11;
  const validDv = remainder === 0 || remainder === 1 ? 0 : 11 - remainder;
  return `${base}${(validDv + 1) % 10}`;
}
function randomSimulationNumber() {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return (bytes[0] % 999999999) + 1;
}

export default function NfeProfessionalModule() {
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [loading, setLoading] = useState(true);
  const [activeStep, setActiveStep] = useState("identificacao");
  const [simulationMode, setSimulationMode] = useState(true);
  const [simulationOpen, setSimulationOpen] = useState(false);
  const [simulationDraftId, setSimulationDraftId] = useState("");
  const [simulationKey, setSimulationKey] = useState("");
  const [simulationNumber, setSimulationNumber] = useState(1);

  const refreshSummary = async () => {
    setLoading(true);
    try {
      const [draftResponse, companyResponse] = await Promise.all([fetch("/api/nfe-drafts"), fetch("/api/company")]);
      const [draftData, companyData] = await Promise.all([draftResponse.json().catch(() => ({})), companyResponse.json().catch(() => ({}))]);
      const company = companyData?.company || {};
      const readiness = draftData?.readiness || {};
      const bridge = (window as any).sevenDesktop;
      let certificateReady = false;
      let logoDataUrl = "";
      if (bridge?.integrationSecretsStatus) {
        const secret = await bridge.integrationSecretsStatus("nfe_sefaz").catch(() => null);
        certificateReady = Boolean(secret?.certificateId);
      }
      if (bridge?.companyLogo && company.taxId) {
        const logo = await bridge.companyLogo({ action: "get", taxId: company.taxId }).catch(() => null);
        logoDataUrl = String(logo?.logoDataUrl || "");
      }
      setSummary({
        environment: readiness.environment || "homologation",
        blockers: Array.isArray(readiness.blockers) ? readiness.blockers : [],
        transmissionEnabled: Boolean(readiness.transmissionEnabled),
        certificateReady,
        series: String(company.nfeSeries || "—"),
        nextNumber: String(company.nfeNextNumber || "—"),
        drafts: Array.isArray(draftData?.drafts) ? draftData.drafts : [],
        companyName: String(company.tradeName || company.legalName || "Estabelecimento não identificado"),
        companyTaxId: formatCnpj(company.taxId),
        companyCity: [company.city, company.state].filter(Boolean).join("/") || "—",
        company,
        logoDataUrl,
      });
    } catch {
      setSummary(emptySummary);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshSummary();
    const handler = () => void refreshSummary();
    window.addEventListener("seven:nfe-updated", handler);
    window.addEventListener("seven:company-updated", handler);
    window.addEventListener("seven:company-logo-updated", handler);
    return () => {
      window.removeEventListener("seven:nfe-updated", handler);
      window.removeEventListener("seven:company-updated", handler);
      window.removeEventListener("seven:company-logo-updated", handler);
    };
  }, []);

  useEffect(() => {
    const previousFetch = window.fetch.bind(window);
    const wrappedFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = String(init?.method || "GET").toUpperCase();
      let nextInit = init;
      let parsed: AnyRow | null = null;
      if (rawUrl.startsWith("/api/nfe-drafts") && method === "POST" && typeof init?.body === "string") {
        try { parsed = JSON.parse(init.body); } catch { parsed = null; }
        if (parsed && !parsed.action) nextInit = { ...init, body: JSON.stringify(enrichNfePayload(parsed)) };
        if (parsed?.action === "transmit" && simulationMode) {
          try {
            const listResponse = await previousFetch("/api/nfe-drafts");
            const listData = await listResponse.json().catch(() => ({}));
            const drafts = Array.isArray(listData?.drafts) ? listData.drafts : [];
            setSummary((current) => ({ ...current, drafts }));
          } catch {}
          setSimulationDraftId(String(parsed.draftId || ""));
          setSimulationKey(invalidSimulationKey());
          setSimulationNumber(randomSimulationNumber());
          setSimulationOpen(true);
          return new Response(JSON.stringify({ status: "simulation", simulation: true, message: "Pré-visualização gerada localmente. Nenhum documento foi enviado à SEFAZ." }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
      }
      return previousFetch(input, nextInit);
    };
    window.fetch = wrappedFetch;
    return () => { if (window.fetch === wrappedFetch) window.fetch = previousFetch; };
  }, [simulationMode]);

  useEffect(() => {
    if (!simulationMode) return;
    const rewrite = () => {
      document.querySelectorAll<HTMLElement>(".nfe-professional-module .nfe-classic-message.success").forEach((node) => {
        const value = node.textContent || "";
        if (/NF-e enviada|SEFAZ ainda|NF-e autorizada/i.test(value)) node.textContent = "Pré-visualização gerada. Nenhum documento foi enviado à SEFAZ.";
      });
    };
    const observer = new MutationObserver(rewrite);
    const root = document.querySelector(".nfe-professional-module");
    if (root) observer.observe(root, { childList: true, subtree: true, characterData: true });
    rewrite();
    return () => observer.disconnect();
  }, [simulationMode]);

  const stats = useMemo(() => ({
    authorized: summary.drafts.filter((row) => statusOf(row) === "authorized").length,
    pending: summary.drafts.filter((row) => !["authorized", "cancelled"].includes(statusOf(row))).length,
    vehicles: readCatalog().filter((row) => row.status === "active" && row.category === "vehicle").length,
  }), [summary.drafts]);
  const ready = summary.transmissionEnabled && summary.certificateReady;
  const environmentLabel = summary.environment === "production" ? "Produção" : "Homologação";

  const scrollToStep = (step: StepHint) => {
    setActiveStep(step.id);
    const root = document.querySelector(".nfe-professional-module .nfe-classic-workspace");
    if (!root) return;
    let target: HTMLElement | null = step.selector ? root.querySelector<HTMLElement>(step.selector) : null;
    if (!target) {
      const headings = Array.from(root.querySelectorAll<HTMLElement>(".classic-section h2"));
      target = headings.find((heading) => {
        const text = (heading.textContent || "").toLowerCase();
        return step.match.some((term) => text.includes(term));
      })?.closest<HTMLElement>(".classic-section") || null;
    }
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const openNewInvoice = () => {
    document.querySelector<HTMLButtonElement>(".nfe-pro-editor-surface .nfe-classic-list-head .classic-button.primary, .nfe-pro-editor-surface .nfe-classic-heading .classic-button.primary")?.click();
    setActiveStep("identificacao");
    window.setTimeout(() => scrollToStep(steps[0]), 80);
  };
  const regenerateSimulation = () => {
    setSimulationKey(invalidSimulationKey());
    setSimulationNumber(randomSimulationNumber());
  };

  const rawSimulationDraft = useMemo(() => summary.drafts.find((row) => row.id === simulationDraftId) || null, [summary.drafts, simulationDraftId]);
  const simulationPayload = useMemo(() => rawSimulationDraft ? enrichNfePayload({ ...rawSimulationDraft, items: Array.isArray(rawSimulationDraft.items) ? rawSimulationDraft.items : [] }) : null, [rawSimulationDraft]);
  const simulationDraft = simulationPayload ? {
    ...simulationPayload,
    environment: "production",
    simulation: true,
    transmissionStatus: "simulation",
    accessKey: simulationKey,
    protocol: "SEM PROTOCOLO",
    nfeNumber: simulationNumber,
    nfeSeries: Number(String(summary.series).replace(/\D/g, "")) || 1,
    createdAt: new Date().toISOString(),
    transmission: { status: "simulation", accessKey: simulationKey, number: simulationNumber, series: Number(String(summary.series).replace(/\D/g, "")) || 1 },
  } : null;
  const previewCompany = { ...summary.company, logoDataUrl: summary.logoDataUrl };

  return <div className="nfe-professional-module nfe-dealership-v112">
    <div className="nfe-pro-app">
      <header className="nfe-pro-topbar">
        <div className="nfe-pro-brand"><div className="nfe-pro-brand-mark">NF</div><div className="nfe-pro-brand-copy"><span>Seven ERP 1.1.2 · Fiscal Automotivo</span><strong>Emissão de NF-e</strong><small>Fluxo profissional para lojas de veículos, seminovos e concessionárias.</small></div></div>
        <div className="nfe-pro-top-actions">
          <div className="nfe-pro-mode-switch" aria-label="Modo de transmissão"><span>Transmitir NF-e</span><button className={simulationMode ? "active" : ""} onClick={() => setSimulationMode(true)}>Modo teste</button><button className={!simulationMode ? "active real" : ""} onClick={() => setSimulationMode(false)}>SEFAZ real</button></div>
          <div className={`nfe-pro-chip ${summary.environment === "production" ? "production" : "homologation"}`}><i />{environmentLabel}</div>
          <button type="button" className="nfe-pro-top-button" onClick={() => void refreshSummary()}>Atualizar</button>
          <button type="button" className="nfe-pro-top-button primary" onClick={openNewInvoice}>+ Nova NF-e</button>
        </div>
      </header>

      <div className="nfe-pro-body">
        <aside className="nfe-pro-sidebar">
          <span className="nfe-pro-side-label">Estabelecimento</span>
          <div className="nfe-pro-establishment-card">
            {summary.logoDataUrl ? <img className="nfe-pro-company-logo" src={summary.logoDataUrl} alt="Logo do estabelecimento" /> : <div className="icon">🏢</div>}
            <b>{summary.companyName}</b><small>{summary.companyTaxId}<br />{summary.companyCity}</small><em>EMITENTE ATIVO</em>
          </div>
          <span className="nfe-pro-side-label">Preenchimento da nota</span>
          <nav className="nfe-pro-side-nav">{steps.map((step) => <button type="button" key={step.id} className={activeStep === step.id ? "active" : ""} onClick={() => scrollToStep(step)}><b>{step.icon}</b><span>{step.label}</span><i>›</i></button>)}</nav>
          <div className={`nfe-pro-transmit-state ${simulationMode ? "test" : "real"}`}><b>{simulationMode ? "MODO TESTE ATIVO" : "SEFAZ REAL"}</b><span>{simulationMode ? "Ao clicar em transmitir, o ERP gera a NF-e de teste e não faz comunicação externa." : "Transmitir envia a NF-e ao autorizador configurado. Use somente com ambiente fiscal validado."}</span></div>
        </aside>

        <main className="nfe-pro-main">
          <div className="nfe-pro-commandbar"><div className="nfe-pro-command-title"><strong>Central fiscal da loja</strong><small>Chassi, RENAVAM, versão, placa, ano, cor, motorização, câmbio, opcionais e acessórios aparecem logo abaixo do veículo no DANFE.</small></div><div className="nfe-pro-command-meta"><div className="nfe-pro-mini-stat"><span>Veículos</span><b>{stats.vehicles}</b></div><div className="nfe-pro-mini-stat"><span>Logo DANFE</span><b className={summary.logoDataUrl ? "ok" : "warn"}>{summary.logoDataUrl ? "OK" : "Opcional"}</b></div><div className="nfe-pro-mini-stat"><span>Autorizadas</span><b>{stats.authorized}</b></div><div className="nfe-pro-mini-stat"><span>Pendentes</span><b className={stats.pending ? "warn" : ""}>{stats.pending}</b></div></div></div>
          <div className={`nfe-pro-readiness-modern ${simulationMode || ready ? "ready" : "blocked"}`}><div className="state"><span>{simulationMode || ready ? "✓" : "!"}</span><div><b>{simulationMode ? "Modo teste pronto — transmitir gera a prévia da NF-e" : ready ? "Ambiente fiscal pronto para transmissão" : "Revise a configuração fiscal antes da transmissão real"}</b><small>{simulationMode ? "A chave e o código de barras são gerados localmente e não possuem validade fiscal." : loading ? "Atualizando diagnóstico..." : summary.blockers[0] || "Serviços fiscais disponíveis para o estabelecimento ativo."}</small></div></div><button type="button" onClick={() => void refreshSummary()}>Revalidar ambiente</button></div>
          <div className="nfe-pro-editor-surface"><NfeClassicModule /></div>
        </main>
      </div>
    </div>

    {simulationOpen && <div className="nfe-simulation-overlay" role="dialog" aria-modal="true" aria-label="Pré-visualização da NF-e">
      <div className="nfe-simulation-window">
        <header className="nfe-simulation-toolbar no-print"><div><span>MODO TESTE · SEVEN ERP 1.1.2</span><h2>Pré-visualização da NF-e</h2><p>Documento gerado pelo mesmo comando “Transmitir NF-e”, sem comunicação com a SEFAZ.</p></div><div className="nfe-simulation-actions"><button onClick={regenerateSimulation}>Gerar outra chave</button><button onClick={() => window.print()} disabled={!simulationDraft}>Imprimir / PDF</button><button className="close" onClick={() => setSimulationOpen(false)}>Fechar</button></div></header>
        <div className="nfe-simulation-stage">
          {!simulationDraft ? <div className="nfe-simulation-empty"><b>Não foi possível montar a prévia</b><span>Salve a NF-e e clique novamente em transmitir.</span></div> : <div className={`nfe-simulation-paper ${summary.logoDataUrl ? "has-logo" : ""}`} style={summary.logoDataUrl ? ({ "--nfe-company-logo": `url("${summary.logoDataUrl}")` } as any) : undefined}><NfeDanfeReferencePreview draft={simulationDraft} company={previewCompany} snapshot={simulationPayload || undefined} /></div>}
        </div>
      </div>
    </div>}
  </div>;
}
