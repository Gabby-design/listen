---
doc: plans/plan-audio-speech-theme-installer
purpose: "Phased resolution for background audio pause/resume, accidental tap filter, humming/singing transcription, web/in-app separation, orange-purple theme, and NSIS installer setup"
authority: canonical
hosts_rules: []
mirrors_rules: []
last_reviewed: "2026-10-06"
---

# Plan: Listen Enhancements & Fixes

**Status:** completed · **Classification:** bug fix & enhancement · **Source:** Owner audio directives · **Owner approval:** completed

## Objective

Deliver five requested fixes in sequential, individually verified steps:
1. Prevent unintended media playback: inspect system audio peak meter before touching playback; pause only if actively playing; resume only if paused by Listen; never mute master audio output.
2. Filter accidental shortcut taps and silent triggers; faithfully capture exact words, humming ("hmmm"), and singing without hallucinated output.
3. Remove technical "How it Works" architecture from web landing page (`index.html`); preserve creator story, mission, and purpose.
4. Add in-app "How It Works" tab inside installed desktop application; replace blue theme with clean Sunset Orange & Purple palette across settings UI and fluid orb.
5. Standardize Windows distribution on full NSIS setup wizard (`Listen Setup X.X.X.exe`) with UAC permission request; eliminate portable target ambiguity.

## Scope

- Native helper: `assets/bin/audiocontrol.cs`, compiled to `assets/bin/audiocontrol.exe`.
- Core application: `main.js`, `config.js`, `package.json`.
- Web landing page: `index.html`.
- Renderer UI: `overlay/overlay.js`, `overlay/overlay.html`, `settings/settings.html`, `settings/settings.css`, `settings/settings.js`.
- Test suites: `tests/test-audiocontrol.js`, `tests/test-formatter.js`, `tests/test-audio-filtering.js`.

## Non-goals

- Altering clipboard preservation restore timing.
- Modifying offline speech recognition grammar engine (`offlinetranscriber.cs`).
- Introducing third-party CSS or UI framework dependencies.

## Ordered Tasks

| ID | Task | Acceptance Criteria | Status |
| --- | --- | --- | --- |
| T1 | Audio playback & meter control refactor | `audiocontrol.exe pause-if-playing` checks endpoint peak value; pauses only when sound active; `resume-media` runs only if Listen paused playback; zero master volume muting. | completed |
| T2 | Accidental tap filter & vocal sound handling | Discard recordings < 400ms or below vocal RMS energy without calling transcription or pasting; update prompts and formatters to preserve humming ("hmmm") and singing lyrics verbatim. | completed |
| T3 | Landing page content cleanup | Remove "How the Technology Works" section from `index.html`; keep origin story, purpose, and download links. | completed |
| T4 | In-app "How It Works" & Orange/Purple theme | Add dedicated explanation tab in `settings.html`; update `settings.css` and `overlay.js` to vibrant Sunset Orange & Purple palette, replacing blue accents. | completed |
| T5 | NSIS installer target standardization | Remove `portable` target in `package.json` win configuration; require UAC execution level; verify build produces only `Listen Setup X.X.X.exe`. | completed |
| T6 | Silent auto-updater & targeted GSMTC media control | `electron-updater` background download with OS notification & in-app "Restart to Update" badge; WinRT GSMTC targeted pause/resume prevents accidental playback of background tabs (TikTok). | completed |

## Verification Plan

1. Audio control:
   - Run `audiocontrol.exe is-playing` with sound stopped -> returns `FALSE`.
   - Run `audiocontrol.exe pause-if-playing` when silent -> returns `NOT_PLAYING`; no keystrokes emitted.
   - Run with active audio -> returns `PAUSED`.
2. Audio filtering:
   - Run test script simulating short buffer (<400ms) and low RMS -> rejected, no paste executed.
   - Run test with humming phrase -> formatted correctly, preserving "hmmm".
3. UI verification:
   - Syntax check: `node --check main.js`, `node --check overlay/overlay.js`, `node --check settings/settings.js`.
   - Run existing and new test suites: `npm test`.

## Documentation Impact

- `docs/ai/MEMORY.md`: Update background audio handling notes, theme details, and installer target description.
- `docs/ai/HANDOFF.md`: Update current state per step.
- `CHANGELOG.md`: Record symptom, cause, and fixes.
