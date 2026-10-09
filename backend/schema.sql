-- Diane backend schema (D1 / SQLite)
--
-- Apply with:
--   wrangler d1 execute diane-prod --remote --file=schema.sql
--   wrangler d1 execute diane-prod --local  --file=schema.sql

CREATE TABLE IF NOT EXISTS users (
  -- Identity
  id              TEXT PRIMARY KEY,             -- '<leverantör>:<sub>', t.ex. 'google:1234' — se docs/decisions/0003
  email           TEXT,

  -- RevenueCat binding (set when first subscription event arrives)
  rc_app_user_id  TEXT UNIQUE,

  -- Subscription state (mirrored from RevenueCat webhooks)
  sub_active      INTEGER NOT NULL DEFAULT 0,
  period_end      INTEGER,                       -- unix seconds: current sub period end
  period_started  INTEGER,                       -- unix seconds: usage-window start

  -- Usage tracking (resets when period_started rolls forward)
  audio_seconds_used  INTEGER NOT NULL DEFAULT 0,
  summaries_used      INTEGER NOT NULL DEFAULT 0,
  tokens_used         INTEGER NOT NULL DEFAULT 0,  -- alla Gemini-tokens (migrations/004)

  -- Audit / soft delete
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  deleted_at      INTEGER                        -- if set, refuse all requests for this user
);

CREATE INDEX IF NOT EXISTS idx_users_email          ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_rc_app_user_id ON users(rc_app_user_id);

-- Audit log of subscription lifecycle events from RevenueCat.
-- Useful for debugging and dispute resolution; raw_payload stores the full webhook body.
CREATE TABLE IF NOT EXISTS subscription_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL,
  event_type  TEXT NOT NULL,                     -- INITIAL_PURCHASE, RENEWAL, CANCELLATION, EXPIRATION, BILLING_ISSUE, REFUND
  raw_payload TEXT,                              -- JSON
  received_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_sub_events_user ON subscription_events(user_id, received_at DESC);

-- Gratis åtkomst som admin delar ut per e-postadress (migrations/002-grants.sql).
-- Matchas mot Google-intygad e-post; expires_at NULL = för alltid.
CREATE TABLE IF NOT EXISTS grants (
  email       TEXT PRIMARY KEY,   -- gemener
  expires_at  INTEGER,            -- unix-sekunder; NULL = för alltid
  note        TEXT,
  created_by  TEXT NOT NULL,      -- adminens e-post
  created_at  INTEGER NOT NULL
);

-- Felloggning per användare (migrations/003-errors.sql). Gallras efter 30 dagar.
CREATE TABLE IF NOT EXISTS errors (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at   INTEGER NOT NULL,
  user_id      TEXT,
  email        TEXT,
  source       TEXT NOT NULL,      -- 'server' | 'client'
  kind         TEXT NOT NULL,
  status       INTEGER,
  format       TEXT,
  model        TEXT,
  message      TEXT,
  platform     TEXT,
  app_version  TEXT
);

CREATE INDEX IF NOT EXISTS idx_errors_email   ON errors(email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_errors_created ON errors(created_at);

-- Verklig AI-förbrukning per anrop (migrations/004-usage.sql). Gallras efter 13 mån.
CREATE TABLE IF NOT EXISTS usage (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at      INTEGER NOT NULL,
  user_id         TEXT NOT NULL,
  kind            TEXT NOT NULL,      -- summary | qa | reformat | transcribe
  format          TEXT,
  model           TEXT,
  audio_tokens    INTEGER NOT NULL DEFAULT 0,
  input_tokens    INTEGER NOT NULL DEFAULT 0,
  output_tokens   INTEGER NOT NULL DEFAULT 0,
  thought_tokens  INTEGER NOT NULL DEFAULT 0,
  outcome         TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_usage_user    ON usage(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_created ON usage(created_at);
