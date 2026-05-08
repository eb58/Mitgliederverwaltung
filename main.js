const { app, BrowserWindow, Menu, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

const createApplicationMenu = () => Menu.buildFromTemplate([
  {
    label: "Ansicht",
    submenu: [
      {
        label: "Entwicklertools",
        accelerator: "CommandOrControl+Shift+I",
        role: "toggleDevTools"
      },
      {
        label: "Neu laden",
        accelerator: "CommandOrControl+R",
        role: "reload"
      },
      {
        label: "Neu laden erzwingen",
        accelerator: "CommandOrControl+Shift+R",
        role: "forceReload"
      },
      { type: "separator" },
      {
        label: "Zoom In",
        accelerator: "CommandOrControl+Plus",
        role: "zoomIn"
      },
      {
        label: "Zoom Out",
        accelerator: "CommandOrControl+-",
        role: "zoomOut"
      },
      {
        label: "Zoom zuruecksetzen",
        accelerator: "CommandOrControl+0",
        role: "resetZoom"
      }
    ]
  }
]);

const createMainWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));
};

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
  Menu.setApplicationMenu(createApplicationMenu());
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
