# Runbook — deploya backend

Katalog: `backend/`.

## Deploy

```bash
cd backend
npm run typecheck
npx wrangler deploy
```

## Verifiera

```bash
curl -s https://diane-api.johan-skaneby.workers.dev/health | jq
```

Ska visa `has_gemini_key: true`, att D1 är bundet, att OAuth-klient och
webhook-hemlighet är satta. Är något `false` är motsvarande secret eller var
inte uppladdad.

## Secrets

```bash
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put REVENUECAT_WEBHOOK_SECRET
```

Secrets ligger aldrig i `wrangler.jsonc`.

## Databasmigrering

```bash
npx wrangler d1 execute diane-prod --local  --file=schema.sql   # testa först
npx wrangler d1 execute diane-prod --remote --file=schema.sql
```

Det finns ingen separat staging-databas. Kör alltid `--local` först, och ta en
export före migreringar som rör `users`.

## Följ loggar

```bash
npx wrangler tail
```

## Vanliga lägen

| Symptom | Trolig orsak |
|---|---|
| alla anrop ger 503 | `GOOGLE_OAUTH_CLIENT_ID` saknas eller är platshållare |
| alla anrop ger 401 | fel OAuth-klient-id — token-audience matchar inte |
| 402 trots betald prenumeration | webhooken nådde aldrig fram; kontrollera `subscription_events` |
| 429 direkt | rate limiter 30 req/min per användare |
