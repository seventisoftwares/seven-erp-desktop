const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("sevenDesktop", {
  getStatus: () => ipcRenderer.invoke("seven:get-status"),
  pair: (payload) => ipcRenderer.invoke("seven:pair", payload),
  forget: () => ipcRenderer.invoke("seven:forget"),
  apiRequest: (path, options) => ipcRenderer.invoke("seven:api-request", path, options),
  onStatus: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on("seven:status", listener);
    return () => ipcRenderer.removeListener("seven:status", listener);
  },
});
