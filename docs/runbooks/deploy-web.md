# Runbook — deploya webbversionen

## Normalfall

```bash
git push origin main
```

GitHub Pages bygger och publicerar automatiskt. Live inom ungefär en minut på
https://skaneby.github.io/voicesummary/

## Före push

```bash
node tests/smoke.js       # ska vara helgrön
```

Ändrade du något som cachas (`manifest.json`, ikoner, `sw.js`)? Bumpa `CACHE`
högst upp i `sw.js`. `index.html` cachas aldrig — den hämtas network-first, så
den behöver ingen bump.

## Verifiera efteråt

Ladda om sidan och kontrollera att ändringen syns. Fastnar en användare på en
gammal version finns "Tvinga uppdatering" i inställningarna, som kallar
`registration.update()` och laddar om.

## Om det gått fel

Rulla tillbaka med en revert-commit och pusha — det finns ingen separat
deploy-pipeline att stoppa.

```bash
git revert <commit> && git push origin main
```
