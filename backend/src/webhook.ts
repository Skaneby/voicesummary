/**
 * RevenueCat webhook payload. Only the fields we actually use are typed —
 * RC's payload has dozens of fields we ignore.
 *
 * See: https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields
 */
export interface RevenueCatEvent {
  type:
    | "INITIAL_PURCHASE"
    | "RENEWAL"
    | "PRODUCT_CHANGE"
    | "CANCELLATION"
    | "UNCANCELLATION"
    | "NON_RENEWING_PURCHASE"
    | "SUBSCRIPTION_PAUSED"
    | "EXPIRATION"
    | "BILLING_ISSUE"
    | "SUBSCRIBER_ALIAS"
    | "SUBSCRIPTION_EXTENDED"
    | "REFUND"
    | "TRANSFER"
    | "TEMPORARY_ENTITLEMENT_GRANT"
    | "TEST";
  id: string;
  app_user_id: string;
  expiration_at_ms?: number;
  purchased_at_ms?: number;
  product_id?: string;
  /** TRANSFER: id:n som förlorar prenumerationen */
  transferred_from?: string[];
  /** TRANSFER: id:n som tar över den */
  transferred_to?: string[];
}

export interface RevenueCatWebhookBody {
  event: RevenueCatEvent;
  api_version?: string;
}

export function isRevenueCatWebhookBody(x: unknown): x is RevenueCatWebhookBody {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  if (typeof o.event !== "object" || o.event === null) return false;
  const e = o.event as Record<string, unknown>;
  if (typeof e.type !== "string") return false;
  // TRANSFER bär id:n i transferred_from/-to i stället för app_user_id
  if (e.type === "TRANSFER") return Array.isArray(e.transferred_to);
  return typeof e.app_user_id === "string";
}

interface SubscriptionUpdate {
  sub_active: 0 | 1;
  period_started_ms?: number;
  period_end_ms?: number;
  resetUsage?: boolean;
}

/**
 * Map a RevenueCat event type to the user-row state change it implies.
 * Returns null for event types we deliberately ignore.
 */
export function eventToUpdate(
  event: RevenueCatEvent,
): SubscriptionUpdate | null {
  switch (event.type) {
    case "INITIAL_PURCHASE":
    case "RENEWAL":
    case "UNCANCELLATION":
    case "PRODUCT_CHANGE":
    case "SUBSCRIPTION_EXTENDED":
    case "TEMPORARY_ENTITLEMENT_GRANT":
      return {
        sub_active: 1,
        period_started_ms: event.purchased_at_ms,
        period_end_ms: event.expiration_at_ms,
        // Reset usage at the start of each billing window.
        resetUsage: event.type === "RENEWAL" || event.type === "INITIAL_PURCHASE",
      };

    case "CANCELLATION":
      // User cancelled but period_end may be in the future — keep them active
      // until period_end. RC sends EXPIRATION when the period actually ends.
      return null;

    case "EXPIRATION":
    case "BILLING_ISSUE":
    case "REFUND":
      return { sub_active: 0 };

    case "SUBSCRIPTION_PAUSED":
      return { sub_active: 0 };

    case "TEST":
    case "SUBSCRIBER_ALIAS":
    case "TRANSFER":
    case "NON_RENEWING_PURCHASE":
      return null;
  }
}

export interface TransferPlan {
  from: string[];
  to: string;
}

/**
 * TRANSFER skickas när en prenumeration flyttas mellan app_user_id:n — t.ex.
 * när samma person loggar in med en annan identitet, eller byter enhet.
 * Utan hantering skulle den gamla raden behålla rättigheten och den nya sakna
 * den. Returnerar null om händelsen inte är en användbar överföring.
 */
export function transferPlan(event: RevenueCatEvent): TransferPlan | null {
  if (event.type !== "TRANSFER") return null;
  const to = event.transferred_to?.[0];
  if (!to) return null;
  const from = (event.transferred_from || []).filter((id) => id && id !== to);
  return { from, to };
}

export async function applyWebhookEvent(
  db: D1Database,
  event: RevenueCatEvent,
  rawPayload: string,
): Promise<{ applied: boolean; reason?: string }> {
  const update = eventToUpdate(event);
  const now = Math.floor(Date.now() / 1000);

  // TRANSFER: flytta prenumerationen i stället för att uppdatera en rad
  const transfer = transferPlan(event);
  if (transfer) {
    await db
      .prepare(`INSERT OR IGNORE INTO users (id, created_at, updated_at) VALUES (?, ?, ?)`)
      .bind(transfer.to, now, now)
      .run();
    for (const fromId of transfer.from) {
      // Kopiera rättigheten till den nya raden …
      await db
        .prepare(
          `UPDATE users SET sub_active = (SELECT sub_active FROM users WHERE id = ?),
                            period_end = (SELECT period_end FROM users WHERE id = ?),
                            period_started = (SELECT period_started FROM users WHERE id = ?),
                            updated_at = ?
             WHERE id = ? AND EXISTS (SELECT 1 FROM users WHERE id = ?)`,
        )
        .bind(fromId, fromId, fromId, now, transfer.to, fromId)
        .run();
      // … och ta bort den från den gamla
      await db
        .prepare(`UPDATE users SET sub_active = 0, updated_at = ? WHERE id = ?`)
        .bind(now, fromId)
        .run();
    }
    await db
      .prepare(
        `INSERT INTO subscription_events (user_id, event_type, raw_payload, received_at)
         VALUES (?, ?, ?, ?)`,
      )
      .bind(transfer.to, event.type, rawPayload, now)
      .run();
    return { applied: true, reason: "transferred" };
  }

  // Ensure the user row exists FIRST — the audit log has an FK referencing
  // users(id), and D1 enforces foreign keys. Purchase webhooks often arrive
  // before the user has called /summarize, so the row may not exist yet.
  await db
    .prepare(
      `INSERT OR IGNORE INTO users (id, created_at, updated_at) VALUES (?, ?, ?)`,
    )
    .bind(event.app_user_id, now, now)
    .run();

  // Audit: store every event we receive, even ignored ones, for debugging.
  await db
    .prepare(
      `INSERT INTO subscription_events (user_id, event_type, raw_payload, received_at)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(event.app_user_id, event.type, rawPayload, now)
    .run();

  if (!update) {
    return { applied: false, reason: "event_ignored" };
  }

  const sets: string[] = ["sub_active = ?", "rc_app_user_id = ?", "updated_at = ?"];
  const binds: (string | number | null)[] = [
    update.sub_active,
    event.app_user_id,
    now,
  ];

  if (update.period_started_ms != null) {
    sets.push("period_started = ?");
    binds.push(Math.floor(update.period_started_ms / 1000));
  }
  if (update.period_end_ms != null) {
    sets.push("period_end = ?");
    binds.push(Math.floor(update.period_end_ms / 1000));
  }
  if (update.resetUsage) {
    sets.push("audio_seconds_used = 0", "summaries_used = 0");
  }

  binds.push(event.app_user_id);
  await db
    .prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...binds)
    .run();

  return { applied: true };
}
