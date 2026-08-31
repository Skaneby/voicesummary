-- Migrering: namnrymda användar-id per identitetsleverantör.
--
-- Före: id = rå Google-sub. Efter: id = 'google:<sub>'.
-- Utan detta får samma person två konton när Apple-inloggning tillkommer på
-- iOS. Se docs/decisions/0003-identitet-per-leverantor.md.
--
-- Kör:
--   wrangler d1 execute diane-prod --local  --file=migrations/001-namespace-user-ids.sql
--   wrangler d1 execute diane-prod --remote --file=migrations/001-namespace-user-ids.sql
--
-- Idempotent: rader som redan har prefix lämnas orörda.

PRAGMA foreign_keys = OFF;

UPDATE subscription_events
   SET user_id = 'google:' || user_id
 WHERE user_id NOT LIKE '%:%';

UPDATE users
   SET id = 'google:' || id
 WHERE id NOT LIKE '%:%';

PRAGMA foreign_keys = ON;
