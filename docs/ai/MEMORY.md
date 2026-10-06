# MEMORY — listen

> Current state only. Rewritten when reality changes; never a diary, never contradictory facts side by side. Read top to bottom at every session start. No secrets.

## Current Position

- Owner: **Master** (address as Master across all sessions)

Desktop voice dictation application built with Electron for Windows and macOS. Version 0.0.6. Features silent in-app auto-updating via `electron-updater` from GitHub Releases (`Gabby-design/listen`), fully offline speech recognition via the native Windows Speech Platform (`offlinetranscriber.exe`), targeted title-aware background media pausing via Windows System Media Transport Controls (`audiocontrol.exe`), accidental tap and silence filtering, faithful transcription of humming and singing, in-app "How It Works" guide, vibrant Sunset Orange & Purple theme, cloud Whisper fallback, and simulated paste injection with zero clipboard residue.

## Fixed Decisions

- Use Electron for cross-platform desktop application runtime.
- Use native Windows Speech Platform (`System.Speech.Recognition` with `DictationGrammar`) for 100% offline speech-to-text with zero external download or bundle overhead.
- Inspect Windows System Media Transport Controls (GSMTC) before touching media; query specific sessions using composite `SourceAppUserModelId:::Title` fingerprints. Call `TryPauseAsync()` strictly on sessions with `PlaybackStatus == Playing`, and resume via `TryPlayAsync()` strictly if the exact session fingerprint was paused by Listen. This prevents multiple tabs in the same browser (e.g. YouTube video playing while YouTube Music is paused) from cross-triggering each other. Never emit blind `VK_MEDIA_PLAY_PAUSE` toggle keys. Duck master volume for active non-GSMTC audio. Leave silent media completely untouched.
- Distribute updates via `electron-updater` pointing to GitHub Releases (`Gabby-design/listen`). Download updates silently in the background, issue native OS desktop notifications, and provide a one-click in-app "Restart to Update" button that triggers `autoUpdater.quitAndInstall()`.
- Discard accidental hotkey taps (< 400ms) or silent recordings (RMS < 0.0025) immediately with zero paste output. Filter repetitive silence hallucinations while preserving humming ("hmmm") and sung lyrics verbatim.
- Launch main application window on executable startup; minimize to system tray on window close when `closeToTray` is active; provide explicit quit button to terminate both window and background listening completely.
- Use Sunset Orange (`#f97316`) and Neon Purple (`#a855f7`) as the signature visual identity across settings UI and the fluid floating orb.
- Keep technical architecture explanation inside the installed desktop application ("How It Works" tab); keep the web landing page (`index.html`) focused on origin story, product mission, and downloads.
- Standardize Windows distribution on the NSIS setup wizard (`Listen Setup 0.0.6.exe`) with `perMachine: true` (UAC prompt), removing portable target ambiguity.
- Use Groq Whisper (`whisper-large-v3-turbo`) for cloud ultra-low latency transcription when online with automatic offline fallback.
- Preserve system clipboard by snapshotting before injection and restoring 35ms after paste execution; clear clipboard if empty previously.
- Frameless floating orb widget set to `focusable: false` to prevent stealing OS window focus from target cursor.

## Architecture

- Main Process (`main.js`): Manages application lifecycle, main window and tray, global shortcut registration, peak-meter media pausing, offline/cloud transcription dispatch, and simulated paste injection.
- Native Helpers (`assets/bin/`):
  - `audiocontrol.exe`: Native Windows Core Audio peak meter inspection, media play/pause simulation, and volume control.
  - `offlinetranscriber.exe`: Native Windows offline speech recognition engine using DictationGrammar.
  - `keywatcher.exe`: Low-level keyboard state watcher for Push-to-Talk key release.
- Overlay Renderer (`overlay/`): Frameless fluid orb rendered on HTML5 canvas with Sunset Orange/Purple shaders, Web Audio analyser, MediaRecorder, duration/RMS filtering, and 16kHz mono WAV encoding pipeline.
- Main/Settings Renderer (`settings/`): User interface for configuring trigger mode, hotkeys, offline engine diagnostics, background audio handling, transcription history, and the built-in "How It Works" guide.
- Native Paste Automation (`paste.js`): Dispatches native keystrokes (`Ctrl+V` on Windows, `Cmd+V` on macOS).
- Storage: Local configuration stored in `config.json`, transcription history in `history.js`.

## Features

- Fully offline speech recognition with zero internet requirement.
- Real-time GSMTC session inspection: pauses media strictly when playing via `TryPauseAsync()`, resumes strictly if paused by Listen via `TryPlayAsync()`, zero blind toggle keystrokes, zero accidental playback of paused background media.
- Accidental hotkey tap and silence rejection (< 400ms duration or low RMS energy).
- Faithful transcription of humming ("hmmm"), singing lyrics, and exact spoken words.
- In-app "How It Works" interactive guide tab.
- Sunset Orange and Purple visual theme across desktop UI and canvas orb.
- Native desktop application window lifecycle on startup with tray minimization and explicit quit.
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
- Optional Groq or OpenAI API key in `config.json` for cloud transcription.
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
