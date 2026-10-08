-- Migrering: gratis åtkomst som admin delar ut per e-postadress.
--
-- En inbjudan gäller i 10 dagar eller för alltid (expires_at NULL) och
-- matchas mot den Google-intygade e-posten i inloggningstoken — personen
-- behöver inte ha loggat in när inbjudan skapas.
--
-- Kör:
--   wrangler d1 execute diane-prod --local  --file=migrations/002-grants.sql
--   wrangler d1 execute diane-prod --remote --file=migrations/002-grants.sql
--
-- Idempotent.

CREATE TABLE IF NOT EXISTS grants (
  email       TEXT PRIMARY KEY,   -- gemener
  expires_at  INTEGER,            -- unix-sekunder; NULL = för alltid
  note        TEXT,
  created_by  TEXT NOT NULL,      -- adminens e-post
  created_at  INTEGER NOT NULL
);
