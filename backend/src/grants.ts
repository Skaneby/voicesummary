// Gratis åtkomst som admin delar ut per e-postadress — i 10 dagar eller för
// alltid. Inbjudna får samma kvot som betalande, men eftersom ingen
// RENEWAL-webhook nollställer deras förbrukning används ett eget rullande
// 30-dagarsfönster (users.period_started).
import type { User } from "./entitlement";

export interface Grant {
  email: string;
  expires_at: number | null; // null = för alltid
  note: string | null;
  created_by: string;
  created_at: number;
}

export type GrantDuration = "10d" | "forever";

export const USAGE_WINDOW_SECONDS = 30 * 24 * 3600;
const TEN_DAYS = 10 * 24 * 3600;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Enkel rimlighetskontroll — själva äganderätten bevisas av Google vid inloggning. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

export function isGrantDuration(x: unknown): x is GrantDuration {
  return x === "10d" || x === "forever";
}

export function expiryFor(duration: GrantDuration, now: number): number | null {
  return duration === "forever" ? null : now + TEN_DAYS;
}

export function grantActive(grant: Grant | null, now: number): boolean {
  return !!grant && (grant.expires_at === null || grant.expires_at > now);
}

/** Har inbjudans 30-dagarsfönster för förbrukning löpt ut (eller aldrig startat)? */
export function usageWindowExpired(user: Pick<User, "period_started">, now: number): boolean {
  return user.period_started === null || now - user.period_started >= USAGE_WINDOW_SECONDS;
}

export async function getGrant(db: D1Database, email: string): Promise<Grant | null> {
  return await db.prepare("SELECT * FROM grants WHERE email = ?").bind(normalizeEmail(email)).first<Grant>();
}

export interface GrantRow extends Grant {
  signed_in: number; // 1 om personen har loggat in minst en gång
  summaries_used: number | null;
  audio_seconds_used: number | null;
}

/** Alla inbjudningar, med om personen loggat in och hur mycket som förbrukats. */
export async function listGrants(db: D1Database): Promise<GrantRow[]> {
  const res = await db
    .prepare(
      `SELECT g.*, (u.id IS NOT NULL) AS signed_in, u.summaries_used, u.audio_seconds_used
       FROM grants g LEFT JOIN users u ON lower(u.email) = g.email AND u.deleted_at IS NULL
       ORDER BY g.created_at DESC`,
    )
    .all<GrantRow>();
  return res.results ?? [];
}

export async function upsertGrant(
  db: D1Database,
  email: string,
  duration: GrantDuration,
  createdBy: string,
  note: string | null,
  now: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO grants (email, expires_at, note, created_by, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET expires_at = excluded.expires_at, note = excluded.note,
         created_by = excluded.created_by, created_at = excluded.created_at`,
    )
    .bind(normalizeEmail(email), expiryFor(duration, now), note, createdBy, now)
    .run();
}

export async function deleteGrant(db: D1Database, email: string): Promise<void> {
  await db.prepare("DELETE FROM grants WHERE email = ?").bind(normalizeEmail(email)).run();
}

/** Starta ett nytt 30-dagarsfönster: nollställ förbrukningen. */
export async function resetUsageWindow(db: D1Database, userId: string, now: number): Promise<void> {
  await db
    .prepare("UPDATE users SET period_started = ?, audio_seconds_used = 0, summaries_used = 0, updated_at = ? WHERE id = ?")
    .bind(now, now, userId)
    .run();
}
