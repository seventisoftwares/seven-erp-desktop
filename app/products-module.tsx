"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { makeLocalId, readCatalog, writeCatalog, type CatalogItem } from "./catalog-core";

const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((Number(cents) || 0) / 100);
const qty = (milli: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format((Number(milli) || 0) / 1000);
const cents = (value: FormDataEntryValue | null) => Math.max(0, Math.round((Number(value) || 0) * 100));
const milli = (value: FormDataEntryValue | null) => Math.max(0, Math.round((Number(value) || 0) * 1000));

const emptyItem = (): CatalogItem => ({
  id: "", type: "product", sku: "", name: "", description: "", ncm: "", cest: "", serviceCode: "", unit: "UN",
  costCents: 0, priceCents: 0, stockQuantityMilli: 0, minimumStockMilli: 0, status: "active",
  gtin: "SEM GTIN", origin: "", defaultCfop: "", cst: "", csosn: "", pisCst: "", cofinsCst: "", ibsCbsCst: "", cClassTrib: "",
  createdAt: "", updatedAt: "",
});

export default function ProductsModule({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogItem>(emptyItem());
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = () => setItems(readCatalog().sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
  useEffect(() => { load(); const handler = () => load(); window.addEventListener("seven:catalog-updated", handler); return () => window.removeEventListener("seven:catalog-updated", handler); }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => (typeFilter === "all" || item.type === typeFilter) && (!needle || [item.sku, item.name, item.description, item.ncm, item.cest, item.serviceCode, item.defaultCfop].join(" ").toLowerCase().includes(needle)));
  }, [items, query, typeFilter]);

  const stockValue = items.filter((item) => item.type === "product" && item.status === "active").reduce((sum, item) => sum + Math.round((item.stockQuantityMilli / 1000) * item.costCents), 0);
  const lowStock = items.filter((item) => item.type === "product" && item.status === "active" && item.minimumStockMilli > 0 && item.stockQuantityMilli <= item.minimumStockMilli).length;

  const openNew = () => { setEditing(emptyItem()); setEditorOpen(true); setError(""); setNotice(""); };
  const openEdit = (item: CatalogItem) => { setEditing({ ...emptyItem(), ...item }); setEditorOpen(true); setError(""); setNotice(""); };

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError("");
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") || "").trim();
    const sku = String(data.get("sku") || "").trim().toUpperCase();
    if (!name) return setError("Informe o nome do produto ou serviço.");
    const current = readCatalog();
    if (sku && current.some((item) => item.sku.toUpperCase() === sku && item.id !== editing.id)) return setError("Já existe outro item com este código/SKU.");
    const type = data.get("type") === "service" ? "service" : "product";
    const now = new Date().toISOString();
    const next: CatalogItem = {
      id: editing.id || makeLocalId("catalog"), type, sku, name,
      description: String(data.get("description") || "").trim(),
      ncm: String(data.get("ncm") || "").replace(/\D/g, "").slice(0, 8),
      cest: String(data.get("cest") || "").replace(/\D/g, "").slice(0, 7),
      serviceCode: String(data.get("serviceCode") || "").trim(),
      unit: String(data.get("unit") || "UN").trim().toUpperCase().slice(0, 6) || "UN",
      costCents: cents(data.get("cost")), priceCents: cents(data.get("price")),
      stockQuantityMilli: type === "product" ? milli(data.get("stock")) : 0,
      minimumStockMilli: type === "product" ? milli(data.get("minimumStock")) : 0,
      status: data.get("status") === "inactive" ? "inactive" : "active",
      gtin: String(data.get("gtin") || "SEM GTIN").trim().toUpperCase() || "SEM GTIN",
      origin: String(data.get("origin") || "").replace(/\D/g, "").slice(0, 1),
      defaultCfop: String(data.get("defaultCfop") || "").replace(/\D/g, "").slice(0, 4),
      cst: String(data.get("cst") || "").replace(/\D/g, "").slice(0, 3),
      csosn: String(data.get("csosn") || "").replace(/\D/g, "").slice(0, 3),
      pisCst: String(data.get("pisCst") || "").replace(/\D/g, "").slice(0, 2),
      cofinsCst: String(data.get("cofinsCst") || "").replace(/\D/g, "").slice(0, 2),
      ibsCbsCst: String(data.get("ibsCbsCst") || "").replace(/\D/g, "").slice(0, 3),
      cClassTrib: String(data.get("cClassTrib") || "").replace(/\D/g, "").slice(0, 6),
      createdAt: editing.createdAt || now, updatedAt: now,
    };
    const index = current.findIndex((item) => item.id === next.id);
    if (index >= 0) current[index] = next; else current.push(next);
    writeCatalog(current); setEditorOpen(false); setNotice(`${type === "product" ? "Produto" : "Serviço"} salvo com sucesso.`);
  };

  const toggleStatus = (item: CatalogItem) => {
    const current = readCatalog();
    const index = current.findIndex((row) => row.id === item.id);
    if (index < 0) return;
    current[index] = { ...current[index], status: item.status === "active" ? "inactive" : "active", updatedAt: new Date().toISOString() };
    writeCatalog(current);
  };

  const duplicate = (item: CatalogItem) => {
    const current = readCatalog();
    const now = new Date().toISOString();
    current.push({ ...item, id: makeLocalId("catalog"), sku: item.sku ? `${item.sku}-COPIA` : "", name: `${item.name} - cópia`, createdAt: now, updatedAt: now });
    writeCatalog(current); setNotice("Item duplicado.");
  };

  return <div className="catalog-workspace">
    <aside className="catalog-rail">
      <button onClick={onClose}>←</button><div><span>CAT</span><strong>Catálogo</strong></div>
      <nav><button className={typeFilter === "all" ? "active" : ""} onClick={() => setTypeFilter("all")}>Todos</button><button className={typeFilter === "product" ? "active" : ""} onClick={() => setTypeFilter("product")}>Produtos</button><button className={typeFilter === "service" ? "active" : ""} onClick={() => setTypeFilter("service")}>Serviços</button></nav>
      <footer><small>Itens ativos</small><strong>{items.filter((item) => item.status === "active").length}</strong></footer>
    </aside>
    <main className="catalog-main">
      <header className="catalog-header"><div><span>CADASTROS · BASE COMERCIAL E FISCAL</span><h1>Produtos e serviços</h1><p>Cadastre itens usados em OS, orçamento, estoque e documentos fiscais.</p></div><button onClick={openNew}>+ Novo produto / serviço</button></header>
      {notice && <div className="catalog-message success">{notice}<button onClick={() => setNotice("")}>×</button></div>}
      {error && !editorOpen && <div className="catalog-message error">{error}</div>}
      <section className="catalog-kpis"><article><span>Produtos</span><strong>{items.filter((item) => item.type === "product").length}</strong><small>cadastrados</small></article><article><span>Serviços</span><strong>{items.filter((item) => item.type === "service").length}</strong><small>cadastrados</small></article><article className={lowStock ? "warning" : ""}><span>Estoque baixo</span><strong>{lowStock}</strong><small>abaixo do mínimo</small></article><article><span>Custo em estoque</span><strong>{money(stockValue)}</strong><small>posição atual</small></article></section>
      <section className="catalog-table-panel"><div className="catalog-toolbar"><div className="catalog-search"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar código, descrição, NCM, CEST..." /></div><select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}><option value="all">Todos</option><option value="product">Produtos</option><option value="service">Serviços</option></select></div>
        <div className="catalog-table-wrap"><table className="catalog-table"><thead><tr><th>Código</th><th>Descrição</th><th>Tipo</th><th>Fiscal</th><th>Estoque</th><th>Custo</th><th>Venda</th><th>Status</th><th></th></tr></thead><tbody>
          {filtered.map((item) => { const low = item.type === "product" && item.minimumStockMilli > 0 && item.stockQuantityMilli <= item.minimumStockMilli; return <tr key={item.id}><td><strong>{item.sku || "—"}</strong></td><td><strong>{item.name}</strong><small>{item.description || "Sem descrição complementar"}</small></td><td><span className={`catalog-type ${item.type}`}>{item.type === "product" ? "Produto" : "Serviço"}</span></td><td><span>{item.type === "product" ? `NCM ${item.ncm || "—"}` : `Serviço ${item.serviceCode || "—"}`}</span><small>{[item.cest ? `CEST ${item.cest}` : "", item.defaultCfop ? `CFOP ${item.defaultCfop}` : ""].filter(Boolean).join(" · ")}</small></td><td><strong className={low ? "stock-low" : ""}>{item.type === "product" ? qty(item.stockQuantityMilli) : "—"}</strong><small>{item.type === "product" && item.minimumStockMilli ? `mín. ${qty(item.minimumStockMilli)}` : ""}</small></td><td>{money(item.costCents)}</td><td><strong>{money(item.priceCents)}</strong></td><td><span className={`catalog-status ${item.status}`}>{item.status === "active" ? "Ativo" : "Inativo"}</span></td><td><div className="catalog-row-actions"><button onClick={() => openEdit(item)}>Editar</button><button onClick={() => duplicate(item)}>Duplicar</button><button onClick={() => toggleStatus(item)}>{item.status === "active" ? "Inativar" : "Ativar"}</button></div></td></tr>; })}
          {!filtered.length && <tr><td colSpan={9}><div className="catalog-empty"><strong>Nenhum item encontrado</strong><span>Cadastre o primeiro produto ou serviço para usar em OS e NF-e.</span><button onClick={openNew}>Cadastrar item</button></div></td></tr>}
        </tbody></table></div>
      </section>
    </main>

    {editorOpen && <div className="catalog-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setEditorOpen(false)}><form className="catalog-editor" onSubmit={save}><header><div><span>{editing.id ? "EDITAR ITEM" : "NOVO ITEM"}</span><h2>{editing.id ? editing.name : "Cadastrar produto ou serviço"}</h2></div><button type="button" onClick={() => setEditorOpen(false)}>×</button></header>{error && <div className="catalog-message error">{error}</div>}<div className="catalog-form-scroll">
      <section><h3>Identificação</h3><div className="catalog-form-grid"><label><span>Tipo *</span><select name="type" defaultValue={editing.type}><option value="product">Produto</option><option value="service">Serviço</option></select></label><label><span>Código / SKU</span><input name="sku" defaultValue={editing.sku} /></label><label className="wide"><span>Nome / descrição *</span><input name="name" required defaultValue={editing.name} /></label><label className="wide"><span>Descrição complementar</span><textarea name="description" rows={3} defaultValue={editing.description} /></label><label><span>Unidade</span><input name="unit" defaultValue={editing.unit || "UN"} /></label><label><span>Status</span><select name="status" defaultValue={editing.status}><option value="active">Ativo</option><option value="inactive">Inativo</option></select></label></div></section>
      <section><h3>Preços</h3><div className="catalog-form-grid"><label><span>Custo (R$)</span><input name="cost" type="number" min="0" step="0.01" defaultValue={(editing.costCents / 100).toFixed(2)} /></label><label><span>Preço de venda (R$)</span><input name="price" type="number" min="0" step="0.01" defaultValue={(editing.priceCents / 100).toFixed(2)} /></label></div></section>
      <section><h3>Estoque</h3><div className="catalog-form-grid"><label><span>Quantidade atual</span><input name="stock" type="number" min="0" step="0.001" defaultValue={(editing.stockQuantityMilli / 1000).toString()} /></label><label><span>Estoque mínimo</span><input name="minimumStock" type="number" min="0" step="0.001" defaultValue={(editing.minimumStockMilli / 1000).toString()} /></label></div><small>Campos de estoque são ignorados quando o item é do tipo Serviço.</small></section>
      <section><h3>Fiscal para NF-e</h3><div className="catalog-form-grid"><label><span>NCM</span><input name="ncm" inputMode="numeric" maxLength={8} defaultValue={editing.ncm} placeholder="8 dígitos" /></label><label><span>CEST</span><input name="cest" inputMode="numeric" maxLength={7} defaultValue={editing.cest} /></label><label><span>GTIN</span><input name="gtin" defaultValue={editing.gtin || "SEM GTIN"} placeholder="ou SEM GTIN" /></label><label><span>Origem</span><select name="origin" defaultValue={editing.origin || ""}><option value="">Selecione</option>{[0,1,2,3,4,5,6,7,8].map((value) => <option key={value} value={String(value)}>{value}</option>)}</select></label><label><span>CFOP padrão</span><input name="defaultCfop" inputMode="numeric" maxLength={4} defaultValue={editing.defaultCfop || ""} /></label><label><span>CST ICMS</span><input name="cst" inputMode="numeric" maxLength={3} defaultValue={editing.cst || ""} /></label><label><span>CSOSN</span><input name="csosn" inputMode="numeric" maxLength={3} defaultValue={editing.csosn || ""} /></label><label><span>CST PIS</span><input name="pisCst" inputMode="numeric" maxLength={2} defaultValue={editing.pisCst || ""} /></label><label><span>CST COFINS</span><input name="cofinsCst" inputMode="numeric" maxLength={2} defaultValue={editing.cofinsCst || ""} /></label><label><span>CST IBS/CBS</span><input name="ibsCbsCst" inputMode="numeric" maxLength={3} defaultValue={editing.ibsCbsCst || ""} /></label><label><span>cClassTrib</span><input name="cClassTrib" inputMode="numeric" maxLength={6} defaultValue={editing.cClassTrib || ""} /></label><label><span>Código do serviço</span><input name="serviceCode" defaultValue={editing.serviceCode} /></label></div><small>Esses campos são apenas padrões para preencher a NF-e. A validação fiscal continua sendo feita no momento da emissão.</small></section>
    </div><footer><button type="button" onClick={() => setEditorOpen(false)}>Cancelar</button><button className="primary">Salvar item</button></footer></form></div>}
  </div>;
}
