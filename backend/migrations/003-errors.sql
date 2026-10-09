-- Migrering: felloggning per användare.
--
-- Fel från /summarize (server) och fel som appen visat för användaren
-- (client, via /log-error). Gallras efter 30 dagar av den dagliga cronen.
-- Aldrig ljud, prompt eller genererad text — bara vad som gick fel.
--
-- Kör FÖRE Worker-deploy:
--   wrangler d1 execute diane-prod --local  --file=migrations/003-errors.sql
--   wrangler d1 execute diane-prod --remote --file=migrations/003-errors.sql
--
-- Idempotent.

CREATE TABLE IF NOT EXISTS errors (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at   INTEGER NOT NULL,   -- unix-sekunder
  user_id      TEXT,               -- '<leverantör>:<sub>'
  email        TEXT,               -- gemener, för sökning per person
  source       TEXT NOT NULL,      -- 'server' | 'client'
  kind         TEXT NOT NULL,      -- t.ex. upstream_error, blocked, empty, rate_limited
  status       INTEGER,            -- HTTP-status, om någon
  format       TEXT,               -- PROMPTS-nyckeln, t.ex. 'tal'
  model        TEXT,               -- Gemini-modellen som svarade
  message      TEXT,               -- ≤ 500 tecken
  platform     TEXT,               -- 'android' | 'ios' | 'web'
  app_version  TEXT
);

CREATE INDEX IF NOT EXISTS idx_errors_email   ON errors(email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_errors_created ON errors(created_at);
