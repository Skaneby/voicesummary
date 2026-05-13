import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

// Google's JWKS for Sign-In ID tokens. jose caches keys in-memory per isolate
// with a 10-minute TTL by default — fine for our throughput, no Cache API
// machinery needed for v1.
const JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);

export interface GoogleClaims extends JWTPayload {
  sub: string;
  email?: string;
  email_verified?: boolean;
}

/**
 * Verify a Google ID token. Throws if the signature is invalid, the issuer
 * is wrong, the audience doesn't match our OAuth client, or the token is
 * expired. `sub` is the stable Google user identifier we use as our user PK.
 */
export async function verifyGoogleToken(
  token: string,
  clientId: string,
): Promise<GoogleClaims> {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: ["accounts.google.com", "https://accounts.google.com"],
    audience: clientId,
  });
  if (!payload.sub) throw new Error("token missing sub claim");
  return payload as GoogleClaims;
}
