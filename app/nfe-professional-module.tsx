"use client";

import { useEffect, useMemo, useState } from "react";
import NfeClassicModule from "./nfe-classic-module";

type AnyRow = Record<string, any>;
type Summary = {
  environment: string; blockers: string[]; transmissionEnabled: boolean; certificateReady: boolean;
  series: string; nextNumber: string; drafts: AnyRow[]; companyName: string; companyTaxId: string; companyCity: string;
};
type StepHint = { id: string; label: string; icon: string; match: string[]; selector?: string };

const emptySummary: Summary = {
  environment: "homologation", blockers: [], transmissionEnabled: false, certificateReady: false,
  series: "—", nextNumber: "—", drafts: [], companyName: "Estabelecimento não identificado", companyTaxId: "—", companyCity: "—",
};
const stepHints: StepHint[] = [
  { id: "identificacao", label: "Identificação", icon: "01", match: ["identifica", "operação", "operacao"] },
  { id: "destinatario", label: "Destinatário", icon: "02", match: ["destinat", "cliente"] },
  { id: "itens", label: "Produtos e serviços", icon: "03", match: ["produto", "itens", "serviço", "servico"] },
  { id: "tributacao", label: "Tributação dos itens", icon: "04", match: ["tribut", "imposto", "icms"], selector: ".classic-tax-panel" },
  { id: "totais", label: "Totais e adicionais", icon: "05", match: ["totais", "adicionais"] },
  { id: "revisao", label: "Revisar e transmitir", icon: "06", match: ["revis"], selector: ".nfe-classic-footer-actions" },
];

function statusOf(row: AnyRow) { return String(row.transmissionStatus || row.transmission?.status || "draft"); }
function cnpj(value: unknown) {
  const v = String(value || "").replace(/\D/g, "");
  return v.length === 14 ? v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : String(value || "—");
}

export default function NfeProfessionalModule() {
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [loading, setLoading] = useState(true);
  const [activeStep, setActiveStep] = useState("identificacao");

  const refreshSummary = async () => {
    setLoading(true);
    try {
      const [draftResponse, companyResponse] = await Promise.all([fetch("/api/nfe-drafts"), fetch("/api/company")]);
      const [draftData, companyData] = await Promise.all([
        draftResponse.json().catch(() => ({})), companyResponse.json().catch(() => ({})),
      ]);
      let certificateReady = false;
      const bridge = (window as any).sevenDesktop;
      if (bridge?.integrationSecretsStatus) {
        const secret = await bridge.integrationSecretsStatus("nfe_sefaz").catch(() => null);
        certificateReady = Boolean(secret?.certificateId);
      }
      const readiness = draftData?.readiness || {};
      const company = companyData?.company || {};
      setSummary({
        environment: readiness.environment || "homologation",
        blockers: Array.isArray(readiness.blockers) ? readiness.blockers : [],
        transmissionEnabled: Boolean(readiness.transmissionEnabled), certificateReady,
        series: String(company.nfeSeries || "—"), nextNumber: String(company.nfeNextNumber || "—"),
        drafts: Array.isArray(draftData?.drafts) ? draftData.drafts : [],
        companyName: String(company.tradeName || company.legalName || "Estabelecimento não identificado"),
        companyTaxId: cnpj(company.taxId), companyCity: [company.city, company.state].filter(Boolean).join("/") || "—",
      });
    } catch { setSummary(emptySummary); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    void refreshSummary();
    const handler = () => void refreshSummary();
    window.addEventListener("seven:nfe-updated", handler);
    window.addEventListener("seven:company-updated", handler);
    return () => {
      window.removeEventListener("seven:nfe-updated", handler);
      window.removeEventListener("seven:company-updated", handler);
    };
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
    setActiveStep(step.id);
    const root = document.querySelector(".nfe-professional-module .nfe-classic-workspace");
    if (!root) return;
    let target: HTMLElement | null = null;
    if (step.selector) target = root.querySelector<HTMLElement>(step.selector);
    if (!target) {
      const headings = Array.from(root.querySelectorAll<HTMLElement>(".classic-section h2"));
      target = headings.find((heading) => {
        const value = (heading.textContent || "").toLowerCase();
        return step.match.some((pattern) => value.includes(pattern));
      })?.closest<HTMLElement>(".classic-section") || null;
    }
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const openNewInvoice = () => {
    const button = document.querySelector<HTMLButtonElement>(
      ".nfe-pro-editor-surface .nfe-classic-list-head .classic-button.primary, .nfe-pro-editor-surface .nfe-classic-heading .classic-button.primary",
    );
    button?.click();
    setActiveStep("identificacao");
    window.setTimeout(() => scrollToStep(stepHints[0]), 80);
  };

  return <div className="nfe-professional-module">
    <div className="nfe-pro-app">
      <header className="nfe-pro-topbar">
        <div className="nfe-pro-brand">
          <div className="nfe-pro-brand-mark">NF</div>
          <div className="nfe-pro-brand-copy">
            <span>Seven ERP 1.1.0 · Fiscal</span>
            <strong>Emissão de NF-e</strong>
            <small>Modelo 55 · validação, assinatura, SEFAZ, eventos e DANFE no mesmo fluxo</small>
          </div>
        </div>
        <div className="nfe-pro-top-actions">
          <div className={`nfe-pro-chip ${environmentClass}`}><i />{environmentLabel}</div>
          <div className="nfe-pro-chip"><i />Série {summary.series} · Próx. {summary.nextNumber}</div>
          <button type="button" className="nfe-pro-top-button" onClick={() => void refreshSummary()}>Atualizar</button>
          <button type="button" className="nfe-pro-top-button primary" onClick={openNewInvoice}>+ Nova NF-e</button>
        </div>
      </header>

      <div className="nfe-pro-body">
        <aside className="nfe-pro-sidebar">
          <span className="nfe-pro-side-label">Estabelecimento</span>
          <div className="nfe-pro-establishment-card">
            <div className="icon">🏢</div>
            <b>{summary.companyName}</b>
            <small>{summary.companyTaxId}<br />{summary.companyCity}</small>
            <em>EMITENTE ATIVO</em>
          </div>

          <span className="nfe-pro-side-label">Preenchimento da nota</span>
          <nav className="nfe-pro-side-nav" aria-label="Etapas da NF-e">
            {stepHints.map((step) => <button type="button" key={step.id} className={activeStep === step.id ? "active" : ""} onClick={() => scrollToStep(step)}>
              <b>{step.icon}</b><span>{step.label}</span><i>›</i>
            </button>)}
          </nav>

          <div className="nfe-pro-side-status">
            <span className="nfe-pro-side-label">Status fiscal</span>
            <div className="status-row"><i className={`dot ${summary.certificateReady ? "ok" : "warn"}`} /><span><b>Certificado A1</b>{summary.certificateReady ? "Configurado" : "Pendente"}</span></div>
            <div className="status-row"><i className={`dot ${summary.transmissionEnabled ? "ok" : "warn"}`} /><span><b>Integração SEFAZ</b>{summary.transmissionEnabled ? "Disponível" : "Requer atenção"}</span></div>
            <div className="status-row"><i className={`dot ${ready ? "ok" : "warn"}`} /><span><b>Emissão</b>{ready ? "Pronta para transmitir" : "Há pendências"}</span></div>
          </div>
        </aside>

        <main className="nfe-pro-main">
          <div className="nfe-pro-commandbar">
            <div className="nfe-pro-command-title">
              <strong>Central de notas fiscais</strong>
              <small>Preencha somente o necessário; os campos fiscais e validações continuam sendo tratados pelo motor NF-e existente.</small>
            </div>
            <div className="nfe-pro-command-meta">
              <div className="nfe-pro-mini-stat"><span>Certificado</span><b className={summary.certificateReady ? "ok" : "warn"}>{summary.certificateReady ? "A1 OK" : "Pendente"}</b></div>
              <div className="nfe-pro-mini-stat"><span>Autorizadas</span><b>{stats.authorized}</b></div>
              <div className="nfe-pro-mini-stat"><span>Pendentes</span><b className={stats.pending ? "warn" : ""}>{stats.pending}</b></div>
              <div className="nfe-pro-mini-stat"><span>Rejeitadas</span><b className={stats.rejected ? "danger" : ""}>{stats.rejected}</b></div>
            </div>
          </div>

          <div className={`nfe-pro-readiness-modern ${ready ? "ready" : "blocked"}`}>
            <div className="state"><span>{ready ? "✓" : "!"}</span><div>
              <b>{ready ? "Ambiente fiscal pronto para transmissão" : "Antes de transmitir, revise a configuração fiscal"}</b>
              <small>{loading ? "Atualizando diagnóstico..." : summary.blockers[0] || (summary.certificateReady ? "Serviços fiscais disponíveis para o estabelecimento ativo." : "Configure o certificado digital A1 para habilitar a transmissão.")}</small>
            </div></div>
            <button type="button" onClick={() => void refreshSummary()}>Revalidar ambiente</button>
          </div>

          <div className="nfe-pro-editor-surface"><NfeClassicModule /></div>
        </main>
      </div>
    </div>
  </div>;
}
