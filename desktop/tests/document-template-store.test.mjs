import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createDocumentTemplateStore } from "../src/document-template-store.mjs";

const definition = (label = "OS") => ({ schemaVersion: 1, pagePreset: "A4", orientation: "portrait", pageWidthMm: 210, pageHeightMm: 297, marginTopMm: 8, marginRightMm: 8, marginBottomMm: 8, marginLeftMm: 8, gridMm: 2, elements: [{ id: "title", kind: "text", xMm: 10, yMm: 10, widthMm: 80, heightMm: 8, text: label }] });
const url = (query = "") => new URL(`/api/document-templates${query ? `?${query}` : ""}`, "http://seven.local");
const body = (response) => JSON.parse(response.body);

test("modelos persistem após reiniciar e restauração cria nova versão", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "seven-doc-store-"));
  try {
    const first = createDocumentTemplateStore({ dataDir: dir }); await first.initialize();
    const created = body(await first.api("POST", url(), { id: "os-test", documentType: "service_order", name: "OS Oficina", isDefault: true, definition: definition("Versão 1") })).template;
    assert.equal(created.currentVersion, 1);
    const changed = body(await first.api("PATCH", url(), { id: created.id, definition: definition("Versão 2"), note: "Mudou cabeçalho" })).template;
    assert.equal(changed.currentVersion, 2);

    const restarted = createDocumentTemplateStore({ dataDir: dir }); await restarted.initialize();
    const loaded = body(await restarted.api("GET", url(`templateId=${created.id}`)));
    assert.equal(loaded.template.definition.elements[0].text, "Versão 2");
    assert.deepEqual(loaded.versions.map((row) => row.version), [2, 1]);

    const restored = body(await restarted.api("POST", url(), { action: "restore", id: created.id, version: 1 })).template;
    assert.equal(restored.currentVersion, 3);
    assert.equal(restored.definition.elements[0].text, "Versão 1");
    const after = body(await restarted.api("GET", url(`templateId=${created.id}`)));
    assert.deepEqual(after.versions.map((row) => row.version), [3, 2, 1]);

    const raw = JSON.parse(await readFile(path.join(dir, "document-templates.json"), "utf8"));
    assert.equal(raw.templates[0].currentVersion, 3);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("excluir modelo preserva histórico de versões", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "seven-doc-delete-"));
  try {
    const store = createDocumentTemplateStore({ dataDir: dir }); await store.initialize();
    await store.api("POST", url(), { id: "quote-test", documentType: "quote", name: "Orçamento", definition: definition("Orçamento") });
    await store.api("PATCH", url(), { id: "quote-test", definition: definition("Orçamento atualizado") });
    assert.equal(body(await store.api("DELETE", url(), { id: "quote-test" })).removed, true);
    assert.equal(store.templates.length, 0);
    assert.equal(store.versions.filter((row) => row.templateId === "quote-test").length, 2);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
