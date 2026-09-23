# Runbook — släppa en ny version av Diane

Diane levereras på tre vägar. Bara webben går live av sig själv; appen kräver
ett aktivt beslut, och backend deployas automatiskt från `main`.

| Del | Hur en ändring når användarna |
|---|---|
| Webben (skaneby.github.io) | Push till `main` → GitHub Pages, ca en minut |
| Backend (Cloudflare Worker) | Push till `main` som rör `backend/` → GitHub Action deployar |
| Android-appen | `npm run release -- X.Y.Z` → ladda upp AAB:n i Play Console |

Appen bär `index.html` inbakad (inget `server.url` i `capacitor.config.json`),
så en push till GitHub ändrar **inte** appen på användarnas telefoner.

## Engångssteg 1 — signeringsnyckeln

```
sh scripts/create-upload-key.sh
```

Frågar efter ett lösenord, skapar nyckeln i `~/.diane-signing/diane-upload.jks`
(utanför repot) och skriver `android/keystore.properties` (gitignored).

**Säkerhetskopiera direkt:** lösenordet i lösenordshanteraren, `.jks`-filen på
en andra plats. Välj **Play App Signing** när appen skapas i Play Console — då
förvarar Google själva appsigneringsnyckeln, och en förlorad
uppladdningsnyckel kan återställas via Googles support.

Nyckeln och `keystore.properties` får aldrig checkas in.

## Engångssteg 2 — automatisk Worker-deploy

1. Cloudflare → My Profile → API Tokens → Create Token → mallen
   **Edit Cloudflare Workers**. Lägg till **D1 → Read** (Workern har en
   D1-bindning). Begränsa till ditt konto.
2. Lägg in token som repo-secret (frågar efter värdet, hamnar inte i historiken):
   ```
   gh secret set CLOUDFLARE_API_TOKEN -R Skaneby/voicesummary
   ```
3. Provkör: GitHub → Actions → Deploy Worker → Run workflow, eller
   `gh workflow run deploy-worker.yml && gh run watch`.

Workflowen kör backendtester och typkontroll före deploy, och en
hälsokontroll efteråt. Workerns egna hemligheter (Gemini-nyckel,
webhook-hemlighet) ligger i Cloudflare och påverkas inte.

Manuell deploy fungerar fortfarande: `cd backend && npx wrangler deploy`.

## Släppa en appversion

Från grenen `mobile-app`, rent träd, i synk med GitHub:

```
npm run release -- 1.0.0 --dry-run   # prova: bygger och verifierar, ändrar inget
npm run release -- 1.0.0             # skarpt
```

Skriptet ([scripts/release.sh](../../scripts/release.sh)) gör i ordning:

1. Förkontroller — semver, högre än nuvarande, taggen fri, rätt gren, rent
   träd, i synk med origin, nyckelfilen finns.
2. Klient- och backendtester.
3. `versionName` → X.Y.Z och `versionCode` +1 i `android/app/build.gradle`
   (Play kräver ett högre `versionCode` för varje uppladdning).
4. `npm run android:sync`.
5. `./gradlew bundleRelease` — väljer själv en JDK 21+.
6. Verifierar signaturen och kopierar AAB:n till
   `releases/diane-vX.Y.Z-<versionCode>.aab` (gitignored).
7. Commit `release: vX.Y.Z`, git-tagg `vX.Y.Z`, push — och fast-forward av
   `main` och `web-app` (aldrig force).

Ladda sedan upp AAB:n i Play Console (Test and release → spår → Create new
release).

**Vilken kod ligger i Play?** `git show vX.Y.Z` — taggen pekar exakt på
koden i det bygget.

## Grenarna

`main`, `mobile-app` och `web-app` hålls på samma commit. Commits som bara
hamnar på en gren saknas på de andra — se tasks/lessons.md (2026-09-23).
