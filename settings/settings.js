// Listen v2.1.2 Settings Controller
// Elements
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

// Mode selection
const modeCardToggle = document.getElementById('mode-card-toggle');
const modeCardPtt = document.getElementById('mode-card-ptt');
const modeRadios = document.querySelectorAll('input[name="dictationMode"]');

// Shortcuts
const primaryShortcutBox = document.getElementById('shortcut-recorder-box');
const primaryBadges = document.getElementById('shortcut-badges');
const primaryRecorderHint = document.getElementById('recorder-hint');

const secondaryShortcutBox = document.getElementById('secondary-shortcut-box');
const secondaryBadges = document.getElementById('secondary-badges');
const secondaryRecorderHint = document.getElementById('secondary-recorder-hint');

const btnResetShortcut = document.getElementById('btn-reset-shortcut');
const btnTestPill = document.getElementById('btn-test-pill');
const presetChips = document.querySelectorAll('.preset-chip');

// AI & Vocabulary
const aiIntelligenceToggle = document.getElementById('ai-intelligence-toggle');
const customVocabularyInput = document.getElementById('custom-vocabulary-input');

// Paste & Audio
const soundFeedbackToggle = document.getElementById('sound-feedback-toggle');
const pasteMethodSelect = document.getElementById('paste-method-select');
const restoreClipboardToggle = document.getElementById('restore-clipboard-toggle');
const pasteDelayInput = document.getElementById('paste-delay-input');

// History
const historySearchInput = document.getElementById('history-search-input');
const btnClearHistory = document.getElementById('btn-clear-history');
const historyList = document.getElementById('history-list');
const historyEmpty = document.getElementById('history-empty');
const tabBtnHistory = document.getElementById('tab-btn-history');

// Onboarding & Global
const firstLaunchBanner = document.getElementById('first-launch-banner');
const btnFinishOnboarding = document.getElementById('btn-finish-onboarding');
const btnSave = document.getElementById('btn-save');
const btnCancel = document.getElementById('btn-cancel');
const saveStatus = document.getElementById('save-status');

// State
let currentConfig = {};
let recordingTarget = null; // 'primary' | 'secondary' | null
let recordedPrimary = 'CommandOrControl+Shift+Space';
let recordedSecondary = 'CommandOrControl+Shift+K';
let cachedHistory = [];

// Initialize
async function init() {
  if (!window.settingsApi) return;
  setupTabs();
  setupModeCards();
  setupShortcuts();
  setupHistoryEvents();
  setupSaveAndActions();

  currentConfig = await window.settingsApi.getConfig();
  populateForm(currentConfig);
}

// Tabs
function setupTabs() {
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTabId = btn.getAttribute('data-tab');
      activateTab(targetTabId);
    });
  });
}

function activateTab(tabId) {
  tabButtons.forEach(b => {
    const isTarget = b.getAttribute('data-tab') === tabId;
    b.classList.toggle('active', isTarget);
    b.setAttribute('aria-selected', isTarget ? 'true' : 'false');
  });

  tabPanels.forEach(p => {
    p.classList.toggle('active', p.id === tabId);
  });

  if (tabId === 'tab-history') {
    loadAndRenderHistory();
  }
}

// Mode Selection Cards
function setupModeCards() {
  function selectMode(mode) {
    modeRadios.forEach(radio => {
      radio.checked = (radio.value === mode);
    });
    modeCardToggle.classList.toggle('active', mode === 'toggle');
    modeCardPtt.classList.toggle('active', mode === 'push_to_talk');
  }

  modeCardToggle.addEventListener('click', () => selectMode('toggle'));
  modeCardPtt.addEventListener('click', () => selectMode('push_to_talk'));

  modeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      selectMode(e.target.value);
    });
  });
}

// Populate form from config
function populateForm(config) {
  // Mode
  const mode = config.dictationMode || 'toggle';
  const radio = document.querySelector(`input[name="dictationMode"][value="${mode}"]`);
  if (radio) radio.checked = true;
  modeCardToggle.classList.toggle('active', mode === 'toggle');
  modeCardPtt.classList.toggle('active', mode === 'push_to_talk');

  // Shortcuts
  recordedPrimary = config.shortcut || 'CommandOrControl+Shift+Space';
  renderBadges(primaryBadges, recordedPrimary);

  recordedSecondary = config.secondaryShortcut || 'CommandOrControl+Shift+K';
  renderBadges(secondaryBadges, recordedSecondary);

  // AI & Vocabulary
  if (aiIntelligenceToggle) {
    aiIntelligenceToggle.checked = config.aiIntelligence !== false;
  }
  if (customVocabularyInput) {
    customVocabularyInput.value = config.customVocabulary || '';
  }

  // Paste & Audio
  if (soundFeedbackToggle) {
    soundFeedbackToggle.checked = config.soundFeedback !== false;
  }
  if (pasteMethodSelect) {
    pasteMethodSelect.value = config.pasteMethod || 'default';
  }
  if (restoreClipboardToggle) {
    restoreClipboardToggle.checked = config.restoreClipboard !== false;
  }
  if (pasteDelayInput) {
    pasteDelayInput.value = config.pasteDelayMs || 80;
  }
}

// Shortcut Badges Rendering
function renderBadges(container, shortcutStr) {
  if (!container) return;
  container.innerHTML = '';
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
    container.appendChild(kbd);

    if (index < parts.length - 1) {
      const plus = document.createElement('span');
      plus.className = 'kbd-plus';
      plus.textContent = '+';
      container.appendChild(plus);
    }
  });
}

// Shortcuts Setup & Recording
function setupShortcuts() {
  function startRecording(target) {
    recordingTarget = target;
    if (target === 'primary') {
      primaryShortcutBox.classList.add('recording');
      primaryRecorderHint.textContent = 'Press keys now... (Esc to cancel)';
      primaryBadges.innerHTML = '<span class="kbd-badge">Listening...</span>';
    } else {
      secondaryShortcutBox.classList.add('recording');
      secondaryRecorderHint.textContent = 'Press keys now... (Esc to cancel)';
      secondaryBadges.innerHTML = '<span class="kbd-badge">Listening...</span>';
    }
  }

  function stopRecording(target, newShortcut) {
    if (target === 'primary') {
      primaryShortcutBox.classList.remove('recording');
      primaryRecorderHint.textContent = 'Click to change shortcut';
      if (newShortcut) recordedPrimary = newShortcut;
      renderBadges(primaryBadges, recordedPrimary);
    } else {
      secondaryShortcutBox.classList.remove('recording');
      secondaryRecorderHint.textContent = 'Click to change shortcut';
      if (newShortcut) recordedSecondary = newShortcut;
      renderBadges(secondaryBadges, recordedSecondary);
    }
    recordingTarget = null;
  }

  function handleKeydown(e, target) {
    if (recordingTarget !== target) return;
    e.preventDefault();
    e.stopPropagation();

    const isModifierOnly = ['Control', 'Shift', 'Alt', 'Meta'].includes(e.key);
    if (isModifierOnly) return;

    if (e.key === 'Escape') {
      stopRecording(target, null);
      return;
    }

    const parts = [];
    if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');

    if (parts.length === 0) {
      const hint = target === 'primary' ? primaryRecorderHint : secondaryRecorderHint;
      hint.textContent = 'Must include Ctrl, Alt, or Shift!';
      return;
    }

    let keyName = e.key.toUpperCase();
    if (e.code === 'Space' || e.key === ' ') keyName = 'Space';
    else if (e.code.startsWith('Key')) keyName = e.code.replace('Key', '');
    else if (e.code.startsWith('Digit')) keyName = e.code.replace('Digit', '');

    parts.push(keyName);
    const accelerator = parts.join('+');
    stopRecording(target, accelerator);
  }

  primaryShortcutBox.addEventListener('click', () => startRecording('primary'));
  primaryShortcutBox.addEventListener('keydown', (e) => handleKeydown(e, 'primary'));
  primaryShortcutBox.addEventListener('blur', () => {
    if (recordingTarget === 'primary') stopRecording('primary', null);
  });

  secondaryShortcutBox.addEventListener('click', () => startRecording('secondary'));
  secondaryShortcutBox.addEventListener('keydown', (e) => handleKeydown(e, 'secondary'));
  secondaryShortcutBox.addEventListener('blur', () => {
    if (recordingTarget === 'secondary') stopRecording('secondary', null);
  });

  // Preset Chips
  presetChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const target = chip.getAttribute('data-target') || 'primary';
      const sc = chip.getAttribute('data-shortcut');
      if (sc) {
        if (target === 'primary') {
          recordedPrimary = sc;
          renderBadges(primaryBadges, recordedPrimary);
        } else {
          recordedSecondary = sc;
          renderBadges(secondaryBadges, recordedSecondary);
        }
      }
    });
  });

  // Reset Button
  btnResetShortcut.addEventListener('click', () => {
    recordedPrimary = 'CommandOrControl+Shift+Space';
    recordedSecondary = 'CommandOrControl+Shift+K';
    renderBadges(primaryBadges, recordedPrimary);
    renderBadges(secondaryBadges, recordedSecondary);
  });

  // Test Pill
  if (btnTestPill) {
    btnTestPill.addEventListener('click', () => {
      window.settingsApi.triggerDictation();
    });
  }
}

// History Functions
async function loadAndRenderHistory() {
  if (!window.settingsApi || !window.settingsApi.getHistory) return;
  try {
    cachedHistory = await window.settingsApi.getHistory();
    filterAndRenderHistory(historySearchInput ? historySearchInput.value : '');
  } catch (e) {
    console.error('Failed to load history:', e);
  }
}

function filterAndRenderHistory(query = '') {
  const q = query.trim().toLowerCase();
  const filtered = q
    ? cachedHistory.filter(item => item.text && item.text.toLowerCase().includes(q))
    : cachedHistory;

  historyList.innerHTML = '';

  if (!filtered || filtered.length === 0) {
    historyEmpty.style.display = 'flex';
    return;
  }

  historyEmpty.style.display = 'none';

  filtered.forEach(item => {
    const card = document.createElement('div');
    card.className = 'history-item';

    const header = document.createElement('div');
    header.className = 'history-item-header';

    const meta = document.createElement('div');
    meta.className = 'history-item-meta';

    const badge = document.createElement('span');
    badge.className = `mode-indicator-pill ${item.mode === 'smart_ai' ? 'smart-pill' : 'verbatim-pill'}`;
    badge.textContent = item.mode === 'smart_ai' ? 'Smart Polish' : 'Verbatim';

    const time = document.createElement('span');
    time.className = 'history-item-time';
    time.textContent = formatRelativeTime(item.timestamp);

    meta.appendChild(badge);
    meta.appendChild(time);

    const btnCopy = document.createElement('button');
    btnCopy.type = 'button';
    btnCopy.className = 'btn-history-copy';
    btnCopy.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
      <span>Copy</span>
    `;

    btnCopy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(item.text);
        const span = btnCopy.querySelector('span');
        if (span) span.textContent = 'Copied!';
        btnCopy.classList.add('copied');
        setTimeout(() => {
          if (span) span.textContent = 'Copy';
          btnCopy.classList.remove('copied');
        }, 1800);
      } catch (err) {
        console.error('Clipboard copy failed:', err);
      }
    });

    header.appendChild(meta);
    header.appendChild(btnCopy);

    const text = document.createElement('div');
    text.className = 'history-item-text';
    text.textContent = item.text;

    card.appendChild(header);
    card.appendChild(text);
    historyList.appendChild(card);
  });
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return '';
  const now = Date.now();
  const past = new Date(timestamp).getTime();
  const diffSec = Math.floor((now - past) / 1000);

  if (diffSec < 45) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function setupHistoryEvents() {
  if (historySearchInput) {
    historySearchInput.addEventListener('input', (e) => {
      filterAndRenderHistory(e.target.value);
    });
  }

  if (btnClearHistory) {
    btnClearHistory.addEventListener('click', async () => {
      if (!confirm('Are you sure you want to clear your transcription history?')) return;
      if (window.settingsApi && window.settingsApi.clearHistory) {
        await window.settingsApi.clearHistory();
        cachedHistory = [];
        filterAndRenderHistory('');
      }
    });
  }
}

// Collect Current Settings Form
function getFormData() {
  const selectedModeRadio = document.querySelector('input[name="dictationMode"]:checked');
  const dictationMode = selectedModeRadio ? selectedModeRadio.value : 'toggle';

  return {
    provider: currentConfig.provider || 'groq',
    model: currentConfig.model || 'whisper-large-v3-turbo',
    apiKey: currentConfig.apiKey || '',
    shortcut: recordedPrimary,
    secondaryShortcut: recordedSecondary,
    dictationMode: dictationMode,
    aiIntelligence: aiIntelligenceToggle ? aiIntelligenceToggle.checked : true,
    customVocabulary: customVocabularyInput ? customVocabularyInput.value.trim() : '',
    soundFeedback: soundFeedbackToggle ? soundFeedbackToggle.checked : true,
    pasteMethod: pasteMethodSelect ? pasteMethodSelect.value : 'default',
    restoreClipboard: restoreClipboardToggle ? restoreClipboardToggle.checked : true,
    pasteDelayMs: parseInt(pasteDelayInput ? pasteDelayInput.value : 80, 10) || 80
  };
}

// Setup Save & Action Handlers
function setupSaveAndActions() {
  btnSave.addEventListener('click', async () => {
    const updated = getFormData();
    saveStatus.textContent = 'Saving...';
    const result = await window.settingsApi.saveConfig(updated);
    if (result.success) {
      currentConfig = result.config;
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

  if (btnFinishOnboarding) {
    btnFinishOnboarding.addEventListener('click', async () => {
      const updated = {
        ...getFormData(),
        firstLaunchCompleted: true
      };

      saveStatus.textContent = 'Configuring your shortcut...';
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

  btnCancel.addEventListener('click', () => {
    window.settingsApi.closeSettings();
  });

  // First-launch mode listener
  if (window.settingsApi.onSetFirstLaunchMode) {
    window.settingsApi.onSetFirstLaunchMode((isFirst) => {
      if (isFirst) {
        activateTab('tab-shortcuts');
        if (firstLaunchBanner) firstLaunchBanner.style.display = 'flex';
        if (btnFinishOnboarding) btnFinishOnboarding.style.display = 'inline-flex';
        if (btnSave) btnSave.style.display = 'none';
        if (btnCancel) btnCancel.style.display = 'none';
        primaryShortcutBox.scrollIntoView({ behavior: 'smooth' });
        primaryShortcutBox.click();
      }
    });
  }

  // Tray menu trigger to record shortcut
  if (window.settingsApi.onActivateShortcutRecorder) {
    window.settingsApi.onActivateShortcutRecorder(() => {
      activateTab('tab-shortcuts');
      primaryShortcutBox.scrollIntoView({ behavior: 'smooth' });
      primaryShortcutBox.click();
    });
  }
}

document.addEventListener('DOMContentLoaded', init);
