# MEMORY — listen

> Current state only. Rewritten when reality changes; never a diary, never contradictory facts side by side. Read top to bottom at every session start. No secrets.

## Current Position

Desktop voice dictation application built with Electron for Windows and macOS. Version 0.0.03. Audio capture via HTML5 MediaRecorder and Web Audio API, transcription via Groq Whisper (`whisper-large-v3-turbo`) or OpenAI Whisper (`whisper-1`), context-aware formatting and phonetic correction via Groq (`qwen/qwen3.8-27b`), and simulated paste injection via WScript.Shell (Windows) or osascript (macOS). Pre-paste clipboard snapshotting ensures the user's existing clipboard is never overwritten by dictation. Working tree contains modified files ready for owner review.

## Fixed Decisions

- Use Electron for cross-platform desktop application runtime.
- Use Groq Whisper (`whisper-large-v3-turbo`) for primary ultra-low latency transcription.
- Use Groq (`qwen/qwen3.8-27b`) for contextual AI formatting, phonetic correction, and sentence assembly.
- Preserve system clipboard by snapshotting before injection and restoring 35ms after paste execution; clear clipboard if empty previously.
- Frameless floating orb widget set to `focusable: false` to prevent stealing OS window focus from target cursor.

## Architecture

- Main Process (`main.js`): Manages system tray, global shortcut registration, IPC coordination, audio buffer forwarding to Groq API, AI context formatting, and simulated paste dispatch.
- Overlay Renderer (`overlay/`): Frameless fluid orb rendered on HTML5 canvas with Web Audio analyser and MediaRecorder at 48 kHz with noise suppression and echo cancellation.
- Settings Renderer (`settings/`): User interface for configuring trigger mode (toggle vs push-to-talk), hotkeys, audio feedback, and custom vocabulary.
- Native Paste Automation (`paste.js`): Dispatches native keystrokes (`Ctrl+V` on Windows, `Cmd+V` on macOS).
- Storage: Local configuration stored in `config.json`, transcription history in `history.js`.

## Features

- Zero-focus-stealing floating orb indicator.
- Global keyboard hotkey trigger (`Ctrl+Shift+Space` default).
- Push-to-talk and toggle dictation modes.
- Sentence-level comprehension with phonetic auto-healing and spelling correction.
- Figures vs words formatting for numbers, dates, times, measurements, and explicit directives.
- Mathematical operators and symbols formatting (`+`, `=`, `-`, `*`, `/`, `%`).
- Spoken punctuation commands and natural cadence punctuation.
- Full clipboard protection with zero dictation residue.
- Local history drawer for past transcriptions.

## Environment

- Node.js >= 18.0.0.
- Windows 10/11 or macOS.
- Working audio input microphone.
- Valid Groq or OpenAI API key in `config.json`.
- Launch command: `npm start`.

## Gotchas

- In Windows, writing empty string to clipboard does not clear it; `clipboard.clear()` must be used explicitly.
- Sending keystrokes via WScript.Shell requires the target window to retain focus; overlay window must never be focusable.
- Reasoning models (such as `gpt-oss-20b`) introduce significant token generation latency; lightweight non-reasoning models (`qwen3.8-27b`) are required for sub-second response.

## Deferred Work

- None currently pending.

## Deviations

- None.

## Open Questions

- None.
