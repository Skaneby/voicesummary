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
