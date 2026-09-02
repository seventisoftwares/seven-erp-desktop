"use client";

import { useEffect, useState } from "react";
import SevenErpApp from "./seven-erp-app";
import ServiceOrdersModuleV6 from "./service-orders-module-v6";
import OsTemplateDesigner from "./os-template-designer";
import ProductsModule from "./products-module";
import IntegrationsModuleV7 from "./integrations-module-v7";
import DfeReceivedModule from "./dfe-received-module";
import MeshDevicesModule from "./mesh-devices-module";
import CompanyModule from "./company-module";
import NfeMirrorCenter from "./nfe-mirror-center";
import NfeClassicModule from "./nfe-classic-module";
import "./erp-enhancements.css";
import "./erp-professional.css";
import "./os-studio.css";
import "./catalog-studio.css";
import "./nfe-mirror.css";
import "./nfe-classic.css";
import "./nfe-classic-route.css";
import "./os-preview.css";

type EnhancedModule = "service" | "osDesigner" | "catalog" | "integrations" | "dfe" | "devices" | "company" | "nfe" | null;

export default function SevenErpShell() {
  const [enhancedModule, setEnhancedModule] = useState<EnhancedModule>(null);

  useEffect(() => {
    const intercept = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest("button");
      if (!button) return;

      if (button.closest(".seven-enhancement-overlay")) return;

      const label = (button.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      if (label.includes("emissão de nf-e") || label.includes("emissao de nf-e")) { event.preventDefault(); event.stopPropagation(); setEnhancedModule("nfe"); return; }
      if (label.includes("integrações e ajustes")) { event.preventDefault(); event.stopPropagation(); setEnhancedModule("integrations"); return; }
      if (label.includes("manifestação nf-e") || label.includes("manifestacao nf-e")) { event.preventDefault(); event.stopPropagation(); setEnhancedModule("dfe"); return; }
      if (label.includes("designer de os") || label.includes("modelos de os") || label.includes("modelos de ordem")) { event.preventDefault(); event.stopPropagation(); setEnhancedModule("osDesigner"); return; }
      if (label.includes("produtos e serviços") || label.includes("produtos e servicos")) { event.preventDefault(); event.stopPropagation(); setEnhancedModule("catalog"); return; }
      if (label.includes("ordem de serviço") || label.includes("ordens de serviço")) { event.preventDefault(); event.stopPropagation(); setEnhancedModule("service"); return; }
      if (label.includes("dispositivos e sincronização")) { event.preventDefault(); event.stopPropagation(); setEnhancedModule("devices"); return; }
      if (label.includes("cadastro da empresa")) { event.preventDefault(); event.stopPropagation(); setEnhancedModule("company"); return; }
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
    : enhancedModule === "catalog" ? "theme-catalog"
    : enhancedModule === "nfe" ? "theme-nfe-classic"
    : "";

  return <div className="seven-erp-shell">
    <SevenErpApp />
    <NfeMirrorCenter />
    {!enhancedModule && <button className="company-nav-shortcut" onClick={() => setEnhancedModule("company")}><span>🏢</span><div><strong>Cadastro da empresa</strong><small>Dados fiscais e cadastrais</small></div></button>}
    {enhancedModule && <div className={`seven-enhancement-overlay ${theme}`}>
      {enhancedModule === "service" ? <ServiceOrdersModuleV6 onClose={() => setEnhancedModule(null)} onOpenDesigner={() => setEnhancedModule("osDesigner")} onOpenCatalog={() => setEnhancedModule("catalog")} />
        : enhancedModule === "osDesigner" ? <OsTemplateDesigner onClose={() => setEnhancedModule("service")} />
        : enhancedModule === "catalog" ? <ProductsModule onClose={() => setEnhancedModule(null)} />
        : enhancedModule === "integrations" ? <IntegrationsModuleV7 onClose={() => setEnhancedModule(null)} />
        : enhancedModule === "dfe" ? <DfeReceivedModule onClose={() => setEnhancedModule(null)} />
        : enhancedModule === "company" ? <CompanyModule onClose={() => setEnhancedModule(null)} />
        : enhancedModule === "nfe" ? <div className="nfe-classic-real-shell"><div className="nfe-classic-real-banner"><div><strong>Emissor Clássico NF-e · v1.0.1</strong><span>Modelo 55 · clientes e produtos cadastrados · DANFE clássico · Build NFE-CLASSIC-REAL</span></div><button className="classic-button" onClick={() => setEnhancedModule(null)}>Fechar</button></div><NfeClassicModule /></div>
        : <MeshDevicesModule onClose={() => setEnhancedModule(null)} />}
    </div>}
  </div>;
}
