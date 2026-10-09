# Lärdomar

## 2026-09-02 — Android bygger från en spegel, inte från roten

**Vad hände:** Ljudarkivet och satirskiljningen var committade i rotens
`index.html` men syntes inte i Android Studio. Orsak: appen buntar `www/`
(speglad vidare till `android/app/src/main/assets/public/`), och
`npm run android:sync` hade inte körts efter de två feature-commitarna.

**Regel:** Varje ändring i `index.html` som ska nå enheten kräver
`npm run android:sync` efteråt. Kör den som sista steg i varje session som
rört webbtillgångarna — och vid "syns inte i appen"-rapporter, kontrollera
först `diff index.html www/index.html`.

## 2026-09-02 — Urklipp kan inte fylla ämnesraden

**Vad hände:** "Kopiera mail" kopierade formaterad text men ämnesfältet i
mailet blev tomt. Inget urklippsformat kan fylla ämnesraden — enda vägen är
`mailto:?subject=`, som i sin tur inte klarar HTML-kropp eller långa texter.

**Regel:** Kombinera: kopiera kroppen till urklipp och öppna mailklienten
via ett ankarklick på `mailto:` med ämnet. Capacitor fångar schemat och
öppnar mailappen.

## 2026-09-02 — CSS-kirurgi med radbaserade script förstörde grundtemat

**Vad hände:** Vid borttagningen av temana raderade ett radbaserat python-
script fel rader — det klev in mitt i regler och slog ihop temanas
egenskaper med grundtemat, så hela designen försvann. Testerna fångade det
inte, eftersom de verifierar beteende, inte stilar.

**Regel:** Bulkändringar i CSS görs med en riktig parser (teckenbaserad
djupräkning, strängar och kommentarer hanterade), aldrig med radheuristik.
Efter varje CSS-ingrepp: kontrollera att klamrarna går jämnt ut OCH ta en
skärmdump via playwright — grön testsvit bevisar inte att designen lever.

## 2026-09-03 — Ett faktureringskonto per produkt

**Vad hände:** Projektet "EVFL fakturering" hamnade av misstag på Dianes
faktureringskonto. Prepaid-krediter dras av alla projekt på kontot, så ett
främmande projekt kan tömma Dianes saldo — och kreditstoppet 2026-09-01
drabbade alla användare utan förvarning.

**Regel:** Ett faktureringskonto per produkt — Diane-kontot betalar bara
`diane-prod-skaneby`. Vid kreditmysterier: kontrollera FÖRST vilka projekt
som ligger på kontot (console.cloud.google.com/billing/<id>/manage), sedan
förbrukning per projekt under reports. AI Studios "Projects using this
billing account" visar bara AI Studio-importerade projekt — Cloud Console
är facit.

## 2026-09-23 — En commit som bara hamnar på main når aldrig appen

**Vad hände:** En annan session pushade kostnadstaken (b2e332e, 5 sept) enbart
till `main`. Appgrenarna `mobile-app`/`web-app` saknade den i nästan tre veckor,
och eftersom Workern deployades manuellt låg taken dessutom odeployade.

**Regel:** Varje commit ska ut på alla tre grenarna (`main`, `mobile-app`,
`web-app`) — med fast-forward eller merge, aldrig force. Innan push: `git fetch`
och kontrollera att ingen gren har commits som saknas lokalt. Backend deployas
nu automatiskt från `main` via GitHub Actions, så "glömd deploy" är borta —
men bara om ändringen faktiskt når `main`.

## 2026-10-08 — Påstod ur minnet att drive.appdata ger "overifierad app"-varning

**Vad hände:** Runbooken och svaret till Johan sa att Drive-synken visar en
varning tills Google granskat `drive.appdata`. Googles Drive-dokumentation
klassar `drive.appdata` som *Non-sensitive* — ingen sådan varning.

**Regel:** Scope-klassning, granskningskrav och konsolvägar slås upp i Googles
aktuella dokumentation innan de skrivs i svar eller runbook — aldrig ur minnet.
Kontrollera också produktionsläget (deployments list, tabeller) innan man
säger vad som återstår; Johan kan ha gjort steget själv.

## 2026-10-09 — Ett användarfel gick inte att felsöka: inga fel sparas

**Vad hände:** En användare fick ett "tillfälligt fel" vid formatet
Politiskt brandtal i senaste versionen. Det fanns inget att läsa — D1 har
bara `users`, `subscription_events` och `grants`, misslyckade anrop räknas
inte, och Worker-loggar behålls inte. Jag gissade först på orsaker
(säkerhetsfilter) innan jag konstaterat att datan inte fanns.

**Regel:** Vid en felrapport från en användare: kontrollera FÖRST vilka
källor som faktiskt finns, och be sedan om exakt felmeddelande, skärmdump,
plattform och om "Försök igen" fungerade. Presentera hypoteser som
hypoteser. Kom ihåg att ett Gemini-svar blockerat av säkerhetsfilter kommer
som HTTP 200 — bara klienten ser felet.

## 2026-10-09 — CLAUDE.md hade ruttnat: radnummer och "ingen backend"

**Vad hände:** CLAUDE.md beskrev fortfarande en ren PWA utan backend, med
radnummer i en 2 170 raders `index.html` (nu ~4 600) och funktioner som
tagits bort (teman, wake lock, GitHub Issues).

**Regel:** CLAUDE.md pekar på kod med namn, aldrig radnummer, och hänvisar
till `docs/` för detaljer. Ändras arkitekturen uppdateras CLAUDE.md i samma
commit som `docs/` (regeln i docs/README.md).
