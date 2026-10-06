const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlayApi', {
  onStartRecording: (callback) => {
    ipcRenderer.on('start-recording', () => callback());
  },
  onStopRecording: (callback) => {
    ipcRenderer.on('stop-recording', () => callback());
  },
  onShowError: (callback) => {
    ipcRenderer.on('show-error', (_event, message) => callback(message));
  },
  onReset: (callback) => {
    ipcRenderer.on('reset-state', () => callback());
  },
  onSetSoundFeedback: (callback) => {
    ipcRenderer.on('set-sound-feedback', (_event, enabled) => callback(enabled));
  },
  sendAudio: (arrayBuffer, mimeType, wavBuffer, durationMs, rms) => {
    ipcRenderer.send('audio-captured', { buffer: arrayBuffer, mimeType, wavBuffer, durationMs, rms });
  },
  sendCancel: () => {
    ipcRenderer.send('recording-cancelled');
  },
  sendError: (errorMessage) => {
    ipcRenderer.send('recording-error', errorMessage);
  },
  ready: () => {
    ipcRenderer.send('overlay-ready');
  }
});
