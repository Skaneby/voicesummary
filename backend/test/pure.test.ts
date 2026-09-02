// Enhetstester för backendens rena funktioner — de som styr pengar och
// rättigheter. Kör: npm test (i backend/). Ingen databas, inga nätanrop.
import { test } from "node:test";
import assert from "node:assert/strict";
import { eventToUpdate } from "../src/webhook.ts";
import { checkEntitlement } from "../src/entitlement.ts";

const NOW = Math.floor(Date.now() / 1000);
const CAPS = { audio: 3600, summaries: 100 };

function user(over = {}) {
  return {
    id: "google:1", email: "a@b.c", rc_app_user_id: null,
    sub_active: 1, period_end: NOW + 86400, period_started: NOW - 86400,
    audio_seconds_used: 0, summaries_used: 0,
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

// Tanketaket är anledningen till att appläget en gång tog minuter på sig:
// utan thinkingConfig tänker Gemini 3.x dynamiskt tills svarsbudgeten är slut.
test("tanketaket sätts alltid — även när klienten inte skickar något", () => {
  const p = buildGeminiPayload({ prompt: "x", audio_seconds: 10 });
  assert.equal(p.generationConfig.thinkingConfig.thinkingBudget, 2048);
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
