const { app, BrowserWindow } = require('electron');

app.whenReady().then(() => {
  try {
    const win = new BrowserWindow({
      width: 200,
      height: 200,
      show: false,
      transparent: true,
      frame: false,
      focusable: false
    });
    console.log('Window created.');
    try {
      win.setAlwaysOnTop(true, 'screen-saver');
      console.log('setAlwaysOnTop screen-saver succeeded');
    } catch (e) {
      console.error('setAlwaysOnTop screen-saver error:', e.message);
    }
    try {
      win.showInactive();
      console.log('showInactive succeeded, isVisible:', win.isVisible());
    } catch (e) {
      console.error('showInactive error:', e.message);
    }
  } catch (err) {
    console.error('Test error:', err);
  }
  setTimeout(() => app.quit(), 500);
});
