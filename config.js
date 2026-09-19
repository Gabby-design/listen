const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULT_CONFIG = {
  provider: 'groq', // 'groq' | 'openai'
  apiKey: process.env.GROQ_API_KEY || '',
  model: 'whisper-large-v3-turbo', // 'whisper-large-v3-turbo' | 'whisper-1'
  shortcut: 'CommandOrControl+Shift+Space',
  language: 'en',
  pasteDelayMs: 80,
  restoreClipboard: false,
  soundFeedback: true
};

function getConfigPath() {
  try {
    const userDataPath = app ? app.getPath('userData') : process.cwd();
    return path.join(userDataPath, 'config.json');
  } catch {
    return path.join(process.cwd(), 'config.json');
  }
}

function loadConfig() {
  const userConfigPath = getConfigPath();
  const localConfigPath = path.join(process.cwd(), 'config.json');

  let chosenPath = userConfigPath;
  if (!fs.existsSync(userConfigPath) && fs.existsSync(localConfigPath)) {
    chosenPath = localConfigPath;
  }

  try {
    if (fs.existsSync(chosenPath)) {
      const raw = fs.readFileSync(chosenPath, 'utf8');
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_CONFIG, ...parsed };
    }
  } catch (err) {
    console.error('Error loading config, using defaults:', err);
  }

  saveConfig(DEFAULT_CONFIG);
  return { ...DEFAULT_CONFIG };
}

function saveConfig(newConfig) {
  const configPath = getConfigPath();
  try {
    const merged = { ...loadConfig(), ...newConfig };
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), 'utf8');
    return { success: true, config: merged };
  } catch (err) {
    console.error('Error saving config:', err);
    return { success: false, error: err.message };
  }
}

function getShortcutDisplay(shortcut) {
  if (!shortcut) return 'None';
  const isMac = process.platform === 'darwin';
  return shortcut
    .replace(/CommandOrControl/gi, isMac ? 'Cmd' : 'Ctrl')
    .replace(/Control/gi, 'Ctrl')
    .replace(/Command/gi, 'Cmd')
    .replace(/\+/g, ' + ');
}

module.exports = {
  DEFAULT_CONFIG,
  loadConfig,
  saveConfig,
  getShortcutDisplay
};
