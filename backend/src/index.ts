import { verifyGoogleToken } from "./auth";
import {
  checkEntitlement,
  incrementUsage,
  upsertUser,
  type UsageCaps,
} from "./entitlement";
import { callGemini, isSummarizeBody } from "./gemini";

interface Env {
  GEMINI_API_KEY: string;
  DB: D1Database;
  GOOGLE_OAUTH_CLIENT_ID: string;
  USAGE_CAP_SUMMARIES: string;
  USAGE_CAP_AUDIO_SECONDS: string;
  GEMINI_MODEL: string;
}

const VERSION = "0.2.0";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return cors(new Response(null, { status: 204 }));
    }

    switch (url.pathname) {
      case "/":
      case "/health":
        return cors(
          json({
            ok: true,
            service: "diane-api",
            version: VERSION,
            has_gemini_key: Boolean(env.GEMINI_API_KEY),
            has_db: Boolean(env.DB),
            oauth_client_configured:
              Boolean(env.GOOGLE_OAUTH_CLIENT_ID) &&
              !env.GOOGLE_OAUTH_CLIENT_ID.startsWith("REPLACE_"),
            user_count: await countUsers(env.DB).catch(() => null),
          }),
        );

      case "/summarize":
        return methodGuard(request, "POST", () =>
          handleSummarize(request, env),
        );

      case "/webhook/revenuecat":
        return methodGuard(request, "POST", () =>
          cors(json({ error: "not_implemented" }, 501)),
        );

      case "/account/delete":
        return methodGuard(request, "POST", () =>
          cors(json({ error: "not_implemented" }, 501)),
        );

      default:
        return cors(json({ error: "not_found" }, 404));
    }
  },
} satisfies ExportedHandler<Env>;

async function handleSummarize(
  request: Request,
  env: Env,
): Promise<Response> {
  if (
    !env.GOOGLE_OAUTH_CLIENT_ID ||
    env.GOOGLE_OAUTH_CLIENT_ID.startsWith("REPLACE_")
  ) {
    return cors(json({ error: "server_misconfigured" }, 503));
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return cors(json({ error: "missing_auth" }, 401));
  }
  const token = authHeader.slice("Bearer ".length).trim();

  let claims;
  try {
    claims = await verifyGoogleToken(token, env.GOOGLE_OAUTH_CLIENT_ID);
  } catch {
    return cors(json({ error: "invalid_token" }, 401));
  }

  const user = await upsertUser(env.DB, claims.sub, claims.email ?? null);

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
    return cors(json({ error: check.reason }, status));
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return cors(json({ error: "invalid_json" }, 400));
  }
  if (!isSummarizeBody(body)) {
    return cors(json({ error: "invalid_body" }, 400));
  }

  const upstream = await callGemini(
    env.GEMINI_API_KEY,
    env.GEMINI_MODEL || "gemini-2.5-flash",
    body,
  );

  if (!upstream.ok) {
    const errText = await upstream.text();
    return cors(
      new Response(errText, {
        status: upstream.status,
        headers: { "content-type": "application/json" },
      }),
    );
  }

  // Best-effort usage tracking — don't fail the user request if this errors.
  await incrementUsage(env.DB, user.id, body.audio_seconds).catch(() => {});

  const respText = await upstream.text();
  return cors(
    new Response(respText, {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
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

// TODO: restrict to capacitor://localhost + https://localhost + http://localhost:*
// before going live. Wide-open CORS is fine while we develop.
function cors(res: Response): Response {
  res.headers.set("access-control-allow-origin", "*");
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
    return cors(json({ error: "method_not_allowed" }, 405));
  }
  return handler();
}
