const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("recorderApi", {
  onStart: (callback) => {
    ipcRenderer.on("recorder:start", (_event, options) => callback(options));
  },
  onStop: (callback) => {
    ipcRenderer.on("recorder:stop", () => callback());
  },
  onCancel: (callback) => {
    ipcRenderer.on("recorder:cancel", () => callback());
  },
  onConfigure: (callback) => {
    ipcRenderer.on("recorder:configure", (_event, options) => callback(options));
  },
  onGetDevices: (callback) => {
    ipcRenderer.on("recorder:get-devices", (_event, requestId) => callback(requestId));
  },
  ready: () => ipcRenderer.send("recorder:ready"),
  started: (meta) => ipcRenderer.send("recorder:started", meta),
  level: (payload) => ipcRenderer.send("recorder:level", payload),
  result: (payload) => ipcRenderer.send("recorder:result", payload),
  error: (payload) => ipcRenderer.send("recorder:error", payload),
  devices: (requestId, devices, error) =>
    ipcRenderer.send("recorder:devices", { requestId, devices, error }),
  configured: (meta) => ipcRenderer.send("recorder:configured", meta),
});
