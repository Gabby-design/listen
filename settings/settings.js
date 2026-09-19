// Settings Controller
const providerGroq = document.getElementById('provider-groq');
const providerOpenAI = document.getElementById('provider-openai');
const cardGroq = document.getElementById('card-groq');
const cardOpenAI = document.getElementById('card-openai');
const modelSelect = document.getElementById('model-select');
const apiKeyInput = document.getElementById('api-key-input');
const toggleKeyVisibility = document.getElementById('toggle-key-visibility');
const btnTestKey = document.getElementById('btn-test-key');
const testKeyStatus = document.getElementById('test-key-status');
const apiHint = document.getElementById('api-hint');
const linkProviderConsole = document.getElementById('link-provider-console');

const shortcutBox = document.getElementById('shortcut-recorder-box');
const shortcutBadges = document.getElementById('shortcut-badges');
const recorderHint = document.getElementById('recorder-hint');
const btnResetShortcut = document.getElementById('btn-reset-shortcut');
const pasteDelayInput = document.getElementById('paste-delay-input');

const btnSave = document.getElementById('btn-save');
const btnCancel = document.getElementById('btn-cancel');
const saveStatus = document.getElementById('save-status');

const MODELS = {
  groq: [
    { value: 'whisper-large-v3-turbo', label: 'whisper-large-v3-turbo (Fastest, High Quality)' },
    { value: 'whisper-large-v3', label: 'whisper-large-v3 (Maximum Accuracy)' },
    { value: 'distil-whisper-large-v3-en', label: 'distil-whisper-large-v3-en (English Optimized)' }
  ],
  openai: [
    { value: 'whisper-1', label: 'whisper-1 (OpenAI Standard Whisper)' }
  ]
};

let currentConfig = {};
let isRecordingShortcut = false;
let recordedShortcut = 'CommandOrControl+Shift+Space';

// Initialize
async function init() {
  if (!window.settingsApi) return;
  currentConfig = await window.settingsApi.getConfig();
  populateForm(currentConfig);
  setupEvents();
}

function populateForm(config) {
  // Provider
  const provider = config.provider || 'groq';
  if (provider === 'openai') {
    providerOpenAI.checked = true;
  } else {
    providerGroq.checked = true;
  }
  updateProviderSelection();

  // Model
  populateModels(provider, config.model);

  // API Key
  apiKeyInput.value = config.apiKey || '';

  // Shortcut
  recordedShortcut = config.shortcut || 'CommandOrControl+Shift+Space';
  renderShortcutBadges(recordedShortcut);

  // Paste Delay
  pasteDelayInput.value = config.pasteDelayMs || 80;
}

function populateModels(provider, selectedModel) {
  modelSelect.innerHTML = '';
  const list = MODELS[provider] || MODELS.groq;
  list.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.value;
    opt.textContent = m.label;
    if (m.value === selectedModel) {
      opt.selected = true;
    }
    modelSelect.appendChild(opt);
  });
}

function updateProviderSelection() {
  const isGroq = providerGroq.checked;
  cardGroq.classList.toggle('active', isGroq);
  cardOpenAI.classList.toggle('active', !isGroq);

  if (isGroq) {
    apiHint.innerHTML = 'Get your Groq API key at <a href="https://console.groq.com/keys" target="_blank">console.groq.com/keys</a>';
    if (!apiKeyInput.value.startsWith('gsk_') && !apiKeyInput.value.trim()) {
      apiKeyInput.placeholder = 'Paste your Groq key here (gsk_...)';
    }
  } else {
    apiHint.innerHTML = 'Get your OpenAI API key at <a href="https://platform.openai.com/api-keys" target="_blank">platform.openai.com/api-keys</a>';
    if (!apiKeyInput.value.startsWith('sk-') && !apiKeyInput.value.trim()) {
      apiKeyInput.placeholder = 'Paste your OpenAI key here (sk-...)';
    }
  }
}

function renderShortcutBadges(shortcutStr) {
  shortcutBadges.innerHTML = '';
  if (!shortcutStr) return;

  const parts = shortcutStr.split('+').map(p => p.trim());
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

  parts.forEach((part, index) => {
    let display = part;
    if (part === 'CommandOrControl') display = isMac ? 'Cmd' : 'Ctrl';
    else if (part === 'Control') display = 'Ctrl';
    else if (part === 'Command') display = 'Cmd';

    const kbd = document.createElement('span');
    kbd.className = 'kbd-badge';
    kbd.textContent = display;
    shortcutBadges.appendChild(kbd);

    if (index < parts.length - 1) {
      const plus = document.createElement('span');
      plus.className = 'kbd-plus';
      plus.textContent = '+';
      shortcutBadges.appendChild(plus);
    }
  });
}

function startRecordingShortcut() {
  isRecordingShortcut = true;
  shortcutBox.classList.add('recording');
  recorderHint.textContent = 'Press shortcut keys now...';
  shortcutBadges.innerHTML = '<span class="kbd-badge">Listening...</span>';
}

function stopRecordingShortcut(newShortcut) {
  isRecordingShortcut = false;
  shortcutBox.classList.remove('recording');
  recorderHint.textContent = 'Click to change shortcut';
  if (newShortcut) {
    recordedShortcut = newShortcut;
  }
  renderShortcutBadges(recordedShortcut);
}

function setupEvents() {
  // Provider radio change
  providerGroq.addEventListener('change', () => {
    updateProviderSelection();
    populateModels('groq');
  });

  providerOpenAI.addEventListener('change', () => {
    updateProviderSelection();
    populateModels('openai');
  });

  // Toggle API key password view
  toggleKeyVisibility.addEventListener('click', () => {
    if (apiKeyInput.type === 'password') {
      apiKeyInput.type = 'text';
    } else {
      apiKeyInput.type = 'password';
    }
  });

  // Test API Key
  btnTestKey.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    const provider = providerGroq.checked ? 'groq' : 'openai';
    const model = modelSelect.value;

    if (!key) {
      testKeyStatus.className = 'status-indicator error';
      testKeyStatus.textContent = 'Please enter an API key first.';
      return;
    }

    testKeyStatus.className = 'status-indicator loading';
    testKeyStatus.textContent = 'Verifying API connection...';

    try {
      const res = await window.settingsApi.testApiKey({ provider, apiKey: key, model });
      if (res.success) {
        testKeyStatus.className = 'status-indicator success';
        testKeyStatus.textContent = '✓ Connection successful and verified!';
      } else {
        testKeyStatus.className = 'status-indicator error';
        testKeyStatus.textContent = '✗ ' + (res.error || 'Connection failed.');
      }
    } catch (err) {
      testKeyStatus.className = 'status-indicator error';
      testKeyStatus.textContent = '✗ Verification error: ' + err.message;
    }
  });

  // Interactive Shortcut Recorder
  shortcutBox.addEventListener('click', () => {
    startRecordingShortcut();
  });

  shortcutBox.addEventListener('keydown', (e) => {
    if (!isRecordingShortcut) return;
    e.preventDefault();
    e.stopPropagation();

    // Ignore single modifier presses while waiting for actual key
    const isModifierOnly = ['Control', 'Shift', 'Alt', 'Meta'].includes(e.key);
    if (isModifierOnly) return;

    // Escape cancels
    if (e.key === 'Escape') {
      stopRecordingShortcut(null);
      return;
    }

    const parts = [];
    if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');

    // Need at least one modifier
    if (parts.length === 0) {
      recorderHint.textContent = 'Shortcut must include Ctrl, Alt, or Shift!';
      return;
    }

    // Format key name
    let keyName = e.key.toUpperCase();
    if (e.code === 'Space' || e.key === ' ') keyName = 'Space';
    else if (e.code.startsWith('Key')) keyName = e.code.replace('Key', '');
    else if (e.code.startsWith('Digit')) keyName = e.code.replace('Digit', '');

    parts.push(keyName);
    const accelerator = parts.join('+');
    stopRecordingShortcut(accelerator);
  });

  shortcutBox.addEventListener('blur', () => {
    if (isRecordingShortcut) {
      stopRecordingShortcut(null);
    }
  });

  btnResetShortcut.addEventListener('click', () => {
    recordedShortcut = 'CommandOrControl+Shift+Space';
    renderShortcutBadges(recordedShortcut);
  });

  // Save Config
  btnSave.addEventListener('click', async () => {
    const updated = {
      provider: providerGroq.checked ? 'groq' : 'openai',
      model: modelSelect.value,
      apiKey: apiKeyInput.value.trim(),
      shortcut: recordedShortcut,
      pasteDelayMs: parseInt(pasteDelayInput.value, 10) || 80
    };

    saveStatus.textContent = 'Saving...';
    const result = await window.settingsApi.saveConfig(updated);
    if (result.success) {
      saveStatus.style.color = 'var(--success)';
      saveStatus.textContent = '✓ Settings saved successfully!';
      setTimeout(() => {
        saveStatus.textContent = '';
      }, 3000);
    } else {
      saveStatus.style.color = 'var(--error)';
      saveStatus.textContent = 'Error: ' + result.error;
    }
  });

  // Cancel / Close
  btnCancel.addEventListener('click', () => {
    window.settingsApi.closeSettings();
  });

  // Listen for tray command "Re-record Shortcut"
  window.settingsApi.onActivateShortcutRecorder(() => {
    shortcutBox.scrollIntoView({ behavior: 'smooth' });
    startRecordingShortcut();
  });
}

document.addEventListener('DOMContentLoaded', init);
