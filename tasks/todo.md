# Backlog

## SENARE: "Fråga om mötet" + uppläsning av svar
> Status: planerad, ej påbörjad — genomförs vid senare tillfälle.

## Idé
Efter att en inspelning gett ett resultat i formaten **säljmöte, protokoll,
sammanfattning eller detaljerad** ska användaren kunna ställa frågor om mötet
i en chatt under resultatet och få svaren upplästa med röst.

## Arkitektur

### Datakälla för svaren (tvåstegsstrategi)
- **Steg A — textbaserad Q&A (MVP):** Frågor besvaras mot `s.resultText`
  (redan lagrad ren text av resultatet). Fungerar alltid, även för resultat
  öppnade från historiken. Ingen ljuduppladdning, snabbt och gratis.
- **Steg B — djup Q&A mot ljudet:** Om `s.blob` finns kvar i minnet (samma
  session) skickas ljudet med första frågan, och Gemini ombeds samtidigt
  returnera en transkription som cachas i `s.transcript`. Följdfrågor går
  sedan mot transkriptionen (text, billigt). Svarar då även på sådant som
  inte kom med i protokollet.

### Q&A-flöde
1. Ny funktion `askQuestion(question)` — bygger en flervändig `contents`-array
   (systemkontext + tidigare frågor/svar i `s.qaHistory`) och anropar samma
   `generateContent`-endpoint som idag, med samma fallback-kedja
   (`MODEL_FALLBACK`) och felhantering som `generateFromText()`.
2. Prompt: "Svara kort och konkret på frågan utifrån mötesunderlaget nedan.
   Svara på samma språk som frågan. Om svaret inte finns i underlaget, säg det."
3. Svar renderas som ren text (inte HTML) — enklare, säkert utan sanering,
   och direkt användbart för uppläsning.

### UI
- Ny sektion `#qaSection` under `#resultBox`: textfält ("Fråga om mötet…"),
  skicka-knapp, chattbubblor (fråga höger, svar vänster), 🔊-knapp per svar
  samt ⏹ för att stoppa uppläsning.
- Visas endast när `s.style` ∈ `['sales','protocol','summary','detailed']`
  (styrs i `showResult()` via en `QA_STYLES`-konstant).
- Q&A-historiken ligger i minnet per resultat (`s.qaHistory`), nollställs när
  nytt resultat visas. Sparas inte i localStorage i v1 (håller lagringen ren).

### Uppläsning (röst)
- **Steg A — Web Speech API (MVP, 0 kr):** `speechSynthesis` med svensk röst
  (`sv-SE`, fallback till svarets språk). Inbyggt i alla moderna webbläsare,
  ingen API-kostnad, fungerar offline.
  - iOS-fallgropar: uppläsning måste startas av en användargest (🔊-knappen
    uppfyller det), långa texter chunkas per mening, `speechSynthesis.pause`
    beter sig olika — testas på riktig iPhone.
- **Steg B — Gemini TTS (tillval i Inställningar):** `gemini-3.5-flash-tts`
  ger mycket naturligare röst. Returnerar PCM/WAV som spelas via Web Audio.
  Kräver i praktiken fakturering — därför opt-in, aldrig default.

### Övrigt
- Nya UI-texter på svenska. Inga nya lagringsnycklar behövs i v1
  (ev. `vs_tts`-inställning i steg B — behåller `vs_`-prefixet).
- Bumpa `CACHE` i sw.js vid release.
- Smoke-test utökas: Q&A-sektionens synlighet per format, mockat Q&A-svar,
  flervändig historik, fallback-kedjan även för `askQuestion()`.

## Kostnad

### Med gratisnyckel (dagens upplägg) — 0 kr
- Varje fråga är ett vanligt `generateContent`-anrop och ryms i samma fria
  kvot som appen redan använder (ca 15 förfrågningar/min, ~1500/dag för
  flash-modellerna). Q&A på text är dessutom mycket "billigare" mot kvoten
  än ljuduppladdningar.
- Web Speech-uppläsning sker helt i webbläsaren: **0 kr, obegränsat.**

### Med fakturering aktiverad (ungefärliga listpriser, juli 2026)
Gemini 3.5 Flash: ~$1,50/M input-tokens, ~$9/M output-tokens.
- **Textfråga mot protokoll/transkription:** ett 30-min möte ≈ 8–10k tokens
  underlag + kort svar ⇒ ca **$0,02 ≈ 0,2 kr per fråga**.
- **Första frågan med ljud (steg B):** 30 min ljud ≈ 57 600 tokens
  (32 tokens/s) ⇒ ca **$0,10 ≈ 1 kr engångskostnad**, därefter textpris.
- **Gemini TTS (steg B, tillval):** ~$6/M output-tokens, tal ≈ 25 tokens/s
  ⇒ ca **$0,01 ≈ 0,1 kr per minut uppläst svar**. (TTS saknar tydlig
  gratisnivå — därav Web Speech som default.)

Typisk användare med gratisnyckel: hela funktionen kostar 0 kr.
Storanvändare med fakturering: ett möte med 10 frågor + uppläsning ≈ 2–3 kr.

## Genomförande (checklista)
- [ ] `QA_STYLES`-konstant + visa/dölj `#qaSection` i `showResult()`
- [ ] Chatt-UI (markup + CSS i befintliga teman)
- [ ] `askQuestion()` med flervändig historik + befintlig fallback-kedja
- [ ] Web Speech-uppläsning med chunkning + stoppknapp
- [ ] iOS-test (gest-krav, långa svar)
- [ ] Utöka smoke-testet
- [ ] Bumpa SW-cache, push till main
- [ ] (Steg B, separat release) ljud-fråga + transkriptionscache
- [ ] (Steg B, separat release) Gemini TTS som opt-in i Inställningar

## Review
_(fylls i efter implementation)_
