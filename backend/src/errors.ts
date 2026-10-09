// Felloggning per användare — tabellen `errors` (migrations/003-errors.sql).
//
// Två källor: `server` (det /summarize såg gå fel) och `client` (det appen
// visade för användaren, via /log-error). Ett serverfel ger alltså två rader:
// orsaken och vad användaren fick se. Aldrig ljud, prompt eller svarstext.

export const ERROR_RETENTION_DAYS = 30;
const MESSAGE_MAX = 500;

export interface ErrorEntry {
  user_id: string | null;
  email: string | null;
  source: "server" | "client";
  kind: string;
  status?: number | null;
  format?: string | null;
  model?: string | null;
  message?: string | null;
  platform?: string | null;
  app_version?: string | null;
}

export function clip(s: string | null | undefined, max: number): string | null {
  if (s == null) return null;
  const t = String(s).trim();
  return t ? t.slice(0, max) : null;
}

/** Korta identifierare — formatnyckel, kind, plattform. Allt annat avvisas
    så att fria strängar inte smyger in i fält som ska gå att gruppera på. */
export function isShortKey(x: unknown): x is string {
  return typeof x === "string" && /^[a-z0-9_.-]{1,40}$/i.test(x);
}

/**
 * Skriver en felrad. Kastar aldrig: loggning får inte fälla en begäran som
 * annars hade lyckats, och saknas tabellen (migreringen inte körd) blir det
 * bara en rad i Workers Logs.
 */
export async function logError(db: D1Database, e: ErrorEntry, now: number): Promise<void> {
  const row = {
    created_at: now,
    user_id: e.user_id,
    email: e.email ? e.email.toLowerCase() : null,
    source: e.source,
    kind: e.kind,
    status: e.status ?? null,
    format: e.format ?? null,
    model: e.model ?? null,
    message: clip(e.message, MESSAGE_MAX),
    platform: e.platform ?? null,
    app_version: e.app_version ?? null,
  };
  // Strukturerad rad till Workers Logs — sökbar i Cloudflare även utan D1
  console.error(JSON.stringify({ event: "error_logged", ...row }));
  try {
    await db
      .prepare(
        `INSERT INTO errors (created_at, user_id, email, source, kind, status,
           format, model, message, platform, app_version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        row.created_at, row.user_id, row.email, row.source, row.kind, row.status,
        row.format, row.model, row.message, row.platform, row.app_version,
      )
      .run();
  } catch (err) {
    console.error("logError failed", String(err));
  }
}

/** Geminis eget felmeddelande ur en felkropp, annars de första tecknen. */
export function upstreamMessage(body: string): string {
  try {
    const msg = JSON.parse(body)?.error?.message;
    if (typeof msg === "string") return msg;
  } catch {
    // inte JSON — falla tillbaka på råtexten
  }
  return body.slice(0, MESSAGE_MAX);
}

/**
 * Hittar 200-svar som egentligen är fel. Gemini svarar 200 även när
 * säkerhetsfiltret stoppat begäran eller svaret, eller när texten blev tom —
 * utan den här kontrollen ser Workern dem som lyckade.
 */
export function classifyGeminiBody(body: string): { kind: string; message: string } | null {
  let d: any;
  try {
    d = JSON.parse(body);
  } catch {
    return { kind: "invalid_response", message: "Svaret var inte JSON" };
  }
  const blockReason = d?.promptFeedback?.blockReason;
  if (blockReason) return { kind: "blocked", message: "prompt: " + blockReason };

  const candidate = d?.candidates?.[0];
  if (!candidate) return { kind: "empty", message: "inga candidates" };

  const reason = candidate.finishReason;
  if (reason === "MAX_TOKENS") return { kind: "max_tokens", message: "finishReason: MAX_TOKENS" };
  if (reason && reason !== "STOP") return { kind: "blocked", message: "finishReason: " + reason };

  // Tankedelar räknas inte — det är den synliga texten klienten renderar
  const parts: any[] = candidate.content?.parts ?? [];
  const text = parts.filter((p) => !p?.thought).map((p) => p?.text ?? "").join("");
  if (!text.trim()) return { kind: "empty", message: "tom text" + (reason ? ", finishReason: " + reason : "") };
  return null;
}

export interface ClientErrorBody {
  kind: string;
  message: string;
  status?: number;
  format?: string;
  platform?: string;
  app_version?: string;
}

/**
 * Validerar /log-error. `kind` och `message` krävs; de valfria fälten släpps
 * om de ser konstiga ut — hellre en rad utan format än ingen rad alls.
 */
export function parseClientError(x: unknown): ClientErrorBody | null {
  if (typeof x !== "object" || x === null) return null;
  const o = x as Record<string, unknown>;
  if (!isShortKey(o.kind)) return null;
  if (typeof o.message !== "string" || !o.message.trim()) return null;
  const key = (v: unknown) => (isShortKey(v) ? v : undefined);
  return {
    kind: o.kind,
    message: o.message.slice(0, MESSAGE_MAX),
    status: Number.isInteger(o.status) ? (o.status as number) : undefined,
    format: key(o.format),
    platform: key(o.platform),
    app_version: key(o.app_version),
  };
}

/** Körs av den dagliga cronen. Returnerar antal raderade rader. */
export async function purgeOldErrors(db: D1Database, now: number): Promise<number> {
  const cutoff = now - ERROR_RETENTION_DAYS * 86400;
  const res = await db.prepare("DELETE FROM errors WHERE created_at < ?").bind(cutoff).run();
  return res.meta?.changes ?? 0;
}
