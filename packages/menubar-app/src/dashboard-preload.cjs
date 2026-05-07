const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("sanchoDashboard", {
  openRimeSettings: () => ipcRenderer.invoke("dashboard:open-rime-settings"),
  saveRimeSettings: (settings) => ipcRenderer.invoke("dashboard:rime-settings:save", settings),
  saveCustomPhrases: (entries) => ipcRenderer.invoke("dashboard:custom-phrases:save", { entries }),
  openRimeDirectory: () => ipcRenderer.invoke("rime-settings:open-directory"),
  suggestSkin: (input) => ipcRenderer.invoke("rime-settings:suggest-skin", input),
  deepSeekStatus: () => ipcRenderer.invoke("deepseek-credentials:status"),
  saveDeepSeekKey: (apiKey) => ipcRenderer.invoke("deepseek-credentials:save", { apiKey }),
  deleteDeepSeekKey: () => ipcRenderer.invoke("deepseek-credentials:delete"),
  executeAction: (action) => ipcRenderer.invoke("dashboard:action:execute", action)
});
