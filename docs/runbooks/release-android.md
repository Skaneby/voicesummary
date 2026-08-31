# Runbook — släpp Android

## Bygg

```bash
npm install
npx cap sync android
npm run android:build        # AAB i android/app/build/outputs/bundle/release/
```

Höj `versionCode` i `android/app/build.gradle` före varje uppladdning — Play
avvisar samma `versionCode` två gånger. `versionName` är den sträng användaren
ser.

## Signering

Använd **Play App Signing**: Google håller uppladdningsnyckeln. Tappar du din
lokala nyckel går den att återutfärda — utan Play App Signing är appen
oåterkalleligt låst.

## Före uppladdning

- [ ] `node tests/smoke.js` grön
- [ ] Testad på **riktig enhet**, inte bara emulator
- [ ] Lång inspelning (30+ min) med släckt skärm
- [ ] Bakgrund → förgrund mitt i inspelning
- [ ] Inloggning överlever att appen dödas och startas kallt
- [ ] Köpflöde: köp, återställ köp, avbryt
- [ ] Kvotgräns ger begripligt svenskt meddelande

## Spår

Intern testning → stängd testning → produktion.

**Nya utvecklarkonton måste köra stängd testning med minst 20 testare i 14
dagar** innan produktion kan öppnas. Det är kalendertid — starta rekryteringen
tidigt, parallellt med utvecklingen.

## Utrullning

Stegvis: 10 % → 50 % → 100 % över ungefär en vecka. Bevaka kraschstatistik i
Play Console, återbetalningar och konvertering från provperiod i RevenueCat,
samt Gemini-kostnad per aktiv prenumerant.

## Om något är fel i produktion

Stoppa utrullningen i Play Console (går direkt). En trasig version kan inte
"tas tillbaka" — du måste släppa en högre `versionCode` med rättningen.
