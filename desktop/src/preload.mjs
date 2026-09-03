const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("sevenDesktop", {
  getStatus: () => ipcRenderer.invoke("seven:get-status"),
  createWorkspace: (payload) => ipcRenderer.invoke("seven:create-workspace", payload),
  pair: (payload) => ipcRenderer.invoke("seven:pair", payload),
  forget: () => ipcRenderer.invoke("seven:forget"),
  apiRequest: (path, options) => ipcRenderer.invoke("seven:api-request", path, options),
  meshAddPeer: (address) => ipcRenderer.invoke("seven:mesh-add-peer", address),
  meshSync: () => ipcRenderer.invoke("seven:mesh-sync"),
  certificatesList: () => ipcRenderer.invoke("seven:certificates-list"),
  certificateImport: (payload) => ipcRenderer.invoke("seven:certificate-import", payload),
  certificateRemove: (id) => ipcRenderer.invoke("seven:certificate-remove", id),
  integrationSecretsSet: (connector, secrets) => ipcRenderer.invoke("seven:integration-secrets-set", connector, secrets),
  integrationSecretsStatus: (connector) => ipcRenderer.invoke("seven:integration-secrets-status", connector),
  integrationSecretsRemove: (connector) => ipcRenderer.invoke("seven:integration-secrets-remove", connector),
  integrationTest: (payload) => ipcRenderer.invoke("seven:integration-test", payload),
  dfeSync: (payload) => ipcRenderer.invoke("seven:dfe-sync", payload),
  dfeList: () => ipcRenderer.invoke("seven:dfe-list"),
  nfeDanfePdf: (draftId) => ipcRenderer.invoke("seven:nfe-danfe-pdf", draftId),
  documentTemplates: (request) => ipcRenderer.invoke("seven:document-templates", request),
  reportingStatus: () => ipcRenderer.invoke("seven:reporting-status"),
  documentRenderPdf: (payload) => ipcRenderer.invoke("seven:document-render-pdf", payload),
  fiscalZeus: (command, payload) => ipcRenderer.invoke("seven:fiscal-zeus", command, payload),
  danfeZeusPdf: (payload) => ipcRenderer.invoke("seven:danfe-zeus-pdf", payload),
  fiscalConfigGet: (section) => ipcRenderer.invoke("seven:fiscal-config-get", section),
  fiscalConfigSet: (section, payload, actor) => ipcRenderer.invoke("seven:fiscal-config-set", section, payload, actor),
  fiscalConfigAudit: (limit) => ipcRenderer.invoke("seven:fiscal-config-audit", limit),
  companyEstablishments: (request) => ipcRenderer.invoke("seven:company-establishments", request),
  companyLogo: (request) => ipcRenderer.invoke("seven:company-logo", request),
  onStatus: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on("seven:status", listener);
    return () => ipcRenderer.removeListener("seven:status", listener);
  },
});
