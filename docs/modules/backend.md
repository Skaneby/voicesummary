# Backend — Cloudflare Worker `diane-api`

Kod: `backend/src/`. Deploy: `wrangler deploy`. Se
[../runbooks/deploy-backend.md](../runbooks/deploy-backend.md).

## Endpoints (`backend/src/index.ts`)

| Metod | Väg | Auth | Syfte |
|---|---|---|---|
| GET | `/`, `/health` | nej | konfigurationsstatus, `user_count` |
| GET | `/me` | Bearer | upsertar användaren, returnerar rättighet + kvot |
| POST | `/summarize` | Bearer | rate limit → rättighet → proxa till Gemini → räkna kvot; fel loggas i `errors` |
| POST | `/log-error` | Bearer | appen rapporterar fel den visat (`{ kind, message, format?, platform? }`) |
| POST | `/webhook/revenuecat` | delad hemlighet | speglar prenumerationsstatus till D1 |
| POST | `/account/delete` | Bearer | hård radering av användare, händelser och felloggar (GDPR) |
| cron | `0 3 * * *` | — | `scheduled()`: gallrar `errors` äldre än 30 dagar |

`/summarize` tar `{ prompt, audio_base64, audio_mime, audio_seconds, format? }` och
returnerar **Geminis svar oförändrat**. Se [../architecture.md](../architecture.md).

## Filer

| Fil | Ansvar |
|---|---|
| `auth.ts` | verifierar ID-token mot leverantörens JWKS |
| `entitlement.ts` | `upsertUser`, `checkEntitlement`, `incrementUsage` |
| `webhook.ts` | `eventToUpdate` — RevenueCat-händelse → databasändring |
| `gemini.ts` | anropet uppströms mot Gemini |
| `errors.ts` | felloggen: `logError`, `classifyGeminiBody` (200-svar som är fel), gallring |
| `index.ts` | router, CORS, rate limit |

`eventToUpdate()` och `checkEntitlement()` är rena funktioner utan I/O —
de ska ha enhetstester och är rätt ställe att börja när något ändras i
pengar- eller rättighetslogiken.

## Statusar klienten måste hantera

| Kod | Betyder | Klienten ska |
|---|---|---|
| 401 | ogiltig/saknad token | logga ut, visa inloggning |
| 402 | ingen aktiv prenumeration | visa betalvägg |
| 429 `rate_limited` | >30 req/min | be användaren vänta |
| 429 `summary_cap_reached` / `audio_cap_reached` | månadskvot slut | visa kvotmeddelande |
| 503 | servern felkonfigurerad | generiskt fel |

## Konfiguration (`backend/wrangler.jsonc`)

Vars: `GOOGLE_OAUTH_CLIENT_ID`, `USAGE_CAP_SUMMARIES`, `USAGE_CAP_AUDIO_SECONDS`,
`GEMINI_MODELS` (kommaseparerad fallback-kedja), `ADMINS`, `APPLE_BUNDLE_ID`.
Secrets (via `wrangler secret put`): `GEMINI_API_KEY`, `REVENUECAT_WEBHOOK_SECRET`.
Bindningar: D1 `DB` → `diane-prod`, `RATE_LIMITER` (30 req/60 s).

**Modellen sätts här, inte i klienten** — så en modelluppgradering är en
konfigurationsändring och inte en ny appversion genom Play-granskning.

## Identitet

`users.id` är **namnrymdat per leverantör**: `google:<sub>`, `apple:<sub>`.
`verifyToken()` i `auth.ts` väljer JWKS utifrån token-utgivaren och returnerar
`userId` färdigt. Klientens RevenueCat-`appUserID` måste vara exakt samma
sträng — se `backendUserId()` i `index.html`.

Befintliga rader migreras med
`backend/migrations/001-namespace-user-ids.sql` (idempotent).

## Tester

```bash
cd backend && npm test
```

13 enhetstester över `eventToUpdate()`, `checkEntitlement()` och
identitetslogiken — de rena funktioner som styr pengar och rättigheter.
Körs med Nodes inbyggda testkörare, inga beroenden.

## Felloggning

Tabellen `errors` (`migrations/003-errors.sql`) + Workers Logs
(`observability` i `wrangler.jsonc`). `logError` kastar aldrig — loggning får
inte fälla en begäran. Hur man läser felen:
[../runbooks/felsokning.md](../runbooks/felsokning.md).

## Kända skulder

- Blockerade och tomma 200-svar loggas som fel men **räknas ändå mot kvoten**
  (`incrementUsage` körs på all 200). Användaren betalar för ett svar den
  inte fick.
- `incrementUsage` är icke-atomär och anropas med tyst `.catch()` — kvot kan
  tappas vid samtidiga anrop.
- `TRANSFER` och `SUBSCRIBER_ALIAS` från RevenueCat ignoreras; de behövs när en
  person kan ha flera identiteter.
