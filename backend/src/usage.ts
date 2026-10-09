// Verklig AI-förbrukning — vad ett Gemini-anrop kostade och vad som ska
// räknas mot användarens tak.
//
// Taken skyddar ägarens Gemini-budget: användaren betalar en fast
// prenumeration, tokens betalas av Diane. Därför mäts förbrukningen här ur
// Geminis eget svar (`usageMetadata`) i stället för att lita på klienten.
// Ren modul utan I/O och utan importer, så att testerna kan ladda den direkt.

/** Googles docs: 32 tokens per sekund ljud. Används bara för att översätta
    till sekunder för ljudtaket — kostnaden sparas som tokens. */
export const AUDIO_TOKENS_PER_SECOND = 32;

/** Tokenloggen (`usage`) sparas i 13 månader — ett års jämförelse + marginal. */
export const USAGE_RETENTION_DAYS = 395;

export type CallKind = "summary" | "qa" | "reformat" | "transcribe";
const CALL_KINDS: readonly string[] = ["summary", "qa", "reformat", "transcribe"];

/**
 * Vilken sorts anrop klienten säger att det är. Saknas eller okänt räknas
 * det som en sammanfattning — så räknade äldre appversioner allt, och det är
 * det försiktiga valet för kostnaden.
 */
export function callKind(x: unknown): CallKind {
  return typeof x === "string" && CALL_KINDS.includes(x) ? (x as CallKind) : "summary";
}

export interface Tokens {
  audio: number;
  input: number;   // hela prompten, ljudet inräknat
  output: number;
  thought: number;
}

const count = (x: unknown) => (typeof x === "number" && x > 0 ? Math.round(x) : 0);

/** Läser `usageMetadata` ur ett Gemini-svar. Null om fältet saknas. */
export function readUsage(body: string): Tokens | null {
  let meta: any;
  try {
    meta = JSON.parse(body)?.usageMetadata;
  } catch {
    return null;
  }
  if (!meta || typeof meta !== "object") return null;
  const details: any[] = Array.isArray(meta.promptTokensDetails) ? meta.promptTokensDetails : [];
  const audio = details
    .filter((d) => d?.modality === "AUDIO")
    .reduce((sum, d) => sum + count(d?.tokenCount), 0);
  return {
    audio,
    input: count(meta.promptTokenCount),
    output: count(meta.candidatesTokenCount),
    thought: count(meta.thoughtsTokenCount),
  };
}

export interface UsageDelta {
  summaries: number;
  audioSeconds: number;
  tokens: number;
}

/**
 * Vad ett 200-svar ska räkna upp.
 *
 * - Sammanfattningar: bara nya inspelningar (`summary`), och bara när
 *   användaren faktiskt fick ett svar.
 * - Ljud och tokens: alltid — även blockerade och tomma svar har kostat.
 * - Klientens sekunder används bara om Gemini inte skickat `usageMetadata`.
 */
export function usageDelta(
  kind: CallKind,
  tokens: Tokens | null,
  clientSeconds: number,
  delivered: boolean,
): UsageDelta {
  return {
    summaries: kind === "summary" && delivered ? 1 : 0,
    audioSeconds: tokens
      ? Math.round(tokens.audio / AUDIO_TOKENS_PER_SECOND)
      : Math.max(0, Math.round(clientSeconds)),
    tokens: tokens ? tokens.input + tokens.output + tokens.thought : 0,
  };
}
