---
doc: ARCHITECTURE
purpose: "The current architectural model: workspaces, services, dependency directions, contracts, persistence, integrations, deployment shape, structural constraints"
authority: canonical
hosts_rules: []
mirrors_rules: []
last_reviewed: "2026-09-22"
---

# ARCHITECTURE — listen

> How the repository is structured **now** — not how it was planned, not a directory listing. Document boundaries and why they exist, non-obvious constraints, what breaks if you touch a given thing, and where authority lives. Every statement is `[verified]` against the repository or tagged otherwise.

## 1. Repository shape

Single repository containing an Electron desktop application (`main.js`, `overlay/`, `settings/`, `assets/`) alongside a static companion web/PWA landing page (`index.html`, `manifest.json`, `sw.js`, `vercel.json`).

## 2. Boundaries and dependency directions

- `main.js`: Root coordinator. Governs Electron application lifecycle, IPC events, system tray, global shortcut listening, audio network dispatch, AI formatting, and clipboard paste execution.
- `overlay/`: Isolated renderer process for visual feedback. Communicates exclusively via `preload-overlay.js` contextBridge. Captures microphone audio using HTML5 MediaRecorder and sends binary audio buffer to main process.
- `settings/`: Isolated renderer process for preferences. Communicates via `preload-settings.js` contextBridge. Reads and writes application settings.
- `paste.js`: Standalone automation helper. Executes WScript.Shell (Windows) or osascript (macOS) to send native paste keystroke to the active OS application.
- `config.js`: Configuration manager. Loads and persists runtime settings to `config.json` in user data directory or working directory.
- `history.js`: Persistence module. Appends transcription records to local JSON storage.

## 3. Cross-boundary contracts

- Overlay IPC:
  - `start-recording`: main -> overlay. Initiates MediaRecorder.
  - `stop-recording`: main -> overlay. Stops MediaRecorder.
  - `audio-captured`: overlay -> main. Transmits raw audio ArrayBuffer and MIME type.
  - `recording-error`: overlay -> main. Reports microphone errors.
  - `show-error`: main -> overlay. Triggers visual error state on orb.
- Settings IPC:
  - `get-config`: renderer -> main. Returns active configuration object.
  - `save-config`: renderer -> main. Persists updated configuration object.
  - `get-history` / `clear-history`: renderer -> main. Manages history records.

## 4. Persistence

- Configuration: Stored in `config.json` (`userData` path or project root).
- History: Stored in `history.json` under `userData` directory.

## 5. Integrations

- Groq Cloud API:
  - Audio transcription: `https://api.groq.com/openai/v1/audio/transcriptions` using `whisper-large-v3-turbo`.
  - Chat completions: `https://api.groq.com/openai/v1/chat/completions` using `qwen/qwen3.8-27b` for context formatting, phonetic healing, and punctuation.
- OpenAI API (fallback/alternative):
  - Audio transcription: `whisper-1`.
  - Chat completions: `gpt-4o-mini`.

## 6. Queue / worker

No external queue or background worker process. Audio processing is executed asynchronously in the main process event loop upon receipt of the `audio-captured` IPC event.

## 7. Deployment shape

- Desktop client packaged via `electron-builder` into Windows NSIS / portable executables and macOS DMG packages.
- Web companion deployed statically via Vercel.

## 8. Structural constraints

- Overlay window must always remain `focusable: false` to avoid stealing keyboard and window focus from the user's active application.
- Clipboard content must be snapshotted before writing transcribed text and restored immediately after paste execution so the user's prior clipboard is never destroyed.
