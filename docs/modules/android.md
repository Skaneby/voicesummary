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

`FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MICROPHONE` och `POST_NOTIFICATIONS`
används av förgrundstjänsten nedan.

## Förgrundstjänst under inspelning

`RecordingService.java` håller processen vid liv när skärmen släcks — utan den
fryser Android appen och inspelningen dör mitt i mötet. Tjänsten spelar inte in
något själv; den signalerar att mikrofonanvändning pågår och visar en notis med
en väg tillbaka in i appen.

`RecordingPlugin.java` är bron. Webbappen anropar den via
`recordingServiceStart()` / `recordingServiceStop()` i `index.html`, kopplade
till samma ställen som Wake Lock. **Allt är best-effort** — saknas plugin:et
eller kastar det ska inspelningen fungera ändå.

Plugin:et registreras i `MainActivity.onCreate()` *före* `super.onCreate()`.

**Att verifiera på enhet:**
- Syns notisen på Android 13+? `POST_NOTIFICATIONS` begärs inte i runtime än —
  utan medgivande kör tjänsten men notisen kan utebli.
- Notisikonen använder launcher-ikonen. Notisikoner ska egentligen vara vita
  silhuetter; byt till en egen om den ser tvättad ut.
- `FOREGROUND_SERVICE_MICROPHONE` utlöser ett deklarationsformulär i Play
  Console — motivera med att inspelning måste kunna fortsätta med släckt skärm.

## Fallgropar

- **Lagring:** `sessionStorage` överlever inte att appen dödas. Allt som ska
  finnas kvar mellan kallstarter måste till `localStorage` eller Capacitor
  Preferences — annars tvingas användaren logga in vid varje start.
- **Keep-alive-oscillatorn** i `index.html` finns för iOS. Verifiera att den
  inte stör ljudfokus eller batteri på Android.
- **CORS:** Workern tillåter `capacitor://localhost` och `https://localhost`.
  Ändras `androidScheme` måste allowlistan i `backend/src/index.ts` följa med.
