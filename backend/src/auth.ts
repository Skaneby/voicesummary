import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

// En JWKS per identitetsleverantör. jose cachar nycklarna i minnet per isolat
// med 10 minuters TTL — tillräckligt för vår volym.
const JWKS = {
  google: createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs")),
  apple: createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys")),
} as const;

const ISSUERS: Record<Provider, string[]> = {
  google: ["accounts.google.com", "https://accounts.google.com"],
  apple: ["https://appleid.apple.com"],
};

export type Provider = "google" | "apple";

export interface Claims extends JWTPayload {
  sub: string;
  email?: string;
  email_verified?: boolean;
}

export interface VerifiedUser {
  provider: Provider;
  claims: Claims;
  /**
   * Vårt användar-id. Namnrymdat per leverantör eftersom `sub` bara är unikt
   * inom en leverantör — utan prefix skulle samma person få två konton när hen
   * loggar in med Apple på iOS och Google på Android. Se
   * docs/decisions/0003-identitet-per-leverantor.md.
   */
  userId: string;
}

export function userIdFor(provider: Provider, sub: string): string {
  return provider + ":" + sub;
}

/** Läser `iss` utan att lita på den — bara för att välja vilken JWKS som ska pröva signaturen. */
export function providerFromToken(token: string): Provider | null {
  try {
    const payload = JSON.parse(
      atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    const iss = String(payload.iss || "");
    if (ISSUERS.google.includes(iss)) return "google";
    if (ISSUERS.apple.includes(iss)) return "apple";
  } catch {
    /* trasig token — faller igenom till null */
  }
  return null;
}

export interface AudienceConfig {
  google?: string;
  apple?: string;
}

/**
 * Verifierar en ID-token från någon av de konfigurerade leverantörerna.
 * Kastar om signaturen är ogiltig, utgivaren fel, mottagaren inte matchar
 * eller token har gått ut.
 */
export async function verifyToken(
  token: string,
  audiences: AudienceConfig,
): Promise<VerifiedUser> {
  const provider = providerFromToken(token);
  if (!provider) throw new Error("okänd tokenutgivare");
  const audience = audiences[provider];
  if (!audience) throw new Error(provider + " är inte konfigurerad");

  const { payload } = await jwtVerify(token, JWKS[provider], {
    issuer: ISSUERS[provider],
    audience,
  });
  if (!payload.sub) throw new Error("token saknar sub");
  const claims = payload as Claims;
  return { provider, claims, userId: userIdFor(provider, claims.sub) };
}
