"use client";

import { useEffect, useState, type FormEvent } from "react";

type MeshStatus = {
  storageMode?: string; syncMode?: string; workspaceName?: string | null; peers?: number; reachablePeers?: number;
  lastSyncAt?: string | null; localAddresses?: string[]; listenPort?: number | null;
};
type Device = { id: string; name: string; platform?: string; status?: string; lastSeenAt?: string | null; url?: string | null };

function dateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString("pt-BR") : "Ainda não sincronizado";
}

export default function MeshDevicesModule({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<MeshStatus>({});
  const [devices, setDevices] = useState<Device[]>([]);
  const [pairing, setPairing] = useState<{ code: string; expiresAt: string } | null>(null);
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const bridge = window.sevenDesktop as any;

  const load = async () => {
    setLoading(true); setError("");
    try {
      const [statusResponse, devicesResponse] = await Promise.all([fetch("/api/sync/status"), fetch("/api/sync/pairing")]);
      const statusData = await statusResponse.json();
      const devicesData = await devicesResponse.json();
      if (!statusResponse.ok) throw new Error(statusData.error || "Não foi possível consultar o Seven Mesh.");
      if (!devicesResponse.ok) throw new Error(devicesData.error || "Não foi possível consultar os computadores.");
      setStatus(statusData); setDevices(devicesData.devices || []);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Falha ao carregar o Seven Mesh."); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const generateCode = async () => {
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/sync/pairing", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível gerar o código.");
      setPairing(data);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Falha ao gerar código."); }
    finally { setSaving(false); }
  };

  const addRemote = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true); setError(""); setNotice("");
    try {
      if (!bridge?.meshAddPeer) throw new Error("Controle Seven Mesh indisponível.");
      const peer = await bridge.meshAddPeer(address.trim());
      setAddress(""); setNotice(`Computador ${peer?.name || "remoto"} adicionado e sincronizado.`); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível adicionar o computador remoto."); }
    finally { setSaving(false); }
  };

  const syncNow = async () => {
    setSaving(true); setError(""); setNotice("");
    try {
      if (!bridge?.meshSync) throw new Error("Controle Seven Mesh indisponível.");
      await bridge.meshSync(); setNotice("Sincronização direta executada."); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Falha ao sincronizar peers."); }
    finally { setSaving(false); }
  };

  const remove = async (deviceId: string) => {
    if (!window.confirm("Remover este computador da lista de peers?")) return;
    const response = await fetch("/api/sync/pairing", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ deviceId }) });
    const data = await response.json();
    if (!response.ok) return setError(data.error || "Não foi possível remover o computador.");
    await load();
  };

  return <div className="enhanced-module mesh-devices-v2">
    <header className="enhanced-header">
      <div><span className="enhanced-kicker">Administração · local-first</span><h1>Dispositivos e sincronização</h1><p>Sincronização direta entre computadores Seven ERP, sem depender do servidor web do ChatGPT.</p></div>
      <div className="enhanced-actions"><button className="enhanced-secondary" onClick={onClose}>Voltar ao ERP</button><button className="enhanced-secondary" disabled={saving} onClick={() => void syncNow()}>Sincronizar agora</button><button className="enhanced-primary" disabled={saving} onClick={() => void generateCode()}>+ Autorizar computador</button></div>
    </header>

    <div className="core-independence-banner"><strong>Seven Mesh</strong><span>Cada computador mantém uma cópia local dos dados. Se outro computador estiver desligado ou sem rede, ambos continuam trabalhando e reconciliam as alterações quando voltarem a se encontrar.</span></div>
    {error && <div className="enhanced-alert error">{error}</div>}
    {notice && <div className="enhanced-alert success">{notice}</div>}

    <section className="enhanced-metrics">
      <article><span>Armazenamento</span><strong>Local</strong><small>Dados no próprio computador</small></article>
      <article><span>Computadores</span><strong>{loading ? "—" : devices.length}</strong><small>Peers conhecidos</small></article>
      <article><span>Online agora</span><strong>{loading ? "—" : status.reachablePeers || 0}</strong><small>Peers alcançáveis diretamente</small></article>
      <article><span>Última sincronização</span><strong>{status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—"}</strong><small>{dateTime(status.lastSyncAt)}</small></article>
    </section>

    <section className="enhanced-panel">
      <div className="enhanced-toolbar"><div><h2>Este computador</h2><p>Porta Seven Mesh: {status.listenPort || "—"}</p></div><button onClick={() => void load()}>Atualizar</button></div>
      <div className="mesh-address-list">
        {(status.localAddresses || []).length ? (status.localAddresses || []).map((item) => <span key={item}>{item}</span>) : <span>Nenhum endereço LAN detectado</span>}
      </div>
      <p className="mesh-helper">Na mesma rede, o pareamento é automático por descoberta local. Para filial, home office ou outra Internet, use um endereço alcançável por VPN/WireGuard/Tailscale ou uma rota direta entre as redes.</p>
    </section>

    <section className="enhanced-panel">
      <div className="enhanced-toolbar"><div><h2>Computadores conhecidos</h2><p>{devices.length} peer(s) salvos neste ambiente</p></div></div>
      {loading ? <div className="enhanced-empty">Carregando peers...</div> : devices.length ? <div className="service-table-wrap"><table className="enhanced-table"><thead><tr><th>Computador</th><th>Conexão</th><th>Status</th><th>Último contato</th><th></th></tr></thead><tbody>{devices.map((device) => <tr key={device.id}><td><strong>{device.name}</strong><small>{device.id.slice(0, 12)}</small></td><td><strong>{device.platform || "Seven Mesh"}</strong><small>{device.url || "Descoberta automática"}</small></td><td><span className={`integration-state ${device.status === "active" ? "active" : "off"}`}>{device.status === "active" ? "Conhecido" : "Offline"}</span></td><td>{dateTime(device.lastSeenAt)}</td><td><button onClick={() => void remove(device.id)}>Remover</button></td></tr>)}</tbody></table></div> : <div className="enhanced-empty"><strong>Nenhum outro computador conectado</strong><span>Gere um código de pareamento e use-o no segundo Seven ERP.</span></div>}
    </section>

    <section className="enhanced-panel">
      <div className="enhanced-toolbar"><div><h2>Adicionar computador remoto</h2><p>Para máquinas fora da mesma rede local</p></div></div>
      <form className="mesh-remote-form" onSubmit={addRemote}><label><span>IP, hostname ou endereço VPN</span><input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Ex.: 100.64.0.20 ou filial-seven.local" required /></label><button className="enhanced-primary" disabled={saving}>{saving ? "Conectando..." : "Adicionar e sincronizar"}</button></form>
    </section>

    {pairing && <div className="enhanced-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setPairing(null)}><section className="enhanced-modal pairing-mesh-modal"><div className="enhanced-modal-title"><div><span>SEVEN MESH</span><h2>Autorizar novo computador</h2></div><button onClick={() => setPairing(null)}>×</button></div><div className="mesh-pairing-code"><span>Digite este código no outro Seven ERP</span><strong>{pairing.code.match(/.{1,4}/g)?.join(" – ")}</strong><p>Válido até {new Date(pairing.expiresAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}. Na mesma LAN, não é necessário informar IP.</p><button className="enhanced-secondary" onClick={() => navigator.clipboard.writeText(pairing.code)}>Copiar código</button></div></section></div>}
  </div>;
}
