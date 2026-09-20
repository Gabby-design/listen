// Listen Settings Controller - Focused exclusively on Shortcut & User Preferences
const shortcutBox = document.getElementById('shortcut-recorder-box');
const shortcutBadges = document.getElementById('shortcut-badges');
const recorderHint = document.getElementById('recorder-hint');
const btnResetShortcut = document.getElementById('btn-reset-shortcut');
const btnTestPill = document.getElementById('btn-test-pill');
const pasteDelayInput = document.getElementById('paste-delay-input');

const firstLaunchBanner = document.getElementById('first-launch-banner');
const aiIntelligenceToggle = document.getElementById('ai-intelligence-toggle');
const btnFinishOnboarding = document.getElementById('btn-finish-onboarding');
const presetChips = document.querySelectorAll('.preset-chip');

const btnSave = document.getElementById('btn-save');
const btnCancel = document.getElementById('btn-cancel');
const saveStatus = document.getElementById('save-status');

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
  // Shortcut
  recordedShortcut = config.shortcut || 'CommandOrControl+Shift+Space';
  renderShortcutBadges(recordedShortcut);

  // AI Context Engine
  if (aiIntelligenceToggle) {
    aiIntelligenceToggle.checked = config.aiIntelligence !== false;
  }

  // Paste Delay
  if (pasteDelayInput) {
    pasteDelayInput.value = config.pasteDelayMs || 80;
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

  // Preset Shortcut Chips
  presetChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const sc = chip.getAttribute('data-shortcut');
      if (sc) {
        stopRecordingShortcut(sc);
      }
    });
  });

  if (btnTestPill) {
    btnTestPill.addEventListener('click', () => {
      window.settingsApi.triggerDictation();
    });
  }

  // Save Config (preserves developer-managed provider, model, apiKey)
  btnSave.addEventListener('click', async () => {
    const updated = {
      provider: currentConfig.provider || 'groq',
      model: currentConfig.model || 'whisper-large-v3-turbo',
      apiKey: currentConfig.apiKey || '',
      shortcut: recordedShortcut,
      pasteDelayMs: parseInt(pasteDelayInput ? pasteDelayInput.value : 80, 10) || 80,
      aiIntelligence: aiIntelligenceToggle ? aiIntelligenceToggle.checked : true
    };

    saveStatus.textContent = 'Saving...';
    const result = await window.settingsApi.saveConfig(updated);
    if (result.success) {
      currentConfig = result.config;
      saveStatus.style.color = 'var(--success)';
      saveStatus.textContent = '✓ Shortcut saved successfully!';
      setTimeout(() => {
        saveStatus.textContent = '';
      }, 3000);
    } else {
      saveStatus.style.color = 'var(--error)';
      saveStatus.textContent = 'Error: ' + result.error;
    }
  });

  // Finish Onboarding / First Launch
  if (btnFinishOnboarding) {
    btnFinishOnboarding.addEventListener('click', async () => {
      const updated = {
        provider: currentConfig.provider || 'groq',
        model: currentConfig.model || 'whisper-large-v3-turbo',
        apiKey: currentConfig.apiKey || '',
        shortcut: recordedShortcut,
        pasteDelayMs: parseInt(pasteDelayInput ? pasteDelayInput.value : 80, 10) || 80,
        aiIntelligence: aiIntelligenceToggle ? aiIntelligenceToggle.checked : true,
        firstLaunchCompleted: true
      };

      saveStatus.textContent = 'Setting your shortcut...';
      const result = await window.settingsApi.saveConfig(updated);
      if (result.success) {
        currentConfig = result.config;
        saveStatus.style.color = 'var(--success)';
        saveStatus.textContent = '✓ Ready to dictate! Closing setup...';
        setTimeout(() => {
          window.settingsApi.closeSettings();
        }, 800);
      } else {
        saveStatus.style.color = 'var(--error)';
        saveStatus.textContent = 'Error: ' + result.error;
      }
    });
  }

  // Cancel / Close
  btnCancel.addEventListener('click', () => {
    window.settingsApi.closeSettings();
  });

  // Listen for first-launch onboarding trigger
  if (window.settingsApi.onSetFirstLaunchMode) {
    window.settingsApi.onSetFirstLaunchMode((isFirst) => {
      if (isFirst) {
        if (firstLaunchBanner) firstLaunchBanner.style.display = 'flex';
        if (btnFinishOnboarding) btnFinishOnboarding.style.display = 'inline-flex';
        if (btnSave) btnSave.style.display = 'none';
        if (btnCancel) btnCancel.style.display = 'none';
        shortcutBox.scrollIntoView({ behavior: 'smooth' });
        startRecordingShortcut();
      }
    });
  }

  // Listen for tray command "Re-record Shortcut"
  window.settingsApi.onActivateShortcutRecorder(() => {
    shortcutBox.scrollIntoView({ behavior: 'smooth' });
    startRecordingShortcut();
  });
}

document.addEventListener('DOMContentLoaded', init);
