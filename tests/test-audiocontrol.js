const assert = require('assert');
const path = require('path');
const { execFileSync } = require('child_process');

if (process.platform !== 'win32') {
  console.log('Skipping audiocontrol test on non-Windows platform.');
  process.exit(0);
}

const exePath = path.join(__dirname, '..', 'assets', 'bin', 'audiocontrol.exe');

console.log('Testing audiocontrol binary:');

// Test 1: get-peak returns valid float string
const peakOut = execFileSync(exePath, ['get-peak'], { encoding: 'utf8' }).trim();
const peakVal = parseFloat(peakOut);
assert(!isNaN(peakVal), 'Peak value must be a valid float');
assert(peakVal >= 0.0 && peakVal <= 1.0, 'Peak value must be between 0.0 and 1.0');
console.log(`Test 1 (get-peak): Value=${peakVal.toFixed(6)} - PASS`);

// Test 2: pause-if-playing returns PAUSED or NOT_PLAYING without throwing
const pauseOut = execFileSync(exePath, ['pause-if-playing'], { encoding: 'utf8' }).trim();
assert(pauseOut === 'PAUSED' || pauseOut === 'NOT_PLAYING', `Expected PAUSED or NOT_PLAYING, got ${pauseOut}`);
console.log(`Test 2 (pause-if-playing): Result=${pauseOut} - PASS`);

// Test 3: resume-media returns RESUMED or NO_ACTION without throwing
const resumeOut = execFileSync(exePath, ['resume-media'], { encoding: 'utf8' }).trim();
assert(resumeOut === 'RESUMED' || resumeOut === 'NO_ACTION', `Expected RESUMED or NO_ACTION, got ${resumeOut}`);
console.log(`Test 3 (resume-media): Result=${resumeOut} - PASS`);

// Test 4: is-playing returns TRUE or FALSE
const playingOut = execFileSync(exePath, ['is-playing'], { encoding: 'utf8' }).trim();
assert(playingOut === 'TRUE' || playingOut === 'FALSE', `Expected TRUE or FALSE, got ${playingOut}`);
console.log(`Test 4 (is-playing): Result=${playingOut} - PASS`);

console.log('All audiocontrol tests passed successfully.');
