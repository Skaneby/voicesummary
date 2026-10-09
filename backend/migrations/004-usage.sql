-- Migrering: verklig AI-förbrukning per anrop och tokentak per period.
--
-- Kvottaket skyddar ägarens Gemini-budget. Förut kom ljudets längd från
-- klienten och litades på — nu mäter servern den ur Geminis usageMetadata.
-- `usage` har en rad per lyckat Gemini-anrop — antal tokens, aldrig
-- innehåll. Gallras efter 13 månader av den dagliga cronen och raderas
-- med kontot.
--
-- Kör FÖRE Worker-deploy, EN gång (ALTER TABLE går inte att köra två gånger
-- — andra körningen ger "duplicate column name", ofarligt men stoppar filen):
--   wrangler d1 execute diane-prod --local  --file=migrations/004-usage.sql
--   wrangler d1 execute diane-prod --remote --file=migrations/004-usage.sql

ALTER TABLE users ADD COLUMN tokens_used INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS usage (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at      INTEGER NOT NULL,   -- unix-sekunder
  user_id         TEXT NOT NULL,
  kind            TEXT NOT NULL,      -- summary | qa | reformat | transcribe
  format          TEXT,               -- PROMPTS-nyckeln, t.ex. 'tal'
  model           TEXT,
  audio_tokens    INTEGER NOT NULL DEFAULT 0,
  input_tokens    INTEGER NOT NULL DEFAULT 0,   -- hela prompten, inkl. ljud
  output_tokens   INTEGER NOT NULL DEFAULT 0,
  thought_tokens  INTEGER NOT NULL DEFAULT 0,
  outcome         TEXT NOT NULL       -- ok | blocked | empty | max_tokens | invalid_response
);

CREATE INDEX IF NOT EXISTS idx_usage_user    ON usage(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_created ON usage(created_at);
