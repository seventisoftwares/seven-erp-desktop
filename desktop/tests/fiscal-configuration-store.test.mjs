import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createFiscalConfigurationStore } from "../src/fiscal-configuration-store.mjs";

test("configuração fiscal persiste, audita e não aceita campos secretos", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "seven-fiscal-config-"));
  try {
    const store = createFiscalConfigurationStore({ dataDir: dir }); await store.initialize();
    const saved = await store.set("nfe", { environment: "production", uf: "RS", series: "3", nextNumber: 891, crt: "3", defaultCfop: "5102", natureOperation: "VENDA", presenceIndicator: "1", contingency: "normal", passphrase: "NAO_PODE_SALVAR", password: "NAO_PODE_SALVAR", csc: "NAO_PODE_SALVAR" }, "teste");
    assert.equal(saved.environment, "production"); assert.equal(saved.series, "3"); assert.equal(saved.nextNumber, 891);
    const disk = await readFile(path.join(dir, "fiscal-configurations.json"), "utf8");
    assert.equal(disk.includes("NAO_PODE_SALVAR"), false);
    const logs = await store.audit(10); assert.equal(logs[0].section, "nfe"); assert.equal(logs[0].event, "fiscal_configuration_changed");
    const restarted = createFiscalConfigurationStore({ dataDir: dir }); await restarted.initialize();
    assert.equal((await restarted.get("nfe")).nextNumber, 891);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("configuração DANFE limita vias e preserva preview", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "seven-danfe-config-"));
  try {
    const store = createFiscalConfigurationStore({ dataDir: dir }); await store.initialize();
    const cfg = await store.set("danfe", { orientation: "landscape", copies: 99, printer: "Zebra", previewBeforePrint: true, autoPrintAfterAuthorization: false, additionalInfo: "Dados permitidos", logoMode: "company" });
    assert.equal(cfg.orientation, "landscape"); assert.equal(cfg.copies, 5); assert.equal(cfg.previewBeforePrint, true);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
