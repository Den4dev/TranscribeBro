const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("overlayApi", {
  getState: () => ipcRenderer.invoke("overlay:get-state"),
  hide: () => ipcRenderer.send("overlay:hide"),
  onState: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("overlay:state", listener);
    return () => ipcRenderer.removeListener("overlay:state", listener);
  },
});
