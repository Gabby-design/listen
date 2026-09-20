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
    width: 580,
    height: 740,
    minWidth: 520,
    minHeight: 640,
    resizable: true,
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

  // Windows resilience: register fallback hotkeys so IME switching doesn't block dictation
  if (primary.toLowerCase().includes('shift') || primary.includes('Space')) {
    if (!listToRegister.some(item => item.key === 'CommandOrControl+Space')) {
      listToRegister.push({ key: 'CommandOrControl+Space', secondary: false });
    }
    if (!listToRegister.some(item => item.key === 'Alt+Space')) {
      listToRegister.push({ key: 'Alt+Space', secondary: false });
    }
  }

  for (const item of listToRegister) {
    try {
      const ok = globalShortcut.register(item.key, () => handleShortcutPressed(item.secondary, false));
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
    // Start Recording
    activeMode = isSecondary ? 'smart_ai' : 'verbatim';
    appState = 'recording';
    updateTrayMenu();

    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('set-sound-feedback', config.soundFeedback !== false);
      overlayWindow.webContents.send('reset-state');
      overlayWindow.webContents.send('start-recording');

      // Show without stealing focus from active window/cursor
      overlayWindow.setAlwaysOnTop(true, 'screen-saver');
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

    // Stop Recording & Begin Processing
    stopKeyWatcher();
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
Transform spoken speech into clear, professional, beautifully written text.
RULES:
1. Clean up vocal hesitations and filler words ("um", "uh", "you know", "like" when used as filler).
2. Fix obvious grammatical slips while faithfully preserving the speaker's true meaning and authentic voice.
3. Automatically format spoken lists or numbered steps into clean bullet points or numbered lists.
4. Correct punctuation, capitalization, and paragraph breaks for maximum readability.
5. Output ONLY the polished text with NO preamble, explanation, notes, or markdown code fences.`;
  } else {
    systemPrompt = `You are Listen AI, an exact verbatim dictation formatter.

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
  }

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
        temperature: mode === 'smart_ai' ? 0.2 : 0.0,
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

  // Personal Vocabulary / Custom Words injection into Whisper context prompt
  if (config.customVocabulary && config.customVocabulary.trim()) {
    formData.append('prompt', config.customVocabulary.trim());
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
  stopKeyWatcher();
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

      console.log(`Transcribing ${buffer.byteLength} bytes using ${config.provider}... (mode: ${activeMode})`);
      const rawText = await transcribeAudio(buffer, mimeType);

      let transcribedText = '';
      if (rawText && rawText.trim()) {
        console.log(`Raw Whisper transcription: "${rawText}"`);
        if (config.aiIntelligence !== false) {
          console.log(`Applying AI Context Engine (mode: ${activeMode})...`);
          transcribedText = await enhanceTranscriptionWithAI(rawText, activeMode);
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

      // 1. Save to local history drawer so user never loses spoken content
      addHistoryItem(transcribedText, activeMode);

      // 2. Preserve previous clipboard content if restoreClipboard is enabled
      let previousClipboard = null;
      if (config.restoreClipboard !== false) {
        try {
          previousClipboard = clipboard.readText();
        } catch (e) {}
      }

      // 3. Write transcribed text to system clipboard
      clipboard.writeText(transcribedText);

      // 4. Hide overlay immediately
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.hide();
      }
      appState = 'idle';

      // 5. Wait brief focus stability delay and trigger paste
      const delay = config.pasteDelayMs || 80;
      const pasteMethod = config.pasteMethod || 'default';
      await simulatePaste(delay, pasteMethod);

      // 6. Restore user's previous clipboard so it's not destroyed
      if (previousClipboard !== null) {
        setTimeout(() => {
          try {
            clipboard.writeText(previousClipboard);
          } catch (e) {}
        }, 180);
      }
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
