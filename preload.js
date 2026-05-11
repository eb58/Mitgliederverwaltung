const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  platform: process.platform,
  versions: process.versions,
  send: (channel, data) => ipcRenderer.send(channel, data),
  receive: (channel, callback) => ipcRenderer.on(channel, (event, ...args) => callback(...args)),
  fs: {
    readFile: (filePath) => ipcRenderer.invoke("fs:readFile", filePath),
    readFileBase64: (filePath) => ipcRenderer.invoke("fs:readFileBase64", filePath),
    readDir: (dirPath) => ipcRenderer.invoke("fs:readDir", dirPath),
    writeFile: (filePath, data) => ipcRenderer.invoke("fs:writeFile", filePath, data),
    existsSync: (filePath) => ipcRenderer.invoke("fs:existsSync", filePath)
  },
  path: {
    join: (...args) => ipcRenderer.invoke("path:join", ...args),
    dirname: (filePath) => ipcRenderer.invoke("path:dirname", filePath)
  },
  photos: {
    findDataUrl: (membersFilePath, fileNames) => ipcRenderer.invoke("photos:findDataUrl", membersFilePath, fileNames)
  },
  getUserDataPath: () => ipcRenderer.invoke("app:getUserDataPath"),
  getPortableDataPath: () => ipcRenderer.invoke("app:getPortableDataPath"),
  migratePortableData: () => ipcRenderer.invoke("app:migratePortableData")
});
