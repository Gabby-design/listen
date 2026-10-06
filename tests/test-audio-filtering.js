const assert = require('assert');

function shouldRejectAudio(durationMs, rms, rawText) {
  // 1. Accidental tap filter
  if (durationMs !== undefined && durationMs < 400) {
    return { reject: true, reason: 'duration_too_short' };
  }

  // 2. Audio energy filter (RMS below human speech threshold)
  if (rms !== undefined && rms > 0 && rms < 0.0025) {
    return { reject: true, reason: 'rms_below_threshold' };
  }

  // 3. Silence hallucination filter
  const silencePatterns = [
    /^thank\s+you(?:\s+very\s+much)?[.!]?$/i,
    /^(?:thank\s+you|thanks)\s+for\s+watching[.!]?$/i,
    /^subtitles?\s+by/i,
    /^(?:please\s+)?subscribe[.!]?$/i,
    /^like\s+and\s+subscribe[.!]?$/i,
    /^(?:bye|goodbye)[.!]?$/i,
    /^(?:you|so|oh|okay)[.!]?$/i
  ];
  const normRaw = (rawText || '').trim();
  const isHallucination = silencePatterns.some(pat => pat.test(normRaw));
  if (isHallucination && ((durationMs && durationMs < 1800) || (rms && rms < 0.01))) {
    return { reject: true, reason: 'silence_hallucination' };
  }

  return { reject: false };
}

console.log('Testing audio tap and silence filtering:');

// Case 1: Accidental quick tap (< 400ms)
const res1 = shouldRejectAudio(180, 0.05, 'Hello');
assert.strictEqual(res1.reject, true);
assert.strictEqual(res1.reason, 'duration_too_short');
console.log('Case 1 (Accidental tap 180ms): Correctly rejected');

// Case 2: Silent recording with low RMS
const res2 = shouldRejectAudio(1200, 0.0012, 'Hello');
assert.strictEqual(res2.reject, true);
assert.strictEqual(res2.reason, 'rms_below_threshold');
console.log('Case 2 (Silent recording RMS 0.0012): Correctly rejected');

// Case 3: Whisper silence hallucination on brief audio
const res3 = shouldRejectAudio(800, 0.008, 'Thank you for watching.');
assert.strictEqual(res3.reject, true);
assert.strictEqual(res3.reason, 'silence_hallucination');
console.log('Case 3 (Silence hallucination "Thank you for watching."): Correctly rejected');

// Case 4: Legitimate speech (normal duration and RMS)
const res4 = shouldRejectAudio(2500, 0.08, 'This is a genuine voice dictation test.');
assert.strictEqual(res4.reject, false);
console.log('Case 4 (Legitimate speech): Correctly accepted');

// Case 5: Legitimate humming ("Hmmm let me see")
const res5 = shouldRejectAudio(1900, 0.06, 'Hmmm let me see');
assert.strictEqual(res5.reject, false);
console.log('Case 5 (Legitimate humming): Correctly accepted');

console.log('All audio filtering tests passed successfully.');
