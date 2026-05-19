const { app, BrowserWindow, Menu, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { startServer: startMemberApiServer } = require("./server/server");

const appIconPath = path.join(__dirname, "assets", "app-icon.png");
const storageFileNames = ["members.json", "members.csv"];
let memberApiServer = null;

const getPortableDataPath = () => app.isPackaged ? path.dirname(app.getPath("exe")) : app.getPath("userData");

const copyIfMissing = async (sourcePath, targetPath) => {
  if (!fs.existsSync(sourcePath) || fs.existsSync(targetPath)) {
    return false;
  }

  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.promises.copyFile(sourcePath, targetPath);
  return true;
};

const copyDirectoryIfMissing = async (sourcePath, targetPath) => {
  if (!fs.existsSync(sourcePath) || fs.existsSync(targetPath)) {
    return false;
  }

  await fs.promises.cp(sourcePath, targetPath, { recursive: true });
  return true;
};

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
    icon: appIconPath,
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

ipcMain.handle("fs:readFileBase64", async (event, filePath) => {
  try {
    return await fs.promises.readFile(filePath, "base64");
  } catch (error) {
    throw error;
  }
});

ipcMain.handle("fs:readDir", async (event, dirPath) => {
  try {
    return await fs.promises.readdir(dirPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
});

ipcMain.handle("photos:findDataUrl", async (event, membersFilePath, fileNames) => {
  const passbilderDirectoryPath = path.join(path.dirname(membersFilePath), "Passbilder");
  const names = Array.isArray(fileNames) ? fileNames.filter(Boolean) : [];
  if (names.length === 0 || !fs.existsSync(passbilderDirectoryPath)) {
    return null;
  }

  const availableFileNames = await fs.promises.readdir(passbilderDirectoryPath);
  const fileNameByLowerName = new Map(availableFileNames.map(fileName => [fileName.toLowerCase(), fileName]));
  const matchedFileName = names.map(fileName => fileNameByLowerName.get(String(fileName).toLowerCase())).find(Boolean);
  if (!matchedFileName) {
    return null;
  }

  const photoPath = path.join(passbilderDirectoryPath, matchedFileName);
  const extension = path.extname(photoPath).toLowerCase();
  const mimeTypes = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png"
  };
  const base64 = await fs.promises.readFile(photoPath, "base64");
  return `data:${mimeTypes[extension] || "image/jpeg"};base64,${base64}`;
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

ipcMain.handle("app:getPortableDataPath", () => {
  return getPortableDataPath();
});

ipcMain.handle("app:migratePortableData", async () => {
  const sourceDirectoryPath = app.getPath("userData");
  const targetDirectoryPath = getPortableDataPath();
  const copied = [];

  for (const fileName of storageFileNames) {
    if (await copyIfMissing(path.join(sourceDirectoryPath, fileName), path.join(targetDirectoryPath, fileName))) {
      copied.push(fileName);
    }
  }

  if (await copyDirectoryIfMissing(path.join(sourceDirectoryPath, "Passbilder"), path.join(targetDirectoryPath, "Passbilder"))) {
    copied.push("Passbilder");
  }

  return { copied, targetDirectoryPath };
});

app.whenReady().then(async () => {
  try {
    memberApiServer = await startMemberApiServer();
  } catch (error) {
    if (error.code === "EADDRINUSE") {
      console.warn("Mitglieder-API laeuft bereits.");
    } else {
      console.warn("Mitglieder-API konnte nicht gestartet werden.", error);
    }
  }

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

app.on("before-quit", () => {
  if (memberApiServer) {
    memberApiServer.close();
    memberApiServer = null;
  }
});
