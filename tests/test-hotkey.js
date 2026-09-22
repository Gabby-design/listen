const { app, globalShortcut } = require('electron');

app.whenReady().then(() => {
  const scList = [
    'CommandOrControl+Space',
    'CommandOrControl+Shift+Space',
    'Alt+Space',
    'F8',
    'F9',
    'CommandOrControl+Shift+D'
  ];

  console.log('Testing globalShortcut registrations:');
  for (const sc of scList) {
    const ok = globalShortcut.register(sc, () => {
      console.log('TRIGGERED:', sc);
    });
    console.log(`Shortcut: ${sc} -> registered: ${ok}, isRegistered: ${globalShortcut.isRegistered(sc)}`);
  }

  setTimeout(() => {
    console.log('Exiting test.');
    app.quit();
  }, 2000);
});
