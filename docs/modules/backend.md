# Backend — Cloudflare Worker `diane-api`

Kod: `backend/src/`. Deploy: `wrangler deploy`. Se
[../runbooks/deploy-backend.md](../runbooks/deploy-backend.md).

## Endpoints (`backend/src/index.ts`)

| Metod | Väg | Auth | Syfte |
|---|---|---|---|
| GET | `/`, `/health` | nej | konfigurationsstatus, `user_count` |
| GET | `/me` | Bearer | upsertar användaren, returnerar rättighet + kvot |
| POST | `/summarize` | Bearer | rate limit → rättighet → proxa till Gemini → räkna kvot |
| POST | `/webhook/revenuecat` | delad hemlighet | speglar prenumerationsstatus till D1 |
| POST | `/account/delete` | Bearer | hård radering av användare + händelser (GDPR) |

`/summarize` tar `{ prompt, audio_base64, audio_mime, audio_seconds }` och
returnerar **Geminis svar oförändrat**. Se [../architecture.md](../architecture.md).

## Filer

| Fil | Ansvar |
|---|---|
| `auth.ts` | verifierar ID-token mot leverantörens JWKS |
| `entitlement.ts` | `upsertUser`, `checkEntitlement`, `incrementUsage` |
| `webhook.ts` | `eventToUpdate` — RevenueCat-händelse → databasändring |
| `gemini.ts` | anropet uppströms mot Gemini |
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
`GEMINI_MODEL`.
Secrets (via `wrangler secret put`): `GEMINI_API_KEY`, `REVENUECAT_WEBHOOK_SECRET`.
Bindningar: D1 `DB` → `diane-prod`, `RATE_LIMITER` (30 req/60 s).

**Modellen sätts här, inte i klienten** — så en modelluppgradering är en
konfigurationsändring och inte en ny appversion genom Play-granskning.

## Kända skulder

- `users.id` är rå Google-`sub`. Med Apple på iOS blir samma person **två
  konton med två prenumerationer**. Se
  [../decisions/0003-identitet-per-leverantor.md](../decisions/0003-identitet-per-leverantor.md).
- `upsertUser` gör `email = excluded.email`, vilket nollar e-posten när Apple
  utelämnar den (Apple skickar e-post bara vid första inloggningen). Ska vara
  `COALESCE(excluded.email, email)`.
- `incrementUsage` är icke-atomär och anropas med tyst `.catch()` — kvot kan
  tappas vid samtidiga anrop.
- `TRANSFER` och `SUBSCRIBER_ALIAS` från RevenueCat ignoreras; de behövs när en
  person kan ha flera identiteter.
