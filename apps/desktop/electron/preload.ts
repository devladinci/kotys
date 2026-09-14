import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("kotys", {
  platform: process.platform,
  isElectron: true,
  // Renderer notifications can't work from the app://kotys origin; the main
  // process shows them instead.
  notify: (n: { title: string; body: string }) => ipcRenderer.send("notify", n),
  // Backend mode: read the persisted config, write a new one (validated in
  // main), and restart the window against the chosen backend.
  getBackend: () => ipcRenderer.invoke("backend:get"),
  setBackend: (raw: unknown) => ipcRenderer.invoke("backend:set", raw),
  restartWithBackend: () => ipcRenderer.invoke("backend:restart"),
  connectCode: () => ipcRenderer.invoke("backend:connectCode"),
});