import { verifyToken, type AudienceConfig } from "./auth";
import {
  checkEntitlement,
  isAdmin,
  incrementUsage,
  upsertUser,
  type UsageCaps,
} from "./entitlement";
import { callGeminiWithFallback, isSummarizeBody } from "./gemini";
import { applyWebhookEvent, isRevenueCatWebhookBody } from "./webhook";
import { isOriginAllowed } from "./cors";
import {
  deleteGrant,
  getGrant,
  grantActive,
  isGrantDuration,
  isValidEmail,
  listGrants,
  normalizeEmail,
  resetUsageWindow,
  upsertGrant,
  usageWindowExpired,
  type Grant,
} from "./grants";
import type { User } from "./entitlement";
import {
  classifyGeminiBody,
  isShortKey,
  logError,
  parseClientError,
  purgeOldErrors,
  upstreamMessage,
  type ErrorEntry,
} from "./errors";

interface RateLimit {
  limit(opts: { key: string }): Promise<{ success: boolean }>;
}

interface Env {
  GEMINI_API_KEY: string;
  DB: D1Database;
  GOOGLE_OAUTH_CLIENT_ID: string;
  APPLE_BUNDLE_ID?: string;
  USAGE_CAP_SUMMARIES: string;
  USAGE_CAP_AUDIO_SECONDS: string;
  GEMINI_MODEL?: string;
  GEMINI_MODELS?: string;
  REVENUECAT_WEBHOOK_SECRET?: string;
  RATE_LIMITER: RateLimit;
  ADMINS?: string;
}


/** Mottagar-id per leverantör. Tom om leverantören inte är konfigurerad. */
function audiencesFor(env: Env): AudienceConfig {
  const out: AudienceConfig = {};
  if (env.GOOGLE_OAUTH_CLIENT_ID && !env.GOOGLE_OAUTH_CLIENT_ID.startsWith("REPLACE_"))
    out.google = env.GOOGLE_OAUTH_CLIENT_ID;
  if (env.APPLE_BUNDLE_ID && !env.APPLE_BUNDLE_ID.startsWith("REPLACE_"))
    out.apple = env.APPLE_BUNDLE_ID;
  return out;
}

function anyProviderConfigured(env: Env): boolean {
  const a = audiencesFor(env);
  return !!(a.google || a.apple);
}

function adminCheck(claims: { userId: string; claims: { email?: string; email_verified?: boolean } }, env: Env): boolean {
  return isAdmin(
    { userId: claims.userId, email: claims.claims.email, emailVerified: claims.claims.email_verified },
    env.ADMINS,
  );
}

type Claims = Awaited<ReturnType<typeof verifyToken>>;

/** Inbjudan för den Google-intygade e-posten i token, annars null. */
async function grantFor(claims: Claims, env: Env): Promise<Grant | null> {
  const email = claims.claims.email;
  if (!email || claims.claims.email_verified !== true) return null;
  return getGrant(env.DB, email);
}

/**
 * Användaren som rättighetskontrollen ska se. En aktiv inbjudan ger samma
 * rättighet som en prenumeration — med samma kvottak — om personen inte redan
 * har en egen aktiv prenumeration (den vinner alltid). Inbjudna får ingen
 * RENEWAL-webhook, så deras förbrukning nollställs när 30 dagar gått.
 */
async function withGrant(user: User, grant: Grant | null, env: Env, now: number): Promise<User> {
  const ownSub = user.sub_active === 1 && (user.period_end == null || user.period_end > now);
  if (ownSub || !grantActive(grant, now)) return user;
  if (usageWindowExpired(user, now)) {
    await resetUsageWindow(env.DB, user.id, now);
    user = { ...user, period_started: now, audio_seconds_used: 0, summaries_used: 0 };
  }
  return { ...user, sub_active: 1, period_end: grant!.expires_at };
}

const VERSION = "0.6.0";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return cors(request, new Response(null, { status: 204 }));
    }

    switch (url.pathname) {
      case "/":
      case "/health":
        return cors(
          request,
          json({
            ok: true,
            service: "diane-api",
            version: VERSION,
            has_gemini_key: Boolean(env.GEMINI_API_KEY),
            has_db: Boolean(env.DB),
            oauth_client_configured:
              Boolean(env.GOOGLE_OAUTH_CLIENT_ID) &&
              !env.GOOGLE_OAUTH_CLIENT_ID.startsWith("REPLACE_"),
            webhook_configured: Boolean(env.REVENUECAT_WEBHOOK_SECRET),
            rate_limiter_configured: Boolean(env.RATE_LIMITER),
            user_count: await countUsers(env.DB).catch(() => null),
          }),
        );

      case "/me":
        return methodGuard(request, "GET", () => handleMe(request, env));

      case "/summarize":
        return methodGuard(request, "POST", () =>
          handleSummarize(request, env, ctx),
        );

      case "/log-error":
        return methodGuard(request, "POST", () => handleLogError(request, env, ctx));

      case "/webhook/revenuecat":
        return methodGuard(request, "POST", () =>
          handleRevenueCatWebhook(request, env),
        );

      case "/admin/grants":
        if (request.method === "GET") return handleAdminListGrants(request, env);
        return methodGuard(request, "POST", () => handleAdminUpsertGrant(request, env));

      case "/admin/grants/revoke":
        return methodGuard(request, "POST", () => handleAdminRevokeGrant(request, env));

      case "/account/delete":
        return methodGuard(request, "POST", () =>
          handleAccountDelete(request, env),
        );

      default:
        return cors(request, json({ error: "not_found" }, 404));
    }
  },

  // Daglig cron (wrangler.jsonc → triggers.crons): gallra felloggen.
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    const deleted = await purgeOldErrors(env.DB, Math.floor(Date.now() / 1000));
    console.log(JSON.stringify({ event: "errors_purged", deleted }));
  },
} satisfies ExportedHandler<Env>;

async function handleMe(request: Request, env: Env): Promise<Response> {
  if (!anyProviderConfigured(env)) {
    return cors(request, json({ error: "server_misconfigured" }, 503));
  }
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return cors(request, json({ error: "missing_auth" }, 401));
  }
  const token = authHeader.slice("Bearer ".length).trim();

  let claims: Awaited<ReturnType<typeof verifyToken>>;
  try {
    claims = await verifyToken(token, audiencesFor(env));
  } catch {
    return cors(request, json({ error: "invalid_token" }, 401));
  }

  // Upsert so the row exists if this is the user's first sign-in. The
  // webhook also creates rows but won't have fired for non-subscribers.
  const now = Math.floor(Date.now() / 1000);
  const grant = await grantFor(claims, env);
  const user = await withGrant(
    await upsertUser(env.DB, claims.userId, claims.claims.email ?? null),
    grant, env, now,
  );
  const isAdminUser = adminCheck(claims, env);

  const caps = {
    summaries: Number(env.USAGE_CAP_SUMMARIES) || 30,
    audio_seconds: Number(env.USAGE_CAP_AUDIO_SECONDS) || 10800,
  };

  // Re-evaluate sub_active server-side instead of trusting the stored flag —
  // catches the case where period_end has passed but the EXPIRATION webhook
  // hasn't arrived yet.
  const subActive =
    isAdminUser ? 1 :
    user.sub_active === 1 &&
    (user.period_end == null || user.period_end > now)
      ? 1
      : 0;

  return cors(
    request,
    json({
      email: user.email,
      sub_active: subActive,
      period_end: user.period_end,
      summaries_used: user.summaries_used,
      audio_seconds_used: user.audio_seconds_used,
      caps,
      is_admin: isAdminUser,
      grant: grantActive(grant, now) ? { expires_at: grant!.expires_at } : null,
    }),
  );
}

async function handleSummarize(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  if (!anyProviderConfigured(env)) {
    return cors(request, json({ error: "server_misconfigured" }, 503));
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return cors(request, json({ error: "missing_auth" }, 401));
  }
  const token = authHeader.slice("Bearer ".length).trim();

  let claims: Awaited<ReturnType<typeof verifyToken>>;
  try {
    claims = await verifyToken(token, audiencesFor(env));
  } catch {
    return cors(request, json({ error: "invalid_token" }, 401));
  }

  // Rate limit per authenticated user. 30 req/min — well above real usage,
  // catches buggy clients and stolen tokens before they drain the budget.
  const rl = await env.RATE_LIMITER.limit({ key: claims.userId });
  if (!rl.success) {
    // Bara Workers Logs, inte D1: över gränsen finns inget tak, och en
    // läckt token ska inte kunna fylla tabellen.
    console.warn(JSON.stringify({ event: "rate_limited", user_id: claims.userId }));
    return cors(request, json({ error: "rate_limited" }, 429));
  }

  const now = Math.floor(Date.now() / 1000);
  // Formatet är inte känt förrän kroppen lästs — fylls i nedan
  const fail = (e: Omit<ErrorEntry, "user_id" | "email" | "source">) =>
    ctx.waitUntil(logError(env.DB, {
      user_id: claims.userId, email: claims.claims.email ?? null, source: "server", ...e,
    }, now));
  const user = await withGrant(
    await upsertUser(env.DB, claims.userId, claims.claims.email ?? null),
    await grantFor(claims, env), env, now,
  );

  const caps: UsageCaps = {
    audio: Number(env.USAGE_CAP_AUDIO_SECONDS) || 10800,
    summaries: Number(env.USAGE_CAP_SUMMARIES) || 30,
  };
  const check = adminCheck(claims, env)
    ? { allowed: true }
    : checkEntitlement(user, caps);
  if (!check.allowed) {
    const status =
      check.reason === "not_subscribed" || check.reason === "expired"
        ? 402
        : 429;
    fail({ kind: check.reason ?? "denied", status });
    return cors(request, json({ error: check.reason }, status));
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return cors(request, json({ error: "invalid_json" }, 400));
  }
  if (!isSummarizeBody(body)) {
    fail({ kind: "invalid_body", status: 400 });
    return cors(request, json({ error: "invalid_body" }, 400));
  }
  // Bara metadata för felloggen: ett konstigt värde ignoreras i stället för
  // att fälla sammanfattningen.
  const format = isShortKey(body.format) ? body.format : null;

  const { response: upstream, model } = await callGeminiWithFallback(
    env.GEMINI_API_KEY,
    env.GEMINI_MODELS || env.GEMINI_MODEL,
    body,
  );

  if (!upstream.ok) {
    const errText = await upstream.text();
    fail({ kind: "upstream_error", status: upstream.status, format, model, message: upstreamMessage(errText) });
    return cors(
      request,
      new Response(errText, {
        status: upstream.status,
        headers: { "content-type": "application/json" },
      }),
    );
  }

  // Tappad räknare betyder tappad intäktskontroll — svälj inte felet tyst
  await incrementUsage(env.DB, user.id, body.audio_seconds).catch((e) =>
    console.error("incrementUsage failed", user.id, String(e)),
  );

  const respText = await upstream.text();
  // 200 betyder inte att det gick bra — säkerhetsfilter och tomma svar
  // kommer också som 200. Svaret skickas ändå vidare oförändrat.
  const problem = classifyGeminiBody(respText);
  if (problem) fail({ ...problem, status: 200, format, model });
  return cors(
    request,
    new Response(respText, {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
}

async function handleRevenueCatWebhook(
  request: Request,
  env: Env,
): Promise<Response> {
  if (!env.REVENUECAT_WEBHOOK_SECRET) {
    return cors(request, json({ error: "server_misconfigured" }, 503));
  }

  const authHeader = request.headers.get("authorization") ?? "";
  if (!constantTimeEqual(authHeader, env.REVENUECAT_WEBHOOK_SECRET)) {
    return cors(request, json({ error: "invalid_signature" }, 401));
  }

  const raw = await request.text();
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return cors(request, json({ error: "invalid_json" }, 400));
  }
  if (!isRevenueCatWebhookBody(body)) {
    return cors(request, json({ error: "invalid_body" }, 400));
  }

  const result = await applyWebhookEvent(env.DB, body.event, raw);
  return cors(request, json({ ok: true, ...result }));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function handleAccountDelete(
  request: Request,
  env: Env,
): Promise<Response> {
  if (!anyProviderConfigured(env)) {
    return cors(request, json({ error: "server_misconfigured" }, 503));
  }
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return cors(request, json({ error: "missing_auth" }, 401));
  }
  const token = authHeader.slice("Bearer ".length).trim();

  let claims: Awaited<ReturnType<typeof verifyToken>>;
  try {
    claims = await verifyToken(token, audiencesFor(env));
  } catch {
    return cors(request, json({ error: "invalid_token" }, 401));
  }

  await env.DB.batch([
    env.DB.prepare("DELETE FROM subscription_events WHERE user_id = ?").bind(
      claims.userId,
    ),
    env.DB.prepare("DELETE FROM users WHERE id = ?").bind(claims.userId),
  ]);
  // Separat och tolerant: saknas tabellen (migrering 003 inte körd) får det
  // inte stoppa en kontoradering. Gallringen tar resten inom 30 dagar.
  await env.DB.prepare("DELETE FROM errors WHERE user_id = ?").bind(claims.userId).run()
    .catch((e) => console.error("delete errors failed", claims.userId, String(e)));

  return cors(request, json({ ok: true, deleted: true }));
}

// Fel som appen visat för användaren. Kräver inloggning — utan identitet
// går raden inte att koppla till någon. Delar rate limit med /summarize.
async function handleLogError(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (!anyProviderConfigured(env)) {
    return cors(request, json({ error: "server_misconfigured" }, 503));
  }
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return cors(request, json({ error: "missing_auth" }, 401));
  }
  let claims: Claims;
  try {
    claims = await verifyToken(authHeader.slice("Bearer ".length).trim(), audiencesFor(env));
  } catch {
    return cors(request, json({ error: "invalid_token" }, 401));
  }
  const rl = await env.RATE_LIMITER.limit({ key: claims.userId });
  if (!rl.success) return cors(request, json({ error: "rate_limited" }, 429));

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return cors(request, json({ error: "invalid_json" }, 400));
  }
  const body = parseClientError(raw);
  if (!body) return cors(request, json({ error: "invalid_body" }, 400));

  ctx.waitUntil(logError(env.DB, {
    user_id: claims.userId,
    email: claims.claims.email ?? null,
    source: "client",
    ...body,
  }, Math.floor(Date.now() / 1000)));
  return cors(request, json({ ok: true }));
}

async function countUsers(db: D1Database): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM users WHERE deleted_at IS NULL")
    .first<{ n: number }>();
  return row?.n ?? 0;
}

// ── ADMIN: inbjudningar ─────────────────────────────────────────────────────
// Kräver giltig token OCH att kontot står i ADMINS (id eller Google-intygad
// e-post). Allt annat får 401/403 innan databasen rörs.
async function requireAdmin(request: Request, env: Env): Promise<Claims | Response> {
  if (!anyProviderConfigured(env)) return cors(request, json({ error: "server_misconfigured" }, 503));
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return cors(request, json({ error: "missing_auth" }, 401));
  let claims: Claims;
  try {
    claims = await verifyToken(authHeader.slice("Bearer ".length).trim(), audiencesFor(env));
  } catch {
    return cors(request, json({ error: "invalid_token" }, 401));
  }
  if (!adminCheck(claims, env)) return cors(request, json({ error: "forbidden" }, 403));
  return claims;
}

async function handleAdminListGrants(request: Request, env: Env): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;
  return cors(request, json({ grants: await listGrants(env.DB) }));
}

async function handleAdminUpsertGrant(request: Request, env: Env): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;
  let body: { email?: unknown; duration?: unknown; note?: unknown };
  try {
    body = await request.json();
  } catch {
    return cors(request, json({ error: "invalid_json" }, 400));
  }
  const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
  if (!isValidEmail(email)) return cors(request, json({ error: "invalid_email" }, 400));
  if (!isGrantDuration(body.duration)) return cors(request, json({ error: "invalid_duration" }, 400));
  const note = typeof body.note === "string" ? body.note.slice(0, 200) : null;
  const now = Math.floor(Date.now() / 1000);
  await upsertGrant(env.DB, email, body.duration, admin.claims.email ?? admin.userId, note, now);
  return cors(request, json({ ok: true, grant: await getGrant(env.DB, email) }));
}

async function handleAdminRevokeGrant(request: Request, env: Env): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;
  let body: { email?: unknown };
  try {
    body = await request.json();
  } catch {
    return cors(request, json({ error: "invalid_json" }, 400));
  }
  const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
  if (!isValidEmail(email)) return cors(request, json({ error: "invalid_email" }, 400));
  await deleteGrant(env.DB, email);
  return cors(request, json({ ok: true }));
}

function json(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function cors(request: Request, res: Response): Response {
  const origin = request.headers.get("origin");
  // Same-origin / non-browser requests don't send Origin. We don't need to
  // set Allow-Origin in that case — only browsers enforce CORS, and they
  // always send Origin on cross-origin requests.
  if (origin && isOriginAllowed(origin)) {
    res.headers.set("access-control-allow-origin", origin);
    res.headers.set("vary", "origin");
  }
  res.headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
  res.headers.set("access-control-allow-headers", "content-type, authorization");
  return res;
}

function methodGuard(
  request: Request,
  expected: string,
  handler: () => Response | Promise<Response>,
): Response | Promise<Response> {
  if (request.method !== expected) {
    return cors(request, json({ error: "method_not_allowed" }, 405));
  }
  return handler();
}
