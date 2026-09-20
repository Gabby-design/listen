const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settingsApi', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  testApiKey: (data) => ipcRenderer.invoke('test-api-key', data),
  triggerDictation: () => ipcRenderer.send('trigger-dictation'),
  closeSettings: () => ipcRenderer.send('close-settings'),
  completeFirstLaunch: (customShortcut) => ipcRenderer.invoke('complete-first-launch', customShortcut),
  onActivateShortcutRecorder: (callback) => {
    ipcRenderer.on('activate-shortcut-recorder', () => callback());
  },
  onSetFirstLaunchMode: (callback) => {
    ipcRenderer.on('set-first-launch-mode', (_event, isFirstLaunch) => callback(isFirstLaunch));
  }
});
