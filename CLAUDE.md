# CLAUDE.md

## Workflow Orchestration

### 1. Plan Node Default

Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)

If something goes sideways, STOP and re-plan immediately don't keep pushing

Use plan mode for verification steps, not just building

Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy

Use subagents liberally to keep main context window clean

Offload research, exploration, and parallel analysis to subagents

For complex problems, throw more compute at it via subagents

One tack per subagent for focused execution

### 3. Self-Improvement Loop

After ANY correction from the user: update tasks/lessons.md with the pattern

Write rules for yourself that prevent the same mistake

Ruthlessly iterate on these lessons until mistake rate drops

Review lessons at session start for relevant project

### 4. Verification Before Done

Never mark a task complete without proving it works

Diff behavior between main and your changes when relevant

Ask yourself: "Would a staff engineer approve this?"

Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)

For non-trivial changes: pause and ask "is there a more elegant way?"

If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"

Skip this for simple, obvious fixes don't over-engineer

Challenge your own work before presenting it

### 6. Autonomous Bug Fizing

When given a bug report: just fix it. Don't ask for hand-holding

Point at logs, errors, failing tests then resolve them

Zero context switching required from the user

Go fix failing CI tests without being told how

##Task Management

1. **Plan First**: Write plan to tasks/todo.md with checkable items

2. **Verify Plan**: Check in before starting implementation

3. **Track Progress**: Mark items complete as you go

4. **Explain Changes**: High-level summary at each step

5. **Document Results**: Add review section to tasks/todo.md

6. **Capture Lessons**: Update tasks/lessons.md after corrections

## Core Principles

**Simplicity First**: Make every change as simple as possible. Impact minimal code.

**No Laziness**: Find root causes. No temporary fixes. Senior developer standards.

**Minimat Impact**: Changes should only touch what's necessary. Avoid introducing bugs.
** comment on code ": write clear and understandable code for developers to follow

Context for Claude when working in this repo.

## What this is

**Diane** — a single-page PWA that records audio in the browser, sends it to Google's Gemini API, and renders an AI-generated summary in one of several preset formats (meeting protocol, sales notes, social-media post, formal letter, "vibe prompt" for AI coding tools, etc.). UI is in Swedish.

Live: https://skaneby.github.io/voicesummary/ — hosted on GitHub Pages, deployed automatically from `main`.

## Stack

- **Zero build step.** Vanilla HTML/CSS/JS in a single [index.html](index.html) (~2,170 lines). Open it in a browser and it works.
- **Service worker** ([sw.js](sw.js)) — network-first for `index.html`, cache-first for static assets. Bump `CACHE` const to invalidate.
- **PWA manifest** ([manifest.json](manifest.json)) — installable on Android (`beforeinstallprompt`) and iOS (Safari "Add to Home Screen", detected at [index.html:2136](index.html#L2136)).
- **No backend.** Gemini API is called directly from the browser using the user's own API key, stored in `localStorage`.

## File map

- [index.html](index.html) — everything: markup, styles, all JS. Sections are marked with `// ── SECTION ─` banner comments.
- [sw.js](sw.js) — service worker. 44 lines. Tiny on purpose.
- [manifest.json](manifest.json) — PWA manifest.
- [icon.svg](icon.svg), [icon-192.png](icon-192.png), [icon-512.png](icon-512.png) — app icons.
- [test.html](test.html) — scratch/test page, not part of the app.

## Key code locations

- API base + storage keys: [index.html:859-862](index.html#L859-L862)
- `PROMPTS` table (one entry per format preset): [index.html:880](index.html#L880)
- HTML sanitizer for Gemini output: [index.html:1146](index.html#L1146) — whitelist is `article, section, h2, p, ul, ol, li, strong, em, br`. All attributes stripped.
- App state `s` + allowed Gemini models: [index.html:1166-1176](index.html#L1166-L1176)
- Wake Lock: [index.html:1178](index.html#L1178)
- iOS keep-alive oscillator (1 Hz, gain 0.001) to prevent Safari from suspending the page mid-recording: [index.html:1191](index.html#L1191)
- `isIOS()` / `isStandalone()` helpers: [index.html:2064](index.html#L2064)
- Gemini error handling (403 / 429 limit:0 / 503 retries / MAX_TOKENS): around [index.html:1476-1508](index.html#L1476-L1508)
- GitHub Issues integration (optional, uses user-supplied PAT): [index.html:1855](index.html#L1855)

## Format presets

Defined as keys in `PROMPTS` at [index.html:880](index.html#L880) and rendered as cards in `#formatRow` at [index.html:570](index.html#L570). Current set: `summary`, `protocol`, `brief`, `detailed`, `sales`, `social`, `blog`, `letter`, `vibecoder`, `insandare`, `psyk`, `tal`, `predikan`, `drama`, `konspiration`. Each prompt instructs Gemini to detect the spoken language and respond in that same language, returning a TITLE line + sanitizable HTML.

## Themes

Three CSS-variable themes selected via `html[data-theme="..."]`: `original` (default, dark indigo), `twinpeaks` (Black Lodge — chevron floor, red vignette, Special Elite font), `panasonic` (skeuomorphic cassette recorder, monospace).

## Gemini API behavior

- Default model: `gemini-2.5-flash` (works on free tier). `gemini-2.5-pro` requires billing.
- Free-tier handling: on `403` or `429` with `limit: 0`, auto-switches to Flash and surfaces a Swedish error asking the user to retry.
- `503` overloaded: auto-retries up to 3× with backoff.
- `MAX_TOKENS` finish reason and empty `candidates` arrays are handled explicitly.

## Conventions / gotchas

- **Don't add a build step.** The whole point is "edit one file, push, done."
- **Don't cache `index.html` aggressively** — the SW intentionally fetches it network-first so updates ship instantly. Bump `CACHE` in [sw.js:1](sw.js#L1) when changing assets that ARE cached.
- **All AI-rendered HTML must go through `sanitizeHtml()`** before insertion. Never `innerHTML =` raw Gemini output.
- **Swedish UI strings.** New user-facing text should be Swedish to match.
- **Storage keys** are prefixed `vs_` (from the old "voicesummary" name) — keep using them, don't rename or existing users lose their API key.
- **iOS recording is fragile.** Wake Lock + keep-alive oscillator + `visibilitychange` resume are all load-bearing — touch [index.html:1178-1223](index.html#L1178-L1223) carefully and test on a real iPhone with the screen off.

## Workflow

- Branch: `main` is the deployed branch. Pushes go live within a minute via GitHub Pages.
- Test locally by opening [index.html](index.html) directly or serving the folder (`python3 -m http.server`). The service worker only registers over HTTPS or `localhost`.
- Commit style (see `git log`): lowercase prefix — `feat:`, `fix:`, `merge:`, `security:`, `rebrand:` — followed by a terse imperative summary. Em dashes are used freely. No trailing period.
