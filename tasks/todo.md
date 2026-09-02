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

### 1.1 Custom domain — DEFERRED

Cloudflare Workers requires the zone to be on Cloudflare DNS to attach a custom domain. A simple CNAME at one.com is not enough. Moving DNS hosting from one.com to Cloudflare is the standard path — domain registration stays at one.com, only DNS moves. **Skipped for now** because the backend URL is internal (users never see it) and the email-downtime risk of a DNS migration isn't worth the cosmetic gain. The `*.workers.dev` URL is permanent and works forever.

Revisit if/when: branding becomes important (e.g. surfacing the API URL in any user-facing documentation), or we have multiple backend services and want clean naming.

### 1.2 Data layer

- [ ] D1 database `diane-prod` provisioned via `wrangler d1 create`
- [ ] Schema: `users (id TEXT PK, email TEXT, sub_active INT, period_end INT, period_started INT, audio_seconds_used INT, summaries_used INT, created_at INT, updated_at INT, deleted_at INT)`
- [ ] Bind D1 in `wrangler.jsonc`
- [ ] Migration script in `backend/schema.sql`

### 1.3 `POST /summarize` (real) — done

- [x] Verify `Authorization: Bearer <Google ID token>` via Google JWKS (cached in Worker, via `jose`)
- [x] Look up user by Google `sub`; reject if `sub_active != 1` or `period_end < now` (402)
- [x] Enforce monthly usage cap (429 with structured error)
- [x] Forward audio body to Gemini, pass response back
- [x] Increment usage counter on success (best-effort)
- [x] **Verified end-to-end**: real Google ID token → /summarize → user upserted in D1 → entitlement check → Gemini call → 200 response. 3.6s round-trip.

### 1.4 `POST /webhook/revenuecat` — done

- [x] Verify shared secret in `Authorization` header (constant-time compare)
- [x] Handle `INITIAL_PURCHASE`, `RENEWAL`, `UNCANCELLATION`, `PRODUCT_CHANGE`, `SUBSCRIPTION_EXTENDED`, `EXPIRATION`, `BILLING_ISSUE`, `REFUND`, `SUBSCRIPTION_PAUSED`, `TEMPORARY_ENTITLEMENT_GRANT`, `TEST` — update `users` row
- [x] `CANCELLATION` deliberately no-op: user stays active until `period_end`, RC sends `EXPIRATION` at that moment
- [x] Insert audit row into `subscription_events` for every event received (even ignored ones)
- [x] User row auto-created on first webhook (`INSERT OR IGNORE` before audit log) so purchase webhooks work before user calls `/summarize`
- [x] **Verified end-to-end**: synthetic INITIAL_PURCHASE flips sub_active=1; RC's "Send test event" delivered TEST event, Worker returned 200, audit logged.

### 1.5 `POST /account/delete` — done

- [x] Hard-delete the user row + cascade-delete `subscription_events`
- [x] GDPR-compliant: deletion isn't a ban; returning user creates a fresh row with no subscription state
- [x] **Verified end-to-end**: delete returns 200, user_count drops, follow-up /summarize creates fresh row and correctly returns 402
- [ ] (later) Call RevenueCat `DELETE /v1/subscribers/{id}` to clean up RC-side too

### 1.6 Hardening — done

- [x] Per-user rate limit via Cloudflare Workers Rate Limiting binding, 30 req/min keyed on Google `sub` (defends against compromised tokens / runaway clients)
- [x] CORS allowlist: `capacitor://localhost`, `https://localhost`, `ionic://localhost`, plus regex match for `http://localhost:*` and `http://127.0.0.1:*`. Other origins get no `Access-Control-Allow-Origin` header — browsers block.
- [x] **Verified**: evil.com origin returns no Allow-Origin header; capacitor + localhost origins are echoed correctly.
- [x] Smoke tests (across Phases 1.3, 1.4, 1.5): unauth → 401; valid token + no sub → 402; sub active → 200 from Gemini; wrong webhook secret → 401; correct webhook → 200 + state updated in D1.

## Phase 2 — App refactor (week 1–2)

Goal: transform [index.html](../index.html) on the `mobile-app` branch into a
client that authenticates with Google, checks subscription state against the
backend, and proxies all Gemini calls through `/summarize` instead of holding
its own API key. Stays single-file (no build step in Phase 2 — Capacitor
adds bundling in Phase 3).

**Locked decisions:**

- [x] **GitHub Issues integration: REMOVE entirely.** Consumer app, paid subscription — power-user features add complexity, security surface (PATs in localStorage), and Play Store data-safety questions. The PWA on `main` keeps it for existing users.
- [x] Settings panel content: keep theme picker + format picker; everything else (API key, model, GitHub token) goes away.

**Constants to update at the top of the script section:**

```
const API_PROXY    = 'https://diane-api.johan-skaneby.workers.dev'; // until custom domain
const GOOGLE_OAUTH_CLIENT_ID = '732034397281-rtpshfsohq70p0cjnif78sm6u07sbnre.apps.googleusercontent.com';
```

### 2.0 Backend extension: `/me` endpoint — done

- [x] `GET /me` — verifies token, upserts user row (first-touch creation), returns email + sub_active + period_end + usage + caps
- [x] Server re-evaluates sub_active against current time so an expired-but-not-yet-EXPIRATION-webhook'd period reports as inactive

### 2.1 — 2.7 Client refactor — done

All items below landed in a single commit (`347caab`):

- [x] Google Identity Services script loaded async in `<head>`
- [x] `#screen-signin` with GIS-rendered button
- [x] On credential callback: token saved to `sessionStorage`, JWT decoded for instant email display
- [x] State `s` holds `idToken`, `googleSub`, `email`, `subActive`, `periodEnd`, `summariesUsed`, `audioSecondsUsed`, `caps`
- [x] App-load routing: stashed token → `/me` → idle vs paywall vs signin
- [x] `#screen-paywall` with 7-day trial copy, feature bullets, subscribe button (placeholder until Phase 3), log out, delete account
- [x] `#screen-setup` removed entirely; `sKey`, `sModel`, `sGHToken` removed from settings
- [x] All GitHub Issues code removed (gh-panel, fetchGHRepos, renderGHRepos, createGHIssue, repoRow, pinRepo, unpinRepo, githubBtn, ghSearch, ghStatus, gh-overlay)
- [x] `generate()` rewritten to call `POST /summarize` with `Authorization: Bearer ${idToken}` + JSON body containing base64 audio + duration
- [x] Error mapping: 401 → re-sign-in, 402 → paywall, 429 (rate or cap) → Swedish toast, 503 → generic, 5xx → retry-with-backoff
- [x] Settings panel: user email read-only, "Hantera prenumeration" (Play subscriptions URL), "Logga ut", "Radera konto"
- [x] Service worker cache bumped `vs-v37`

### 2.8 Test plan (manual — needs real Google sign-in)

- [ ] Local: `python3 -m http.server 8000` → http://localhost:8000 → sign in → verify `/me` returns `sub_active: 0` → paywall shown
- [ ] Manually flip `sub_active: 1` in D1 → reload → idle screen shown
- [ ] Record audio → `/summarize` call → summary rendered
- [ ] Click "Radera konto" → confirm → `/account/delete` called → returned to sign-in
- [ ] Manually delete user in D1 → try `/summarize` → 401 → returned to sign-in

**Browser CORS note:** for testing from `http://localhost:8000`, the Worker's CORS allowlist already includes `http://localhost:*` so this Just Works.

**OAuth client note:** the `diane-server` Web OAuth client has `https://developers.google.com/oauthplayground` as its authorized redirect URI. For `localhost:8000` to work with Google Sign-In, we may need to add `http://localhost:8000` as an additional authorized JavaScript origin in the GCP Cloud Console. (No redirect URI needed — GIS uses popup/iframe, not redirect.)

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

---

## Genomfört 2026-08-31 (grenen `mobile-app`)

**Fas 0 — dokumentation.** `docs/` med arkitektur, moduler, tre ADR:er,
runbooks och designprinciper för Android.

**Fas 1 — en kodbas.** `index.html` i roten kör båda produkterna.
Lägesskillnaden inkapslad på fyra ställen. Appen fick allt från
webbversionen: Q&A, transkription, Kopiera mail, kalenderdialog, alla
format. `www/` avspårad, `scripts/sync-www.sh` speglar roten.

**Fas 2 — backend.** Identitet namnrymdad per leverantör (google:/apple:),
Apple-JWKS på plats, e-post-buggen rättad, modell till `gemini-3.7-flash`,
13 enhetstester.

**Fas 3 — delvis.** RevenueCat köp + återställ köp, bakåtnavigering,
prominent disclosure, integritetspolicy och raderingssida.

### Kvar
- [ ] Förgrundstjänst för inspelning (native Java — kräver Android SDK)
- [ ] Edge-to-edge verifierad på riktig enhet
- [ ] RevenueCat publika SDK-nycklar (platshållare i koden)
- [ ] Merge `mobile-app` → `main` så sidorna blir publikt nåbara
- [ ] Play Console: konto, produkt, testare

---

## Öppet 2026-09-02

Nedtecknat i slutet av en session som kördes med AI-videogeneratorns
arbetskatalog, alltså utan Dianes egen `CLAUDE.md` laddad. Punkterna är
verifierade mot koden efter rebase på `62bd4c2`.

### Blockerande — Gemini-krediterna är slut

Appen svarar `Gemini nekade förfrågan: …` på varje sammanfattning. Felet är
Googles eget, vidarebefordrat oförändrat av Workern
([backend/src/index.ts:216-225](../backend/src/index.ts#L216-L225)) och visat av
klienten i APP_MODE-grenen för 429
([index.html:2258](../index.html#L2258)). Googles text säger att de förbetalda
krediterna är slut.

Kontot är identifierat:

| | |
|---|---|
| faktureringskonto | **Diane** — `014453-7CCCDF-2F90E4` |
| projekt | `diane-prod-skaneby` (nr `732034397281`) |

Projektnumret matchar prefixet i `GOOGLE_OAUTH_CLIENT_ID` i
[backend/wrangler.jsonc:9](../backend/wrangler.jsonc#L9). Kontot betalar bara
det här projektet, vilket stämmer med att andra Gemini-nycklar på maskinen
fortfarande fungerar.

- [ ] Köp krediter på https://aistudio.google.com/billing → **Buy credits**
      (min $10). Kontrollera att kontot **Diane** är valt.
- [ ] Slå på **auto reload** samma sida. Googles dokumentation är tydlig med
      att alla Gemini-tjänster i alla projekt på ett tömt prepay-konto stoppas
      omedelbart — för Diane betyder det att sammanfattningar dör för samtliga
      användare utan förvarning.
- [ ] Verifiera med `cd backend && npx wrangler tail` medan appen provas.

Inget annat går att prova på riktigt förrän saldot är påfyllt.

### Faktureringsfallet saknar fallback

`87ae98c` gav en fallback-kedja mellan modeller vid *överbelastning*, men den
hjälper inte här: är kontot tomt är alla modeller lika otillgängliga. Kvar
står att användaren får Googles engelska faktureringstext rakt i ansiktet.

- [ ] Fånga faktureringsfallet i APP_MODE och visa ett svenskt meddelande om
      att tjänsten är tillfälligt otillgänglig, i stället för att läcka
      uppströmstexten ([index.html:2258](../index.html#L2258)).

### Lös ändring i arbetskopian

- [ ] `playwright-core` i `package.json` — `npm test` krävde den men den
      saknades. Ligger i `git stash` ("playwright-core devDependency,
      obeslutad"). Committa eller släng.

### Löst sedan anteckningarna skrevs

- [x] **Satir skild från sakliga format** — `b7eada2`. Löstes bättre än den
      gruppering som föreslogs här: de sex humorformaten är dolda som standard
      och slås på under Inställningar, resultaten får synliga varningar (psyk
      och konspiration skarpare formulerade), och en hjälpruta byggd ur
      `STYLE_META` + `FORMAT_HELP` kan inte bli inaktuell.
- [x] **Ljudarkiv** — `62bd4c2`. De tio senaste inspelningarna sparas i
      IndexedDB på enheten, listade under Inställningar, delbara via systemets
      delningsmeny och raderbara. Ljudet sparas *före* API-anropet, så en
      misslyckad analys inte tar inspelningen med sig.

      **Obs:** en tidigare version av den här anteckningen påstod att ljud
      aldrig lagras och att det var ett produktlöfte man inte skulle röra. Det
      gällde fram till `62bd4c2` och är inte längre sant. Servern lagrar
      fortfarande ingenting — det är den delen av löftet som står kvar.
- [x] `android/.idea/` ignorerad.
