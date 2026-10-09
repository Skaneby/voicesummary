# Runbook — felsöka ett fel för en användare

När någon hör av sig med "det blev fel": slå upp vad som hände i felloggen
innan du gissar. Allt körs från `backend/`.

## Var felen finns

| Källa | Vad | Hur länge |
|---|---|---|
| D1-tabellen `errors` | ett fel per rad, sökbart per e-post | 30 dagar (daglig cron 03 UTC) |
| Workers Logs (Cloudflare-dashboarden → Workers → `diane-api` → Logs) | samma rader som JSON (`"event":"error_logged"`) + rate limit | några dagar |
| `npx wrangler tail` | allt, live | bara medan den körs |

Två källor i tabellen, `source`:

- **`server`** — vad `/summarize` såg: Geminis status och meddelande, modell,
  spärrar (kvot, ingen prenumeration). Ger **orsaken**.
- **`client`** — vad appen visade för användaren, via `/log-error`. Ger
  **upplevelsen**. Ett serverfel ger alltså normalt två rader.

Viktiga `kind`:

| kind | Betyder |
|---|---|
| `upstream_error` | Gemini svarade med fel (`status` 503 = överbelastad, 429 = kvot/krediter slut) |
| `blocked` | Säkerhetsfilter — kom som HTTP 200. `message` säger `prompt:` eller `finishReason:` |
| `empty` | 200 men ingen text |
| `max_tokens` | Svaret klipptes |
| `summary_cap_reached`, `audio_cap_reached`, `not_subscribed`, `expired` | Spärr i vår egen rättighetskontroll |
| `invalid_body` | Klienten skickade något backend inte förstod — trolig klientbugg |
| `app`, `js`, `promise`, `drive` | (client) felrutan, ohanterade JS-fel, Drive |

Rate limit (`rate_limited`) sparas **inte** i D1 — bara i Workers Logs, så att
en läckt token inte kan fylla tabellen.

## Frågor

Senaste felen för en person:

```bash
npx wrangler d1 execute diane-prod --remote --command "
  SELECT datetime(created_at,'unixepoch') AS tid, source, kind, status, format, model, platform, message
  FROM errors WHERE email = 'namn@example.com'
  ORDER BY created_at DESC LIMIT 20"
```

Fel per format och typ senaste dygnet — hittar ett format som krånglar för alla:

```bash
npx wrangler d1 execute diane-prod --remote --command "
  SELECT format, kind, status, COUNT(*) AS n
  FROM errors WHERE source = 'server' AND created_at > unixepoch() - 86400
  GROUP BY format, kind, status ORDER BY n DESC"
```

Säkerhetsfilter senaste veckan:

```bash
npx wrangler d1 execute diane-prod --remote --command "
  SELECT datetime(created_at,'unixepoch') AS tid, email, format, model, message
  FROM errors WHERE kind = 'blocked' AND created_at > unixepoch() - 7*86400
  ORDER BY created_at DESC"
```

## Hittar du inget

- Användaren använder webben **med egen nyckel** (BYOK) — de anropen går
  direkt till Google och loggas inte.
- Felet hände innan Workern med felloggning deployades, eller i en appversion
  utan klientrapportering.
- Migreringen `003-errors.sql` är inte körd — då finns raderna bara i Workers
  Logs (`logError failed … no such table`).

Fråga då efter exakt felmeddelande, skärmdump, plattform och om
"Försök igen" fungerade (se tasks/lessons.md 2026-10-09).

## Vad kostar en användare?

Tabellen `usage` har en rad per Gemini-anrop med tokens per typ (13 månader).
Räkna om till kronor med priserna på
[Googles prissida](https://ai.google.dev/gemini-api/docs/pricing) — de är inte
hårdkodade, eftersom de ändras och skiljer sig per modell och för ljud.

Förbrukning per användare senaste 30 dagarna:

```bash
npx wrangler d1 execute diane-prod --remote --command "
  SELECT u.email, COUNT(*) AS anrop,
         SUM(g.audio_tokens) AS ljud, SUM(g.input_tokens) AS in_tot,
         SUM(g.output_tokens) AS ut, SUM(g.thought_tokens) AS tankande
  FROM usage g JOIN users u ON u.id = g.user_id
  WHERE g.created_at > unixepoch() - 30*86400
  GROUP BY u.email ORDER BY in_tot + ut + tankande DESC LIMIT 20"
```

Per anropstyp och format — vad driver kostnaden?

```bash
npx wrangler d1 execute diane-prod --remote --command "
  SELECT kind, format, model, COUNT(*) AS anrop,
         AVG(input_tokens) AS snitt_in, AVG(output_tokens + thought_tokens) AS snitt_ut
  FROM usage WHERE created_at > unixepoch() - 30*86400
  GROUP BY kind, format, model ORDER BY anrop DESC"
```

Vem närmar sig tokentaket (1,5 M per period)?

```bash
npx wrangler d1 execute diane-prod --remote --command "
  SELECT email, tokens_used, summaries_used, audio_seconds_used
  FROM users ORDER BY tokens_used DESC LIMIT 10"
```
