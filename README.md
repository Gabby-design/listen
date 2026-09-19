# Listen - Desktop Voice Dictation Application

A sleek, production-ready desktop dictation application for **Windows** and **macOS** built with Electron.

Press your custom keyboard shortcut from any application or screen, speak naturally into your microphone while a floating, non-focus-stealing pill widget visualizes your speech, and press the shortcut again to have your words instantly transcribed via **Groq Whisper** or **OpenAI Whisper** and automatically pasted directly into your active cursor.

---

## Features

- 🎙️ **Zero-Focus-Steal Floating Pill**:
  Frameless glassmorphic widget (`focusable: false`, `skipTaskbar: true`, `alwaysOnTop: true`) that sits elegantly at the top of your screen without stealing OS focus from Word, VSCode, Chrome, Slack, or any other active application.
- ⚡ **Ultra-Fast Transcription**:
  Powered by **Groq Whisper** (`whisper-large-v3-turbo`) transcribing in ~300ms, or **OpenAI Whisper** (`whisper-1`).
- 🌊 **Real-Time Voice Waveform Visualizer**:
  Reactive audio frequency visualizer powered by Web Audio API `AnalyserNode` that pulses and animates to your actual voice volume.
- ⌨️ **Interactive Shortcut Recorder**:
  Configure any global hotkey (e.g., `Ctrl+Shift+Space`, `Alt+D`, `Ctrl+Shift+X`) using an interactive key recorder that captures modifier and key combinations on the fly.
- 📋 **Automated Native Paste Injection**:
  Places transcribed text into the system clipboard, waits for focus stabilization, and dispatches native simulated `Ctrl+V` (Windows) or `Cmd+V` (macOS) with zero console window popups.
- 🎛️ **System Tray Integration**:
  Runs unobtrusively in the background with quick access to Settings, Re-record Shortcut, and App Exit.
- 🛡️ **Robust Error Handling**:
  Displays brief red status warnings on the pill if the microphone is disconnected or an API key fails, auto-fading after 2 seconds without crashing.

---

## Project Structure

```
listen/
├── package.json              # Project dependencies and scripts
├── main.js                   # Electron main process (tray, shortcuts, STT API, paste simulation)
├── config.js                 # Configuration persistence & accelerator formatting
├── paste.js                  # Cross-platform paste automation (Windows wscript, macOS osascript)
├── preload-overlay.js        # Secure contextBridge IPC for floating pill overlay
├── preload-settings.js       # Secure contextBridge IPC for settings window
├── assets/
│   ├── icon.png              # App icon
│   └── tray-icon.png         # System tray icon
├── overlay/
│   ├── overlay.html          # Floating pill indicator DOM
│   ├── overlay.css           # Glassmorphism, animations, state transitions
│   └── overlay.js            # HTML5 MediaRecorder & Web Audio visualizer
├── settings/
│   ├── settings.html         # Settings UI (providers, models, key recorder)
│   ├── settings.css          # Dark slate theme styling
│   └── settings.js           # Interactive settings logic and connection tester
└── README.md                 # Project documentation
```

---

## Requirements

- **Node.js**: v18.0.0 or higher
- **Microphone**: Default system audio input device enabled

---

## Step-by-Step Installation & Run

### 1. Clone the Repository
```bash
git clone https://github.com/Gabby-design/listen.git
cd listen
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Launch the Application
```bash
npm start
```

---

## How to Use

1. **Initial Setup**:
   - The app starts minimized to the system tray.
   - If an API key is not yet set, the **Settings** window will open automatically.
   - Enter your Groq or OpenAI API key.
   - Click **Test Connection** to verify your key, then click **Save Changes**.

2. **Dictation**:
   - Focus any text field in any application (e.g. Notepad, browser search bar, Discord, VSCode).
   - Press **`Ctrl + Shift + Space`** (default shortcut).
   - The floating pill indicator appears displaying **"Listening..."** with reactive waveform bars.
   - Speak your thoughts into your microphone.
   - Press **`Ctrl + Shift + Space`** again to finish.
   - The pill transitions to **"Transcribing..."**, and within milliseconds, your spoken words are automatically pasted directly at your cursor position!

3. **Change Shortcut**:
   - Right-click the **Listen** icon in the system tray.
   - Select **Re-record Shortcut** (or open Settings).
   - Click the shortcut recorder input box and press your desired keyboard combination (e.g., `Ctrl+Shift+X` or `Alt+D`).
   - Click **Save Changes**.

---

## Supported Providers & Models

| Provider | Model | Latency | Recommended Use |
| :--- | :--- | :--- | :--- |
| **Groq Cloud** | `whisper-large-v3-turbo` | ~300ms | **Default & Recommended** (Real-time speed) |
| **Groq Cloud** | `whisper-large-v3` | ~600ms | Highest accuracy transcription |
| **Groq Cloud** | `distil-whisper-large-v3-en` | ~250ms | English-only ultra-low latency |
| **OpenAI** | `whisper-1` | ~1.2s - 2s | OpenAI Whisper API |

---

## License

MIT © Gabby-design
