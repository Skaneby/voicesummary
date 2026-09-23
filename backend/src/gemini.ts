export interface SummarizeBody {
  prompt: string;
  /** Utelämnas för rena textanrop: omformatering och frågor om mötet. */
  audio_base64?: string;
  audio_mime?: string;
  audio_seconds: number;
  /** Flervändig konversation (Q&A). Ersätter `prompt` när den finns. */
  contents?: unknown[];
  /** Låt klienten begära lägre temperatur för faktafrågor. */
  temperature?: number;
  max_output_tokens?: number;
  /** Tak på modellens tanketokens. Utan tak tänker Gemini 3.x dynamiskt och
      kan äta hela svarsbudgeten på en ljuduppgift — svaret blir tomt efter
      flera minuter. Servern sätter därför alltid ett tak, även utan fältet. */
  thinking_budget?: number;
}

export function isSummarizeBody(x: unknown): x is SummarizeBody {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  if (typeof o.audio_seconds !== "number" || o.audio_seconds < 0) return false;
  // Antingen en färdig konversation, eller en prompt
  const hasContents = Array.isArray(o.contents) && o.contents.length > 0;
  if (!hasContents && typeof o.prompt !== "string") return false;
  // Ljud är valfritt, men kommer det måste båda fälten finnas
  if (o.audio_base64 !== undefined || o.audio_mime !== undefined) {
    if (typeof o.audio_base64 !== "string" || typeof o.audio_mime !== "string")
      return false;
  }
  if (o.thinking_budget !== undefined && typeof o.thinking_budget !== "number")
    return false;
  return true;
}

// Tanketokens debiteras till output-pris. Klienten skickar normalt sitt eget
// tak; detta är skyddsnätet om fältet faller bort.
const THINKING_BUDGET_DEFAULT = 1024;
const THINKING_BUDGET_MAX = 8192;

/** Gemini-payloaden byggs separat så att tester kan verifiera att tanketaket
    aldrig faller bort igen — det var så här appläget blev långsamt. */
export function buildGeminiPayload(body: SummarizeBody) {
  const parts: unknown[] = [{ text: body.prompt }];
  if (body.audio_base64 && body.audio_mime) {
    parts.push({
      inlineData: { mimeType: body.audio_mime, data: body.audio_base64 },
    });
  }
  const budget = Math.min(
    Math.max(body.thinking_budget ?? THINKING_BUDGET_DEFAULT, 0),
    THINKING_BUDGET_MAX,
  );
  return {
    contents: body.contents ?? [{ parts }],
    generationConfig: {
      temperature: body.temperature ?? 0.4,
      maxOutputTokens: body.max_output_tokens ?? 16384,
      thinkingConfig: { thinkingBudget: budget },
    },
  };
}

/** Standardkedja när GEMINI_MODELS inte är satt. Ordning = fallande preferens. */
const DEFAULT_CHAIN = [
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
];

/** Läser modellkedjan ur konfigurationen. Tom eller osatt ⇒ standardkedjan. */
export function modelChain(configured?: string): string[] {
  const list = (configured || "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return list.length ? list : DEFAULT_CHAIN;
}

/**
 * Ska vi prova nästa modell i kedjan?
 *
 * Bara vid fel som beror på *modellen* — överbelastning eller att den dragits
 * in. INTE vid 429: den betyder slut på kvot eller krediter, och då hjälper
 * ingen annan modell. Att gå vidare där skulle bara tredubbla anropen mot ett
 * konto som redan sagt stopp.
 */
export function shouldTryNextModel(status: number): boolean {
  return status === 503 || status === 500 || status === 404;
}

/**
 * Call Google's Generative Language API with audio as inline data.
 * Returns the upstream response untouched so the caller can decide whether
 * to pass through or transform.
 */
export async function callGemini(
  apiKey: string,
  model: string,
  body: SummarizeBody,
): Promise<Response> {
  // Tre former stöds: färdig konversation (Q&A), prompt + ljud
  // (sammanfattning och transkribering) och enbart prompt (omformatering).
  const payload = buildGeminiPayload(body);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  return await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/**
 * Kör anropet mot modellkedjan. Faller vidare till nästa modell när den
 * aktuella är överbelastad eller borta, och returnerar annars svaret som det
 * är. Sista svaret returneras om ingen modell lyckades.
 */
export async function callGeminiWithFallback(
  apiKey: string,
  configuredModels: string | undefined,
  body: SummarizeBody,
): Promise<{ response: Response; model: string }> {
  const chain = modelChain(configuredModels);
  let last: Response | null = null;
  let lastModel = chain[0];

  for (const model of chain) {
    const response = await callGemini(apiKey, model, body);
    if (response.ok || !shouldTryNextModel(response.status)) {
      return { response, model };
    }
    // Läs ur kroppen så anslutningen kan återanvändas
    await response.text().catch(() => "");
    last = response;
    lastModel = model;
    console.warn("modell " + model + " svarade " + response.status + " — provar nästa");
  }
  return {
    response:
      last ??
      new Response(JSON.stringify({ error: "no_model_available" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      }),
    model: lastModel,
  };
}
