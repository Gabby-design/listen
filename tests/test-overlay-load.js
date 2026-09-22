const { app, BrowserWindow, screen } = require('electron');
const path = require('path');

app.whenReady().then(() => {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { x: workX, y: workY, width: screenWidth, height: screenHeight } = primaryDisplay.workArea;
  console.log('workArea:', { workX, workY, screenWidth, height: screenHeight });

  const orbSize = 140;
  const x = Math.round(workX + (screenWidth - orbSize) / 2);
  const y = Math.round(workY + screenHeight - orbSize - 24);
  console.log('Orb Position x, y:', x, y);

  const win = new BrowserWindow({
    width: orbSize,
    height: orbSize,
    x,
    y,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload-overlay.js')
    }
  });

  win.loadFile(path.join(__dirname, 'overlay', 'overlay.html')).then(() => {
    console.log('Loaded overlay.html');
    win.setAlwaysOnTop(true, 'floating');
    win.showInactive();
    console.log('isVisible:', win.isVisible(), 'isDestroyed:', win.isDestroyed());
    setTimeout(() => {
      app.quit();
    }, 1000);
  });
});
