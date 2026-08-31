export interface User {
  id: string;
  email: string | null;
  rc_app_user_id: string | null;
  sub_active: number;
  period_end: number | null;
  period_started: number | null;
  audio_seconds_used: number;
  summaries_used: number;
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
  | "deleted";

export interface EntitlementCheck {
  allowed: boolean;
  reason?: EntitlementReason;
}

export interface UsageCaps {
  audio: number; // seconds
  summaries: number; // count
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
  return { allowed: true };
}

export async function incrementUsage(
  db: D1Database,
  id: string,
  audioSeconds: number,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `UPDATE users
       SET audio_seconds_used = audio_seconds_used + ?,
           summaries_used = summaries_used + 1,
           updated_at = ?
       WHERE id = ?`,
    )
    .bind(audioSeconds, now, id)
    .run();
}
