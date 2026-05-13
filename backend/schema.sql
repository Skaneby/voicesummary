-- Diane backend schema (D1 / SQLite)
--
-- Apply with:
--   wrangler d1 execute diane-prod --remote --file=schema.sql
--   wrangler d1 execute diane-prod --local  --file=schema.sql

CREATE TABLE IF NOT EXISTS users (
  -- Identity
  id              TEXT PRIMARY KEY,             -- Google subject ID, stable across logins
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
