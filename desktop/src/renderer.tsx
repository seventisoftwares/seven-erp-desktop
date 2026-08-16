import React, { useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import SevenErpApp from "../../app/seven-erp-app";
import erpCss from "../../app/globals.css?raw";
import "./desktop.css";

const erpStyle = document.createElement("style");
erpStyle.textContent = erpCss.replace(/^@import\s+["']tailwindcss["'];?\s*/m, "");
document.head.appendChild(erpStyle);

const nativeFetch = window.fetch.bind(window);
if (window.sevenDesktop?.apiRequest) {
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (rawUrl.startsWith("/api/")) {
      const headers = new Headers(init?.headers);
      const body = typeof init?.body === "string" ? init.body : init?.body ? String(init.body) : null;
      const result = await window.sevenDesktop!.apiRequest!(rawUrl, {
        method: init?.method || "GET",
        headers: Object.fromEntries(headers.entries()),
        body,
      });
      return new Response(result.body, { status: result.status, headers: result.headers });
    }
    return nativeFetch(input, init);
  };
}

function PairingScreen({ status, onPaired }: { status: SevenDesktopStatus; onPaired: () => void }) {
  const [code, setCode] = useState("");
  const [deviceName, setDeviceName] = useState(status.deviceName || "Computador Seven TI");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true); setError("");
    try {
      if (!window.sevenDesktop?.pair) throw new Error("Integração desktop indisponível.");
      await window.sevenDesktop.pair({ code: code.replace(/[^A-Z0-9]/gi, "").toUpperCase(), deviceName: deviceName.trim() });
      onPaired();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível conectar este computador.");
    } finally { setSaving(false); }
  };

  return <main className="desktop-onboarding">
    <section className="desktop-pair-card">
      <aside><div className="desktop-brand"><span>S</span><div><strong>SEVEN</strong><b>ERP</b></div></div><div className="desktop-cloud-art"><i /><i /><i /><strong>Seven Cloud</strong><small>Seus dados disponíveis em todos os computadores autorizados.</small></div><ul><li><span>✓</span>Trabalho offline</li><li><span>✓</span>Sincronização automática</li><li><span>✓</span>Isolamento por empresa</li><li><span>✓</span>Auditoria de alterações</li></ul></aside>
      <form onSubmit={submit}><span className="desktop-step">CONFIGURAÇÃO INICIAL</span><h1>Conectar este computador</h1><p>No painel web do Seven ERP, acesse <b>Dispositivos e sincronização</b>, clique em <b>Autorizar computador</b> e informe o código abaixo.</p><label><span>Nome deste computador</span><input value={deviceName} onChange={(event) => setDeviceName(event.target.value)} required maxLength={80} placeholder="Ex.: Recepção – Matriz" /></label><label><span>Código de pareamento</span><input className="pair-code-input" value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))} required minLength={8} maxLength={8} placeholder="ABCD1234" autoFocus /></label>{error && <div className="desktop-pair-error">{error}</div>}<button disabled={saving || code.length !== 8}>{saving ? "Conectando..." : "Conectar ao Seven Cloud"}</button><footer><span><i />Conexão criptografada</span><small>O código expira em 15 minutos e funciona uma única vez.</small></footer></form>
    </section>
  </main>;
}

function DesktopApp() {
  const [status, setStatus] = useState<SevenDesktopStatus | null>(null);
  useEffect(() => {
    const bridge = window.sevenDesktop;
    if (!bridge) return;
    let active = true;
    bridge.getStatus().then((value) => active && setStatus(value));
    const unsubscribe = bridge.onStatus((value) => active && setStatus(value));
    return () => { active = false; unsubscribe(); };
  }, []);
  if (!status) return <div className="desktop-loading"><span>S</span><strong>Seven ERP</strong><small>Preparando ambiente seguro...</small></div>;
  if (!status.paired) return <PairingScreen status={status} onPaired={() => window.sevenDesktop!.getStatus().then(setStatus)} />;
  return <SevenErpApp />;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><DesktopApp /></React.StrictMode>);
