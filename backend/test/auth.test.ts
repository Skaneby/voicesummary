// Identitetslogiken — den som avgör om samma person får ett eller två konton.
import { test } from "node:test";
import assert from "node:assert/strict";
import { userIdFor, providerFromToken } from "../src/auth.ts";

function tokenWith(iss: string) {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return "hdr." + b64({ iss, sub: "123" }) + ".sig";
}

test("användar-id namnrymdas per leverantör", () => {
  assert.equal(userIdFor("google", "123"), "google:123");
  assert.equal(userIdFor("apple", "123"), "apple:123");
});

test("samma sub hos olika leverantörer krockar inte", () => {
  assert.notEqual(userIdFor("google", "123"), userIdFor("apple", "123"));
});

test("leverantör härleds ur utgivaren", () => {
  assert.equal(providerFromToken(tokenWith("https://accounts.google.com")), "google");
  assert.equal(providerFromToken(tokenWith("accounts.google.com")), "google");
  assert.equal(providerFromToken(tokenWith("https://appleid.apple.com")), "apple");
});

test("okänd eller trasig utgivare avvisas", () => {
  assert.equal(providerFromToken(tokenWith("https://evil.example.com")), null);
  assert.equal(providerFromToken("inte-en-token"), null);
  assert.equal(providerFromToken(""), null);
});
