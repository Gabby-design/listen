const { exec, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const vbsCache = {};

function getWindowsVbsScript(method = 'default') {
  if (vbsCache[method] && fs.existsSync(vbsCache[method])) {
    return vbsCache[method];
  }

  let sendKeysSequence = '^v';
  if (method === 'terminal') {
    sendKeysSequence = '^+v'; // Ctrl+Shift+V
  } else if (method === 'shift_insert') {
    sendKeysSequence = '+{INSERT}'; // Shift+Insert
  }

  const tempDir = os.tmpdir();
  const vbsPath = path.join(tempDir, `listen_paste_${method}.vbs`);
  const vbsContent = [
    'Set WshShell = CreateObject("WScript.Shell")',
    'WScript.Sleep 20',
    `WshShell.SendKeys "${sendKeysSequence}"`
  ].join('\r\n');

  try {
    fs.writeFileSync(vbsPath, vbsContent, 'utf8');
    vbsCache[method] = vbsPath;
    return vbsPath;
  } catch (err) {
    console.error('Failed to create VBS script for paste:', err);
    return null;
  }
}

/**
 * Simulates paste into active focus with configurable method and delay.
 * @param {number} delayMs Delay before pasting in milliseconds (default: 80ms)
 * @param {string} method 'default' (Ctrl+V) | 'terminal' (Ctrl+Shift+V) | 'shift_insert' (Shift+Insert)
 * @returns {Promise<boolean>}
 */
function simulatePaste(delayMs = 80, method = 'default') {
  return new Promise((resolve) => {
    setTimeout(() => {
      const platform = process.platform;

      if (platform === 'win32') {
        const vbsPath = getWindowsVbsScript(method);
        if (vbsPath) {
          execFile('wscript.exe', ['//nologo', vbsPath], (err) => {
            if (err) {
              console.warn('wscript paste failed, falling back to powershell:', err);
              let psKeys = '^v';
              if (method === 'terminal') psKeys = '^+v';
              else if (method === 'shift_insert') psKeys = '+{INSERT}';

              exec(
                `powershell.exe -NoProfile -NonInteractive -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${psKeys}')"`,
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
          let psKeys = '^v';
          if (method === 'terminal') psKeys = '^+v';
          else if (method === 'shift_insert') psKeys = '+{INSERT}';

          exec(
            `powershell.exe -NoProfile -NonInteractive -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${psKeys}')"`,
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
        const keyCmd = method === 'terminal' ? 'ctrl+shift+v' : 'ctrl+v';
        exec(`xdotool key ${keyCmd}`, (err) => {
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
