# CLAUDE.md

@.claude/rules/apple-hig.md

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

**Diane** — records audio, sends it to Google's Gemini and renders an AI-written summary in one of several preset formats. UI is in Swedish. One `index.html` runs two products:

- **Web** — https://skaneby.github.io/voicesummary/ (GitHub Pages). Either the user's own Gemini key (BYOK) or Google sign-in ("proxy mode", same backend as the app).
- **Android app** — Capacitor wrapper, paid via RevenueCat, always proxy mode.

**Start here: [docs/README.md](docs/README.md)** — the maintained map of architecture, modules, runbooks and decisions. This file only holds what every session needs.

## File map

- [index.html](index.html) — the whole client (~4,600 lines): markup, styles, JS. Sections marked with `// ── SECTION ─` banners.
- [backend/](backend/) — Cloudflare Worker `diane-api` (TypeScript) + D1 database `diane-prod`. See [docs/modules/backend.md](docs/modules/backend.md).
- [android/](android/) — Capacitor Android project. Bundles a copy of `index.html` — run `npm run android:sync` after client changes.
- [sw.js](sw.js), [manifest.json](manifest.json) — PWA. Bump `CACHE` in `sw.js` when changing cached assets.
- [tests/](tests/) — client tests (`npm test`). Backend tests: `cd backend && npm test`.
- [tasks/todo.md](tasks/todo.md) — current plans. [tasks/lessons.md](tasks/lessons.md) — read at session start.

Find code by name, not line number — line numbers rot: `PROMPTS`, `sanitizeHtml`, `ALLOWED_MODELS`, `MODEL_FALLBACK`, `proxyMode()`, `generate()`, `callModel()`.

## Branches and deploy

| Branch | Purpose |
|---|---|
| `main` | Default branch. GitHub Pages serves the web from here (verified 2026-10-09). The Worker *should* deploy from here via GitHub Actions on changes under `backend/**` — see below. |
| `mobile-app` | Mobile version. Android releases via `npm run release` — it git-tags each release (none exist yet as of 2026-10-09). |
| `web-app` | Web version. |

**The automatic Worker deploy has never succeeded** (every run since 2026-09-23 failed): the repo secret `CLOUDFLARE_API_TOKEN` is missing. Until Johan adds it, the Worker is deployed by hand (`cd backend && npx wrangler deploy`). After pushing backend changes, check the "Deploy Worker" run — don't assume it shipped.

Every commit goes to **all three** branches (fast-forward or merge, never force) — see lessons.md 2026-09-23. D1 migrations in `backend/migrations/` are **not** automated: run them with `wrangler d1 execute diane-prod --remote --file=...` before deploying code that needs them.

## Error logging

Per-user errors live in the D1 table `errors` (30 days) and in Workers Logs. **When a user reports a problem, look there first:** [docs/runbooks/felsokning.md](docs/runbooks/felsokning.md) has the SQL.

- `source = 'server'` — what `/summarize` saw (Gemini status, model, our own blocks). `source = 'client'` — what the app showed, via `/log-error`.
- A Gemini response blocked by safety filters arrives as HTTP **200** — `classifyGeminiBody()` in `backend/src/errors.ts` catches it.
- Not covered: web users with their own API key (no identity).
- Client side: `logError()` in `index.html` saves locally *and* calls `reportError()` (signed-in only, max 5/min, deduped, never throws).

## Conventions / gotchas

- **Don't add a build step to the client.** Edit `index.html`, push, done.
- **All AI-rendered HTML goes through `sanitizeHtml()`** (whitelist `ALLOWED_TAGS`). Never `innerHTML =` raw Gemini output.
- **Swedish** for UI strings, docs and commit messages.
- **Storage keys** are prefixed `vs_` — never rename, or users lose their data.
- **Don't cache `index.html` aggressively** — the SW fetches it network-first so updates ship instantly.

## Workflow

- Test locally: `python3 -m http.server` (SW needs HTTPS or `localhost`). Backend: `cd backend && npx wrangler dev --local`.
- Commit style (see `git log`): lowercase prefix — `feat:`, `fix:`, `docs:`, `security:` … — then a terse summary, em dashes welcome, no trailing period.
