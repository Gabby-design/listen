const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  globalShortcut,
  ipcMain,
  clipboard,
  screen,
  session,
  nativeImage
} = require('electron');
const path = require('path');
const fs = require('fs');

const { loadConfig, saveConfig, getShortcutDisplay } = require('./config');
const { simulatePaste } = require('./paste');

// State tracking
let config = loadConfig();
let tray = null;
let overlayWindow = null;
let settingsWindow = null;
let appState = 'idle'; // 'idle' | 'recording' | 'processing'
let registeredShortcut = null;

// Enforce single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    openSettingsWindow();
  });
}

// Auto-grant microphone permissions
function setupPermissions() {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') {
      return callback(true);
    }
    callback(false);
  });

  ses.setPermissionCheckHandler((webContents, permission) => {
    if (permission === 'media') return true;
    return false;
  });
}

// Create Floating Pill Overlay
function createOverlayWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth } = primaryDisplay.workAreaSize;

  const overlayWidth = 280;
  const overlayHeight = 64;
  const x = Math.round((screenWidth - overlayWidth) / 2);
  const y = 48; // Top-center with 48px margin

  overlayWindow = new BrowserWindow({
    width: overlayWidth,
    height: overlayHeight,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false, // CRITICAL: Never steal focus from active window
    resizable: false,
    movable: false,
    show: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload-overlay.js'),
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  overlayWindow.loadFile(path.join(__dirname, 'overlay', 'overlay.html'));

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

// Create or show Settings Window
function openSettingsWindow(triggerRecorder = false) {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    if (triggerRecorder) {
      settingsWindow.webContents.send('activate-shortcut-recorder');
    }
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 520,
    height: 680,
    resizable: false,
    maximizable: false,
    title: 'Listen - Settings',
    backgroundColor: '#0f111a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload-settings.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  if (fs.existsSync(iconPath)) {
    settingsWindow.setIcon(iconPath);
  }

  settingsWindow.loadFile(path.join(__dirname, 'settings', 'settings.html'));

  settingsWindow.webContents.once('did-finish-load', () => {
    if (triggerRecorder) {
      settingsWindow.webContents.send('activate-shortcut-recorder');
    }
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

// System Tray setup
function createTray() {
  const trayIconPath = path.join(__dirname, 'assets', 'tray-icon.png');
  let trayImage;

  if (fs.existsSync(trayIconPath)) {
    trayImage = nativeImage.createFromPath(trayIconPath);
  } else {
    trayImage = nativeImage.createEmpty();
  }

  tray = new Tray(trayImage);
  tray.setToolTip('Listen - Desktop Voice Dictation');

  updateTrayMenu();

  tray.on('click', () => {
    openSettingsWindow();
  });
}

function updateTrayMenu() {
  if (!tray) return;

  const currentShortcutDisplay = getShortcutDisplay(config.shortcut);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Settings',
      click: () => openSettingsWindow()
    },
    {
      label: 'Re-record Shortcut',
      click: () => openSettingsWindow(true)
    },
    {
      label: `Shortcut: ${currentShortcutDisplay}`,
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Quit Listen',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
}

// Register Global Shortcut
function registerGlobalShortcut() {
  if (registeredShortcut) {
    globalShortcut.unregister(registeredShortcut);
    registeredShortcut = null;
  }

  const shortcutToRegister = config.shortcut || 'CommandOrControl+Shift+Space';

  try {
    const success = globalShortcut.register(shortcutToRegister, handleShortcutPressed);
    if (success) {
      registeredShortcut = shortcutToRegister;
      console.log(`Global shortcut registered successfully: ${shortcutToRegister}`);
    } else {
      console.error(`Failed to register global shortcut: ${shortcutToRegister}`);
    }
  } catch (err) {
    console.error(`Error registering shortcut ${shortcutToRegister}:`, err);
  }

  updateTrayMenu();
}

// Shortcut Toggle Handler
function handleShortcutPressed() {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    createOverlayWindow();
    return;
  }

  if (appState === 'idle') {
    // Start Recording
    appState = 'recording';
    overlayWindow.webContents.send('reset-state');
    overlayWindow.webContents.send('start-recording');

    // Show without stealing focus from active window/cursor
    overlayWindow.showInactive();
  } else if (appState === 'recording') {
    // Stop Recording & Begin Processing
    appState = 'processing';
    overlayWindow.webContents.send('stop-recording');
  } else if (appState === 'processing') {
    // Already transcribing, ignore extra press
    console.log('Currently transcribing audio, please wait...');
  }
}

// Send audio to Whisper API (Groq or OpenAI)
async function transcribeAudio(buffer, mimeType) {
  const provider = config.provider || 'groq';
  const apiKey = config.apiKey ? config.apiKey.trim() : '';
  const model = config.model || (provider === 'groq' ? 'whisper-large-v3-turbo' : 'whisper-1');

  if (!apiKey) {
    throw new Error('No API key configured');
  }

  const endpoint = provider === 'groq'
    ? 'https://api.groq.com/openai/v1/audio/transcriptions'
    : 'https://api.openai.com/v1/audio/transcriptions';

  const formData = new FormData();
  const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
  const blob = new Blob([buffer], { type: mimeType });
  formData.append('file', blob, `dictation.${ext}`);
  formData.append('model', model);
  formData.append('response_format', 'json');

  if (config.language && config.language !== 'auto') {
    formData.append('language', config.language);
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`
    },
    body: formData
  });

  if (!response.ok) {
    let errorDetail = response.statusText;
    try {
      const errJson = await response.json();
      if (errJson.error && errJson.error.message) {
        errorDetail = errJson.error.message;
      }
    } catch {
      // Ignore JSON parse failure on error response
    }
    throw new Error(`API Error (${response.status}): ${errorDetail}`);
  }

  const data = await response.json();
  return data.text ? data.text.trim() : '';
}

// Show temporary error on overlay
function handleOverlayError(errorMessage) {
  appState = 'idle';
  if (!overlayWindow || overlayWindow.isDestroyed()) return;

  overlayWindow.webContents.send('show-error', errorMessage);
  overlayWindow.showInactive();

  setTimeout(() => {
    if (overlayWindow && !overlayWindow.isDestroyed() && appState === 'idle') {
      overlayWindow.hide();
      overlayWindow.webContents.send('reset-state');
    }
  }, 2200);
}

// IPC Handlers
function setupIpcHandlers() {
  // Audio captured by overlay window
  ipcMain.on('audio-captured', async (_event, { buffer, mimeType }) => {
    try {
      if (!buffer || buffer.byteLength === 0) {
        handleOverlayError('No audio captured');
        return;
      }

      console.log(`Transcribing ${buffer.byteLength} bytes using ${config.provider}...`);
      const transcribedText = await transcribeAudio(buffer, mimeType);

      if (!transcribedText) {
        console.log('No speech detected in audio.');
        appState = 'idle';
        if (overlayWindow && !overlayWindow.isDestroyed()) {
          overlayWindow.hide();
        }
        return;
      }

      console.log('Transcription succeeded:', transcribedText);

      // Write transcribed text to system clipboard
      clipboard.writeText(transcribedText);

      // Hide overlay immediately
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.hide();
      }
      appState = 'idle';

      // Wait brief focus stability delay and trigger paste
      const delay = config.pasteDelayMs || 80;
      await simulatePaste(delay);
    } catch (err) {
      console.error('Transcription error:', err);
      let displayMsg = 'Error: STT failed';
      if (err.message.includes('No API key')) {
        displayMsg = 'Error: Check API Key';
      } else if (err.message.includes('401') || err.message.toLowerCase().includes('auth') || err.message.toLowerCase().includes('invalid api key')) {
        displayMsg = 'Error: Invalid API Key';
      } else if (err.message.includes('429')) {
        displayMsg = 'Error: Rate Limit Exceeded';
      }
      handleOverlayError(displayMsg);
    }
  });

  // Recording error reported by renderer
  ipcMain.on('recording-error', (_event, message) => {
    console.error('Microphone recording error:', message);
    handleOverlayError(message || 'Mic Error');
  });

  // Settings: Get Config
  ipcMain.handle('get-config', () => {
    return loadConfig();
  });

  // Settings: Save Config
  ipcMain.handle('save-config', (_event, newConfig) => {
    const result = saveConfig(newConfig);
    if (result.success) {
      config = result.config;
      registerGlobalShortcut();
    }
    return result;
  });

  // Settings: Test API Key
  ipcMain.handle('test-api-key', async (_event, { provider, apiKey, model }) => {
    try {
      const endpoint = provider === 'groq'
        ? 'https://api.groq.com/openai/v1/models'
        : 'https://api.openai.com/v1/models';

      const res = await fetch(endpoint, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const msg = errorData.error ? errorData.error.message : res.statusText;
        return { success: false, error: msg };
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Settings: Close
  ipcMain.on('close-settings', () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.close();
    }
  });
}

// App lifecycle
app.whenReady().then(() => {
  setupPermissions();
  setupIpcHandlers();
  createOverlayWindow();
  createTray();
  registerGlobalShortcut();

  // If no API key is configured, automatically open Settings window on initial launch
  if (!config.apiKey || !config.apiKey.trim()) {
    openSettingsWindow();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createOverlayWindow();
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// Keep running in background / tray when all windows are closed
app.on('window-all-closed', (e) => {
  e.preventDefault();
});
