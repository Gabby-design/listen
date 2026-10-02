# MEMORY — listen

> Current state only. Rewritten when reality changes; never a diary, never contradictory facts side by side. Read top to bottom at every session start. No secrets.

## Current Position

Desktop voice dictation application built with Electron for Windows and macOS. Version 0.0.4. Features fully offline speech recognition via the native Windows Speech Platform (`offlinetranscriber.exe`), automatic background audio output muting and media player pausing during dictation (`audiocontrol.exe`), full desktop application window lifecycle on startup with tray minimization and complete exit controls, cloud Whisper fallback, and simulated paste injection with zero clipboard residue.

## Fixed Decisions

- Use Electron for cross-platform desktop application runtime.
- Use native Windows Speech Platform (`System.Speech.Recognition` with `DictationGrammar`) for 100% offline speech-to-text with zero external download or bundle overhead.
- Use Windows Core Audio Endpoint API (`IAudioEndpointVolume`) and `VK_MEDIA_PLAY_PAUSE` to cleanly mute system sound and pause active media during speech input.
- Launch main application window on executable startup; minimize to system tray on window close when `closeToTray` is active; provide explicit quit button to terminate both window and background listening completely.
- Use Groq Whisper (`whisper-large-v3-turbo`) for cloud ultra-low latency transcription when online with automatic offline fallback.
- Preserve system clipboard by snapshotting before injection and restoring 35ms after paste execution; clear clipboard if empty previously.
- Frameless floating orb widget set to `focusable: false` to prevent stealing OS window focus from target cursor.

## Architecture

- Main Process (`main.js`): Manages application lifecycle, main window and tray, global shortcut registration, audio muting coordination, offline/cloud transcription dispatch, and simulated paste injection.
- Native Helpers (`assets/bin/`):
  - `audiocontrol.exe`: Native Windows Core Audio endpoint volume muting and media play/pause simulation.
  - `offlinetranscriber.exe`: Native Windows offline speech recognition engine using DictationGrammar.
  - `keywatcher.exe`: Low-level keyboard state watcher for Push-to-Talk key release.
- Overlay Renderer (`overlay/`): Frameless fluid orb rendered on HTML5 canvas with Web Audio analyser, MediaRecorder, and 16kHz mono WAV encoding pipeline.
- Main/Settings Renderer (`settings/`): User interface for configuring trigger mode, hotkeys, offline engine diagnostics, background audio muting, and transcription history.
- Native Paste Automation (`paste.js`): Dispatches native keystrokes (`Ctrl+V` on Windows, `Cmd+V` on macOS).
- Storage: Local configuration stored in `config.json`, transcription history in `history.js`.

## Features

- Fully offline speech recognition with zero internet requirement.
- Background audio output muting and media player pausing during listening.
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
