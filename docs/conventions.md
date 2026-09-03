# Konventioner

## Kod

- **Inget byggsteg.** Vanilla HTML/CSS/JS. "Ändra en fil, pusha, klart."
- Skriv kod som liknar koden omkring — samma namngivning, kommentartäthet och
  idiom som filen du är i.
- Kommentarer förklarar **varför**, inte vad. Särskilt vid något som ser
  konstigt ut men är avsiktligt (keep-alive-oscillatorn, network-first-cachen).
- Minsta möjliga ingrepp. En ändring ska röra det den måste och inget mer.
- Ingen lathet: hitta grundorsaken, inga tillfälliga lappningar.

## Svenska

Allt användarsynligt är på svenska. Kod, kommentarer och commit-meddelanden är
blandat svenska/engelska — följ filen du är i. AI-prompterna i `PROMPTS` är på
engelska men instruerar modellen att svara på det språk användaren talar.

## Lagringsnycklar

Prefix `vs_`, från appens gamla namn "voicesummary". **Byt inte namn** —
befintliga användare tappar då sin API-nyckel och sin historik.

## Commits

Gemener, prefix, terse imperativ sammanfattning, ingen avslutande punkt:

```
feat: Bloggpost avslutas alltid med exakt 5 passande taggar
fix: kalenderdelning använder vald tid i stället för hårdkodad
docs: LLM-wiki under docs/
```

Prefix i bruk: `feat:`, `fix:`, `docs:`, `merge:`, `security:`, `rebrand:`.
Tankstreck används fritt.

## Tester

`tests/smoke.js` kör headless Chromium mot en lokal server och **mockar
Gemini-API:t** — inga riktiga anrop, ingen nyckel behövs.

```bash
node tests/smoke.js
```

Regler:

- En ny funktion utan test är inte klar.
- Ett format är inte tillagt förrän konsistenskontrollen `PROMPTS` ↔
  `STYLE_META` ↔ formatkort passerar.
- Testerna ska täcka **båda lägena** — webb (mockad Gemini) och app (mockad
  proxy och inloggning).

## Dokumentation

Ändrar du arkitekturen — uppdatera motsvarande fil i `docs/` i samma commit.
Fattar du ett beslut som någon kommer att ifrågasätta om ett halvår — skriv en
ADR i `docs/decisions/`. ADR:er redigeras inte i efterhand; de ersätts av en ny
som refererar den gamla.
