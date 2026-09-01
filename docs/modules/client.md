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

Omformatterings-pillren byggs automatiskt från `STYLE_META`, och hjälprutan
från `FORMAT_HELP` — varje format måste ha en hjälptext där.
`tests/smoke.js` har konsistenskontroller som fångar format som saknar någon
av delarna.

### Sakliga format och satirformat

Sex format är satir: `insandare`, `psyk`, `tal`, `predikan`, `drama`,
`konspiration`. De är märkta `fun: true` i `STYLE_META` och **dolda som
standard** — Diane används på riktiga möten, och en psykiatrisk "utredning"
bredvid ett mötesprotokoll inbjuder till missförstånd. Användaren slår på dem
medvetet under Inställningar → Humorformat (`vs_fun`).

Resultat från ett satirformat får alltid en synlig varning ovanför texten.
`psyk` och `konspiration` har egna, skarpare formuleringar via `warn` i
`STYLE_META` — en påhittad diagnos med ordination är det som lättast kan
missförstås.

## Q&A ("Fråga om mötet")

Visas bara för formaten i `QA_STYLES` (säljmöte, protokoll, sammanfattning,
detaljerad). När ett resultat visas transkriberas inspelningen i bakgrunden
och sparas i minnet och i historiken, så att frågor kan besvaras mot hela
mötet i stället för bara sammanfattningen. Misslyckas transkriberingen faller
Q&A tyst tillbaka på resultattexten.

## Lagring

Alla nycklar har prefixet `vs_` (från appens gamla namn). **Byt inte namn** —
befintliga användare tappar då sina data.

### Ljudarkivet

Ljudfiler får inte plats i `localStorage`, så de ligger i **IndexedDB**
(`diane_audio` / `recordings`), nycklade på samma id som historikposten.
De **tio senaste** behålls; äldre gallras av `pruneAudio()`.

Ljudet sparas i början av `process()`, alltså *före* API-anropet — går
analysen fel ska inspelningen ändå finnas kvar.

Allt i lagret är best-effort och sväljer fel: privat läge eller full disk får
aldrig stoppa en inspelning från att sammanfattas.

Användaren ser arkivet under Inställningar och kan dela enskilda filer via
systemets delningsmeny eller radera dem. **Filerna lämnar aldrig enheten av
sig själva** — det står så i `privacy.html`, och det får inte ändras utan att
policyn skrivs om.

Observera att omformatering (`reformatAs`) använder **resultattexten**, inte
ljudet. Den fungerar därför även på gamla poster där ljudet är gallrat.

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
