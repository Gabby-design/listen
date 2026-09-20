const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function getHistoryFilePath() {
  try {
    const userDataPath = app ? app.getPath('userData') : process.cwd();
    return path.join(userDataPath, 'history.json');
  } catch {
    return path.join(process.cwd(), 'history.json');
  }
}

function loadHistory() {
  const filePath = getHistoryFilePath();
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.error('Error loading history:', err);
  }
  return [];
}

function addHistoryItem(text, mode = 'verbatim') {
  if (!text || !text.trim()) return;
  const history = loadHistory();
  const newItem = {
    id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
    text: text.trim(),
    mode,
    timestamp: new Date().toISOString()
  };

  history.unshift(newItem);
  // Keep last 50 entries
  const trimmed = history.slice(0, 50);

  try {
    const filePath = getHistoryFilePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(trimmed, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving history:', err);
  }
  return trimmed;
}

function clearHistory() {
  try {
    const filePath = getHistoryFilePath();
    fs.writeFileSync(filePath, JSON.stringify([], null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error clearing history:', err);
    return false;
  }
}

module.exports = {
  loadHistory,
  addHistoryItem,
  clearHistory
};
