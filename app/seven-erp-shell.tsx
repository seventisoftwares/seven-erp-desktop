"use client";

import { useEffect, useState } from "react";
import SevenErpApp from "./seven-erp-app";
import ServiceOrdersModuleV6 from "./service-orders-module-v6";
import OsTemplateDesigner from "./os-template-designer";
import DocumentTemplateDesigner from "./document-template-designer";
import FiscalSettingsModule from "./fiscal-settings-module";
import ProductsModuleV2 from "./products-module-v2";
import IntegrationsModuleV7 from "./integrations-module-v7";
import DfeReceivedModule from "./dfe-received-module";
import MeshDevicesModule from "./mesh-devices-module";
import CompanyEstablishmentsModule from "./company-establishments-module";
import NfeMirrorCenter from "./nfe-mirror-center-v2";
import NfeIndividualMirrorActions from "./nfe-individual-mirror-actions";
import NfeProfessionalModule from "./nfe-professional-module";
import "./erp-enhancements.css";
import "./erp-professional.css";
import "./os-studio.css";
import "./catalog-studio.css";
import "./catalog-vehicle.css";
import "./nfe-mirror.css";
import "./nfe-sefaz-mirror.css";
import "./nfe-danfe-preview-v3.css";
import "./nfe-danfe-reference-preview.css";
import "./nfe-danfe-reference-fit.css";
import "./nfe-classic.css";
import "./nfe-classic-route.css";
import "./os-preview.css";
import "./platform-shortcuts.css";
import "./nfe-polish-v1.0.7.css";
import "./company-establishments.css";

type EnhancedModule = "service" | "osDesigner" | "documents" | "fiscalSettings" | "catalog" | "integrations" | "dfe" | "devices" | "company" | "nfe" | null;

export default function SevenErpShell() {
  const [enhancedModule, setEnhancedModule] = useState<EnhancedModule>(null);

  useEffect(() => {
    const intercept = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest("button");
      if (!button) return;
      if (button.closest(".seven-enhancement-overlay") || button.closest(".seven-platform-ribbon")) return;
      const label = (button.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      if (label.includes("modelos de documentos") || label.includes("designer de documentos")) { event.preventDefault(); event.stopPropagation(); setEnhancedModule("documents"); return; }
      if (label.includes("configurações nf-e") || label.includes("configuracoes nf-e") || label.includes("configurações nfce") || label.includes("configuracoes nfce") || label.includes("configurações nfs-e") || label.includes("configuracoes nfs-e") || label.includes("configurações fiscais") || label.includes("configuracoes fiscais") || label === "danfe") { event.preventDefault(); event.stopPropagation(); setEnhancedModule("fiscalSettings"); return; }
      if (label.includes("emissão de nf-e") || label.includes("emissao de nf-e")) { event.preventDefault(); event.stopPropagation(); setEnhancedModule("nfe"); return; }
      if (label.includes("integrações e ajustes")) { event.preventDefault(); event.stopPropagation(); setEnhancedModule("integrations"); return; }
      if (label.includes("manifestação nf-e") || label.includes("manifestacao nf-e")) { event.preventDefault(); event.stopPropagation(); setEnhancedModule("dfe"); return; }
      if (label.includes("designer de os") || label.includes("modelos de os") || label.includes("modelos de ordem")) { event.preventDefault(); event.stopPropagation(); setEnhancedModule("osDesigner"); return; }
      if (label.includes("produtos e serviços") || label.includes("produtos e servicos")) { event.preventDefault(); event.stopPropagation(); setEnhancedModule("catalog"); return; }
      if (label.includes("ordem de serviço") || label.includes("ordens de serviço")) { event.preventDefault(); event.stopPropagation(); setEnhancedModule("service"); return; }
      if (label.includes("dispositivos e sincronização")) { event.preventDefault(); event.stopPropagation(); setEnhancedModule("devices"); return; }
      if (label.includes("cadastro da empresa") || label.includes("empresa e filiais") || label.includes("filiais")) { event.preventDefault(); event.stopPropagation(); setEnhancedModule("company"); return; }
      if (enhancedModule && button.closest(".main-nav, .sidebar-footer")) setEnhancedModule(null);
    };
    document.addEventListener("click", intercept, true);
    return () => document.removeEventListener("click", intercept, true);
  }, [enhancedModule]);

  const theme = enhancedModule === "integrations" ? "theme-integrations"
    : enhancedModule === "company" ? "theme-company"
    : enhancedModule === "dfe" ? "theme-dfe"
    : enhancedModule === "devices" ? "theme-devices"
    : enhancedModule === "service" ? "theme-service"
    : enhancedModule === "osDesigner" ? "theme-os-studio"
    : enhancedModule === "documents" ? "theme-document-studio"
    : enhancedModule === "fiscalSettings" ? "theme-fiscal-settings"
    : enhancedModule === "catalog" ? "theme-catalog"
    : enhancedModule === "nfe" ? "theme-nfe-classic"
    : "";

  return <div className="seven-erp-shell">
    <SevenErpApp />
    <NfeMirrorCenter />
    <NfeIndividualMirrorActions />
    <div className="seven-platform-ribbon no-print" role="navigation" aria-label="Módulos profissionais Seven ERP 1.0.8">
      <div className="seven-platform-build"><strong>Seven ERP 1.0.8</strong><span>NF-e FULL A4 · EMPRESA + FILIAIS</span></div>
      <button onClick={() => setEnhancedModule("company")}><b>🏢</b><span>Empresa / Filiais</span></button>
      <button onClick={() => setEnhancedModule("documents")}><b>▤</b><span>Modelos</span></button>
      <button onClick={() => setEnhancedModule("fiscalSettings")}><b>⚙</b><span>Fiscal</span></button>
      <button onClick={() => setEnhancedModule("nfe")}><b>NF</b><span>Emissor NF-e</span></button>
      <button onClick={() => setEnhancedModule("catalog")}><b>▦</b><span>Produtos / Veículos</span></button>
      <button onClick={() => setEnhancedModule("service")}><b>OS</b><span>Ordens de Serviço</span></button>
    </div>
    {enhancedModule && <div className={`seven-enhancement-overlay ${theme}`}>
      {enhancedModule === "service" ? <ServiceOrdersModuleV6 onClose={() => setEnhancedModule(null)} onOpenDesigner={() => setEnhancedModule("documents")} onOpenCatalog={() => setEnhancedModule("catalog")} />
        : enhancedModule === "osDesigner" ? <OsTemplateDesigner onClose={() => setEnhancedModule("service")} />
        : enhancedModule === "documents" ? <DocumentTemplateDesigner onClose={() => setEnhancedModule(null)} />
        : enhancedModule === "fiscalSettings" ? <FiscalSettingsModule onClose={() => setEnhancedModule(null)} />
        : enhancedModule === "catalog" ? <ProductsModuleV2 onClose={() => setEnhancedModule(null)} />
        : enhancedModule === "integrations" ? <IntegrationsModuleV7 onClose={() => setEnhancedModule(null)} />
        : enhancedModule === "dfe" ? <DfeReceivedModule onClose={() => setEnhancedModule(null)} />
        : enhancedModule === "company" ? <CompanyEstablishmentsModule onClose={() => setEnhancedModule(null)} />
        : enhancedModule === "nfe" ? <div className="nfe-classic-real-shell"><div className="nfe-classic-real-banner"><div><strong>Emissor NF-e Profissional · Seven ERP 1.0.8</strong><span>Modelo 55 · estabelecimento ativo · diagnóstico fiscal · DANFE A4 preenchido · XML autorizado preservado</span></div><button className="classic-button" onClick={() => setEnhancedModule(null)}>Fechar</button></div><NfeProfessionalModule /></div>
        : <MeshDevicesModule onClose={() => setEnhancedModule(null)} />}
    </div>}
  </div>;
}
