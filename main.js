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
let registeredShortcuts = [];

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
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  const orbSize = 140;
  const x = Math.round((screenWidth - orbSize) / 2);
  const y = screenHeight - orbSize - 16; // Bottom-center floating seamlessly above taskbar

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
    overlayWindow.setAlwaysOnTop(true, 'floating');
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

// Create or show Settings Window
function openSettingsWindow(triggerRecorder = false, isFirstLaunch = false) {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
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
    width: 540,
    height: 720,
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
    if (isFirstLaunch) {
      settingsWindow.webContents.send('set-first-launch-mode', true);
    }
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
      label: appState === 'recording' ? '⏹️ Stop Dictation' : '🎙️ Start Dictation',
      click: () => handleShortcutPressed()
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

// Register Global Shortcut with fallbacks
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
  const listToRegister = [primary];

  // Windows resilience: register fallback hotkeys so IME switching doesn't block dictation
  if (primary.toLowerCase().includes('shift') || primary.includes('Space')) {
    if (!listToRegister.includes('CommandOrControl+Space')) {
      listToRegister.push('CommandOrControl+Space');
    }
    if (!listToRegister.includes('Alt+Space')) {
      listToRegister.push('Alt+Space');
    }
  }

  for (const sc of listToRegister) {
    try {
      const ok = globalShortcut.register(sc, handleShortcutPressed);
      if (ok) {
        registeredShortcuts.push(sc);
        console.log(`Global shortcut registered: ${sc}`);
      } else {
        console.warn(`Could not register shortcut: ${sc}`);
      }
    } catch (err) {
      console.error(`Error registering shortcut ${sc}:`, err);
    }
  }

  updateTrayMenu();
}

// Shortcut Toggle Handler
function handleShortcutPressed() {
  console.log(`handleShortcutPressed called. Current state: ${appState}`);
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    createOverlayWindow();
  }

  if (appState === 'idle') {
    // Start Recording
    appState = 'recording';
    updateTrayMenu();
    overlayWindow.webContents.send('reset-state');
    overlayWindow.webContents.send('start-recording');

    // Show without stealing focus from active window/cursor
    overlayWindow.setAlwaysOnTop(true, 'screen-saver');
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    overlayWindow.showInactive();
    overlayWindow.moveTop();
    console.log('Overlay window shown (recording started).');
  } else if (appState === 'recording') {
    // Stop Recording & Begin Processing
    appState = 'processing';
    updateTrayMenu();
    overlayWindow.webContents.send('stop-recording');
    console.log('Recording stopped, transcribing...');
  } else if (appState === 'processing') {
    console.log('Currently transcribing audio, please wait...');
  }
}

// Intelligent formatting: Punctuation, capitalization, brackets, and verbal commands
function formatTranscription(rawText) {
  if (!rawText) return '';
  let text = rawText.trim();

  // 1. Spoken punctuation commands conversion
  const spokenPunctuation = [
    { regex: /\b(period|full stop)\b/gi, rep: '.' },
    { regex: /\b(comma)\b/gi, rep: ',' },
    { regex: /\b(question mark)\b/gi, rep: '?' },
    { regex: /\b(exclamation mark|exclamation point)\b/gi, rep: '!' },
    { regex: /\b(colon)\b/gi, rep: ':' },
    { regex: /\b(semicolon)\b/gi, rep: ';' },
    { regex: /\b(open bracket|open parenthesis|open paren)\b/gi, rep: '(' },
    { regex: /\b(close bracket|close parenthesis|close paren)\b/gi, rep: ')' },
    { regex: /\b(open quote)\b/gi, rep: '"' },
    { regex: /\b(close quote)\b/gi, rep: '"' },
    { regex: /\b(new line)\b/gi, rep: '\n' },
    { regex: /\b(new paragraph)\b/gi, rep: '\n\n' }
  ];

  for (const { regex, rep } of spokenPunctuation) {
    text = text.replace(regex, rep);
  }

  // 2. Fix spacing around punctuation marks: "hello , world" -> "hello, world"
  text = text.replace(/\s+([,.:;?!%])/g, '$1');
  text = text.replace(/([,.:;?!])([A-Za-z0-9])/g, '$1 $2');

  // 3. Brackets & parenthesis formatting: "( text )" -> "(text)", "word(text)" -> "word (text)"
  text = text.replace(/\(\s+/g, '(');
  text = text.replace(/\s+\)/g, ')');
  text = text.replace(/([A-Za-z0-9])\(/g, '$1 (');
  text = text.replace(/\)([A-Za-z0-9])/g, ') $1');

  // 4. Collapse consecutive spaces
  text = text.replace(/[ \t]+/g, ' ');

  // 5. Intelligent capitalization:
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

// Two-stage AI context engine: Polishes raw speech with natural punctuation, lists, numbers, and brackets
async function enhanceTranscriptionWithAI(rawText) {
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

  const systemPrompt = `You are Listen AI, an exact verbatim dictation formatter.

CRITICAL VERBATIM RULES:
1. PRESERVE EVERY SINGLE WORD EXACTLY AS SPOKEN.
   - You are strictly forbidden from substituting, replacing, rephrasing, omitting, or inventing words.
   - Never change a word because you think another word makes more sense in context. If the user said "there", keep "there" — NEVER change it to "today" or any other word.
   - Do not translate, do not "fix" grammar by changing vocabulary. Preserve the speaker's exact vocabulary.
2. YOUR ONLY ALLOWED ACTIONS:
   - Capitalization: Capitalize the first letter of sentences, acronyms, and the standalone pronoun "I".
   - Punctuation: Insert natural commas, periods, question marks, and exclamation marks where appropriate based on sentence flow.
   - Spoken Punctuation Commands: Convert spoken punctuation words into punctuation symbols ("comma" -> ",", "period" or "full stop" -> ".", "question mark" -> "?", "exclamation mark" -> "!", "colon" -> ":", "new line" -> "\\n", "new paragraph" -> "\\n\\n").
   - Spoken Lists: When the speaker says "number one [item]" or "step one [item]", format as a clean numbered point (e.g. "1. [Item]" or "Step 1: [Item]").
   - Parentheses & Quotes: Wrap parenthetical thoughts or "in brackets" with "(...)".
3. STRICT OUTPUT:
   - Output ONLY the final formatted text.
   - Do NOT add any preamble, explanation, notes, or markdown code fences (\`\`\`).`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);

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
        temperature: 0.0,
        max_tokens: 4096
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
  const model = config.model || (provider === 'groq' ? 'whisper-large-v3' : 'whisper-1');

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
      const rawText = await transcribeAudio(buffer, mimeType);

      let transcribedText = '';
      if (rawText && rawText.trim()) {
        console.log(`Raw Whisper transcription: "${rawText}"`);
        if (config.aiIntelligence !== false) {
          console.log('Applying AI Context Engine...');
          transcribedText = await enhanceTranscriptionWithAI(rawText);
        } else {
          transcribedText = formatTranscription(rawText);
        }
      }

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

  console.log(`Listen app ready! Shortcuts: ${registeredShortcuts.join(', ')}`);

  // First launch onboarding: Automatically show shortcut selector window right after install
  if (!config.firstLaunchCompleted) {
    setTimeout(() => {
      openSettingsWindow(true, true);
    }, 600);
  } else if (process.platform === 'win32' && tray) {
    try {
      tray.displayBalloon({
        title: 'Listen is Active in Background',
        content: `Ready! Press ${getShortcutDisplay(config.shortcut)} or Ctrl+Space anywhere to dictate.`
      });
    } catch (e) {}
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
