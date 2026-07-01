// Preload script — runs in renderer context with Node access controlled
// Currently minimal: the app talks to the API server via fetch, no Node required in renderer
const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('gooseDirector', {
  version: '0.1.0',
  platform: process.platform,
})
