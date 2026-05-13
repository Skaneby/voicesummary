export interface SummarizeBody {
  prompt: string;
  audio_base64: string;
  audio_mime: string;
  audio_seconds: number;
}

export function isSummarizeBody(x: unknown): x is SummarizeBody {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.prompt === "string" &&
    typeof o.audio_base64 === "string" &&
    typeof o.audio_mime === "string" &&
    typeof o.audio_seconds === "number" &&
    o.audio_seconds >= 0
  );
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
  const payload = {
    contents: [
      {
        parts: [
          { text: body.prompt },
          {
            inlineData: {
              mimeType: body.audio_mime,
              data: body.audio_base64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 8192,
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  return await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}
