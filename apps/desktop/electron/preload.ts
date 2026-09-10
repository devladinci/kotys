import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("kotys", {
  platform: process.platform,
  isElectron: true,
  // Renderer notifications can't work from the app://kotys origin; the main
  // process shows them instead.
  notify: (n: { title: string; body: string }) => ipcRenderer.send("notify", n),
});
