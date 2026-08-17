"use client";

import { useEffect, useState } from "react";
import SevenErpApp from "./seven-erp-app";
import ServiceOrdersModule from "./service-orders-module";
import IntegrationsModuleV2 from "./integrations-module-v2";
import "./erp-enhancements.css";

type EnhancedModule = "service" | "integrations" | null;

export default function SevenErpShell() {
  const [enhancedModule, setEnhancedModule] = useState<EnhancedModule>(null);

  useEffect(() => {
    const intercept = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest("button");
      if (!button) return;
      const label = (button.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();

      if (label.includes("integrações e ajustes")) {
        event.preventDefault();
        event.stopPropagation();
        setEnhancedModule("integrations");
        return;
      }
      if (label.includes("ordem de serviço") || label.includes("ordens de serviço")) {
        event.preventDefault();
        event.stopPropagation();
        setEnhancedModule("service");
        return;
      }

      if (enhancedModule && button.closest(".main-nav, .sidebar-footer")) setEnhancedModule(null);
    };

    document.addEventListener("click", intercept, true);
    return () => document.removeEventListener("click", intercept, true);
  }, [enhancedModule]);

  return <div className="seven-erp-shell">
    <SevenErpApp />
    {enhancedModule && <div className="seven-enhancement-overlay">
      {enhancedModule === "service"
        ? <ServiceOrdersModule onClose={() => setEnhancedModule(null)} />
        : <IntegrationsModuleV2 onClose={() => setEnhancedModule(null)} />}
    </div>}
  </div>;
}
