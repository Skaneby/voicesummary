export interface User {
  id: string;
  email: string | null;
  rc_app_user_id: string | null;
  sub_active: number;
  period_end: number | null;
  period_started: number | null;
  audio_seconds_used: number;
  summaries_used: number;
  tokens_used: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export async function getUser(
  db: D1Database,
  id: string,
): Promise<User | null> {
  return await db
    .prepare("SELECT * FROM users WHERE id = ?")
    .bind(id)
    .first<User>();
}

/**
 * Insert the user if missing, otherwise refresh email + updated_at.
 * Subscription state and usage counters are NEVER touched here — those are
 * mirrored from the RevenueCat webhook and incremented on usage.
 */
export async function upsertUser(
  db: D1Database,
  id: string,
  email: string | null,
): Promise<User> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `INSERT INTO users (id, email, created_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET email = COALESCE(excluded.email, email), updated_at = excluded.updated_at`,
    )
    .bind(id, email, now, now)
    .run();
  const user = await getUser(db, id);
  if (!user) throw new Error("user upsert failed");
  return user;
}

export type EntitlementReason =
  | "not_subscribed"
  | "expired"
  | "audio_cap_reached"
  | "summary_cap_reached"
  | "token_cap_reached"
  | "deleted";

export interface EntitlementCheck {
  allowed: boolean;
  reason?: EntitlementReason;
}

export interface UsageCaps {
  audio: number; // seconds
  summaries: number; // count
  /** Alla Gemini-tokens per period — ägarens kostnadsskydd. Fångar det som
      inte räknas som sammanfattning: frågor, omformatering, transkribering. */
  tokens: number;
}

/**
 * Ägare/admin släpps alltid igenom — utan prenumeration och utan kvottak.
 * ADMINS är en kommaseparerad lista där varje post är antingen ett
 * namnrymdat användar-id ("google:1234") eller en e-postadress. E-post räknas
 * bara om leverantören intygat den (email_verified i den signerade token) —
 * annars skulle vem som helst kunna ange någon annans adress. Förbrukningen
 * räknas ändå, så kostnaden syns i databasen.
 */
export function isAdmin(
  who: { userId: string; email?: string; emailVerified?: boolean },
  admins: string | undefined,
): boolean {
  if (!admins) return false;
  const list = admins.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (who.userId && list.includes(who.userId.toLowerCase())) return true;
  return !!(who.email && who.emailVerified === true && list.includes(who.email.toLowerCase()));
}

export function checkEntitlement(
  user: User,
  caps: UsageCaps,
): EntitlementCheck {
  const now = Math.floor(Date.now() / 1000);
  if (user.deleted_at) return { allowed: false, reason: "deleted" };
  if (user.sub_active === 0) return { allowed: false, reason: "not_subscribed" };
  if (user.period_end !== null && user.period_end < now)
    return { allowed: false, reason: "expired" };
  if (user.audio_seconds_used >= caps.audio)
    return { allowed: false, reason: "audio_cap_reached" };
  if (user.summaries_used >= caps.summaries)
    return { allowed: false, reason: "summary_cap_reached" };
  if ((user.tokens_used ?? 0) >= caps.tokens)
    return { allowed: false, reason: "token_cap_reached" };
  return { allowed: true };
}

/** Räknar upp förbrukningen. `delta` kommer från `usageDelta()` i usage.ts. */
export async function incrementUsage(
  db: D1Database,
  id: string,
  delta: { summaries: number; audioSeconds: number; tokens: number },
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `UPDATE users
       SET audio_seconds_used = audio_seconds_used + ?,
           summaries_used = summaries_used + ?,
           tokens_used = tokens_used + ?,
           updated_at = ?
       WHERE id = ?`,
    )
    .bind(delta.audioSeconds, delta.summaries, delta.tokens, now, id)
    .run();
}

/**
 * En rad i tokenloggen `usage` — vad anropet kostade. Kastar aldrig: loggen
 * är för uppföljning, räknaren ovan är det som skyddar kostnaden.
 */
export async function recordUsage(
  db: D1Database,
  row: {
    user_id: string;
    kind: string;
    format: string | null;
    model: string | null;
    tokens: { audio: number; input: number; output: number; thought: number };
    outcome: string;
  },
  now: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO usage (created_at, user_id, kind, format, model,
         audio_tokens, input_tokens, output_tokens, thought_tokens, outcome)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(now, row.user_id, row.kind, row.format, row.model, row.tokens.audio,
      row.tokens.input, row.tokens.output, row.tokens.thought, row.outcome)
    .run()
    .catch((e) => console.error("recordUsage failed", row.user_id, String(e)));
}
