"use client";

import { useEffect, useMemo, useState } from "react";
import NfeClassicModule from "./nfe-classic-module";

type AnyRow = Record<string, any>;

type Summary = {
  environment: string;
  blockers: string[];
  transmissionEnabled: boolean;
  certificateReady: boolean;
  series: string;
  nextNumber: string;
  drafts: AnyRow[];
};

const emptySummary: Summary = {
  environment: "homologation",
  blockers: [],
  transmissionEnabled: false,
  certificateReady: false,
  series: "—",
  nextNumber: "—",
  drafts: [],
};

const stepHints = [
  { id: "identificacao", label: "Identificação", icon: "01", match: ["identifica", "operação", "operacao"] },
  { id: "destinatario", label: "Destinatário", icon: "02", match: ["destinat", "cliente"] },
  { id: "itens", label: "Produtos / Serviços", icon: "03", match: ["produto", "itens", "serviço", "servico"] },
  { id: "tributacao", label: "Tributação", icon: "04", match: ["tribut", "imposto", "icms"] },
  { id: "transporte", label: "Transporte / Pagamento", icon: "05", match: ["transport", "pagamento", "totais"] },
  { id: "revisao", label: "Revisão e envio", icon: "06", match: ["observa", "adicionais", "revis"] },
];

function statusOf(row: AnyRow) {
  return String(row.transmissionStatus || row.transmission?.status || "draft");
}

export default function NfeProfessionalModule() {
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [loading, setLoading] = useState(true);

  const refreshSummary = async () => {
    setLoading(true);
    try {
      const [draftResponse, companyResponse] = await Promise.all([
        fetch("/api/nfe-drafts"),
        fetch("/api/company"),
      ]);
      const [draftData, companyData] = await Promise.all([
        draftResponse.json().catch(() => ({})),
        companyResponse.json().catch(() => ({})),
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
        transmissionEnabled: Boolean(readiness.transmissionEnabled),
        certificateReady,
        series: String(company.nfeSeries || "—"),
        nextNumber: String(company.nfeNextNumber || "—"),
        drafts: Array.isArray(draftData?.drafts) ? draftData.drafts : [],
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
    return () => window.removeEventListener("seven:nfe-updated", handler);
  }, []);

  const stats = useMemo(() => {
    const authorized = summary.drafts.filter((row) => statusOf(row) === "authorized").length;
    const rejected = summary.drafts.filter((row) => statusOf(row) === "rejected").length;
    const pending = summary.drafts.filter((row) => !["authorized", "cancelled"].includes(statusOf(row))).length;
    return { authorized, rejected, pending };
  }, [summary.drafts]);

  const scrollToStep = (patterns: string[]) => {
    const root = document.querySelector(".nfe-professional-module .nfe-classic-workspace");
    if (!root) return;
    const headings = Array.from(root.querySelectorAll<HTMLElement>(".classic-section h2"));
    const target = headings.find((heading) => {
      const value = (heading.textContent || "").toLowerCase();
      return patterns.some((pattern) => value.includes(pattern));
    })?.closest<HTMLElement>(".classic-section");
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const environmentLabel = summary.environment === "production" ? "Produção" : "Homologação";
  const environmentClass = summary.environment === "production" ? "production" : "homologation";

  return <div className="nfe-professional-module">
    <header className="nfe-pro-hero">
      <div className="nfe-pro-title">
        <span className="nfe-pro-eyebrow">SEVEN ERP 1.0.7 · FISCAL</span>
        <div className="nfe-pro-title-row"><h1>Emissão de NF-e</h1><span className={`nfe-pro-environment ${environmentClass}`}>{environmentLabel}</span></div>
        <p>Emissor modelo 55 com validação, assinatura, transmissão, consulta, eventos e DANFE integrado.</p>
      </div>
      <div className="nfe-pro-kpis">
        <div><span>Certificado A1</span><b className={summary.certificateReady ? "ok" : "warn"}>{summary.certificateReady ? "Configurado" : "Pendente"}</b></div>
        <div><span>Série / Próxima</span><b>{summary.series} / {summary.nextNumber}</b></div>
        <div><span>Autorizadas</span><b>{stats.authorized}</b></div>
        <div><span>Pendentes</span><b>{stats.pending}</b></div>
        <div><span>Rejeitadas</span><b className={stats.rejected ? "danger" : ""}>{stats.rejected}</b></div>
      </div>
    </header>

    <div className="nfe-pro-readiness">
      <div className={`nfe-pro-readiness-state ${summary.transmissionEnabled && summary.certificateReady ? "ready" : "blocked"}`}>
        <span>{summary.transmissionEnabled && summary.certificateReady ? "✓" : "!"}</span>
        <div><b>{summary.transmissionEnabled && summary.certificateReady ? "Pronto para transmissão" : "Configuração fiscal requer atenção"}</b><small>{loading ? "Atualizando status fiscal..." : summary.blockers[0] || (summary.certificateReady ? "Serviços fiscais disponíveis." : "Configure o certificado digital A1 antes de transmitir.")}</small></div>
      </div>
      <button type="button" onClick={() => void refreshSummary()}>↻ Atualizar diagnóstico</button>
    </div>

    <nav className="nfe-pro-steps" aria-label="Etapas da emissão de NF-e">
      {stepHints.map((step) => <button type="button" key={step.id} onClick={() => scrollToStep(step.match)}><b>{step.icon}</b><span>{step.label}</span></button>)}
    </nav>

    <div className="nfe-pro-editor-surface">
      <NfeClassicModule />
    </div>
  </div>;
}
