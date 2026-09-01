import { verifyToken, type AudienceConfig } from "./auth";
import {
  checkEntitlement,
  incrementUsage,
  upsertUser,
  type UsageCaps,
} from "./entitlement";
import { callGeminiWithFallback, isSummarizeBody } from "./gemini";
import { applyWebhookEvent, isRevenueCatWebhookBody } from "./webhook";

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

const VERSION = "0.6.0";

// Origins allowed to call the API from a browser context. Native curl /
// server-to-server requests (no Origin header) are unaffected — CORS is a
// browser security feature only.
const ALLOWED_ORIGINS = new Set([
  "capacitor://localhost", // iOS Capacitor default
  "https://localhost", // Android Capacitor default (Capacitor 5+)
  "ionic://localhost", // legacy Capacitor / Ionic
]);
const ALLOWED_ORIGIN_PATTERNS: RegExp[] = [
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
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
          handleSummarize(request, env),
        );

      case "/webhook/revenuecat":
        return methodGuard(request, "POST", () =>
          handleRevenueCatWebhook(request, env),
        );

      case "/account/delete":
        return methodGuard(request, "POST", () =>
          handleAccountDelete(request, env),
        );

      default:
        return cors(request, json({ error: "not_found" }, 404));
    }
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
  const user = await upsertUser(env.DB, claims.userId, claims.claims.email ?? null);

  const caps = {
    summaries: Number(env.USAGE_CAP_SUMMARIES) || 100,
    audio_seconds: Number(env.USAGE_CAP_AUDIO_SECONDS) || 3600,
  };

  // Re-evaluate sub_active server-side instead of trusting the stored flag —
  // catches the case where period_end has passed but the EXPIRATION webhook
  // hasn't arrived yet.
  const now = Math.floor(Date.now() / 1000);
  const subActive =
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
    }),
  );
}

async function handleSummarize(
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

  // Rate limit per authenticated user. 30 req/min — well above real usage,
  // catches buggy clients and stolen tokens before they drain the budget.
  const rl = await env.RATE_LIMITER.limit({ key: claims.userId });
  if (!rl.success) {
    return cors(request, json({ error: "rate_limited" }, 429));
  }

  const user = await upsertUser(env.DB, claims.userId, claims.claims.email ?? null);

  const caps: UsageCaps = {
    audio: Number(env.USAGE_CAP_AUDIO_SECONDS) || 3600,
    summaries: Number(env.USAGE_CAP_SUMMARIES) || 100,
  };
  const check = checkEntitlement(user, caps);
  if (!check.allowed) {
    const status =
      check.reason === "not_subscribed" || check.reason === "expired"
        ? 402
        : 429;
    return cors(request, json({ error: check.reason }, status));
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return cors(request, json({ error: "invalid_json" }, 400));
  }
  if (!isSummarizeBody(body)) {
    return cors(request, json({ error: "invalid_body" }, 400));
  }

  const { response: upstream } = await callGeminiWithFallback(
    env.GEMINI_API_KEY,
    env.GEMINI_MODELS || env.GEMINI_MODEL,
    body,
  );

  if (!upstream.ok) {
    const errText = await upstream.text();
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

  return cors(request, json({ ok: true, deleted: true }));
}

async function countUsers(db: D1Database): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM users WHERE deleted_at IS NULL")
    .first<{ n: number }>();
  return row?.n ?? 0;
}

function json(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function isOriginAllowed(origin: string): boolean {
  if (ALLOWED_ORIGINS.has(origin)) return true;
  return ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin));
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
