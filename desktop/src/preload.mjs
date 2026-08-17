const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("sevenDesktop", {
  getStatus: () => ipcRenderer.invoke("seven:get-status"),
  createWorkspace: (payload) => ipcRenderer.invoke("seven:create-workspace", payload),
  pair: (payload) => ipcRenderer.invoke("seven:pair", payload),
  forget: () => ipcRenderer.invoke("seven:forget"),
  apiRequest: (path, options) => ipcRenderer.invoke("seven:api-request", path, options),
  meshAddPeer: (address) => ipcRenderer.invoke("seven:mesh-add-peer", address),
  meshSync: () => ipcRenderer.invoke("seven:mesh-sync"),
  onStatus: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on("seven:status", listener);
    return () => ipcRenderer.removeListener("seven:status", listener);
  },
});
