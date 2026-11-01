const { contextBridge, ipcRenderer, webUtils } = require("electron");

function subscribe(channel, callback) {
  if (typeof callback !== "function") return () => {};
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("transcribeBro", {
  getState: () => ipcRenderer.invoke("settings:get-state"),
  ready: () => ipcRenderer.send("settings:ready"),
  updateSettings: (partial) => ipcRenderer.invoke("settings:update", partial),
  suspendHotkeys: () => ipcRenderer.invoke("settings:suspend-hotkeys"),
  resumeHotkeys: () => ipcRenderer.invoke("settings:resume-hotkeys"),
  startDictation: () => ipcRenderer.invoke("settings:start-dictation"),
  stopDictation: () => ipcRenderer.invoke("settings:stop-dictation"),
  cancelDictation: () => ipcRenderer.invoke("settings:cancel-dictation"),
  copyText: (text) => ipcRenderer.invoke("settings:copy-text", text),
  pasteText: (text) => ipcRenderer.invoke("settings:paste-text", text),
  getDevices: () => ipcRenderer.invoke("settings:get-devices"),
  chooseFile: () => ipcRenderer.invoke("settings:choose-file"),
  choosePath: (options) => ipcRenderer.invoke("settings:choose-path", options),
  transcribeFile: (filePath) => ipcRenderer.invoke("settings:transcribe-file", filePath),
  getHistory: (query) => ipcRenderer.invoke("settings:get-history", query),
  downloadCatalog: () => ipcRenderer.invoke("downloads:catalog"),
  installEngine: (buildId) => ipcRenderer.invoke("downloads:install-engine", buildId),
  installFfmpeg: () => ipcRenderer.invoke("downloads:install-ffmpeg"),
  installModel: (modelId) => ipcRenderer.invoke("downloads:install-model", modelId),
  cancelDownload: () => ipcRenderer.invoke("downloads:cancel"),
  openEngineFolder: () => ipcRenderer.invoke("downloads:open-engine-folder"),  deleteHistory: (id) => ipcRenderer.invoke("settings:delete-history", id),
  clearHistory: () => ipcRenderer.invoke("settings:clear-history"),
  restartEngine: () => ipcRenderer.invoke("settings:restart-engine"),
  stopEngine: () => ipcRenderer.invoke("settings:stop-engine"),
  openPath: (targetPath) => ipcRenderer.invoke("settings:open-path", targetPath),
  openModelsFolder: () => ipcRenderer.invoke("settings:open-models-folder"),
  openLogs: () => ipcRenderer.invoke("settings:open-logs"),
  getLog: () => ipcRenderer.invoke("settings:get-log"),
  openExternal: (url) => ipcRenderer.invoke("settings:open-external", url),
  openMicSettings: () => ipcRenderer.invoke("settings:open-mic-settings"),
  saveText: (payload) => ipcRenderer.invoke("settings:save-text", payload),
  setOnboarded: () => ipcRenderer.invoke("settings:set-onboarded"),
  quit: () => ipcRenderer.invoke("settings:quit"),
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return "";
    }
  },
  onState: (callback) => subscribe("settings:state", callback),
  onToast: (callback) => subscribe("settings:toast", callback),
  onTab: (callback) => subscribe("settings:tab", callback),
  onLevel: (callback) => subscribe("settings:level", callback),
  onFileProgress: (callback) => subscribe("settings:file-progress", callback),
  onDownloadProgress: (callback) => subscribe("downloads:progress", callback),
});
