"use client";

import { useEffect, useState } from "react";
import SevenErpApp from "./seven-erp-app";
import ServiceOrdersModuleV3 from "./service-orders-module-v3";
import IntegrationsModuleV3 from "./integrations-module-v3";
import MeshDevicesModule from "./mesh-devices-module";
import CompanyModule from "./company-module";
import "./erp-enhancements.css";

type EnhancedModule = "service" | "integrations" | "devices" | "company" | null;

export default function SevenErpShell() {
  const [enhancedModule, setEnhancedModule] = useState<EnhancedModule>(null);

  useEffect(() => {
    const intercept = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest("button");
      if (!button) return;
      const label = (button.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      if (label.includes("integrações e ajustes")) { event.preventDefault(); event.stopPropagation(); setEnhancedModule("integrations"); return; }
      if (label.includes("ordem de serviço") || label.includes("ordens de serviço")) { event.preventDefault(); event.stopPropagation(); setEnhancedModule("service"); return; }
      if (label.includes("dispositivos e sincronização")) { event.preventDefault(); event.stopPropagation(); setEnhancedModule("devices"); return; }
      if (label.includes("cadastro da empresa")) { event.preventDefault(); event.stopPropagation(); setEnhancedModule("company"); return; }
      if (enhancedModule && button.closest(".main-nav, .sidebar-footer")) setEnhancedModule(null);
    };
    document.addEventListener("click", intercept, true);
    return () => document.removeEventListener("click", intercept, true);
  }, [enhancedModule]);

  return <div className="seven-erp-shell">
    <SevenErpApp />
    {!enhancedModule && <button className="company-nav-shortcut" onClick={() => setEnhancedModule("company")}><span>🏢</span><div><strong>Cadastro da empresa</strong><small>Dados fiscais e cadastrais</small></div></button>}
    {enhancedModule && <div className="seven-enhancement-overlay">
      {enhancedModule === "service" ? <ServiceOrdersModuleV3 onClose={() => setEnhancedModule(null)} />
        : enhancedModule === "integrations" ? <IntegrationsModuleV3 onClose={() => setEnhancedModule(null)} />
        : enhancedModule === "company" ? <CompanyModule onClose={() => setEnhancedModule(null)} />
        : <MeshDevicesModule onClose={() => setEnhancedModule(null)} />}
    </div>}
  </div>;
}
