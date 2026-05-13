# Diane — Android & iOS release plan

Drafted 2026-05-13. Status: **pending verification — do not start implementing until confirmed.**

## Locked decisions

- [x] **Packaging:** Capacitor wrapper. Reuse [index.html](../index.html) as-is, ship Android first, `npx cap add ios` for iOS later.
- [x] **Billing:** RevenueCat SDK on both platforms (free under $2,500/mo MRR ≈ 625 subs at 40 SEK).
- [x] **Free tier:** None. BYOK ("Bring Your Own Gemini Key") mode is removed. Paywall everything, 7-day free trial.
- [x] **Price:** 40 SEK / month, auto-renewing.
- [x] **Token costs:** Paid by the owner via a backend proxy. Client never sees the Gemini key.

## Open decisions (need answers before Phase 1)

- [x] **Domain name for the backend:** `diane-api.skaneby.se` (subdomain of existing `skaneby.se` — no new domain purchase needed). DNS path TBD (move to Cloudflare vs CNAME at existing registrar).
- [ ] Package name / app ID (e.g. `app.diane.android`, `se.skaneby.diane`)
- [ ] Privacy policy: template (TermsFeed/iubenda) or lawyer-drafted?
- [x] **Launch geography:** Sweden only (Play store country restriction).
- [x] **Support email:** Johan.skaneby@gmail.com
- [ ] Free trial length: 7 days (recommended) vs 14 days
- [ ] Monthly usage cap per subscriber (recommended: 60 min audio OR 100 summaries, whichever first)

## Architecture

```
┌─────────────────┐     ┌────────────────────┐     ┌─────────────┐
│ Capacitor app   │────▶│ Cloudflare Worker  │────▶│ Gemini API  │
│ (Android / iOS) │     │  - verify ID token │     └─────────────┘
│  - index.html   │     │  - check entitlmt  │
│  - RevenueCat   │     │  - usage cap       │
│  - Google/Apple │     │  - proxy summarize │
│    Sign-In      │     └────────────────────┘
└────────┬────────┘              ▲
         │                       │ webhook
         ▼                       │
┌─────────────────┐     ┌────────────────────┐
│   RevenueCat    │────▶│  D1 / KV: users +  │
│  (Play+StoreKit)│     │  entitlement state │
└─────────────────┘     └────────────────────┘
```

---

## Phase 1 — Backend proxy (week 1)

### 1.0 Foundation (done)

- [x] GCP project `diane-prod-skaneby` created with dedicated "Diane" billing account
- [x] Generative Language API enabled
- [x] Restricted Gemini API key created (locked to `generativelanguage.googleapis.com`)
- [x] Cloudflare account + `workers.dev` subdomain set up
- [x] Worker project scaffolded in `backend/` (TypeScript, Wrangler 4.90.1)
- [x] Stub routes deployed and reachable at `https://diane-api.johan-skaneby.workers.dev`
- [x] `GEMINI_API_KEY` uploaded as Worker secret (`/health` confirms `has_gemini_key: true`)

### 1.1 Custom domain (next)

- [ ] Add CNAME `diane-api.skaneby.se` → Worker, via one.com DNS panel
- [ ] Add `diane-api.skaneby.se` as a Custom Domain in Cloudflare Workers settings
- [ ] Uncomment `routes` in `backend/wrangler.jsonc`
- [ ] Verify `https://diane-api.skaneby.se/health` works

### 1.2 Data layer

- [ ] D1 database `diane-prod` provisioned via `wrangler d1 create`
- [ ] Schema: `users (id TEXT PK, email TEXT, sub_active INT, period_end INT, period_started INT, audio_seconds_used INT, summaries_used INT, created_at INT, updated_at INT, deleted_at INT)`
- [ ] Bind D1 in `wrangler.jsonc`
- [ ] Migration script in `backend/schema.sql`

### 1.3 `POST /summarize` (real)

- [ ] Verify `Authorization: Bearer <Google ID token>` via Google JWKS (cached in Worker)
- [ ] Look up user by Google `sub`; reject if `sub_active != 1` or `period_end < now` (402)
- [ ] Enforce monthly usage cap (429 with structured error)
- [ ] Forward multipart audio body to Gemini, stream response back
- [ ] Increment usage counter atomically

### 1.4 `POST /webhook/revenuecat`

- [ ] Verify shared secret header
- [ ] Handle `INITIAL_PURCHASE`, `RENEWAL`, `CANCELLATION`, `EXPIRATION`, `BILLING_ISSUE`, `REFUND` — update `users` row

### 1.5 `POST /account/delete`

- [ ] Soft-delete the user row (set `deleted_at`, clear PII)
- [ ] Required by Play + Apple

### 1.6 Hardening

- [ ] Rate limit per user (Workers KV counter, 60 req/min)
- [ ] Restrict CORS origins (capacitor://localhost, http://localhost:*) — drop `*`
- [ ] Smoke test: curl with fake token → 401; with valid token but no sub → 402; with sub → proxies to Gemini

## Phase 2 — App refactor (week 1–2)

- [ ] Remove API-key input UI from settings ([index.html:1281](../index.html#L1281) area)
- [ ] Remove `s.key` from state, remove `vs_key` localStorage usage
- [ ] Remove `gemini-2.5-pro`/`gemini-2.0-flash` model picker (server decides model)
- [ ] Add `auth.js` module: Google Sign-In on Android, Apple Sign-In on iOS (Apple **requires** Apple Sign-In if any other social login is offered)
- [ ] Add paywall screen (`#screen-paywall`): "Starta gratis i 7 dagar, sedan 40 kr/månad"
- [ ] Replace direct `fetch(API_BASE + ...)` with `fetch(API_PROXY + '/summarize', { headers: { Authorization: 'Bearer ' + idToken } })`
- [ ] Update `sanitizeHtml()` call site — server returns identical shape, no change needed
- [ ] Update error handling for new HTTP codes: `401` (re-sign-in), `402` (paywall), `429` (cap reached), `503` (already handled)
- [ ] Add "Hantera prenumeration" link in settings → RevenueCat customer portal URL or platform-native subscription manager
- [ ] Add "Radera konto" button → calls `/delete-account` + signs out

## Phase 3 — Capacitor wrap (week 2)

- [ ] `npm init`, install `@capacitor/core @capacitor/cli @capacitor/android`
- [ ] `npx cap init Diane app.diane.android --web-dir=www`
- [ ] Move [index.html](../index.html), [sw.js](../sw.js), [manifest.json](../manifest.json), icons into `www/`
- [ ] Install plugins:
  - [ ] `@codetrix-studio/capacitor-google-auth` (Google Sign-In)
  - [ ] `@revenuecat/purchases-capacitor` (subscriptions)
  - [ ] `@capacitor/preferences` (replace `localStorage` for native persistence)
- [ ] `npx cap add android`, open in Android Studio
- [ ] Configure app icons + splash screen (use existing [icon-512.png](../icon-512.png))
- [ ] Configure `AndroidManifest.xml`: `RECORD_AUDIO`, `INTERNET`, `WAKE_LOCK`, `FOREGROUND_SERVICE_MICROPHONE`
- [ ] Test on real Android device:
  - [ ] Microphone permission flow
  - [ ] Long recording (30+ min) with screen off — verify the iOS-targeted keep-alive hack at [index.html:1191](../index.html#L1191) doesn't break Android
  - [ ] Background → foreground resume
  - [ ] All 3 themes render correctly
  - [ ] All 8 format presets work
- [ ] Generate signed AAB (Android App Bundle)

## Phase 4 — Play Store prep (week 2–3)

- [ ] Google Play Console account: $25 one-time (one developer account covers unlimited apps)
- [ ] Create app: "Diane — AI Transkribering"
- [ ] Privacy policy hosted publicly (e.g. `skaneby.github.io/voicesummary/privacy.html`) — required for any app accessing mic
- [ ] Data Safety form: declare audio recording, account data, usage data, no location
- [ ] Content rating: questionnaire → likely Everyone / PEGI 3
- [ ] Target audience & content: 13+
- [ ] App access: provide test credentials for Google reviewers
- [ ] App signing: enroll in Play App Signing (recommended)
- [ ] Store listing (Swedish):
  - [ ] Short description (80 char)
  - [ ] Full description (4000 char)
  - [ ] Screenshots: phone (min 2, recommend 4–8). Use all 3 themes for visual variety.
  - [ ] Feature graphic 1024×500
  - [ ] App icon
- [ ] Create subscription product in Play Console:
  - [ ] Product ID: `diane_premium_monthly`
  - [ ] Base plan: 40 SEK/mo auto-renewing
  - [ ] 7-day free trial offer (eligibility: new subscribers only)
  - [ ] Grace period: 7 days
- [ ] Connect Play to RevenueCat: upload Google service account JSON in RC dashboard

## Phase 5 — Testing (week 3)

- [ ] Internal testing track: add own Google accounts as testers
- [ ] Verify full flow:
  - [ ] Fresh install → Google Sign-In → paywall → start trial → record → summary
  - [ ] Cancel during trial → no charge, sub stays active until period_end
  - [ ] Let trial convert → charge appears → still works
  - [ ] Refund via Play Console → RC webhook fires → backend marks `sub_active=0` → next request returns 402
  - [ ] Hit usage cap → 429 → friendly Swedish error
  - [ ] Delete account → data gone from D1
- [ ] Closed testing track: recruit 20+ testers (Play now requires this for production access on new accounts; may need 14-day testing period)
- [ ] Open testing track (optional, for broader feedback before launch)

## Phase 6 — Production (week 3–4)

- [ ] Promote to production
- [ ] Staged rollout: 10% → 50% → 100% over 1 week
- [ ] Monitor:
  - [ ] Crashes (Play Console vitals)
  - [ ] Refund rate (RC dashboard)
  - [ ] Trial → paid conversion (RC dashboard)
  - [ ] Gemini cost per active subscriber
- [ ] ASO iteration after first 2 weeks

## Phase 7 — iOS port (after Android stable, ~week 6+)

- [ ] `npx cap add ios`
- [ ] Replace Google Sign-In implementation with **Sign in with Apple** on iOS (Apple guideline 4.8 — required if any third-party login is offered)
- [ ] RevenueCat plugin — zero code change, same SDK handles StoreKit
- [ ] Apple Developer Program enrollment: ~1,099 SEK/year
- [ ] App Store Connect listing
- [ ] App Privacy nutrition label
- [ ] Create subscription product in App Store Connect: `diane_premium_monthly`, 40 SEK/mo, 7-day intro free
- [ ] Connect App Store Connect to RevenueCat (shared secret)
- [ ] Configure capabilities: Microphone usage description (`NSMicrophoneUsageDescription`)
- [ ] TestFlight: internal then external testers (no mandatory testing period)
- [ ] Submit for App Store review (1–3 days typically; rejections common on first try)

---

## Unit economics

Per 40 SEK subscription, in Sweden:

| Line                         | Amount        |
|------------------------------|---------------|
| Gross                        | 40.00 SEK     |
| Swedish VAT (25%) — Play remits | -8.00 SEK   |
| Play store fee (15%)         | -4.80 SEK     |
| **Net to you**               | **~27.20 SEK**|
| RevenueCat fee (under $2.5K MRR) | 0 SEK     |
| Gemini Flash @ heavy use (100 summaries) | ~-5 SEK |
| **Net margin (heavy user)**  | **~22 SEK**   |
| Gemini Flash @ extreme use (500 summaries) | ~-26 SEK |
| **Net margin (extreme user)**| **~1 SEK** ⚠️ |

**Conclusion:** the monthly usage cap is load-bearing. Recommend 100 summaries OR 60 min audio per month — keeps margin healthy on every plan tier.

## Upfront costs

| Item                   | Cost          |
|------------------------|---------------|
| Play Console           | $25 one-time  |
| Apple Developer (for iOS phase) | ~$105/yr |
| Domain                 | 0 SEK (subdomain of existing `skaneby.se`) |
| Cloudflare Workers     | 0 SEK (free tier covers ~100K requests/day) |
| RevenueCat             | 0 SEK (under $2.5K MRR) |
| D1 database            | 0 SEK (free tier) |
| **Total to launch Android** | **~$25 + domain** |

## Risks

- **Apple "Sign in with Apple" requirement** — must implement on iOS; doesn't apply to Android.
- **Play 14-day testing period** for new developer accounts before production access. Start now if account is new.
- **App rejection** — Apple is stricter than Google. Common rejection causes: missing privacy policy, missing Sign in with Apple, vague subscription terms, mic permission rationale unclear.
- **Backend cost blow-up** if usage cap is missing or too generous. Cap before launch, not after.
- **iOS background recording** is more restricted than Android. The existing keep-alive hack at [index.html:1191](../index.html#L1191) may not be enough — may need a native iOS background task.
- **GDPR** — `/delete-account` endpoint is mandatory on both stores now.

## Review / Lessons

(empty — fill in after each phase per CLAUDE.md "Document Results" rule)

---

**Next step:** answer the 7 open decisions above (especially domain + launch geography), then start Phase 1.
