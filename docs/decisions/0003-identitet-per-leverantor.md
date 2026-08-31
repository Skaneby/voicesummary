# 0003 — Identitet måste vara leverantörsoberoende

**Status:** föreslagen — **måste vara klar före iOS-lansering**

## Problem

`users.id` i `backend/schema.sql` är rå Google-`sub`:

```sql
id TEXT PRIMARY KEY,   -- Google subject ID, stable across logins
```

Det finns ingen `provider`-kolumn. På iOS krävs Sign in with Apple, som ger ett
helt annat opakt `sub`. Samma person som loggar in med Apple på iPhone och
Google på Android får därmed:

- två rader i `users`
- två separata prenumerationer att betala
- två separata månadskvoter

Apples "Hide My Email" ger dessutom en `@privaterelay.appleid.com`-adress, så
kontona kan inte ens länkas via e-post i efterhand.

## Beslut

Namnrymda identiteten: `id` blir `provider:sub` (`google:123`, `apple:456`),
alternativt intern UUID med en `user_identities(provider, provider_sub, user_id)`.

## Varför nu

Så länge det inte finns riktiga användare är detta en halvdagsfix. Efter
lansering är det en datamigrering med supportärenden och möjliga dubbel-
debiteringar.

## Följder

- `subscription_events.user_id` har främmande nyckel mot `users(id)` — båda
  tabellerna berörs.
- `auth.ts` behöver en leverantörsdispatch på token-issuer.
- RevenueCats `app_user_id` måste matcha den nya id-modellen; `rc_app_user_id`
  är `UNIQUE` och skulle annars krocka mellan plattformarna.
- `TRANSFER` och `SUBSCRIBER_ALIAS` från RevenueCat måste börja hanteras.
- **Enhetstester för `eventToUpdate()` och `checkEntitlement()` skrivs före
  refaktoreringen** — det finns inga tester i backend idag.
