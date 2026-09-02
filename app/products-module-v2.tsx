"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  makeLocalId,
  readCatalog,
  writeCatalog,
  type CatalogItem,
  type VehicleData,
  type VehicleStockStatus,
} from "./catalog-core";

type ItemKind = "product" | "service" | "vehicle";
type EditorTab = "general" | "vehicle" | "commercial" | "fiscal" | "documents";

const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((Number(cents) || 0) / 100);
const qty = (milli: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format((Number(milli) || 0) / 1000);
const cents = (value: FormDataEntryValue | null) => Math.max(0, Math.round((Number(value) || 0) * 100));
const milli = (value: FormDataEntryValue | null) => Math.max(0, Math.round((Number(value) || 0) * 1000));
const text = (data: FormData, name: string) => String(data.get(name) || "").trim();
const digits = (value: string, max: number) => value.replace(/\D/g, "").slice(0, max);
const upper = (value: string, max = 200) => value.trim().toUpperCase().slice(0, max);
const numberOrUndefined = (data: FormData, name: string) => {
  const raw = text(data, name);
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
};

const vehicleDefaults = (): VehicleData => ({
  condition: "new",
  stockStatus: "available",
  make: "",
  model: "",
  version: "",
  vin: "",
  renavam: "",
  plate: "",
  plateState: "",
  manufactureYear: "",
  modelYear: "",
  fuel: "",
  transmission: "",
  traction: "",
  exteriorColor: "",
  interiorColor: "",
  yardLocation: "",
  options: "",
  accessories: "",
  notes: "",
});

const emptyItem = (kind: ItemKind = "product"): CatalogItem => ({
  id: "",
  type: kind === "service" ? "service" : "product",
  category: kind === "vehicle" ? "vehicle" : "general",
  sku: "",
  name: "",
  description: "",
  ncm: "",
  cest: "",
  serviceCode: "",
  unit: "UN",
  costCents: 0,
  priceCents: 0,
  stockQuantityMilli: kind === "vehicle" ? 1000 : 0,
  minimumStockMilli: 0,
  status: "active",
  gtin: "SEM GTIN",
  origin: "",
  defaultCfop: "",
  cst: "",
  csosn: "",
  pisCst: "",
  cofinsCst: "",
  ibsCbsCst: "",
  cClassTrib: "",
  vehicle: kind === "vehicle" ? vehicleDefaults() : undefined,
  createdAt: "",
  updatedAt: "",
});

const itemKindOf = (item: CatalogItem): ItemKind => item.category === "vehicle" ? "vehicle" : item.type === "service" ? "service" : "product";
const vehicleStatusLabel: Record<VehicleStockStatus, string> = {
  available: "Disponível",
  reserved: "Reservado",
  sold: "Vendido",
  in_transit: "Em trânsito",
  demo: "Demonstração",
  workshop: "Oficina",
  blocked: "Bloqueado",
};
const conditionLabel: Record<string, string> = { new: "0 km", used: "Usado", seminovo: "Seminovo", demo: "Demonstração" };

function vehicleSearchText(item: CatalogItem) {
  const v = item.vehicle || {};
  return [
    v.make, v.model, v.version, v.modelCode, v.vin, v.renavam, v.plate, v.plateState,
    v.manufactureYear, v.modelYear, v.bodyType, v.exteriorColor, v.colorCode, v.interiorColor,
    v.fuel, v.transmission, v.traction, v.engineNumber, v.engineCode, v.yardLocation,
    v.supplierName, v.supplierTaxId, v.purchaseInvoiceNumber, v.purchaseInvoiceKey, v.fipeCode,
  ].filter(Boolean).join(" ");
}

export default function ProductsModuleV2({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<ItemKind | "all">("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogItem>(emptyItem());
  const [itemKind, setItemKind] = useState<ItemKind>("product");
  const [editorTab, setEditorTab] = useState<EditorTab>("general");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = () => setItems(readCatalog().sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener("seven:catalog-updated", handler);
    return () => window.removeEventListener("seven:catalog-updated", handler);
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      const kind = itemKindOf(item);
      if (typeFilter !== "all" && kind !== typeFilter) return false;
      if (!needle) return true;
      return [item.sku, item.name, item.description, item.ncm, item.cest, item.serviceCode, item.defaultCfop, vehicleSearchText(item)]
        .join(" ").toLowerCase().includes(needle);
    });
  }, [items, query, typeFilter]);

  const generalProducts = items.filter((item) => itemKindOf(item) === "product");
  const vehicles = items.filter((item) => itemKindOf(item) === "vehicle");
  const services = items.filter((item) => itemKindOf(item) === "service");
  const vehiclesInStock = vehicles.filter((item) => item.status === "active" && !["sold", "blocked"].includes(item.vehicle?.stockStatus || "available"));
  const vehiclesAvailable = vehicles.filter((item) => item.status === "active" && (item.vehicle?.stockStatus || "available") === "available");
  const vehiclesReserved = vehicles.filter((item) => item.status === "active" && item.vehicle?.stockStatus === "reserved");
  const stockValue = items.filter((item) => item.type === "product" && item.status === "active").reduce((sum, item) => sum + Math.round((item.stockQuantityMilli / 1000) * item.costCents), 0);
  const lowStock = generalProducts.filter((item) => item.status === "active" && item.minimumStockMilli > 0 && item.stockQuantityMilli <= item.minimumStockMilli).length;

  const openNew = (kind: ItemKind = "product") => {
    setEditing(emptyItem(kind));
    setItemKind(kind);
    setEditorTab("general");
    setEditorOpen(true);
    setError("");
    setNotice("");
  };

  const openEdit = (item: CatalogItem) => {
    const kind = itemKindOf(item);
    setEditing({ ...emptyItem(kind), ...item, vehicle: kind === "vehicle" ? { ...vehicleDefaults(), ...(item.vehicle || {}) } : item.vehicle });
    setItemKind(kind);
    setEditorTab("general");
    setEditorOpen(true);
    setError("");
    setNotice("");
  };

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    const kind = (data.get("kind") === "service" ? "service" : data.get("kind") === "vehicle" ? "vehicle" : "product") as ItemKind;
    const type = kind === "service" ? "service" : "product";
    const category = kind === "vehicle" ? "vehicle" : "general";
    const make = upper(text(data, "vehicleMake"), 80);
    const model = upper(text(data, "vehicleModel"), 80);
    const version = text(data, "vehicleVersion").slice(0, 120);
    const modelYear = digits(text(data, "vehicleModelYear"), 4);
    const autoVehicleName = [make, model, version, modelYear].filter(Boolean).join(" ");
    const name = text(data, "name") || (kind === "vehicle" ? autoVehicleName : "");
    const sku = upper(text(data, "sku"), 60);
    if (!name) return setError(kind === "vehicle" ? "Informe marca/modelo ou um nome comercial para o veículo." : "Informe o nome do produto ou serviço.");

    const current = readCatalog();
    if (sku && current.some((item) => item.sku.toUpperCase() === sku && item.id !== editing.id)) return setError("Já existe outro item com este código/SKU.");

    let vehicle: VehicleData | undefined;
    if (kind === "vehicle") {
      const vin = upper(text(data, "vehicleVin"), 17).replace(/[^A-Z0-9]/g, "");
      const renavam = digits(text(data, "vehicleRenavam"), 11);
      const plate = upper(text(data, "vehiclePlate"), 7).replace(/[^A-Z0-9]/g, "");
      if (vin && current.some((item) => item.id !== editing.id && item.category === "vehicle" && upper(item.vehicle?.vin || "", 17) === vin)) return setError("Já existe um veículo cadastrado com este chassi/VIN.");
      if (renavam && current.some((item) => item.id !== editing.id && item.category === "vehicle" && digits(item.vehicle?.renavam || "", 11) === renavam)) return setError("Já existe um veículo cadastrado com este RENAVAM.");
      if (plate && current.some((item) => item.id !== editing.id && item.category === "vehicle" && upper(item.vehicle?.plate || "", 7).replace(/[^A-Z0-9]/g, "") === plate)) return setError("Já existe um veículo cadastrado com esta placa.");

      vehicle = {
        make,
        model,
        version,
        modelCode: upper(text(data, "vehicleModelCode"), 50),
        condition: (text(data, "vehicleCondition") || "new") as VehicleData["condition"],
        vin,
        renavam,
        plate,
        plateState: upper(text(data, "vehiclePlateState"), 2),
        manufactureYear: digits(text(data, "vehicleManufactureYear"), 4),
        modelYear,
        manufactureDate: text(data, "vehicleManufactureDate"),
        bodyType: text(data, "vehicleBodyType"),
        exteriorColor: text(data, "vehicleExteriorColor"),
        colorCode: upper(text(data, "vehicleColorCode"), 30),
        interiorColor: text(data, "vehicleInteriorColor"),
        doors: numberOrUndefined(data, "vehicleDoors"),
        seats: numberOrUndefined(data, "vehicleSeats"),
        fuel: text(data, "vehicleFuel"),
        transmission: text(data, "vehicleTransmission"),
        traction: text(data, "vehicleTraction"),
        engineNumber: upper(text(data, "vehicleEngineNumber"), 50),
        engineCode: upper(text(data, "vehicleEngineCode"), 40),
        displacementCc: numberOrUndefined(data, "vehicleDisplacementCc"),
        powerCv: numberOrUndefined(data, "vehiclePowerCv"),
        torqueNm: numberOrUndefined(data, "vehicleTorqueNm"),
        cylinders: numberOrUndefined(data, "vehicleCylinders"),
        mileageKm: numberOrUndefined(data, "vehicleMileageKm"),
        keyCount: numberOrUndefined(data, "vehicleKeyCount"),
        stockStatus: (text(data, "vehicleStockStatus") || "available") as VehicleStockStatus,
        yardLocation: text(data, "vehicleYardLocation"),
        entryDate: text(data, "vehicleEntryDate"),
        purchaseDate: text(data, "vehiclePurchaseDate"),
        supplierName: text(data, "vehicleSupplierName"),
        supplierTaxId: text(data, "vehicleSupplierTaxId"),
        purchaseInvoiceNumber: text(data, "vehiclePurchaseInvoiceNumber"),
        purchaseInvoiceKey: digits(text(data, "vehiclePurchaseInvoiceKey"), 44),
        listPriceCents: cents(data.get("vehicleListPrice")),
        fipeCode: text(data, "vehicleFipeCode"),
        fipeReferenceMonth: text(data, "vehicleFipeReferenceMonth"),
        fipeValueCents: cents(data.get("vehicleFipeValue")),
        licensingYear: digits(text(data, "vehicleLicensingYear"), 4),
        crlvStatus: text(data, "vehicleCrlvStatus"),
        ipvaStatus: text(data, "vehicleIpvaStatus"),
        gravame: text(data, "vehicleGravame"),
        restrictions: text(data, "vehicleRestrictions"),
        firstRegistrationDate: text(data, "vehicleFirstRegistrationDate"),
        warrantyStart: text(data, "vehicleWarrantyStart"),
        warrantyEnd: text(data, "vehicleWarrantyEnd"),
        manualAvailable: data.get("vehicleManualAvailable") === "on",
        spareKeyAvailable: data.get("vehicleSpareKeyAvailable") === "on",
        options: text(data, "vehicleOptions"),
        accessories: text(data, "vehicleAccessories"),
        notes: text(data, "vehicleNotes"),
      };
    }

    const now = new Date().toISOString();
    const next: CatalogItem = {
      id: editing.id || makeLocalId("catalog"),
      type,
      category,
      sku,
      name,
      description: text(data, "description"),
      ncm: digits(text(data, "ncm"), 8),
      cest: digits(text(data, "cest"), 7),
      serviceCode: text(data, "serviceCode"),
      unit: kind === "vehicle" ? "UN" : upper(text(data, "unit") || "UN", 6) || "UN",
      costCents: cents(data.get("cost")),
      priceCents: cents(data.get("price")),
      stockQuantityMilli: kind === "vehicle" ? 1000 : type === "product" ? milli(data.get("stock")) : 0,
      minimumStockMilli: kind === "vehicle" ? 0 : type === "product" ? milli(data.get("minimumStock")) : 0,
      status: data.get("status") === "inactive" ? "inactive" : "active",
      gtin: upper(text(data, "gtin") || "SEM GTIN", 32) || "SEM GTIN",
      origin: digits(text(data, "origin"), 1),
      defaultCfop: digits(text(data, "defaultCfop"), 4),
      cst: digits(text(data, "cst"), 3),
      csosn: digits(text(data, "csosn"), 3),
      pisCst: digits(text(data, "pisCst"), 2),
      cofinsCst: digits(text(data, "cofinsCst"), 2),
      ibsCbsCst: digits(text(data, "ibsCbsCst"), 3),
      cClassTrib: digits(text(data, "cClassTrib"), 6),
      vehicle,
      createdAt: editing.createdAt || now,
      updatedAt: now,
    };

    const index = current.findIndex((item) => item.id === next.id);
    if (index >= 0) current[index] = next; else current.push(next);
    writeCatalog(current);
    setEditorOpen(false);
    setNotice(`${kind === "vehicle" ? "Veículo" : kind === "product" ? "Produto" : "Serviço"} salvo com sucesso.`);
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
    const vehicle = item.category === "vehicle" ? {
      ...(item.vehicle || {}),
      vin: "",
      renavam: "",
      plate: "",
      engineNumber: "",
      purchaseInvoiceKey: "",
      stockStatus: "available" as VehicleStockStatus,
    } : item.vehicle;
    current.push({
      ...item,
      vehicle,
      id: makeLocalId("catalog"),
      sku: item.sku ? `${item.sku}-COPIA` : "",
      name: `${item.name} - cópia`,
      createdAt: now,
      updatedAt: now,
    });
    writeCatalog(current);
    setNotice(item.category === "vehicle" ? "Veículo duplicado sem chassi, RENAVAM e placa. Complete a nova unidade." : "Item duplicado.");
  };

  return <div className="catalog-workspace dealership-catalog">
    <aside className="catalog-rail dealership-rail">
      <button onClick={onClose}>←</button>
      <div><span>CAT</span><strong>Catálogo</strong></div>
      <nav>
        <button className={typeFilter === "all" ? "active" : ""} onClick={() => setTypeFilter("all")}>Todos</button>
        <button className={typeFilter === "product" ? "active" : ""} onClick={() => setTypeFilter("product")}>Produtos</button>
        <button className={typeFilter === "vehicle" ? "active vehicle-nav" : "vehicle-nav"} onClick={() => setTypeFilter("vehicle")}>Veículos</button>
        <button className={typeFilter === "service" ? "active" : ""} onClick={() => setTypeFilter("service")}>Serviços</button>
      </nav>
      <footer><small>Veículos disponíveis</small><strong>{vehiclesAvailable.length}</strong></footer>
    </aside>

    <main className="catalog-main">
      <header className="catalog-header dealership-header">
        <div><span>CADASTROS · ESTOQUE · CONCESSIONÁRIA</span><h1>Produtos, serviços e veículos</h1><p>Controle peças, serviços e cada veículo individualmente por chassi, documentação, pátio e situação comercial.</p></div>
        <div className="catalog-header-actions"><button className="secondary" onClick={() => openNew("product")}>+ Produto / serviço</button><button onClick={() => openNew("vehicle")}>+ Novo veículo</button></div>
      </header>

      {notice && <div className="catalog-message success">{notice}<button onClick={() => setNotice("")}>×</button></div>}
      {error && !editorOpen && <div className="catalog-message error">{error}</div>}

      <section className="catalog-kpis dealership-kpis">
        <article><span>Veículos no estoque</span><strong>{vehiclesInStock.length}</strong><small>unidades individuais</small></article>
        <article className="vehicle-available"><span>Disponíveis</span><strong>{vehiclesAvailable.length}</strong><small>liberados para venda</small></article>
        <article className={vehiclesReserved.length ? "warning" : ""}><span>Reservados</span><strong>{vehiclesReserved.length}</strong><small>aguardando conclusão</small></article>
        <article><span>Custo total em estoque</span><strong>{money(stockValue)}</strong><small>veículos + produtos</small></article>
        <article><span>Produtos</span><strong>{generalProducts.length}</strong><small>{lowStock} com estoque baixo</small></article>
        <article><span>Serviços</span><strong>{services.length}</strong><small>cadastrados</small></article>
      </section>

      <section className="catalog-table-panel">
        <div className="catalog-toolbar">
          <div className="catalog-search"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={typeFilter === "vehicle" ? "Buscar chassi, RENAVAM, placa, marca, modelo, cor, pátio..." : "Buscar código, descrição, NCM, CEST..."} /></div>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as ItemKind | "all")}><option value="all">Todos</option><option value="product">Produtos</option><option value="vehicle">Veículos</option><option value="service">Serviços</option></select>
        </div>

        {typeFilter === "vehicle" ? <div className="catalog-table-wrap"><table className="catalog-table vehicle-table"><thead><tr><th>Estoque</th><th>Veículo</th><th>Identificação</th><th>Ano / Cor / KM</th><th>Pátio</th><th>Custo</th><th>Venda</th><th>Situação</th><th></th></tr></thead><tbody>
          {filtered.map((item) => { const v = item.vehicle || {}; const status = (v.stockStatus || "available") as VehicleStockStatus; return <tr key={item.id}>
            <td><strong>{item.sku || "—"}</strong><small>{conditionLabel[v.condition || "new"] || v.condition || "—"}</small></td>
            <td><strong>{[v.make, v.model].filter(Boolean).join(" ") || item.name}</strong><small>{v.version || item.description || "Sem versão"}</small></td>
            <td><span className="vehicle-id-line">CHASSI {v.vin || "—"}</span><small>{v.plate ? `PLACA ${v.plate}` : "Sem placa"} · {v.renavam ? `RENAVAM ${v.renavam}` : "Sem RENAVAM"}</small></td>
            <td><strong>{[v.manufactureYear, v.modelYear].filter(Boolean).join("/") || "—"}</strong><small>{[v.exteriorColor, v.mileageKm !== undefined ? `${Number(v.mileageKm).toLocaleString("pt-BR")} km` : ""].filter(Boolean).join(" · ")}</small></td>
            <td><strong>{v.yardLocation || "—"}</strong><small>{v.entryDate ? `Entrada ${new Date(`${v.entryDate}T12:00:00`).toLocaleDateString("pt-BR")}` : ""}</small></td>
            <td>{money(item.costCents)}</td><td><strong>{money(item.priceCents)}</strong>{v.listPriceCents ? <small>Tabela {money(v.listPriceCents)}</small> : null}</td>
            <td><span className={`vehicle-stock-status ${status}`}>{vehicleStatusLabel[status]}</span><small>{item.status === "inactive" ? "Cadastro inativo" : ""}</small></td>
            <td><div className="catalog-row-actions"><button onClick={() => openEdit(item)}>Abrir ficha</button><button onClick={() => duplicate(item)}>Duplicar</button><button onClick={() => toggleStatus(item)}>{item.status === "active" ? "Inativar" : "Ativar"}</button></div></td>
          </tr>; })}
          {!filtered.length && <tr><td colSpan={9}><div className="catalog-empty"><strong>Nenhum veículo encontrado</strong><span>Cadastre a primeira unidade da concessionária.</span><button onClick={() => openNew("vehicle")}>Cadastrar veículo</button></div></td></tr>}
        </tbody></table></div> : <div className="catalog-table-wrap"><table className="catalog-table"><thead><tr><th>Código</th><th>Descrição</th><th>Tipo</th><th>Fiscal / Identificação</th><th>Estoque</th><th>Custo</th><th>Venda</th><th>Status</th><th></th></tr></thead><tbody>
          {filtered.map((item) => { const kind = itemKindOf(item); const low = kind === "product" && item.minimumStockMilli > 0 && item.stockQuantityMilli <= item.minimumStockMilli; const v = item.vehicle || {}; return <tr key={item.id}>
            <td><strong>{item.sku || "—"}</strong></td>
            <td><strong>{item.name}</strong><small>{kind === "vehicle" ? [v.make, v.model, v.version].filter(Boolean).join(" ") : item.description || "Sem descrição complementar"}</small></td>
            <td><span className={`catalog-type ${kind}`}>{kind === "vehicle" ? "Veículo" : kind === "product" ? "Produto" : "Serviço"}</span></td>
            <td><span>{kind === "service" ? `Serviço ${item.serviceCode || "—"}` : kind === "vehicle" ? `Chassi ${v.vin || "—"}` : `NCM ${item.ncm || "—"}`}</span><small>{kind === "vehicle" ? [v.plate ? `Placa ${v.plate}` : "", v.renavam ? `RENAVAM ${v.renavam}` : ""].filter(Boolean).join(" · ") : [item.cest ? `CEST ${item.cest}` : "", item.defaultCfop ? `CFOP ${item.defaultCfop}` : ""].filter(Boolean).join(" · ")}</small></td>
            <td><strong className={low ? "stock-low" : ""}>{kind === "service" ? "—" : kind === "vehicle" ? "1 un." : qty(item.stockQuantityMilli)}</strong><small>{kind === "vehicle" ? vehicleStatusLabel[(v.stockStatus || "available") as VehicleStockStatus] : kind === "product" && item.minimumStockMilli ? `mín. ${qty(item.minimumStockMilli)}` : ""}</small></td>
            <td>{money(item.costCents)}</td><td><strong>{money(item.priceCents)}</strong></td><td><span className={`catalog-status ${item.status}`}>{item.status === "active" ? "Ativo" : "Inativo"}</span></td>
            <td><div className="catalog-row-actions"><button onClick={() => openEdit(item)}>Editar</button><button onClick={() => duplicate(item)}>Duplicar</button><button onClick={() => toggleStatus(item)}>{item.status === "active" ? "Inativar" : "Ativar"}</button></div></td>
          </tr>; })}
          {!filtered.length && <tr><td colSpan={9}><div className="catalog-empty"><strong>Nenhum item encontrado</strong><span>Cadastre produtos, serviços ou veículos para utilizar no ERP.</span><button onClick={() => openNew(typeFilter === "service" ? "service" : "product")}>Cadastrar item</button></div></td></tr>}
        </tbody></table></div>}
      </section>
    </main>

    {editorOpen && <div className="catalog-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setEditorOpen(false)}>
      <form className="catalog-editor vehicle-editor" onSubmit={save}>
        <header><div><span>{editing.id ? "EDITAR CADASTRO" : "NOVO CADASTRO"}</span><h2>{editing.id ? editing.name : itemKind === "vehicle" ? "Cadastrar veículo" : "Cadastrar produto ou serviço"}</h2></div><button type="button" onClick={() => setEditorOpen(false)}>×</button></header>
        {error && <div className="catalog-message error editor-error">{error}</div>}

        <div className="vehicle-editor-tabs">
          <button type="button" className={editorTab === "general" ? "active" : ""} onClick={() => setEditorTab("general")}>Geral</button>
          {itemKind === "vehicle" && <button type="button" className={editorTab === "vehicle" ? "active" : ""} onClick={() => setEditorTab("vehicle")}>Veículo</button>}
          <button type="button" className={editorTab === "commercial" ? "active" : ""} onClick={() => setEditorTab("commercial")}>Comercial / Estoque</button>
          <button type="button" className={editorTab === "fiscal" ? "active" : ""} onClick={() => setEditorTab("fiscal")}>Fiscal NF-e</button>
          {itemKind === "vehicle" && <button type="button" className={editorTab === "documents" ? "active" : ""} onClick={() => setEditorTab("documents")}>Documentação</button>}
        </div>

        <div className="catalog-form-scroll vehicle-form-scroll">
          <div className={editorTab === "general" ? "vehicle-tab-panel active" : "vehicle-tab-panel"}>
            <section><h3>Identificação do cadastro</h3><div className="catalog-form-grid">
              <label><span>Tipo de cadastro *</span><select name="kind" value={itemKind} onChange={(e) => { const next = e.target.value as ItemKind; setItemKind(next); if (next !== "vehicle" && ["vehicle", "documents"].includes(editorTab)) setEditorTab("general"); }}><option value="product">Produto</option><option value="service">Serviço</option><option value="vehicle">Veículo</option></select></label>
              <label><span>Código / SKU / Nº estoque</span><input name="sku" defaultValue={editing.sku} /></label>
              <label className="wide"><span>Nome comercial {itemKind !== "vehicle" ? "*" : "(opcional)"}</span><input name="name" defaultValue={editing.name} placeholder={itemKind === "vehicle" ? "Se vazio, será montado por marca/modelo/versão/ano" : "Descrição principal"} /></label>
              <label className="wide"><span>Descrição complementar</span><textarea name="description" rows={3} defaultValue={editing.description} /></label>
              <label><span>Unidade</span><input name="unit" disabled={itemKind === "vehicle"} defaultValue={itemKind === "vehicle" ? "UN" : editing.unit || "UN"} /></label>
              <label><span>Status do cadastro</span><select name="status" defaultValue={editing.status}><option value="active">Ativo</option><option value="inactive">Inativo</option></select></label>
            </div></section>
            {itemKind === "vehicle" && <section className="vehicle-intro"><h3>Unidade individual por chassi</h3><p>Cada veículo representa uma unidade única do estoque. Cadastre outro registro para outro chassi, mesmo quando marca, modelo e versão forem iguais.</p></section>}
          </div>

          {itemKind === "vehicle" && <div className={editorTab === "vehicle" ? "vehicle-tab-panel active" : "vehicle-tab-panel"}>
            <section><h3>Identificação do veículo</h3><div className="catalog-form-grid three-cols">
              <label><span>Marca</span><input name="vehicleMake" defaultValue={editing.vehicle?.make || ""} placeholder="Volkswagen" /></label>
              <label><span>Modelo</span><input name="vehicleModel" defaultValue={editing.vehicle?.model || ""} placeholder="T-Cross" /></label>
              <label><span>Versão</span><input name="vehicleVersion" defaultValue={editing.vehicle?.version || ""} placeholder="Highline 250 TSI" /></label>
              <label><span>Código do modelo</span><input name="vehicleModelCode" defaultValue={editing.vehicle?.modelCode || ""} /></label>
              <label><span>Condição</span><select name="vehicleCondition" defaultValue={editing.vehicle?.condition || "new"}><option value="new">0 km / Novo</option><option value="seminovo">Seminovo</option><option value="used">Usado</option><option value="demo">Demonstração</option></select></label>
              <label><span>Chassi / VIN</span><input name="vehicleVin" maxLength={17} defaultValue={editing.vehicle?.vin || ""} className="mono-input" /></label>
              <label><span>RENAVAM</span><input name="vehicleRenavam" inputMode="numeric" maxLength={11} defaultValue={editing.vehicle?.renavam || ""} /></label>
              <label><span>Placa</span><input name="vehiclePlate" maxLength={7} defaultValue={editing.vehicle?.plate || ""} className="mono-input" /></label>
              <label><span>UF da placa</span><input name="vehiclePlateState" maxLength={2} defaultValue={editing.vehicle?.plateState || ""} /></label>
            </div></section>

            <section><h3>Ano, carroceria e acabamento</h3><div className="catalog-form-grid three-cols">
              <label><span>Ano fabricação</span><input name="vehicleManufactureYear" inputMode="numeric" maxLength={4} defaultValue={editing.vehicle?.manufactureYear || ""} /></label>
              <label><span>Ano modelo</span><input name="vehicleModelYear" inputMode="numeric" maxLength={4} defaultValue={editing.vehicle?.modelYear || ""} /></label>
              <label><span>Data de fabricação</span><input name="vehicleManufactureDate" type="date" defaultValue={editing.vehicle?.manufactureDate || ""} /></label>
              <label><span>Carroceria</span><input name="vehicleBodyType" defaultValue={editing.vehicle?.bodyType || ""} placeholder="SUV, Hatch, Sedan..." /></label>
              <label><span>Cor externa</span><input name="vehicleExteriorColor" defaultValue={editing.vehicle?.exteriorColor || ""} /></label>
              <label><span>Código da cor</span><input name="vehicleColorCode" defaultValue={editing.vehicle?.colorCode || ""} /></label>
              <label><span>Cor interna</span><input name="vehicleInteriorColor" defaultValue={editing.vehicle?.interiorColor || ""} /></label>
              <label><span>Portas</span><input name="vehicleDoors" type="number" min="0" max="10" defaultValue={editing.vehicle?.doors ?? ""} /></label>
              <label><span>Lugares</span><input name="vehicleSeats" type="number" min="1" max="50" defaultValue={editing.vehicle?.seats ?? ""} /></label>
            </div></section>

            <section><h3>Dados técnicos</h3><div className="catalog-form-grid three-cols">
              <label><span>Combustível</span><input name="vehicleFuel" defaultValue={editing.vehicle?.fuel || ""} placeholder="Flex, Gasolina, Diesel, Elétrico..." /></label>
              <label><span>Câmbio</span><input name="vehicleTransmission" defaultValue={editing.vehicle?.transmission || ""} placeholder="Automático 6 marchas" /></label>
              <label><span>Tração</span><input name="vehicleTraction" defaultValue={editing.vehicle?.traction || ""} placeholder="4x2, AWD, 4x4..." /></label>
              <label><span>Nº do motor</span><input name="vehicleEngineNumber" defaultValue={editing.vehicle?.engineNumber || ""} className="mono-input" /></label>
              <label><span>Código do motor</span><input name="vehicleEngineCode" defaultValue={editing.vehicle?.engineCode || ""} /></label>
              <label><span>Cilindrada (cm³)</span><input name="vehicleDisplacementCc" type="number" min="0" defaultValue={editing.vehicle?.displacementCc ?? ""} /></label>
              <label><span>Potência (cv)</span><input name="vehiclePowerCv" type="number" min="0" step="0.1" defaultValue={editing.vehicle?.powerCv ?? ""} /></label>
              <label><span>Torque (Nm)</span><input name="vehicleTorqueNm" type="number" min="0" step="0.1" defaultValue={editing.vehicle?.torqueNm ?? ""} /></label>
              <label><span>Cilindros</span><input name="vehicleCylinders" type="number" min="0" max="16" defaultValue={editing.vehicle?.cylinders ?? ""} /></label>
              <label><span>Quilometragem</span><input name="vehicleMileageKm" type="number" min="0" step="1" defaultValue={editing.vehicle?.mileageKm ?? ""} /></label>
              <label><span>Quantidade de chaves</span><input name="vehicleKeyCount" type="number" min="0" max="10" defaultValue={editing.vehicle?.keyCount ?? ""} /></label>
            </div></section>

            <section><h3>Opcionais e acessórios</h3><div className="catalog-form-grid"><label className="wide"><span>Opcionais de fábrica</span><textarea name="vehicleOptions" rows={4} defaultValue={editing.vehicle?.options || ""} placeholder="Pacotes, teto solar, ADAS, bancos, multimídia..." /></label><label className="wide"><span>Acessórios instalados</span><textarea name="vehicleAccessories" rows={4} defaultValue={editing.vehicle?.accessories || ""} placeholder="Película, tapetes, engate, proteção, acessórios da concessionária..." /></label></div></section>
          </div>}

          <div className={editorTab === "commercial" ? "vehicle-tab-panel active" : "vehicle-tab-panel"}>
            <section><h3>Preços e margens</h3><div className="catalog-form-grid three-cols">
              <label><span>Custo de aquisição (R$)</span><input name="cost" type="number" min="0" step="0.01" defaultValue={(editing.costCents / 100).toFixed(2)} /></label>
              <label><span>Preço de venda (R$)</span><input name="price" type="number" min="0" step="0.01" defaultValue={(editing.priceCents / 100).toFixed(2)} /></label>
              {itemKind === "vehicle" && <label><span>Preço de tabela (R$)</span><input name="vehicleListPrice" type="number" min="0" step="0.01" defaultValue={((editing.vehicle?.listPriceCents || 0) / 100).toFixed(2)} /></label>}
              {itemKind === "vehicle" && <label><span>Código FIPE</span><input name="vehicleFipeCode" defaultValue={editing.vehicle?.fipeCode || ""} /></label>}
              {itemKind === "vehicle" && <label><span>Mês referência FIPE</span><input name="vehicleFipeReferenceMonth" type="month" defaultValue={editing.vehicle?.fipeReferenceMonth || ""} /></label>}
              {itemKind === "vehicle" && <label><span>Valor FIPE (R$)</span><input name="vehicleFipeValue" type="number" min="0" step="0.01" defaultValue={((editing.vehicle?.fipeValueCents || 0) / 100).toFixed(2)} /></label>}
            </div></section>

            {itemKind === "vehicle" ? <>
              <section><h3>Estoque e pátio</h3><div className="catalog-form-grid three-cols">
                <label><span>Situação do veículo</span><select name="vehicleStockStatus" defaultValue={editing.vehicle?.stockStatus || "available"}><option value="available">Disponível</option><option value="reserved">Reservado</option><option value="sold">Vendido</option><option value="in_transit">Em trânsito</option><option value="demo">Demonstração</option><option value="workshop">Na oficina / preparação</option><option value="blocked">Bloqueado</option></select></label>
                <label><span>Localização no pátio</span><input name="vehicleYardLocation" defaultValue={editing.vehicle?.yardLocation || ""} placeholder="Pátio A · Linha 03 · Vaga 12" /></label>
                <label><span>Data de entrada</span><input name="vehicleEntryDate" type="date" defaultValue={editing.vehicle?.entryDate || ""} /></label>
                <label><span>Data da compra</span><input name="vehiclePurchaseDate" type="date" defaultValue={editing.vehicle?.purchaseDate || ""} /></label>
              </div><small>Veículos são controlados como uma unidade individual. A quantidade em estoque é automaticamente 1.</small></section>

              <section><h3>Origem / fornecedor</h3><div className="catalog-form-grid three-cols">
                <label><span>Fornecedor / montadora</span><input name="vehicleSupplierName" defaultValue={editing.vehicle?.supplierName || ""} /></label>
                <label><span>CNPJ/CPF fornecedor</span><input name="vehicleSupplierTaxId" defaultValue={editing.vehicle?.supplierTaxId || ""} /></label>
                <label><span>Nº NF de compra</span><input name="vehiclePurchaseInvoiceNumber" defaultValue={editing.vehicle?.purchaseInvoiceNumber || ""} /></label>
                <label className="wide"><span>Chave NF-e de compra</span><input name="vehiclePurchaseInvoiceKey" inputMode="numeric" maxLength={44} defaultValue={editing.vehicle?.purchaseInvoiceKey || ""} className="mono-input" /></label>
              </div></section>
            </> : <section><h3>Estoque</h3><div className="catalog-form-grid"><label><span>Quantidade atual</span><input name="stock" type="number" min="0" step="0.001" defaultValue={(editing.stockQuantityMilli / 1000).toString()} /></label><label><span>Estoque mínimo</span><input name="minimumStock" type="number" min="0" step="0.001" defaultValue={(editing.minimumStockMilli / 1000).toString()} /></label></div><small>Campos de estoque são ignorados quando o cadastro é Serviço.</small></section>}
          </div>

          <div className={editorTab === "fiscal" ? "vehicle-tab-panel active" : "vehicle-tab-panel"}>
            <section><h3>Classificação fiscal para NF-e</h3><div className="catalog-form-grid three-cols">
              <label><span>NCM</span><input name="ncm" inputMode="numeric" maxLength={8} defaultValue={editing.ncm} placeholder="8 dígitos" /></label>
              <label><span>CEST</span><input name="cest" inputMode="numeric" maxLength={7} defaultValue={editing.cest} /></label>
              <label><span>GTIN</span><input name="gtin" defaultValue={editing.gtin || "SEM GTIN"} placeholder="ou SEM GTIN" /></label>
              <label><span>Origem</span><select name="origin" defaultValue={editing.origin || ""}><option value="">Selecione</option>{[0,1,2,3,4,5,6,7,8].map((value) => <option key={value} value={String(value)}>{value}</option>)}</select></label>
              <label><span>CFOP padrão</span><input name="defaultCfop" inputMode="numeric" maxLength={4} defaultValue={editing.defaultCfop || ""} /></label>
              <label><span>CST ICMS</span><input name="cst" inputMode="numeric" maxLength={3} defaultValue={editing.cst || ""} /></label>
              <label><span>CSOSN</span><input name="csosn" inputMode="numeric" maxLength={3} defaultValue={editing.csosn || ""} /></label>
              <label><span>CST PIS</span><input name="pisCst" inputMode="numeric" maxLength={2} defaultValue={editing.pisCst || ""} /></label>
              <label><span>CST COFINS</span><input name="cofinsCst" inputMode="numeric" maxLength={2} defaultValue={editing.cofinsCst || ""} /></label>
              <label><span>CST IBS/CBS</span><input name="ibsCbsCst" inputMode="numeric" maxLength={3} defaultValue={editing.ibsCbsCst || ""} /></label>
              <label><span>cClassTrib</span><input name="cClassTrib" inputMode="numeric" maxLength={6} defaultValue={editing.cClassTrib || ""} /></label>
              {itemKind === "service" && <label><span>Código do serviço</span><input name="serviceCode" defaultValue={editing.serviceCode || ""} /></label>}
            </div><small>Esses valores são padrões do cadastro. O emissor de NF-e continua exigindo conferência tributária da operação antes da transmissão.</small></section>
          </div>

          {itemKind === "vehicle" && <div className={editorTab === "documents" ? "vehicle-tab-panel active" : "vehicle-tab-panel"}>
            <section><h3>Licenciamento e documentação</h3><div className="catalog-form-grid three-cols">
              <label><span>Ano licenciamento</span><input name="vehicleLicensingYear" inputMode="numeric" maxLength={4} defaultValue={editing.vehicle?.licensingYear || ""} /></label>
              <label><span>Situação CRLV</span><select name="vehicleCrlvStatus" defaultValue={editing.vehicle?.crlvStatus || ""}><option value="">Não informado</option><option value="not_issued">Não emitido</option><option value="regular">Regular</option><option value="pending">Pendente</option><option value="digital">CRLV-e disponível</option></select></label>
              <label><span>Situação IPVA</span><select name="vehicleIpvaStatus" defaultValue={editing.vehicle?.ipvaStatus || ""}><option value="">Não informado</option><option value="not_applicable">Não se aplica</option><option value="paid">Pago</option><option value="pending">Pendente</option><option value="installments">Parcelado</option></select></label>
              <label><span>1º emplacamento</span><input name="vehicleFirstRegistrationDate" type="date" defaultValue={editing.vehicle?.firstRegistrationDate || ""} /></label>
              <label className="wide"><span>Gravame / alienação</span><input name="vehicleGravame" defaultValue={editing.vehicle?.gravame || ""} placeholder="Sem gravame ou dados do gravame" /></label>
              <label className="wide"><span>Restrições / observações documentais</span><textarea name="vehicleRestrictions" rows={3} defaultValue={editing.vehicle?.restrictions || ""} /></label>
            </div></section>

            <section><h3>Garantia e itens entregues</h3><div className="catalog-form-grid three-cols">
              <label><span>Início da garantia</span><input name="vehicleWarrantyStart" type="date" defaultValue={editing.vehicle?.warrantyStart || ""} /></label>
              <label><span>Fim da garantia</span><input name="vehicleWarrantyEnd" type="date" defaultValue={editing.vehicle?.warrantyEnd || ""} /></label>
              <label className="check-field"><input name="vehicleManualAvailable" type="checkbox" defaultChecked={Boolean(editing.vehicle?.manualAvailable)} /><span>Manual disponível</span></label>
              <label className="check-field"><input name="vehicleSpareKeyAvailable" type="checkbox" defaultChecked={Boolean(editing.vehicle?.spareKeyAvailable)} /><span>Chave reserva disponível</span></label>
              <label className="wide"><span>Observações internas do veículo</span><textarea name="vehicleNotes" rows={5} defaultValue={editing.vehicle?.notes || ""} /></label>
            </div></section>
          </div>}
        </div>

        <footer><button type="button" onClick={() => setEditorOpen(false)}>Cancelar</button><button className="primary" type="submit">Salvar {itemKind === "vehicle" ? "veículo" : "cadastro"}</button></footer>
      </form>
    </div>}
  </div>;
}
