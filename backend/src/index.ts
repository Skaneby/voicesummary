interface Env {
  GEMINI_API_KEY: string;
  // DB: D1Database;  // added in Phase 1.2 when we wire D1
}

const VERSION = "0.1.0";

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
          }),
        );

      case "/summarize":
        return methodGuard(request, "POST", () =>
          cors(json({ error: "not_implemented" }, 501)),
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

function json(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

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
