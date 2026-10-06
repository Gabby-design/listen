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
  nativeImage,
  Notification
} = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

const { loadConfig, saveConfig, getShortcutDisplay } = require('./config');
const { simulatePaste } = require('./paste');
const { execFile } = require('child_process');
const { loadHistory, addHistoryItem, clearHistory } = require('./history');

app.name = 'Listen';
app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
try {
  app.setPath('userData', path.join(app.getPath('appData'), 'ListenDictation'));
} catch (e) {
  // Ignore if called before app ready
}

// State tracking
let config = loadConfig();
let tray = null;
let overlayWindow = null;
let settingsWindow = null;
let appState = 'idle'; // 'idle' | 'recording' | 'processing'
let activeMode = 'verbatim'; // 'verbatim' | 'smart_ai'
let registeredShortcuts = [];
let keyWatcherProcess = null;

function getKeyWatcherPath() {
  const localPath = path.join(__dirname, 'assets', 'bin', 'keywatcher.exe');
  if (app.isPackaged) {
    const unpacked = path.join(process.resourcesPath, 'app.asar.unpacked', 'assets', 'bin', 'keywatcher.exe');
    if (fs.existsSync(unpacked)) return unpacked;
  }
  if (fs.existsSync(localPath)) return localPath;
  return null;
}

function getAudioControlPath() {
  const localPath = path.join(__dirname, 'assets', 'bin', 'audiocontrol.exe');
  if (app.isPackaged) {
    const unpacked = path.join(process.resourcesPath, 'app.asar.unpacked', 'assets', 'bin', 'audiocontrol.exe');
    if (fs.existsSync(unpacked)) return unpacked;
  }
  if (fs.existsSync(localPath)) return localPath;
  return null;
}

function getOfflineTranscriberPath() {
  const localPath = path.join(__dirname, 'assets', 'bin', 'offlinetranscriber.exe');
  if (app.isPackaged) {
    const unpacked = path.join(process.resourcesPath, 'app.asar.unpacked', 'assets', 'bin', 'offlinetranscriber.exe');
    if (fs.existsSync(unpacked)) return unpacked;
  }
  if (fs.existsSync(localPath)) return localPath;
  return null;
}

let didPauseMediaByListen = false;

function pauseMediaIfPlaying() {
  if (config.pauseMediaOnRecord === false && config.muteAudioOnRecord === false) return;
  if (process.platform !== 'win32') return;
  const exePath = getAudioControlPath();
  if (!exePath || !fs.existsSync(exePath)) return;

  try {
    execFile(exePath, ['pause-if-playing'], (err, stdout) => {
      if (err) {
        console.warn('Audio control error:', err.message);
      } else {
        const out = stdout ? stdout.trim() : '';
        if (out.includes('PAUSED')) {
          if (appState !== 'recording') {
            // Recording already finished or was cancelled before pause completed; restore immediately
            console.log('[AudioControl]: Recording stopped before pause completed; restoring immediately.');
            execFile(exePath, ['resume-media'], () => {});
            didPauseMediaByListen = false;
          } else {
            didPauseMediaByListen = true;
            console.log('[AudioControl]: Background music/audio paused while listening.');
          }
        } else {
          didPauseMediaByListen = false;
          console.log('[AudioControl]: No active audio playing. Background media left untouched.');
        }
      }
    });
  } catch (e) {
    console.warn('Audio pause exception:', e);
  }
}

function restoreMediaIfPaused() {
  if (process.platform !== 'win32') return;
  if (!didPauseMediaByListen) {
    // Sound was not playing or was already paused before dictation started; leave it untouched
    return;
  }
  // Clear immediately to prevent multiple duplicate calls from dispatching parallel resumes
  didPauseMediaByListen = false;

  const exePath = getAudioControlPath();
  if (!exePath || !fs.existsSync(exePath)) return;

  try {
    execFile(exePath, ['resume-media'], (err, stdout) => {
      if (err) {
        console.warn('Audio resume error:', err.message);
      } else {
        const out = stdout ? stdout.trim() : '';
        if (out.includes('RESUMED')) {
          console.log('[AudioControl]: Background music/audio resumed.');
        }
      }
    });
  } catch (e) {
    console.warn('Audio restore exception:', e);
  }
}

function pauseAndMuteAudio() {
  pauseMediaIfPlaying();
}

function restoreAudio() {
  restoreMediaIfPaused();
}

function transcribeAudioOffline(audioBuffer) {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') {
      return reject(new Error('Offline speech engine currently requires Windows.'));
    }
    const exePath = getOfflineTranscriberPath();
    if (!exePath || !fs.existsSync(exePath)) {
      return reject(new Error('Offline transcriber binary not found at ' + exePath));
    }

    try {
      const tempDir = app.getPath('userData');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      const tempWav = path.join(tempDir, `offline_dictation_${Date.now()}.wav`);
      fs.writeFileSync(tempWav, Buffer.from(audioBuffer));

      execFile(exePath, ['transcribe', tempWav], { timeout: 25000 }, (err, stdout, stderr) => {
        // Clean up temporary wav file safely
        try {
          if (fs.existsSync(tempWav)) fs.unlinkSync(tempWav);
        } catch (cleanupErr) {}

        if (err) {
          console.error('Offline transcription process error:', err, stderr);
          return reject(new Error(`Offline STT failed: ${stderr || err.message}`));
        }

        const recognizedText = stdout ? stdout.trim() : '';
        console.log(`[Offline Transcriber]: Recognized "${recognizedText}"`);
        resolve(recognizedText);
      });
    } catch (err) {
      console.error('Offline transcriber invocation error:', err);
      reject(err);
    }
  });
}

function getVirtualKeyCodesForShortcut(shortcut) {
  if (!shortcut) return ['0x11', '0x10', '0x20'];
  const parts = shortcut.split('+').map(p => p.trim());
  const vks = [];
  for (const part of parts) {
    const p = part.toLowerCase();
    if (p === 'commandorcontrol' || p === 'control' || p === 'ctrl') vks.push('0x11');
    else if (p === 'shift') vks.push('0x10');
    else if (p === 'alt') vks.push('0x12');
    else if (p === 'space') vks.push('0x20');
    else if (p === 'escape' || p === 'esc') vks.push('0x1B');
    else if (p.length === 1 && p >= 'a' && p <= 'z') vks.push('0x' + p.toUpperCase().charCodeAt(0).toString(16));
    else if (p.length === 1 && p >= '0' && p <= '9') vks.push('0x' + p.charCodeAt(0).toString(16));
    else if (p.startsWith('f') && parseInt(p.slice(1)) >= 1 && parseInt(p.slice(1)) <= 12) {
      vks.push('0x' + (0x70 + parseInt(p.slice(1)) - 1).toString(16));
    }
  }
  return vks.length > 0 ? vks : ['0x11', '0x10', '0x20'];
}

function stopKeyWatcher() {
  if (keyWatcherProcess) {
    try {
      keyWatcherProcess.kill();
    } catch (e) {}
    keyWatcherProcess = null;
  }
}

function startPushToTalkWatcher(shortcutStr) {
  if (process.platform !== 'win32') return;
  const watcherPath = getKeyWatcherPath();
  if (!watcherPath || !fs.existsSync(watcherPath)) return;

  stopKeyWatcher();
  const vks = getVirtualKeyCodesForShortcut(shortcutStr);

  try {
    keyWatcherProcess = execFile(watcherPath, ['wait-release', ...vks], (err) => {
      keyWatcherProcess = null;
      if (appState === 'recording' && config.dictationMode === 'push_to_talk') {
        console.log('Push-to-talk key released -> stopping recording');
        handleShortcutPressed(false, true);
      }
    });
  } catch (err) {
    console.error('Error starting keywatcher:', err);
  }
}

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

// Create Floating Fluid Orb Overlay
function createOverlayWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { x: workX, y: workY, width: screenWidth, height: screenHeight } = primaryDisplay.workArea;

  const orbSize = 140;
  const x = Math.round(workX + (screenWidth - orbSize) / 2);
  const y = Math.round(workY + screenHeight - orbSize - 20); // Bottom-center floating seamlessly above taskbar

  overlayWindow = new BrowserWindow({
    width: orbSize,
    height: orbSize,
    x,
    y,
    frame: false,
    transparent: true,
    hasShadow: false,
    roundedCorners: false,
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

  if (process.platform === 'darwin') {
    overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  } else {
    overlayWindow.setAlwaysOnTop(true);
  }
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  overlayWindow.webContents.on('console-message', (_e, _level, message) => {
    console.log(`[Overlay Window]: ${message}`);
  });

  overlayWindow.loadFile(path.join(__dirname, 'overlay', 'overlay.html'));

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

// Create or show Main Application Window
function openSettingsWindow(triggerRecorder = false, isFirstLaunch = false) {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    if (settingsWindow.isMinimized()) {
      settingsWindow.restore();
    }
    settingsWindow.show();
    settingsWindow.focus();
    if (isFirstLaunch) {
      settingsWindow.webContents.send('set-first-launch-mode', true);
    }
    if (triggerRecorder) {
      settingsWindow.webContents.send('activate-shortcut-recorder');
    }
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 620,
    height: 780,
    minWidth: 540,
    minHeight: 660,
    resizable: true,
    maximizable: true,
    title: 'Listen Dictation',
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
    if (isFirstLaunch) {
      settingsWindow.webContents.send('set-first-launch-mode', true);
    }
    if (triggerRecorder) {
      settingsWindow.webContents.send('activate-shortcut-recorder');
    }
  });

  // Intercept window close: minimize to tray while listening continues in background
  settingsWindow.on('close', (e) => {
    if (!app.isQuitting && config.closeToTray !== false) {
      e.preventDefault();
      settingsWindow.hide();
      if (process.platform === 'win32' && tray && !app.hasShownTrayTip) {
        app.hasShownTrayTip = true;
        try {
          tray.displayBalloon({
            title: 'Listen is running in the background',
            content: `Listen is minimized to tray. Press ${getShortcutDisplay(config.shortcut)} anytime to dictate.`
          });
        } catch (err) {}
      }
    } else {
      settingsWindow = null;
    }
  });
}

const openMainWindow = openSettingsWindow;

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
  const secondaryDisplay = config.secondaryShortcut ? getShortcutDisplay(config.secondaryShortcut) : 'None';
  const modeDisplay = config.dictationMode === 'push_to_talk' ? 'Push-to-Talk' : 'Toggle';

  const contextMenu = Menu.buildFromTemplate([
    {
      label: appState === 'recording' ? '⏹️ Stop Dictation' : '🎙️ Start Dictation (Verbatim)',
      click: () => handleShortcutPressed(false, false)
    },
    {
      label: '✨ Start Dictation (Smart Polish)',
      click: () => handleShortcutPressed(true, false)
    },
    { type: 'separator' },
    {
      label: 'Open Settings',
      click: () => openSettingsWindow()
    },
    {
      label: 'Re-record Shortcut',
      click: () => openSettingsWindow(true)
    },
    { type: 'separator' },
    {
      label: `Mode: ${modeDisplay}`,
      enabled: false
    },
    {
      label: `Verbatim Hotkey: ${currentShortcutDisplay}`,
      enabled: false
    },
    {
      label: `Smart Polish Hotkey: ${secondaryDisplay}`,
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

// Register Global Shortcut with fallbacks and secondary hotkey
function registerGlobalShortcut() {
  if (Array.isArray(registeredShortcuts)) {
    for (const sc of registeredShortcuts) {
      try {
        globalShortcut.unregister(sc);
      } catch (e) {}
    }
  }
  registeredShortcuts = [];

  const primary = config.shortcut || 'CommandOrControl+Shift+Space';
  const listToRegister = [{ key: primary, secondary: false }];

  // Secondary shortcut for Smart AI Polish mode
  if (config.secondaryShortcut && config.secondaryShortcut.trim()) {
    listToRegister.push({ key: config.secondaryShortcut.trim(), secondary: true });
  }

  // Multi-hotkey fallback list so IME, VS Code, or system menus never block dictation
  const fallbacks = [
    'CommandOrControl+Shift+Space',
    'CommandOrControl+Space',
    'F8',
    'Alt+D'
  ];

  for (const fb of fallbacks) {
    if (!listToRegister.some(item => item.key.toLowerCase() === fb.toLowerCase())) {
      listToRegister.push({ key: fb, secondary: false });
    }
  }

  for (const item of listToRegister) {
    try {
      const ok = globalShortcut.register(item.key, () => {
        console.log(`Global shortcut pressed: ${item.key} (secondary: ${item.secondary})`);
        handleShortcutPressed(item.secondary, false);
      });
      if (ok) {
        registeredShortcuts.push(item.key);
        console.log(`Global shortcut registered: ${item.key} (secondary: ${item.secondary})`);
      } else {
        console.warn(`Could not register shortcut: ${item.key}`);
      }
    } catch (err) {
      console.error(`Error registering shortcut ${item.key}:`, err);
    }
  }

  updateTrayMenu();
}

// Shortcut Handler (Supports both Toggle and Push-to-Talk)
function handleShortcutPressed(isSecondary = false, isReleaseTrigger = false) {
  console.log(`handleShortcutPressed called. State: ${appState}, secondary: ${isSecondary}, releaseTrigger: ${isReleaseTrigger}`);
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    createOverlayWindow();
  }

  const mode = config.dictationMode || 'toggle';

  if (appState === 'idle') {
    // Start Recording - Mute background audio and pause music playback
    pauseAndMuteAudio();
    activeMode = isSecondary ? 'smart_ai' : 'verbatim';
    appState = 'recording';
    updateTrayMenu();

    if (overlayWindow && !overlayWindow.isDestroyed()) {
      const isOfflineMode = config.provider === 'offline' || config.model === 'offline-windows';
      overlayWindow.webContents.send('set-sound-feedback', config.soundFeedback !== false);
      overlayWindow.webContents.send('reset-state');
      overlayWindow.webContents.send('start-recording', { isOffline: isOfflineMode });

      // Show without stealing focus from active window/cursor
      if (process.platform === 'darwin') {
        overlayWindow.setAlwaysOnTop(true, 'screen-saver');
      } else {
        overlayWindow.setAlwaysOnTop(true);
      }
      overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      overlayWindow.showInactive();
      overlayWindow.moveTop();
    }
    console.log(`Overlay window shown (recording started, mode: ${activeMode}).`);

    // In Push-to-Talk mode, start native key release watcher
    if (mode === 'push_to_talk') {
      const activeShortcut = isSecondary ? config.secondaryShortcut : config.shortcut;
      startPushToTalkWatcher(activeShortcut);
    }
  } else if (appState === 'recording') {
    if (mode === 'push_to_talk') {
      // In push-to-talk mode, only actual key release triggers stop; ignore OS keydown repeats
      if (!isReleaseTrigger) {
        return;
      }
    }

    // Stop Recording & Begin Processing - Restore background audio output
    stopKeyWatcher();
    restoreAudio();
    appState = 'processing';
    updateTrayMenu();
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('stop-recording');
    }
    console.log('Recording stopped, transcribing...');
  } else if (appState === 'processing') {
    console.log('Currently transcribing audio, please wait...');
  }
}

// Intelligent formatting: Punctuation, capitalization, brackets, numbers, math signs, and verbal commands
function formatTranscription(rawText) {
  if (!rawText) return '';
  let text = rawText.trim();

  // 1. Explicit number directives: "number one in figures" -> "1", "number 1 in words" -> "one"
  const wordToFig = {
    'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
    'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9',
    'ten': '10', 'eleven': '11', 'twelve': '12'
  };
  const figToWord = {
    '0': 'zero', '1': 'one', '2': 'two', '3': 'three', '4': 'four',
    '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine',
    '10': 'ten'
  };

  text = text.replace(/\bnumber\s+(zero|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+in\s+figures\b/gi, (_m, val) => {
    const lower = val.toLowerCase();
    return wordToFig[lower] || val;
  });

  text = text.replace(/\bnumber\s+(\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten)\s+in\s+words\b/gi, (_m, val) => {
    return figToWord[val] || val.toLowerCase();
  });

  // 2. Mathematical expressions with digits or words
  text = text.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:plus|\+)\s+(zero|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b/gi, (_m, a, b) => {
    const na = wordToFig[a.toLowerCase()] || a;
    const nb = wordToFig[b.toLowerCase()] || b;
    return `${na} + ${nb}`;
  });
  text = text.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:minus|\-)\s+(zero|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b/gi, (_m, a, b) => {
    const na = wordToFig[a.toLowerCase()] || a;
    const nb = wordToFig[b.toLowerCase()] || b;
    return `${na} - ${nb}`;
  });
  text = text.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:times|\*|multiplied by)\s+(zero|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b/gi, (_m, a, b) => {
    const na = wordToFig[a.toLowerCase()] || a;
    const nb = wordToFig[b.toLowerCase()] || b;
    return `${na} * ${nb}`;
  });
  text = text.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:divided by|\/)\s+(zero|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b/gi, (_m, a, b) => {
    const na = wordToFig[a.toLowerCase()] || a;
    const nb = wordToFig[b.toLowerCase()] || b;
    return `${na} / ${nb}`;
  });
  text = text.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:equals to|equal to|equals|=)\s+(zero|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b/gi, (_m, a, b) => {
    const na = wordToFig[a.toLowerCase()] || a;
    const nb = wordToFig[b.toLowerCase()] || b;
    return `${na} = ${nb}`;
  });

  // Hyphenated words: "user dash friendly" -> "user-friendly"
  text = text.replace(/\b([a-zA-Z0-9]+)\s+(?:hyphen|dash)\s+([a-zA-Z0-9]+)\b/gi, '$1-$2');

  // 3. Spoken punctuation commands and signs conversion
  const spokenPunctuation = [
    { regex: /\b(ellipsis|ellipses|dot dot dot)\b/gi, rep: '...' },
    { regex: /\b(period|full stop)\b/gi, rep: '.' },
    { regex: /\b(comma)\b/gi, rep: ',' },
    { regex: /\b(question mark)\b/gi, rep: '?' },
    { regex: /\b(exclamation mark|exclamation point)\b/gi, rep: '!' },
    { regex: /\b(colon)\b/gi, rep: ':' },
    { regex: /\b(semicolon)\b/gi, rep: ';' },
    { regex: /\b(hyphen|dash)\b/gi, rep: '-' },
    { regex: /\b(plus sign)\b/gi, rep: '+' },
    { regex: /\b(equals to|equal to)\b/gi, rep: '=' },
    { regex: /\b(open bracket|open parenthesis|open paren)\b/gi, rep: '(' },
    { regex: /\b(close bracket|close parenthesis|close paren)\b/gi, rep: ')' },
    { regex: /\b(open square bracket)\b/gi, rep: '[' },
    { regex: /\b(close square bracket)\b/gi, rep: ']' },
    { regex: /\b(open curly bracket|open brace)\b/gi, rep: '{' },
    { regex: /\b(close curly bracket|close brace)\b/gi, rep: '}' },
    { regex: /\b(open quote)\b/gi, rep: '"' },
    { regex: /\b(close quote)\b/gi, rep: '"' },
    { regex: /\b(percent sign|percentage sign)\b/gi, rep: '%' },
    { regex: /\b(at sign)\b/gi, rep: '@' },
    { regex: /\b(hashtag|hash sign|pound sign)\b/gi, rep: '#' },
    { regex: /\b(ampersand|and sign)\b/gi, rep: '&' },
    { regex: /\b(forward slash)\b/gi, rep: '/' },
    { regex: /\b(backslash)\b/gi, rep: '\\' },
    { regex: /\b(new line)\b/gi, rep: '\n' },
    { regex: /\b(new paragraph)\b/gi, rep: '\n\n' }
  ];

  for (const { regex, rep } of spokenPunctuation) {
    text = text.replace(regex, rep);
  }

  // 4. Fix spacing around punctuation marks
  text = text.replace(/\.\.\./g, '___ELLIPSIS___');
  text = text.replace(/\s+([,:;?!%])/g, '$1');
  text = text.replace(/\s+\./g, '.');
  text = text.replace(/([,.:;?!])([A-Za-z0-9])/g, '$1 $2');
  text = text.replace(/___ELLIPSIS___/g, '... ');

  // 5. Brackets & parenthesis formatting: "( text )" -> "(text)", "word(text)" -> "word (text)"
  text = text.replace(/\(\s+/g, '(');
  text = text.replace(/\s+\)/g, ')');
  text = text.replace(/([A-Za-z0-9])\(/g, '$1 (');
  text = text.replace(/\)([A-Za-z0-9])/g, ') $1');

  text = text.replace(/\[\s+/g, '[');
  text = text.replace(/\s+\]/g, ']');
  text = text.replace(/([A-Za-z0-9])\[/g, '$1 [');
  text = text.replace(/\]([A-Za-z0-9])/g, '] $1');

  // 6. Collapse consecutive spaces (preserving newlines)
  text = text.replace(/[ \t]+/g, ' ');

  // 7. Intelligent capitalization:
  // First character of dictation
  text = text.charAt(0).toUpperCase() + text.slice(1);
  // After terminal punctuation (. ? !) followed by whitespace
  text = text.replace(/([.?!]\s+)([a-z])/g, (_match, p1, p2) => p1 + p2.toUpperCase());
  // After newlines
  text = text.replace(/(\n+)([a-z])/g, (_match, p1, p2) => p1 + p2.toUpperCase());
  // Capitalize standalone pronoun "I" and contractions
  text = text.replace(/\b(i)\b/g, 'I');
  text = text.replace(/\bi'([a-z]+)/gi, (_match, suffix) => "I'" + suffix.toLowerCase());

  return text.trim();
}

// Two-stage AI context engine: Polishes speech with natural punctuation, lists, numbers, or full smart polish
async function enhanceTranscriptionWithAI(rawText, mode = 'verbatim') {
  if (!rawText || !rawText.trim()) return '';
  if (config.aiIntelligence === false) {
    return formatTranscription(rawText);
  }

  const provider = config.provider || 'groq';
  const apiKey = config.apiKey ? config.apiKey.trim() : '';
  if (!apiKey) {
    return formatTranscription(rawText);
  }

  const llmModel = provider === 'groq' ? 'openai/gpt-oss-20b' : 'gpt-4o-mini';
  const endpoint = provider === 'groq'
    ? 'https://api.groq.com/openai/v1/chat/completions'
    : 'https://api.openai.com/v1/chat/completions';

  let systemPrompt = '';
  if (mode === 'smart_ai') {
    systemPrompt = `You are Listen AI in Smart Polish Mode.
Your job is to listen to the speaker, understand the sentence they are putting together, fix phonetic or grammatical slips, and format clean, beautiful written text.

CORE INSTRUCTIONS:
1. UNDERSTAND SENTENCES, WORDS & VOCAL SOUNDS:
   - Truly understand the meaning and context of the words coming out of the speaker's mouth.
   - Assemble complete, coherent sentences with correct word placement, vocabulary, and spelling.
   - Clean up verbal stutters and filler words ("you know", "like" when used purely as vocal hesitation).
   - PRESERVE HUMMING & SINGING: If the speaker is humming (e.g., "hmmm", "hmm", "mmm", "hmm-mm") or singing lyrics, preserve every word and humming sound verbatim. Do NOT delete humming sounds or sung lyrics.
   - If no words or vocal sounds were spoken, output an empty string. Never hallucinate or invent words.
2. INTELLIGENT NUMBERS & FIGURES:
   - When the speaker refers to figures, mathematical numbers, measurements, dates, times, currency, or explicit numbers ("number 1", "5 dollars", "3 o'clock"), write them in figures (e.g., 1, 5, 3:00).
   - If the speaker says "in figures" or "in words", follow that directive explicitly (e.g. "number one in figures" -> "1", "number one in words" -> "one").
   - For small cardinal numbers in everyday prose ("I have one question"), write as words unless the context is technical, quantitative, or list-oriented.
3. SIGNS & SYMBOLS:
   - Convert spoken mathematical and technical symbols into proper signs when used in math/technical contexts: "plus" -> "+", "equals" / "equals to" -> "=", "minus" -> "-", "times" / "multiplied by" -> "×" or "*", "divided by" -> "/", "percent" -> "%", "at" in handles/emails -> "@", "hashtag" -> "#", "ampersand" -> "&".
   - Differentiate math vs prose ("2 plus 2 equals 4" -> "2 + 2 = 4", but "a big plus for us" -> "a big plus for us").
4. PUNCTUATION & CADENCE:
   - Insert natural commas, periods/full stops, question marks, exclamation marks, ellipses, hyphens, and brackets matching sentence rhythm and grammar even when punctuation words are not spoken.
   - Convert spoken punctuation commands: "comma" -> ",", "period"/"full stop" -> ".", "question mark" -> "?", "exclamation mark" -> "!", "ellipsis"/"dot dot dot" -> "...", "bracket"/"in brackets" -> "(...)", "hyphen"/"dash" -> "-", "colon" -> ":", "semicolon" -> ";", "new line" -> newline.
5. LISTS & STEPS:
   - Automatically format spoken lists or numbered steps into clean numbered lists ("1. Item") or bullet points.
6. STRICT OUTPUT:
   - Output ONLY the polished text with NO preamble, explanation, notes, or markdown code fences.`;
  } else {
    systemPrompt = `You are Listen AI, an intelligent voice dictation engine.
Your job is to listen to the speaker's words, understand their sentences, fix any phonetic speech misrecognitions or spelling errors, and format the output accurately and naturally.

CORE INTELLIGENCE RULES:
1. UNDERSTAND SENTENCES, WORDS & VOCAL EXPRESSIONS:
   - Truly understand the meaning and context of the words coming out of the speaker's mouth.
   - If a word was misheard or phonetically garbled by speech-to-text, correct it based on sentence context so the sentence makes complete, coherent sense.
   - Ensure all words are spelled correctly and placed where they logically belong in the sentence.
   - PRESERVE HUMMING & SINGING: If the speaker is humming (e.g., "hmmm", "hmm", "mmm", "hmm-mm") or singing, faithfully preserve the humming and lyrics verbatim.
   - If no words were spoken, output an empty string. Never hallucinate words.
2. INTELLIGENT NUMBER & FIGURE FORMATTING:
   - Format numbers according to context and speaker intent:
     * When referring to figures, mathematical numbers, measurements, dates, times, currency, or explicit numbers ("number 1", "5 dollars", "3 o'clock", "step 2"), write them in figures (e.g., 1, 5, 3:00, Step 2).
     * If the user says "in figures" or "in words", follow that directive explicitly (e.g., "number one in figures" -> "1", "number one in words" -> "one").
     * For small cardinal numbers in everyday prose ("I have one question"), write as words unless the context is technical, quantitative, or list-oriented.
3. SIGNS & MATHEMATICAL SYMBOLS:
   - Convert spoken mathematical and technical symbols into proper signs when used in math/technical contexts:
     * "plus" -> "+" (e.g., "two plus two" -> "2 + 2")
     * "equals" or "equals to" -> "=" (e.g., "equals four" -> "= 4")
     * "minus" -> "-" (e.g., "five minus three" -> "5 - 3")
     * "times" or "multiplied by" -> "×" or "*"
     * "divided by" -> "/"
     * "percent" -> "%"
     * "at" in handles/emails -> "@"
     * "hashtag" / "hash" -> "#"
     * "ampersand" -> "&"
   - Contextual disambiguation: Differentiate math vs prose ("two plus two equals four" -> "2 + 2 = 4", but "that is a plus for us" -> "that is a plus for us").
4. PUNCTUATION & CADENCE:
   - Insert proper punctuation (commas, periods/full stops, question marks, exclamation marks, ellipses, hyphens, brackets/parentheses, quotes) matching natural grammatical rhythm, clauses, and pauses even when punctuation words are not spoken.
   - Also convert explicitly spoken punctuation commands:
     * "comma" -> ","
     * "period" / "full stop" -> "."
     * "question mark" -> "?"
     * "exclamation mark" / "exclamation point" -> "!"
     * "ellipsis" / "dot dot dot" -> "..."
     * "bracket" / "open bracket ... close bracket" / "in brackets" -> "(...)"
     * "hyphen" / "dash" -> "-"
     * "colon" -> ":"
     * "semicolon" -> ";"
     * "new line" -> line break
     * "new paragraph" -> double line break
5. STRICT OUTPUT:
   - Output ONLY the final transcribed text.
   - No conversational replies, no explanations, no preamble, no markdown code blocks.`;
  }

  try {
    const maxTokens = Math.min(1024, Math.max(128, Math.ceil(rawText.length * 1.5)));
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: llmModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: rawText }
        ],
        temperature: mode === 'smart_ai' ? 0.2 : 0.0,
        max_tokens: maxTokens
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
        let content = data.choices[0].message.content.trim();
        if (content.startsWith('```') && content.endsWith('```')) {
          content = content.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim();
        }
        if (content) {
          return content;
        }
      }
    }
  } catch (err) {
    console.warn('AI enhancement fallback to regex formatting:', err.message);
  }

  // Fallback to local regex formatting if network fails or takes too long
  return formatTranscription(rawText);
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
  formData.append('temperature', '0'); // Deterministic, zero hallucination

  if (config.language && config.language !== 'auto') {
    formData.append('language', config.language);
  }

  // Base conditioning prompt to establish punctuation, capitalization, numbers, humming, singing, and signs
  const baseWhisperPrompt = 'Transcribe exact spoken words, singing lyrics, humming (such as hmm, hmmm, mmm, hmm-mm), and vocal cadence verbatim with punctuation, numbers, and symbols.';
  const whisperPrompt = (config.customVocabulary && config.customVocabulary.trim())
    ? `${baseWhisperPrompt} Custom terms: ${config.customVocabulary.trim()}`
    : baseWhisperPrompt;
  formData.append('prompt', whisperPrompt);

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
  stopKeyWatcher();
  restoreAudio();
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
  // Accidental tap or silence cancellation
  ipcMain.on('recording-cancelled', () => {
    console.log('[Main]: Recording cancelled (accidental tap or silence detected). Zero paste dispatched.');
    appState = 'idle';
    stopKeyWatcher();
    restoreAudio();
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.hide();
      overlayWindow.webContents.send('reset-state');
    }
    updateTrayMenu();
  });

  let latestWavBuffer = null;

  // Background WAV ready from overlay for offline fallback
  ipcMain.on('wav-buffer-ready', (_event, { wavBuffer }) => {
    latestWavBuffer = wavBuffer;
  });

  // Audio captured by overlay window
  ipcMain.on('audio-captured', async (_event, { buffer, mimeType, wavBuffer, durationMs, rms }) => {
    try {
      latestWavBuffer = wavBuffer || latestWavBuffer || null;
      if (!buffer || buffer.byteLength === 0) {
        restoreAudio();
        handleOverlayError('No audio captured');
        return;
      }

      // 1. Accidental press filter (<400ms duration)
      if (durationMs !== undefined && durationMs < 400) {
        console.log(`[Main]: Audio duration (${durationMs}ms) too brief, skipping transcription.`);
        appState = 'idle';
        stopKeyWatcher();
        restoreAudio();
        if (overlayWindow && !overlayWindow.isDestroyed()) {
          overlayWindow.hide();
          overlayWindow.webContents.send('reset-state');
        }
        updateTrayMenu();
        return;
      }

      // 2. Audio energy filter (RMS below human speech threshold)
      if (rms !== undefined && rms > 0 && rms < 0.0025) {
        console.log(`[Main]: Audio energy (${rms.toFixed(5)}) below human voice floor, skipping transcription.`);
        appState = 'idle';
        stopKeyWatcher();
        restoreAudio();
        if (overlayWindow && !overlayWindow.isDestroyed()) {
          overlayWindow.hide();
          overlayWindow.webContents.send('reset-state');
        }
        updateTrayMenu();
        return;
      }

      console.log(`Transcribing audio... (mode: ${activeMode}, provider: ${config.provider})`);

      let rawText = '';
      const isOfflineMode = config.provider === 'offline' || config.model === 'offline-windows';

      if (isOfflineMode) {
        console.log('Transcribing via local offline Windows speech engine...');
        const audioData = wavBuffer || latestWavBuffer || buffer;
        rawText = await transcribeAudioOffline(audioData);
      } else {
        // Try configured cloud provider first
        try {
          rawText = await transcribeAudio(buffer, mimeType);
        } catch (cloudErr) {
          console.warn('Cloud transcription failed:', cloudErr.message);
          if (config.offlineFallback !== false) {
            console.log('Automatically falling back to local offline speech engine...');
            const audioData = wavBuffer || latestWavBuffer || buffer;
            rawText = await transcribeAudioOffline(audioData);
          } else {
            throw cloudErr;
          }
        }
      }

      // 3. Silence hallucination filter (drops common Whisper hallucinations on low/silent audio)
      const silencePatterns = [
        /^thank\s+you(?:\s+very\s+much)?[.!]?$/i,
        /^(?:thank\s+you|thanks)\s+for\s+watching[.!]?$/i,
        /^subtitles?\s+by/i,
        /^(?:please\s+)?subscribe[.!]?$/i,
        /^like\s+and\s+subscribe[.!]?$/i,
        /^(?:bye|goodbye)[.!]?$/i,
        /^(?:you|so|oh|okay)[.!]?$/i
      ];
      const normRaw = (rawText || '').trim();
      const isHallucination = silencePatterns.some(pat => pat.test(normRaw));
      if (isHallucination && ((durationMs && durationMs < 1800) || (rms && rms < 0.01))) {
        console.log(`[Main]: Dropping silence hallucination ("${rawText}") to prevent accidental paste.`);
        appState = 'idle';
        stopKeyWatcher();
        restoreAudio();
        if (overlayWindow && !overlayWindow.isDestroyed()) {
          overlayWindow.hide();
          overlayWindow.webContents.send('reset-state');
        }
        updateTrayMenu();
        return;
      }

      let transcribedText = '';
      if (rawText && rawText.trim()) {
        console.log(`Raw transcription: "${rawText}"`);
        if (!isOfflineMode && config.aiIntelligence !== false) {
          if (activeMode === 'smart_ai') {
            console.log('Applying Smart AI Polish Engine...');
            transcribedText = await enhanceTranscriptionWithAI(rawText, 'smart_ai');
          } else {
            // Verbatim mode (primary shortcut):
            // Whisper Large v3 natively provides accurate sentence capitalization and punctuation.
            // When speaking standard sentences, paragraphs, or many words (>= 12 words), local formatTranscription
            // is instantaneous (0ms) and eliminates 2-3s of redundant LLM generation latency.
            const words = rawText.trim().split(/\s+/);
            const hasComplexDirective = /\b(?:number\s+\w+\s+in\s+(?:figures|words)|equals?\s+to|\d+\s*[\+\-\*\/]\s*\d+)\b/i.test(rawText);
            if (hasComplexDirective && words.length < 12) {
              console.log('Applying AI Context Engine for short math/figure expression...');
              transcribedText = await enhanceTranscriptionWithAI(rawText, 'verbatim');
            } else {
              console.log('Instant formatting via Whisper Large v3 + local engine (zero LLM delay)...');
              transcribedText = formatTranscription(rawText);
            }
          }
        } else {
          transcribedText = formatTranscription(rawText);
        }
      }

      if (!transcribedText) {
        console.log('No speech detected in audio.');
        appState = 'idle';
        restoreAudio();
        if (overlayWindow && !overlayWindow.isDestroyed()) {
          overlayWindow.hide();
        }
        updateTrayMenu();
        return;
      }

      console.log('Transcription succeeded:', transcribedText);

      // 1. Save to local history drawer so user never loses spoken content
      addHistoryItem(transcribedText, activeMode);

      // 2. Snapshot user's previous clipboard so it is NEVER lost or overwritten
      let previousText = '';
      let previousHtml = '';
      let previousImage = null;
      let hadPreviousContent = false;

      try {
        previousText = clipboard.readText();
        previousHtml = clipboard.readHTML();
        previousImage = clipboard.readImage();
        hadPreviousContent = (previousText && previousText.length > 0) ||
                             (previousHtml && previousHtml.length > 0) ||
                             (previousImage && !previousImage.isEmpty());
      } catch (e) {
        console.warn('Error reading clipboard snapshot:', e);
      }

      // 3. Write transcribed text to system clipboard for instant injection
      clipboard.writeText(transcribedText);

      // 4. Hide overlay immediately
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.hide();
      }
      appState = 'idle';

      // 5. Wait brief focus stability delay and trigger paste
      const delay = config.pasteDelayMs || 25;
      const pasteMethod = config.pasteMethod || 'default';
      await simulatePaste(delay, pasteMethod);

      // 6. IMMEDIATELY restore user's previous clipboard content (or clear it if it was empty)
      // The user explicitly demanded: "I don't want it to copy anything... it should not copy it to my clipboard... because I can use it finish and paste what I already copied before I even start using it"
      setTimeout(() => {
        try {
          if (hadPreviousContent) {
            clipboard.write({
              text: previousText,
              html: previousHtml,
              image: (previousImage && !previousImage.isEmpty()) ? previousImage : undefined
            });
            console.log('User previous clipboard restored.');
          } else {
            clipboard.clear();
            console.log('Clipboard cleared to prevent leaving dictation in clipboard.');
          }
        } catch (e) {
          console.warn('Error restoring clipboard:', e);
        }
      }, 35);
    } catch (err) {
      console.error('Transcription error:', err);
      restoreAudio();
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

  // Manually trigger dictation toggle from Settings UI
  ipcMain.on('trigger-dictation', () => {
    handleShortcutPressed();
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
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.webContents.send('set-sound-feedback', config.soundFeedback !== false);
      }
    }
    return result;
  });

  // Settings: History Management
  ipcMain.handle('get-history', () => {
    return loadHistory();
  });

  ipcMain.handle('clear-history', () => {
    return clearHistory();
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

  // Settings: Complete First Launch Setup
  ipcMain.handle('complete-first-launch', (_event, customShortcut) => {
    const update = { firstLaunchCompleted: true };
    if (customShortcut) {
      update.shortcut = customShortcut;
    }
    const result = saveConfig(update);
    if (result.success) {
      config = result.config;
      registerGlobalShortcut();
    }
    return result;
  });

  // Settings: Test Offline Speech Engine
  ipcMain.handle('test-offline-engine', async () => {
    const exePath = getOfflineTranscriberPath();
    if (!exePath || !fs.existsSync(exePath)) {
      return { success: false, error: 'Offline engine binary not found' };
    }
    return new Promise((resolve) => {
      execFile(exePath, ['test'], { timeout: 8000 }, (err, stdout, stderr) => {
        if (err) {
          return resolve({ success: false, error: stderr || err.message });
        }
        resolve({ success: true, message: stdout ? stdout.trim() : 'OK' });
      });
    });
  });

  // Settings: Test Audio Control
  ipcMain.handle('test-audio-control', async () => {
    const exePath = getAudioControlPath();
    if (!exePath || !fs.existsSync(exePath)) {
      return { success: false, error: 'Audio control binary not found' };
    }
    return new Promise((resolve) => {
      execFile(exePath, ['is-muted'], { timeout: 5000 }, (err, stdout, stderr) => {
        if (err) {
          return resolve({ success: false, error: stderr || err.message });
        }
        resolve({ success: true, message: 'Audio control ready (Master muted: ' + stdout.trim() + ')' });
      });
    });
  });

  // Application: Quit completely
  ipcMain.on('quit-app', () => {
    app.isQuitting = true;
    app.quit();
  });

  // Auto-Updater: Check for Updates
  ipcMain.handle('check-for-updates', async () => {
    if (!app.isPackaged && process.env.LISTEN_DEV_UPDATE !== 'true') {
      return { success: false, message: 'Auto-updates available in installed desktop application' };
    }
    try {
      const result = await autoUpdater.checkForUpdates();
      return { success: true, updateInfo: result ? result.updateInfo : null };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Auto-Updater: Restart and Install
  ipcMain.on('restart-and-install-update', () => {
    console.log('[AutoUpdater]: User requested restart to apply update. Closing and installing...');
    try {
      autoUpdater.quitAndInstall(false, true);
    } catch (e) {
      console.warn('Error during quitAndInstall:', e);
    }
  });

  // App version
  ipcMain.handle('get-app-version', () => {
    return app.getVersion();
  });

  // Settings: Close
  ipcMain.on('close-settings', () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.close();
    }
  });
}

function setupAutoUpdater() {
  if (!app.isPackaged && process.env.LISTEN_DEV_UPDATE !== 'true') {
    console.log('[AutoUpdater]: Running in unpackaged mode; update checks active in installed desktop app.');
    return;
  }

  try {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', () => {
      console.log('[AutoUpdater]: Checking for updates...');
      if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.webContents.send('update-status', { status: 'checking' });
      }
    });

    autoUpdater.on('update-available', (info) => {
      console.log(`[AutoUpdater]: Update available: v${info.version}`);
      if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.webContents.send('update-status', { status: 'available', version: info.version });
      }
    });

    autoUpdater.on('update-not-available', (info) => {
      console.log('[AutoUpdater]: App is up to date.');
      if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.webContents.send('update-status', { status: 'up-to-date', version: info.version });
      }
    });

    autoUpdater.on('download-progress', (progressObj) => {
      if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.webContents.send('update-status', {
          status: 'downloading',
          percent: Math.round(progressObj.percent)
        });
      }
    });

    autoUpdater.on('update-downloaded', (info) => {
      console.log(`[AutoUpdater]: Update v${info.version} downloaded and ready to install.`);
      if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.webContents.send('update-status', {
          status: 'ready',
          version: info.version
        });
      }

      // Show native desktop notification
      try {
        if (Notification.isSupported()) {
          const notif = new Notification({
            title: 'Listen Update Ready',
            body: `Version ${info.version} has been downloaded. Click to restart and update.`,
            icon: path.join(__dirname, 'assets', 'icon.png')
          });
          notif.on('click', () => {
            if (settingsWindow && !settingsWindow.isDestroyed()) {
              settingsWindow.show();
              settingsWindow.focus();
            } else {
              openMainWindow();
            }
          });
          notif.show();
        }
      } catch (ne) {
        console.warn('[AutoUpdater]: Notification error:', ne);
      }
    });

    autoUpdater.on('error', (err) => {
      console.warn('[AutoUpdater]: Update check error:', err ? err.message : err);
      if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.webContents.send('update-status', { status: 'error', error: err ? err.message : 'Unknown error' });
      }
    });

    // Check after 4 seconds on launch
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(e => {
        console.log('[AutoUpdater]: Initial check notice:', e.message);
      });
    }, 4000);

    // Periodic check every 4 hours
    setInterval(() => {
      autoUpdater.checkForUpdates().catch(() => {});
    }, 4 * 60 * 60 * 1000);
  } catch (err) {
    console.warn('[AutoUpdater]: Init error:', err);
  }
}

// App lifecycle
app.whenReady().then(() => {
  setupPermissions();
  setupIpcHandlers();
  setupAutoUpdater();
  createOverlayWindow();
  createTray();
  registerGlobalShortcut();

  console.log(`Listen app ready! Shortcuts: ${registeredShortcuts.join(', ')}`);

  // ALWAYS open the main application window on launch so user can interact with the app immediately
  setTimeout(() => {
    openMainWindow(false, !config.firstLaunchCompleted);
  }, 350);

  app.on('activate', () => {
    openMainWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// Keep running in background / tray when all windows are closed
app.on('window-all-closed', (e) => {
  e.preventDefault();
});
