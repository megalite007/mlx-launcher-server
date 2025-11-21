const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { exec } = require('child_process');
const unzipper = require('unzipper');
const os = require('os');

app.disableHardwareAcceleration();

const desktopPath = path.join(os.homedir(), 'Desktop');
const programFilesPath = process.env['ProgramFiles(x86)'] || process.env['ProgramFiles'] || 'C:\\Program Files';
const mlxInstallPath = path.join(programFilesPath, 'MLXGames');

let mainWindow;
const API_URL = 'http://127.0.0.1:3001';

let userData = {
  token: null,
  userId: null,
  username: null,
  installPath: mlxInstallPath
};

[mlxInstallPath].forEach(dir => {
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (error) {
      console.error(`Failed to create directory ${dir}:`, error);
    }
  }
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'launcher.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Auth Register
ipcMain.handle('auth-register', async (event, data) => {
  try {
    const response = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    return { success: true, data: result };
  } catch (error) {
    console.error('Register error:', error);
    return { success: false, error: error.message };
  }
});

// Auth Login
ipcMain.handle('auth-login', async (event, credentials) => {
  try {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error);

    userData.token = result.token;
    userData.userId = result.user.id;
    userData.username = result.user.username;
    userData.installPath = mlxInstallPath;

    return { success: true, data: result.user };
  } catch (error) {
    console.error('Login error:', error);
    return { success: false, error: error.message };
  }
});

// Get Games
ipcMain.handle('get-games', async (event) => {
  try {
    const response = await fetch(`${API_URL}/api/games`);
    if (!response.ok) throw new Error('Failed to fetch games');
    const games = await response.json();
    return { success: true, data: games };
  } catch (error) {
    console.error('Get games error:', error);
    return { success: false, error: error.message };
  }
});

// Get Library
ipcMain.handle('get-library', async (event) => {
  try {
    const response = await fetch(`${API_URL}/api/library`, {
      headers: { 'Authorization': `Bearer ${userData.token}` }
    });

    if (!response.ok) throw new Error('Failed to fetch library');
    const library = await response.json();
    return { success: true, data: library };
  } catch (error) {
    console.error('Get library error:', error);
    return { success: false, error: error.message };
  }
});

// Create Download
ipcMain.handle('create-download', async (event, gameId) => {
  try {
    const response = await fetch(`${API_URL}/api/downloads/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userData.token}`
      },
      body: JSON.stringify({ gameId })
    });

    if (!response.ok) throw new Error('Failed to create download');
    const download = await response.json();
    return { success: true, data: download };
  } catch (error) {
    console.error('Create download error:', error);
    return { success: false, error: error.message };
  }
});

// Download Game
ipcMain.handle('download-game', async (event, { downloadLink, gameId, gameName }) => {
  return new Promise((resolve) => {
    try {
      if (!fs.existsSync(userData.installPath)) {
        fs.mkdirSync(userData.installPath, { recursive: true });
      }

      const fileName = `${gameName.replace(/\s+/g, '_')}_${Date.now()}.zip`;
      const filePath = path.join(userData.installPath, fileName);
      const tempPath = filePath + '.tmp';

      const file = fs.createWriteStream(tempPath);
      let downloadedBytes = 0;
      let totalBytes = 0;

      const request = http.get(downloadLink, (response) => {
        totalBytes = parseInt(response.headers['content-length'], 10) || 0;

        response.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          const progress = totalBytes ? Math.round((downloadedBytes / totalBytes) * 100) : 0;

          mainWindow.webContents.send('download-progress', {
            gameId,
            progress,
            downloaded: downloadedBytes,
            total: totalBytes
          });
        });

        response.pipe(file);
      });

      file.on('finish', () => {
        file.close();
        fs.renameSync(tempPath, filePath);
        resolve({ success: true, filePath, fileName });
      });

      request.on('error', (error) => {
        try { fs.unlinkSync(tempPath); } catch (e) {}
        resolve({ success: false, error: error.message });
      });
    } catch (error) {
      resolve({ success: false, error: error.message });
    }
  });
});

// Extract Game
ipcMain.handle('extract-game', async (event, { filePath, gameFolder }) => {
  return new Promise((resolve) => {
    try {
      const extractPath = path.join(userData.installPath, gameFolder);

      if (!fs.existsSync(extractPath)) {
        fs.mkdirSync(extractPath, { recursive: true });
      }

      fs.createReadStream(filePath)
        .pipe(unzipper.Extract({ path: extractPath }))
        .on('finish', () => {
          try { fs.unlinkSync(filePath); } catch (e) {}
          resolve({ success: true, extractPath });
        })
        .on('error', (error) => {
          resolve({ success: false, error: error.message });
        });
    } catch (error) {
      resolve({ success: false, error: error.message });
    }
  });
});

// Create Desktop Shortcut
function createDesktopShortcut(gameName, exePath, extractPath) {
  try {
    const shortcutPath = path.join(desktopPath, `${gameName}.lnk`);
    const target = path.join(extractPath, exePath);

    const vbScript = `
      Set oWS = WScript.CreateObject("WScript.Shell")
      sLinkFile = "${shortcutPath.replace(/\\/g, '\\\\')}"
      Set oLink = oWS.CreateShortcut(sLinkFile)
      oLink.TargetPath = "${target.replace(/\\/g, '\\\\')}"
      oLink.WorkingDirectory = "${extractPath.replace(/\\/g, '\\\\')}"
      oLink.Save
    `;

    const scriptPath = path.join(os.tmpdir(), `shortcut_${Date.now()}.vbs`);
    fs.writeFileSync(scriptPath, vbScript);

    exec(`cscript.exe "${scriptPath}"`, (error) => {
      try { fs.unlinkSync(scriptPath); } catch (e) {}
    });

    return true;
  } catch (error) {
    console.error('Failed to create desktop shortcut:', error);
    return false;
  }
}

// Launch Game
ipcMain.handle('launch-game', async (event, { executable, gamePath }) => {
  return new Promise((resolve) => {
    try {
      const exePath = path.join(gamePath, executable);

      if (!fs.existsSync(exePath)) {
        return resolve({
          success: false,
          error: `Executable not found: ${exePath}`
        });
      }

      exec(`"${exePath}"`, { cwd: gamePath }, (error) => {
        if (error) {
          resolve({ success: false, error: error.message });
        }
      });

      resolve({ success: true, message: 'Game launched' });
    } catch (error) {
      resolve({ success: false, error: error.message });
    }
  });
});

// Complete Download
ipcMain.handle('complete-download', async (event, { downloadId, installPath, gameName, executable }) => {
  try {
    createDesktopShortcut(gameName, executable, installPath);

    const response = await fetch(`${API_URL}/api/downloads/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userData.token}`
      },
      body: JSON.stringify({ downloadId, installPath })
    });

    if (!response.ok) throw new Error('Failed to complete download');
    const result = await response.json();
    return { success: true, data: result };
  } catch (error) {
    console.error('Complete download error:', error);
    return { success: false, error: error.message };
  }
});

// Get Downloads
ipcMain.handle('get-downloads', async (event) => {
  try {
    const response = await fetch(`${API_URL}/api/downloads`, {
      headers: { 'Authorization': `Bearer ${userData.token}` }
    });

    if (!response.ok) throw new Error('Failed to fetch downloads');
    const downloads = await response.json();
    return { success: true, data: downloads };
  } catch (error) {
    console.error('Get downloads error:', error);
    return { success: false, error: error.message };
  }
});

// Get User Data
ipcMain.handle('get-user-data', async (event) => {
  return userData;
});

// Change Install Path
ipcMain.handle('change-install-path', async (event) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    });

    if (!result.canceled && result.filePaths.length > 0) {
      userData.installPath = result.filePaths[0];
      return { success: true, path: userData.installPath };
    }

    return { success: false, error: 'No folder selected' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
