const { exec, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

let cachedVbsPath = null;

function getWindowsVbsScript() {
  if (cachedVbsPath && fs.existsSync(cachedVbsPath)) {
    return cachedVbsPath;
  }
  const tempDir = os.tmpdir();
  const vbsPath = path.join(tempDir, 'listen_paste.vbs');
  const vbsContent = [
    'Set WshShell = CreateObject("WScript.Shell")',
    'WScript.Sleep 20',
    'WshShell.SendKeys "^v"'
  ].join('\r\n');

  try {
    fs.writeFileSync(vbsPath, vbsContent, 'utf8');
    cachedVbsPath = vbsPath;
    return vbsPath;
  } catch (err) {
    console.error('Failed to create VBS script for paste:', err);
    return null;
  }
}

/**
 * Simulates Ctrl+V (or Cmd+V on macOS) to paste the clipboard contents into active focus.
 * @param {number} delayMs Delay before pasting in milliseconds (default: 80ms)
 * @returns {Promise<boolean>}
 */
function simulatePaste(delayMs = 80) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const platform = process.platform;

      if (platform === 'win32') {
        const vbsPath = getWindowsVbsScript();
        if (vbsPath) {
          // wscript is a GUI program, so it never opens a console/cmd popup window!
          execFile('wscript.exe', ['//nologo', vbsPath], (err) => {
            if (err) {
              console.warn('wscript paste failed, falling back to powershell:', err);
              // Fallback to PowerShell SendKeys
              exec(
                'powershell.exe -NoProfile -NonInteractive -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(\'^v\')"',
                { windowsHide: true },
                (psErr) => {
                  if (psErr) console.error('PowerShell paste failed:', psErr);
                  resolve(!psErr);
                }
              );
            } else {
              resolve(true);
            }
          });
        } else {
          // Fallback to PowerShell
          exec(
            'powershell.exe -NoProfile -NonInteractive -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(\'^v\')"',
            { windowsHide: true },
            (psErr) => {
              if (psErr) console.error('PowerShell paste fallback failed:', psErr);
              resolve(!psErr);
            }
          );
        }
      } else if (platform === 'darwin') {
        // macOS: AppleScript keystroke
        exec(
          'osascript -e \'tell application "System Events" to keystroke "v" using command down\'',
          (err) => {
            if (err) console.error('macOS paste failed:', err);
            resolve(!err);
          }
        );
      } else {
        // Linux: xdotool
        exec('xdotool key ctrl+v', (err) => {
          if (err) console.error('Linux paste failed:', err);
          resolve(!err);
        });
      }
    }, delayMs);
  });
}

module.exports = {
  simulatePaste
};
