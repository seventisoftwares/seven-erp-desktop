import React, { useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import SevenErpShell from "../../app/seven-erp-shell";
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
  const [mode, setMode] = useState<"choose" | "create" | "join">("choose");
  const [code, setCode] = useState("");
  const [deviceName, setDeviceName] = useState(status.deviceName || "Computador Seven TI");
  const [companyName, setCompanyName] = useState("Minha empresa");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const bridge = window.sevenDesktop as any;

  const createEnvironment = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true); setError("");
    try {
      if (!bridge?.createWorkspace) throw new Error("Módulo Seven Mesh indisponível.");
      await bridge.createWorkspace({ name: companyName.trim(), deviceName: deviceName.trim() });
      onPaired();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível criar o ambiente local.");
    } finally { setSaving(false); }
  };

  const joinEnvironment = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true); setError("");
    try {
      if (!bridge?.pair) throw new Error("Módulo Seven Mesh indisponível.");
      await bridge.pair({
        code: code.replace(/[^A-Z0-9]/gi, "").toUpperCase(),
        deviceName: deviceName.trim(),
        address: address.trim(),
      });
      onPaired();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível conectar este computador.");
    } finally { setSaving(false); }
  };

  return <main className="desktop-onboarding">
    <section className="desktop-pair-card">
      <aside>
        <div className="desktop-brand"><span>S</span><div><strong>SEVEN</strong><b>ERP</b></div></div>
        <div className="desktop-cloud-art"><i /><i /><i /><strong>Seven Mesh</strong><small>Dados locais em cada computador, sincronizados diretamente entre os desktops.</small></div>
        <ul>
          <li><span>✓</span>Funciona sem servidor web</li>
          <li><span>✓</span>Banco local em cada computador</li>
          <li><span>✓</span>Sincronização direta na rede</li>
          <li><span>✓</span>Filiais via IP/VPN</li>
        </ul>
      </aside>

      {mode === "choose" && <div className="desktop-mesh-choice">
        <span className="desktop-step">CONFIGURAÇÃO INICIAL</span>
        <h1>Como este computador será usado?</h1>
        <p>O Seven ERP agora é local-first. Você pode iniciar uma empresa neste computador ou conectá-lo a outro Seven ERP já configurado.</p>
        <label><span>Nome deste computador</span><input value={deviceName} onChange={(event) => setDeviceName(event.target.value)} required maxLength={80} placeholder="Ex.: Recepção – Matriz" /></label>
        <button onClick={() => { setMode("create"); setError(""); }}>Criar ambiente neste computador</button>
        <button className="desktop-secondary-button" onClick={() => { setMode("join"); setError(""); }}>Conectar a outro computador</button>
        <footer><span><i />Sem dependência do servidor do ChatGPT</span><small>Os dados permanecem no desktop mesmo sem internet.</small></footer>
      </div>}

      {mode === "create" && <form onSubmit={createEnvironment}>
        <span className="desktop-step">NOVO AMBIENTE LOCAL</span><h1>Criar Seven Mesh</h1>
        <p>Este computador será o primeiro nó da empresa. Depois, gere códigos em <b>Dispositivos e sincronização</b> para adicionar outras máquinas.</p>
        <label><span>Empresa / ambiente</span><input value={companyName} onChange={(event) => setCompanyName(event.target.value)} required maxLength={120} /></label>
        <label><span>Nome deste computador</span><input value={deviceName} onChange={(event) => setDeviceName(event.target.value)} required maxLength={80} /></label>
        {error && <div className="desktop-pair-error">{error}</div>}
        <button disabled={saving}>{saving ? "Criando..." : "Criar ambiente local"}</button>
        <button type="button" className="desktop-secondary-button" onClick={() => setMode("choose")}>Voltar</button>
        <footer><span><i />Chave protegida pelo sistema</span><small>O ambiente é criado localmente neste computador.</small></footer>
      </form>}

      {mode === "join" && <form onSubmit={joinEnvironment}>
        <span className="desktop-step">CONECTAR A OUTRO DESKTOP</span><h1>Entrar no Seven Mesh</h1>
        <p>No computador já configurado, abra <b>Dispositivos e sincronização</b> e gere um código. Na mesma rede, o Seven ERP encontra o computador automaticamente.</p>
        <label><span>Nome deste computador</span><input value={deviceName} onChange={(event) => setDeviceName(event.target.value)} required maxLength={80} /></label>
        <label><span>Código de pareamento</span><input className="pair-code-input" value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))} required minLength={8} maxLength={8} placeholder="ABCD1234" autoFocus /></label>
        <label><span>IP/VPN do computador principal (opcional)</span><input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Ex.: 192.168.1.20 ou 100.64.0.10" /><small>Deixe vazio se os dois computadores estiverem na mesma rede local.</small></label>
        {error && <div className="desktop-pair-error">{error}</div>}
        <button disabled={saving || code.length !== 8}>{saving ? "Conectando..." : "Conectar diretamente"}</button>
        <button type="button" className="desktop-secondary-button" onClick={() => setMode("choose")}>Voltar</button>
        <footer><span><i />Pareamento direto</span><small>O código expira em 15 minutos e funciona uma única vez.</small></footer>
      </form>}
    </section>
  </main>;
}

function DesktopApp() {
  const [status, setStatus] = useState<SevenDesktopStatus | null>(null);
  const [startupError, setStartupError] = useState("");
  useEffect(() => {
    const bridge = window.sevenDesktop;
    if (!bridge) {
      setStartupError("A integração segura do aplicativo não foi carregada. Reinstale a versão mais recente do Seven ERP.");
      return;
    }
    let active = true;
    bridge.getStatus()
      .then((value) => active && setStatus(value))
      .catch((error) => active && setStartupError(error instanceof Error ? error.message : "Falha ao preparar o ambiente local."));
    const unsubscribe = bridge.onStatus((value) => active && setStatus(value));
    return () => { active = false; unsubscribe(); };
  }, []);
  if (startupError) return <div className="desktop-loading"><span>!</span><strong>Seven ERP</strong><small>{startupError}</small></div>;
  if (!status) return <div className="desktop-loading"><span>S</span><strong>Seven ERP</strong><small>Preparando banco local e Seven Mesh...</small></div>;
  if (!status.paired) return <PairingScreen status={status} onPaired={() => window.sevenDesktop!.getStatus().then(setStatus)} />;
  return <SevenErpShell />;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><DesktopApp /></React.StrictMode>);
