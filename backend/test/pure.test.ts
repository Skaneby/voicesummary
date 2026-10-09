// Enhetstester för backendens rena funktioner — de som styr pengar och
// rättigheter. Kör: npm test (i backend/). Ingen databas, inga nätanrop.
import { test } from "node:test";
import assert from "node:assert/strict";
import { eventToUpdate } from "../src/webhook.ts";
import { checkEntitlement, isAdmin } from "../src/entitlement.ts";

const NOW = Math.floor(Date.now() / 1000);
const CAPS = { audio: 3600, summaries: 100, tokens: 1_000_000 };

function user(over = {}) {
  return {
    id: "google:1", email: "a@b.c", rc_app_user_id: null,
    sub_active: 1, period_end: NOW + 86400, period_started: NOW - 86400,
    audio_seconds_used: 0, summaries_used: 0, tokens_used: 0,
    created_at: NOW, updated_at: NOW, deleted_at: null,
    ...over,
  } as any;
}
function ev(type: string, over = {}) {
  return { type, id: "e1", app_user_id: "google:1",
    purchased_at_ms: NOW * 1000, expiration_at_ms: (NOW + 86400) * 1000, ...over } as any;
}

test("köp och förnyelse aktiverar prenumerationen", () => {
  for (const t of ["INITIAL_PURCHASE", "RENEWAL", "UNCANCELLATION", "PRODUCT_CHANGE", "SUBSCRIPTION_EXTENDED"]) {
    const u = eventToUpdate(ev(t));
    assert.equal(u?.sub_active, 1, t + " ska aktivera");
  }
});

test("förnyelse och nyköp nollställer kvoten, förlängning gör det inte", () => {
  assert.equal(eventToUpdate(ev("RENEWAL"))?.resetUsage, true);
  assert.equal(eventToUpdate(ev("INITIAL_PURCHASE"))?.resetUsage, true);
  assert.equal(eventToUpdate(ev("SUBSCRIPTION_EXTENDED"))?.resetUsage, false);
});

test("uppsägning stänger INTE av direkt — perioden ska löpa ut först", () => {
  assert.equal(eventToUpdate(ev("CANCELLATION")), null);
});

test("utgång, betalproblem och återbetalning stänger av", () => {
  for (const t of ["EXPIRATION", "BILLING_ISSUE", "REFUND", "SUBSCRIPTION_PAUSED"]) {
    assert.equal(eventToUpdate(ev(t))?.sub_active, 0, t + " ska stänga av");
  }
});

test("testhändelser ändrar ingenting", () => {
  assert.equal(eventToUpdate(ev("TEST")), null);
});

test("aktiv prenumerant släpps igenom", () => {
  assert.deepEqual(checkEntitlement(user(), CAPS), { allowed: true });
});

test("raderad, obetald och utgången nekas med rätt orsak", () => {
  assert.equal(checkEntitlement(user({ deleted_at: NOW }), CAPS).reason, "deleted");
  assert.equal(checkEntitlement(user({ sub_active: 0 }), CAPS).reason, "not_subscribed");
  assert.equal(checkEntitlement(user({ period_end: NOW - 10 }), CAPS).reason, "expired");
});

test("kvotgränserna håller — annars äts marginalen upp", () => {
  assert.equal(checkEntitlement(user({ audio_seconds_used: 3600 }), CAPS).reason, "audio_cap_reached");
  assert.equal(checkEntitlement(user({ summaries_used: 100 }), CAPS).reason, "summary_cap_reached");
  assert.equal(checkEntitlement(user({ summaries_used: 99 }), CAPS).allowed, true);
});

test("prenumeration utan slutdatum betraktas som aktiv", () => {
  assert.equal(checkEntitlement(user({ period_end: null }), CAPS).allowed, true);
});

// ── TRANSFER: prenumerationen flyttas mellan identiteter ───────────────────
import { transferPlan, isRevenueCatWebhookBody } from "../src/webhook.ts";

test("överföring pekar ut vem som förlorar och vem som tar över", () => {
  const p = transferPlan(ev("TRANSFER", {
    transferred_from: ["google:1"], transferred_to: ["apple:2"],
  }));
  assert.deepEqual(p, { from: ["google:1"], to: "apple:2" });
});

test("överföring till sig själv ger inget att flytta bort", () => {
  const p = transferPlan(ev("TRANSFER", {
    transferred_from: ["google:1"], transferred_to: ["google:1"],
  }));
  assert.deepEqual(p, { from: [], to: "google:1" });
});

test("överföring utan mottagare ignoreras", () => {
  assert.equal(transferPlan(ev("TRANSFER", { transferred_to: [] })), null);
  assert.equal(transferPlan(ev("TRANSFER")), null);
});

test("andra händelser är inte överföringar", () => {
  assert.equal(transferPlan(ev("RENEWAL")), null);
});

test("TRANSFER accepteras utan app_user_id", () => {
  assert.equal(isRevenueCatWebhookBody({
    event: { type: "TRANSFER", transferred_to: ["apple:2"] },
  }), true);
  assert.equal(isRevenueCatWebhookBody({
    event: { type: "RENEWAL" },
  }), false, "vanliga händelser kräver fortfarande app_user_id");
});

// ── Modellkedjan: överbelastning ska inte stoppa användaren ────────────────
import { modelChain, shouldTryNextModel, buildGeminiPayload } from "../src/gemini.ts";
import { isOriginAllowed } from "../src/cors.ts";

test("CORS: webbversionen och apparnas origins släpps in, främmande nekas", () => {
  assert.equal(isOriginAllowed("https://skaneby.github.io"), true);
  assert.equal(isOriginAllowed("capacitor://localhost"), true);
  assert.equal(isOriginAllowed("http://localhost:8000"), true);
  assert.equal(isOriginAllowed("https://evil.com"), false);
  assert.equal(isOriginAllowed("https://skaneby.github.io.evil.com"), false);
});

// Tanketaket är anledningen till att appläget en gång tog minuter på sig:
// utan thinkingConfig tänker Gemini 3.x dynamiskt tills svarsbudgeten är slut.
test("tanketaket sätts alltid — även när klienten inte skickar något", () => {
  const p = buildGeminiPayload({ prompt: "x", audio_seconds: 10 });
  assert.equal(p.generationConfig.thinkingConfig.thinkingBudget, 1024);
  assert.equal(p.generationConfig.maxOutputTokens, 16384);
});

test("klientens tanketak följer med och klampas till rimliga gränser", () => {
  const a = buildGeminiPayload({ prompt: "x", audio_seconds: 0, thinking_budget: 1024 });
  assert.equal(a.generationConfig.thinkingConfig.thinkingBudget, 1024);
  const b = buildGeminiPayload({ prompt: "x", audio_seconds: 0, thinking_budget: 999999 });
  assert.equal(b.generationConfig.thinkingConfig.thinkingBudget, 8192);
  const c = buildGeminiPayload({ prompt: "x", audio_seconds: 0, thinking_budget: -5 });
  assert.equal(c.generationConfig.thinkingConfig.thinkingBudget, 0);
});

test("ljudet hamnar som inlineData bredvid prompten", () => {
  const p = buildGeminiPayload({ prompt: "sammanfatta", audio_seconds: 5, audio_base64: "QUJD", audio_mime: "audio/webm" });
  const parts = (p.contents as { parts: unknown[] }[])[0].parts;
  assert.equal(parts.length, 2);
  assert.deepEqual(parts[1], { inlineData: { mimeType: "audio/webm", data: "QUJD" } });
});

test("kedjan faller tillbaka på standard när inget är satt", () => {
  assert.deepEqual(modelChain(undefined), ["gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite"]);
  assert.deepEqual(modelChain(""), modelChain(undefined));
  assert.deepEqual(modelChain("  ,  "), modelChain(undefined));
});

test("konfigurerad kedja läses i ordning och tål blanksteg", () => {
  assert.deepEqual(modelChain("a, b ,c"), ["a", "b", "c"]);
});

test("en enda modell är en giltig kedja", () => {
  assert.deepEqual(modelChain("gemini-3.6-flash"), ["gemini-3.6-flash"]);
});

test("överbelastad eller borttagen modell ⇒ prova nästa", () => {
  assert.equal(shouldTryNextModel(503), true, "överbelastad");
  assert.equal(shouldTryNextModel(500), true, "internt fel");
  assert.equal(shouldTryNextModel(404), true, "modellen borta");
});

test("slut på krediter ⇒ prova INTE nästa, det hjälper inte", () => {
  assert.equal(shouldTryNextModel(429), false);
});

test("lyckade svar och klientfel går inte vidare i kedjan", () => {
  assert.equal(shouldTryNextModel(200), false);
  assert.equal(shouldTryNextModel(400), false);
  assert.equal(shouldTryNextModel(401), false);
});

test("admin: exakt id släpps in, inget prefix-match", () => {
  assert.equal(isAdmin({ userId: "google:1" }, "google:1"), true);
  assert.equal(isAdmin({ userId: "google:1" }, " apple:9 , google:1 "), true);
  assert.equal(isAdmin({ userId: "google:12" }, "google:1"), false);
  assert.equal(isAdmin({ userId: "google:1" }, undefined), false);
  assert.equal(isAdmin({ userId: "google:1" }, ""), false);
});

test("admin: e-post räknas bara om leverantören intygat den", () => {
  const list = "Agare@Example.se";
  assert.equal(isAdmin({ userId: "google:5", email: "agare@example.se", emailVerified: true }, list), true, "skiftlägesokänslig");
  assert.equal(isAdmin({ userId: "google:5", email: "agare@example.se", emailVerified: false }, list), false, "ointygad e-post");
  assert.equal(isAdmin({ userId: "google:5", email: "agare@example.se" }, list), false, "saknar intyg");
  assert.equal(isAdmin({ userId: "google:5", email: "annan@example.se", emailVerified: true }, list), false);
});

// ── Inbjudningar: gratis åtkomst i 10 dagar eller för alltid ───────────────
import { normalizeEmail, isValidEmail, isGrantDuration, expiryFor, grantActive, usageWindowExpired, USAGE_WINDOW_SECONDS } from "../src/grants.ts";

const grant = (expires_at: number | null) => ({ email: "a@b.se", expires_at, note: null, created_by: "admin@b.se", created_at: NOW });

test("e-post normaliseras och rimlighetskontrolleras", () => {
  assert.equal(normalizeEmail("  Anna@Exempel.SE "), "anna@exempel.se");
  assert.equal(isValidEmail("anna@exempel.se"), true);
  assert.equal(isValidEmail("anna@exempel"), false);
  assert.equal(isValidEmail("anna exempel.se"), false);
  assert.equal(isValidEmail(""), false);
});

test("bara 10d och forever är giltiga varaktigheter", () => {
  assert.equal(isGrantDuration("10d"), true);
  assert.equal(isGrantDuration("forever"), true);
  assert.equal(isGrantDuration("30d"), false);
  assert.equal(isGrantDuration(undefined), false);
});

test("10 dagar ger utgång om 10 dygn, för alltid ger ingen utgång", () => {
  assert.equal(expiryFor("10d", NOW), NOW + 10 * 86400);
  assert.equal(expiryFor("forever", NOW), null);
});

test("inbjudan gäller till utgången, för alltid gäller alltid, saknad gäller inte", () => {
  assert.equal(grantActive(grant(NOW + 60), NOW), true);
  assert.equal(grantActive(grant(NOW - 1), NOW), false);
  assert.equal(grantActive(grant(null), NOW), true);
  assert.equal(grantActive(null, NOW), false);
});

test("kvotfönstret för inbjudna nollställs efter 30 dagar", () => {
  assert.equal(usageWindowExpired({ period_started: null }, NOW), true, "inget fönster ännu");
  assert.equal(usageWindowExpired({ period_started: NOW - 86400 }, NOW), false);
  assert.equal(usageWindowExpired({ period_started: NOW - USAGE_WINDOW_SECONDS }, NOW), true);
});

test("inbjuden användare stoppas av samma kvottak som betalande", () => {
  // Så ser användaren ut efter withGrant(): sub_active=1, period_end=inbjudans utgång
  assert.equal(checkEntitlement(user({ period_end: null, summaries_used: 29 }), { audio: 10800, summaries: 30 }).allowed, true);
  assert.equal(checkEntitlement(user({ period_end: null, summaries_used: 30 }), { audio: 10800, summaries: 30 }).reason, "summary_cap_reached");
});

// ── Felloggning ──────────────────────────────────────────────────────────────
import { classifyGeminiBody, parseClientError, upstreamMessage, clip, isShortKey } from "../src/errors.ts";
import { isSummarizeBody } from "../src/gemini.ts";

const ok = (text: string, finishReason = "STOP") =>
  JSON.stringify({ candidates: [{ finishReason, content: { parts: [{ text }] } }] });

test("ett vanligt svar klassas inte som fel", () => {
  assert.equal(classifyGeminiBody(ok("TITLE: X\n<article></article>")), null);
});

test("200-svar som egentligen är fel fångas", () => {
  // Säkerhetsfiltret stoppar prompten — inga candidates alls
  assert.deepEqual(
    classifyGeminiBody(JSON.stringify({ promptFeedback: { blockReason: "PROHIBITED_CONTENT" } })),
    { kind: "blocked", message: "prompt: PROHIBITED_CONTENT" },
  );
  assert.equal(classifyGeminiBody(ok("x", "SAFETY"))?.kind, "blocked");
  assert.equal(classifyGeminiBody(ok("x", "RECITATION"))?.kind, "blocked");
  assert.equal(classifyGeminiBody(ok("x", "MAX_TOKENS"))?.kind, "max_tokens");
  assert.equal(classifyGeminiBody(ok("   "))?.kind, "empty");
  assert.equal(classifyGeminiBody(JSON.stringify({ candidates: [] }))?.kind, "empty");
  assert.equal(classifyGeminiBody("<html>")?.kind, "invalid_response");
});

test("bara tankedelar räknas som tomt svar", () => {
  const body = JSON.stringify({ candidates: [{ finishReason: "STOP",
    content: { parts: [{ text: "tänker…", thought: true }] } }] });
  assert.equal(classifyGeminiBody(body)?.kind, "empty");
});

test("Geminis felmeddelande plockas ur felkroppen", () => {
  assert.equal(upstreamMessage(JSON.stringify({ error: { message: "overloaded" } })), "overloaded");
  assert.equal(upstreamMessage("Bad Gateway"), "Bad Gateway");
});

test("klientfel valideras och kortas", () => {
  const good = parseClientError({ kind: "network", message: "x".repeat(900), format: "tal", platform: "android", app_version: "1.0", status: 503 });
  assert.equal(good?.message.length, 500);
  assert.equal(good?.format, "tal");
  assert.equal(parseClientError({ kind: "network" }), null, "meddelande krävs");
  assert.equal(parseClientError({ kind: "har mellanslag", message: "x" }), null);
  // Konstiga valfria fält släpps — raden sparas ändå
  const odd = parseClientError({ kind: "a", message: "x", format: "<script>", status: "503" });
  assert.equal(odd?.message, "x");
  assert.equal(odd?.format, undefined);
  assert.equal(odd?.status, undefined);
  assert.equal(parseClientError(null), null);
});

test("clip trimmar, kortar och gör tomt till null", () => {
  assert.equal(clip("  abc  ", 2), "ab");
  assert.equal(clip("   ", 10), null);
  assert.equal(clip(undefined, 10), null);
});

test("ett konstigt format fäller aldrig sammanfattningen", () => {
  const base = { prompt: "p", audio_seconds: 1 };
  for (const format of ["tal", undefined, "a b", 1, "<x>"])
    assert.equal(isSummarizeBody({ ...base, format }), true, String(format));
  // …men det loggas inte heller
  assert.equal(isShortKey("tal"), true);
  assert.equal(isShortKey("a b"), false);
  assert.equal(isShortKey(1), false);
});

test("format skickas aldrig vidare till Gemini", () => {
  const payload = buildGeminiPayload({ prompt: "p", audio_seconds: 1, format: "tal" });
  assert.equal(JSON.stringify(payload).includes('"format"'), false);
});

// ── Kostnadsskydd: verklig förbrukning ──────────────────────────────────────
import { callKind, readUsage, usageDelta } from "../src/usage.ts";

const geminiBody = (meta: object | undefined) =>
  JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "x" }] } }], usageMetadata: meta });

test("tokens läses per typ ur usageMetadata", () => {
  const t = readUsage(geminiBody({
    promptTokenCount: 3900, candidatesTokenCount: 800, thoughtsTokenCount: 1024,
    promptTokensDetails: [{ modality: "TEXT", tokenCount: 60 }, { modality: "AUDIO", tokenCount: 3840 }],
  }));
  assert.deepEqual(t, { audio: 3840, input: 3900, output: 800, thought: 1024 });
});

test("saknad eller trasig usageMetadata ger null", () => {
  assert.equal(readUsage(geminiBody(undefined)), null);
  assert.equal(readUsage("inte json"), null);
});

test("konstiga tokenvärden blir 0, inte NaN", () => {
  const t = readUsage(geminiBody({ promptTokenCount: "många", candidatesTokenCount: -5 }));
  assert.deepEqual(t, { audio: 0, input: 0, output: 0, thought: 0 });
});

test("ljudtiden mäts av servern — klientens siffra ignoreras", () => {
  const tokens = { audio: 32 * 120, input: 4000, output: 500, thought: 1000 };
  // En ändrad klient som påstår 0 sekunder får ändå 120 s räknade
  assert.equal(usageDelta("summary", tokens, 0, true).audioSeconds, 120);
  assert.equal(usageDelta("summary", tokens, 0, true).tokens, 5500);
});

test("klientens sekunder används bara när Gemini inte rapporterat", () => {
  assert.equal(usageDelta("summary", null, 90, true).audioSeconds, 90);
  assert.equal(usageDelta("summary", null, -3, true).audioSeconds, 0);
});

test("bara nya inspelningar räknas som sammanfattning", () => {
  const t = { audio: 0, input: 100, output: 100, thought: 0 };
  assert.equal(usageDelta("summary", t, 0, true).summaries, 1);
  for (const k of ["qa", "reformat", "transcribe"] as const)
    assert.equal(usageDelta(k, t, 0, true).summaries, 0, k);
});

test("blockerat svar: tokens räknas, sammanfattningen inte", () => {
  const d = usageDelta("summary", { audio: 320, input: 400, output: 0, thought: 50 }, 0, false);
  assert.equal(d.summaries, 0);
  assert.equal(d.tokens, 450);
  assert.equal(d.audioSeconds, 10);
});

test("okänt eller saknat kind räknas som sammanfattning (äldre appar)", () => {
  assert.equal(callKind(undefined), "summary");
  assert.equal(callKind("gratis"), "summary");
  assert.equal(callKind("qa"), "qa");
});

test("tokentaket stoppar när det nås", () => {
  assert.deepEqual(checkEntitlement(user({ tokens_used: 999_999 }), CAPS), { allowed: true });
  assert.deepEqual(checkEntitlement(user({ tokens_used: 1_000_000 }), CAPS),
    { allowed: false, reason: "token_cap_reached" });
});

test("rad utan tokens_used (före migrering) spärras inte", () => {
  assert.deepEqual(checkEntitlement(user({ tokens_used: undefined }), CAPS), { allowed: true });
});
