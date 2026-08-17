import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { createLocalCore } from "../src/local-core.mjs";

const dataDir = await mkdtemp(path.join(os.tmpdir(), "seven-erp-smoke-"));

try {
  const core = createLocalCore({
    dataDir,
    deviceId: "smoke-device",
    deviceName: "Smoke Test",
    getWorkspace: async () => ({ id: "smoke-workspace", name: "Empresa Teste", key: "test-key" }),
  });
  await core.initialize();

  const customerResponse = await core.apiRequest("/api/customers", {
    method: "POST",
    body: JSON.stringify({ legalName: "Cliente Teste Automatizado", taxId: "12345678901", phone: "54999999999" }),
  });
  assert.equal(customerResponse.status, 201, `Cadastro de cliente falhou: ${customerResponse.body}`);
  const customer = JSON.parse(customerResponse.body).customer;
  assert.ok(customer?.id, "Cliente não retornou ID local.");

  const orderResponse = await core.apiRequest("/api/service-orders", {
    method: "POST",
    body: JSON.stringify({
      partyId: customer.id,
      priority: "normal",
      equipmentType: "Notebook",
      equipmentBrand: "Dell",
      equipmentModel: "Latitude Test",
      serialNumber: "SMOKE-001",
      reportedIssue: "Teste automático de emissão de ordem de serviço.",
      diagnosis: "Diagnóstico de teste.",
      labor: "150.00",
      parts: "50.00",
      technicianEmail: "tecnico@example.com",
    }),
  });
  assert.equal(orderResponse.status, 201, `Emissão de OS falhou: ${orderResponse.body}`);
  const created = JSON.parse(orderResponse.body).order;
  assert.equal(created.number, 1, "Primeira OS deveria receber número 1.");
  assert.equal(created.totalCents, 20000, "Total da OS não corresponde a mão de obra + peças.");
  assert.equal(created.customerName, "Cliente Teste Automatizado", "OS não vinculou corretamente o cliente.");

  const listResponse = await core.apiRequest("/api/service-orders", { method: "GET" });
  assert.equal(listResponse.status, 200, `Listagem de OS falhou: ${listResponse.body}`);
  const orders = JSON.parse(listResponse.body).orders;
  assert.equal(orders.length, 1, "A OS emitida não foi persistida no banco local.");
  assert.equal(orders[0].id, created.id, "A OS persistida não corresponde à OS criada.");

  const updateResponse = await core.apiRequest("/api/service-orders", {
    method: "PATCH",
    body: JSON.stringify({ id: created.id, status: "finished", diagnosis: "Teste concluído.", solution: "Fluxo local aprovado.", labor: "175.00", parts: "50.00" }),
  });
  assert.equal(updateResponse.status, 200, `Atualização de OS falhou: ${updateResponse.body}`);
  const updated = JSON.parse(updateResponse.body).order;
  assert.equal(updated.status, "finished", "Status da OS não foi atualizado.");
  assert.equal(updated.totalCents, 22500, "Total atualizado da OS está incorreto.");

  console.log("✓ Seven ERP local-core smoke test: cliente → OS → persistência → atualização OK");
} finally {
  await rm(dataDir, { recursive: true, force: true });
}
