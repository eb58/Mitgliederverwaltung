const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));
}

// IPC Handlers für Dateioperationen
ipcMain.handle("fs:readFile", async (event, filePath) => {
  try {
    return await fs.promises.readFile(filePath, "utf8");
  } catch (error) {
    throw error;
  }
});

ipcMain.handle("fs:writeFile", async (event, filePath, data) => {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    await fs.promises.writeFile(filePath, data, "utf8");
  } catch (error) {
    throw error;
  }
});

ipcMain.handle("fs:existsSync", (event, filePath) => {
  return fs.existsSync(filePath);
});

ipcMain.handle("path:join", (event, ...args) => {
  return path.join(...args);
});

ipcMain.handle("path:dirname", (event, filePath) => {
  return path.dirname(filePath);
});

ipcMain.handle("app:getUserDataPath", (event) => {
  return app.getPath("userData");
});

app.whenReady().then(() => {
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
