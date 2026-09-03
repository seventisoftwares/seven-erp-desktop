import { app, ipcMain } from "electron";
import { createCompanyEstablishmentStore } from "./company-establishment-store.mjs";

let store = null;
function ensureStore() {
  if (!store) store = createCompanyEstablishmentStore({ dataDir: app.getPath("userData") });
  return store;
}

ipcMain.handle("seven:company-establishments", async (_event, request = {}) => {
  const method = String(request.method || "GET").toUpperCase();
  const result = await ensureStore().api(method, request.payload || {}, request.matrix || {});
  let data = {};
  try { data = JSON.parse(result.body || "{}"); } catch {}
  return { status: result.status, ok: result.ok, ...data };
});

app.on("before-quit", () => { store = null; });
