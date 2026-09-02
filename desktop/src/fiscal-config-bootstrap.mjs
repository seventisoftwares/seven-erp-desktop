import { app, ipcMain } from "electron";
import { createFiscalConfigurationStore } from "./fiscal-configuration-store.mjs";

let store = null;
let ready = null;
async function ensureStore() {
  if (!store) store = createFiscalConfigurationStore({ dataDir: app.getPath("userData") });
  if (!ready) ready = store.initialize();
  await ready;
  return store;
}

ipcMain.handle("seven:fiscal-config-get", async (_event, section) => (await ensureStore()).get(String(section || "")));
ipcMain.handle("seven:fiscal-config-set", async (_event, section, payload, actor) => (await ensureStore()).set(String(section || ""), payload || {}, actor || "local-user"));
ipcMain.handle("seven:fiscal-config-audit", async (_event, limit) => (await ensureStore()).audit(limit));

app.on("before-quit", () => { ready = null; store = null; });
