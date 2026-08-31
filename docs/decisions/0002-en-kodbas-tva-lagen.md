# 0002 — En kodbas, två lägen

**Status:** antagen · 2026-08-31

## Problem

Grenarna `main` (gratis PWA) och `mobile-app` (betald app) hade glidit isär med
1 549 raders diff. Allt som byggts i webbversionen — Q&A mot mötet,
transkription, Kopiera mail, kalenderdialog, Bloggpost — saknades i appen.

Mätning visade dock att **84 % av appfilen var byte-identisk med webbfilen**.
Den verkligt plattformsspecifika koden var bara 12–15 %. Divergensen handlade
alltså inte om att produkterna är olika, utan om att den ena utvecklats vidare
efter en fork.

## Beslut

En enda `index.html` som upptäcker i runtime om den kör i Capacitor eller i en
webbläsare, och växlar läge därefter. Nya funktioner byggs en gång och hamnar i
båda produkterna.

## Varför det fungerar

Proxyn returnerar Geminis svar **oförändrat**, så svarsparsningen är redan
identisk. Bara *anropet* skiljer. Lägesskillnaden kan därför kapslas in på
fyra ställen i stället för att gå kors och tvärs genom koden:

1. anropet i `generate()`
2. gaten i `startRecording()`
3. inställningspanelen
4. skärmlistan

## Följder

- **Håll listan ovan kort.** Växer den byggs något i fel lager.
- `tests/smoke.js` måste täcka *båda* lägena — webbläge med mockad Gemini,
  appläge med mockad proxy och inloggning.
- Alternativen som valdes bort: frysa PWA:n (gratisversionen slutar utvecklas)
  och portera manuellt (varje funktion byggs två gånger, glidningen fortsätter).
