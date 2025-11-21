const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Auth
  authRegister: (data) => ipcRenderer.invoke('auth-register', data),
  authLogin: (credentials) => ipcRenderer.invoke('auth-login', credentials),

  // Games
  getGames: () => ipcRenderer.invoke('get-games'),
  getLibrary: () => ipcRenderer.invoke('get-library'),

  // Downloads
  createDownload: (gameId) => ipcRenderer.invoke('create-download', gameId),
  downloadGame: (data) => ipcRenderer.invoke('download-game', data),
  extractGame: (data) => ipcRenderer.invoke('extract-game', data),
  completeDownload: (data) => ipcRenderer.invoke('complete-download', data),
  getDownloads: () => ipcRenderer.invoke('get-downloads'),

  // Game Launch
  launchGame: (data) => ipcRenderer.invoke('launch-game', data),

  // User
  getUserData: () => ipcRenderer.invoke('get-user-data'),
  changeInstallPath: () => ipcRenderer.invoke('change-install-path'),

  // Events
  onDownloadProgress: (callback) => 
    ipcRenderer.on('download-progress', (event, data) => callback(data))
});
