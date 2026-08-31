# Android

Capacitor-wrapper runt webbappen. Projekt: `android/`, konfiguration:
`capacitor.config.json`, byggskript i `package.json`.

## Snabbstart

```bash
npm install
npx cap sync android      # kopiera webbtillgångar + länka plugins
npm run android:open      # öppna i Android Studio
npm run android:debug     # assembleDebug
npm run android:build     # bundleRelease (AAB)
```

## Fakta

| | |
|---|---|
| Applikations-id | `se.skaneby.diane` |
| minSdk / targetSdk | 24 / 36 |
| Capacitor | 8.x |

## Plugins

| Plugin | Roll |
|---|---|
| `@capgo/capacitor-social-login` | Google-inloggning (och Apple på iOS) |
| `@revenuecat/purchases-capacitor` | prenumerationer, Play + StoreKit |

Inloggningen initieras i JS via `SocialLogin.initialize(...)` — **inte** via
`capacitor.config.json`. Ett `GoogleAuth`-block där hör till ett annat plugin
och är verkningslöst.

## Behörigheter (`android/app/src/main/AndroidManifest.xml`)

`INTERNET`, `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`, `WAKE_LOCK`.

`FOREGROUND_SERVICE_MICROPHONE` krävs för lång inspelning med släckt skärm —
utan den kan Android avbryta inspelningen.

## Fallgropar

- **Lagring:** `sessionStorage` överlever inte att appen dödas. Allt som ska
  finnas kvar mellan kallstarter måste till `localStorage` eller Capacitor
  Preferences — annars tvingas användaren logga in vid varje start.
- **Keep-alive-oscillatorn** i `index.html` finns för iOS. Verifiera att den
  inte stör ljudfokus eller batteri på Android.
- **CORS:** Workern tillåter `capacitor://localhost` och `https://localhost`.
  Ändras `androidScheme` måste allowlistan i `backend/src/index.ts` följa med.
