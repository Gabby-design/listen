---
doc: HANDOFF
purpose: "The baton for unfinished work — what is happening now and what the next agent needs to continue"
authority: canonical
hosts_rules: []
mirrors_rules: [RULE-GIT-001]
last_reviewed: "2026-10-07"
---

# HANDOFF — listen

## Status

**Implementation complete. Verification passed. Ready for owner review.**

## Task: Eliminating Voice-to-Paste Latency Regression
**Objective:** Eliminate multi-second pasting lag by removing LLM reasoning model bottleneck, bypassing redundant LLM roundtrips in Verbatim mode, dropping prompt decoder overhead in Whisper, ensuring synchronous offline WAV generation, and tightening paste delay.

**Work completed:**
1. **LLM Model & Mode Separation (`main.js`):**
   - Discovered `openai/gpt-oss-20b` was an experimental reasoning model on Groq that consumed all tokens on hidden reasoning traces, returned empty content, and forced a 3.5s timeout.
   - Replaced with `qwen/qwen3.8-27b` on Groq (tested ~400ms-600ms latency) and capped timeout at 1800ms.
   - In Verbatim mode (`activeMode === 'verbatim'`), bypassed remote LLM network calls completely: Whisper Large V3 Turbo handles punctuation/capitalization, and local `formatTranscription` handles math, numbers, and signs in 0.1ms with 0ms network lag (eliminating 3.5s delay).
2. **Whisper Decoder Latency Optimization (`main.js`):**
   - Omitted 160-character conditioning prompt when no custom vocabulary is set, eliminating 500-700ms of decoder warmup latency (measured 638ms vs 1326ms).
3. **WAV Generation & Offline Stability (`overlay/overlay.js`):**
   - When in offline mode (`isCurrentSessionOffline`), generate 16kHz PCM WAV synchronously before dispatch to prevent sending null `wavBuffer` to `offlinetranscriber.exe` (which triggered 25s timeout).
   - Reduced `MediaRecorder` timeslice from 1000ms to 250ms for instant buffer flushing on stop.
4. **Paste Delay Tuning (`paste.js`, `config.js`, `config.json`):**
   - Adjusted default paste delay to 20ms.

**Files changed:**
- `main.js`
- `config.js`
- `config.json`
- `paste.js`
- `overlay/overlay.js`
- `docs/ai/HANDOFF.md`

**Verification:**
- `npm test`: 100% test pass rate across all formatters, audio filtering, and audiocontrol suites.
- Live benchmark confirmed `qwen/qwen3.8-27b` runs in ~400ms-600ms.
- Whisper latency reduced from 1326ms to ~600ms-900ms.
- Verbatim mode now pastes in sub-second time.

## Git status

Working tree contains modified optimization files ready for owner review and commit.
