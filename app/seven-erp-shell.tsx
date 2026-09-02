"use client";

import { useEffect, useState } from "react";
import SevenErpApp from "./seven-erp-app";
import ServiceOrdersModuleV5 from "./service-orders-module-v5";
import OsTemplateDesigner from "./os-template-designer";
import ProductsModule from "./products-module";
import IntegrationsModuleV7 from "./integrations-module-v7";
import DfeReceivedModule from "./dfe-received-module";
import MeshDevicesModule from "./mesh-devices-module";
import CompanyModule from "./company-module";
import NfeMirrorCenter from "./nfe-mirror-center";
import "./erp-enhancements.css";
import "./erp-professional.css";
import "./os-studio.css";
import "./catalog-studio.css";
import "./nfe-mirror.css";

type EnhancedModule = "service" | "osDesigner" | "catalog" | "integrations" | "dfe" | "devices" | "company" | null;

export default function SevenErpShell() {
  const [enhancedModule, setEnhancedModule] = useState<EnhancedModule>(null);

  useEffect(() => {
    const intercept = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest("button");
      if (!button) return;

      // Botões dentro dos módulos aprimorados pertencem ao próprio módulo.
      // Antes desta proteção, o submit "Abrir Ordem de Serviço" era capturado
      // pelo roteador global e o formulário nunca era enviado.
      if (button.closest(".seven-enhancement-overlay")) return;

      const label = (button.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
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
    : "";

  return <div className="seven-erp-shell">
    <SevenErpApp />
    <NfeMirrorCenter />
    {!enhancedModule && <button className="company-nav-shortcut" onClick={() => setEnhancedModule("company")}><span>🏢</span><div><strong>Cadastro da empresa</strong><small>Dados fiscais e cadastrais</small></div></button>}
    {enhancedModule && <div className={`seven-enhancement-overlay ${theme}`}>
      {enhancedModule === "service" ? <ServiceOrdersModuleV5 onClose={() => setEnhancedModule(null)} onOpenDesigner={() => setEnhancedModule("osDesigner")} onOpenCatalog={() => setEnhancedModule("catalog")} />
        : enhancedModule === "osDesigner" ? <OsTemplateDesigner onClose={() => setEnhancedModule("service")} />
        : enhancedModule === "catalog" ? <ProductsModule onClose={() => setEnhancedModule(null)} />
        : enhancedModule === "integrations" ? <IntegrationsModuleV7 onClose={() => setEnhancedModule(null)} />
        : enhancedModule === "dfe" ? <DfeReceivedModule onClose={() => setEnhancedModule(null)} />
        : enhancedModule === "company" ? <CompanyModule onClose={() => setEnhancedModule(null)} />
        : <MeshDevicesModule onClose={() => setEnhancedModule(null)} />}
    </div>}
  </div>;
}
