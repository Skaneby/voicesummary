# Klienten — `index.html`

Hela appen i en fil: markup, stilar och all JS. Inget byggsteg — öppna filen i
en webbläsare så fungerar den. Sektioner är märkta med `// ── AVSNITT ─`.

> **Pågående:** klienten finns just nu i två divergerade kopior — `index.html`
> på `main` (webb) och `www/index.html` på `mobile-app` (app). De slås ihop
> till en fil med lägesväxling i runtime. Se
> [../decisions/0002-en-kodbas-tva-lagen.md](../decisions/0002-en-kodbas-tva-lagen.md).

## Karta

| Avsnitt | Innehåll |
|---|---|
| `PROMPTS` | en post per format. Varje prompt ber Gemini upptäcka talat språk, svara på samma språk, returnera `TITLE:`-rad + HTML |
| `sanitizeHtml()` | vitlista-sanering av allt AI-genererat. **Obligatorisk** |
| state `s` | all körtidsstatus: inspelning, resultat, historik, inloggning |
| inspelning | `startRecording`, `stopRecording`, `togglePause`, vågform |
| Wake Lock + keep-alive | hindrar iOS från att suspendera sidan mitt i inspelning |
| `generate()` | anropet till Gemini eller proxyn — **enda lägesskillnaden i dataflödet** |
| `showResult()` | rendering, format-badge, Q&A-synlighet |
| export | `copyText`, `copyMarkdown`, `copyFormatted`, `share`, `toICS` |
| historik | `localStorage`, nyckel `vs_history`, max 40 poster |

## Format

Formaten definieras som nycklar i `PROMPTS` och renderas som kort i
`#formatRow`. Varje format behöver **tre** saker, annars är det halvfärdigt:

1. en post i `PROMPTS`
2. en post i `STYLE_META` (etikett + badge)
3. ett kort i `#formatRow`

Omformatterings-pillren byggs automatiskt från `STYLE_META`.
`tests/smoke.js` har en konsistenskontroll som fångar format som saknar
någon av delarna.

## Q&A ("Fråga om mötet")

Visas bara för formaten i `QA_STYLES` (säljmöte, protokoll, sammanfattning,
detaljerad). När ett resultat visas transkriberas inspelningen i bakgrunden
och sparas i minnet och i historiken, så att frågor kan besvaras mot hela
mötet i stället för bara sammanfattningen. Misslyckas transkriberingen faller
Q&A tyst tillbaka på resultattexten.

## Lagring

Alla nycklar har prefixet `vs_` (från appens gamla namn). **Byt inte namn** —
befintliga användare tappar då sina data.

`vs_key`, `vs_model`, `vs_style`, `vs_theme`, `vs_history`.
ID-token i appläget lagras separat och avsiktligt kortlivat.

## Fallgropar

- **Lägg inte till ett byggsteg.** Hela poängen är "ändra en fil, pusha, klart".
- **Cacha inte `index.html`.** Service workern hämtar den network-first så att
  uppdateringar når användarna direkt. Bumpa `CACHE` i `sw.js` när du ändrar
  tillgångar som *faktiskt* cachas.
- **Svenska gränssnittssträngar.** Ny användarsynlig text ska vara svensk.
- **iOS-inspelning är skör.** Wake Lock, keep-alive-oscillatorn och
  `visibilitychange`-återupptagningen är alla bärande. Ändra varsamt och testa
  på riktig iPhone med skärmen släckt.
