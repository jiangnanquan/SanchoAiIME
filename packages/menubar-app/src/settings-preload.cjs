const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("sanchoRimeSettings", {
  load: () => ipcRenderer.invoke("rime-settings:load"),
  save: (settings) => ipcRenderer.invoke("rime-settings:save", settings),
  suggestSkin: (input) => ipcRenderer.invoke("rime-settings:suggest-skin", input),
  deepSeekStatus: () => ipcRenderer.invoke("deepseek-credentials:status"),
  saveDeepSeekKey: (apiKey) => ipcRenderer.invoke("deepseek-credentials:save", { apiKey }),
  deleteDeepSeekKey: () => ipcRenderer.invoke("deepseek-credentials:delete"),
  openDirectory: () => ipcRenderer.invoke("rime-settings:open-directory")
});
