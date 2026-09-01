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
  return true;
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
  const parts: unknown[] = [{ text: body.prompt }];
  if (body.audio_base64 && body.audio_mime) {
    parts.push({
      inlineData: { mimeType: body.audio_mime, data: body.audio_base64 },
    });
  }

  const payload = {
    contents: body.contents ?? [{ parts }],
    generationConfig: {
      temperature: body.temperature ?? 0.4,
      maxOutputTokens: body.max_output_tokens ?? 8192,
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  return await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}
