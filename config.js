const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULT_CONFIG = {
  provider: 'groq', // 'groq' | 'openai'
  apiKey: process.env.GROQ_API_KEY || '',
  model: 'whisper-large-v3', // 'whisper-large-v3' | 'whisper-1'
  shortcut: 'CommandOrControl+Shift+Space',
  secondaryShortcut: 'CommandOrControl+Shift+K',
  dictationMode: 'toggle', // 'toggle' | 'push_to_talk'
  language: 'en',
  pasteMethod: 'default', // 'default' (Ctrl+V) | 'terminal' (Ctrl+Shift+V) | 'shift_insert'
  pasteDelayMs: 80,
  restoreClipboard: true,
  soundFeedback: true,
  aiIntelligence: true,
  customVocabulary: '',
  firstLaunchCompleted: false
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
  const dirnameConfigPath = path.join(__dirname, 'config.json');

  let templateData = {};
  if (fs.existsSync(dirnameConfigPath)) {
    try {
      templateData = JSON.parse(fs.readFileSync(dirnameConfigPath, 'utf8'));
    } catch (e) {}
  } else if (fs.existsSync(localConfigPath)) {
    try {
      templateData = JSON.parse(fs.readFileSync(localConfigPath, 'utf8'));
    } catch (e) {}
  }

  try {
    if (fs.existsSync(userConfigPath)) {
      const raw = fs.readFileSync(userConfigPath, 'utf8');
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_CONFIG, ...templateData, ...parsed };
    }
  } catch (err) {
    console.error('Error loading config, using defaults:', err);
  }

  const initial = { ...DEFAULT_CONFIG, ...templateData };
  saveConfig(initial);
  return initial;
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
