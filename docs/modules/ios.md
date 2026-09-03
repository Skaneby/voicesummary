# iOS

> Status: **inte påbörjad.** Arkitekturen förbereds så att porten ska bli liten.

## Vad som skiljer mot Android

| | Android | iOS |
|---|---|---|
| Inloggning | Google | **Sign in with Apple krävs** (Apples riktlinje 4.8 när annan tredjepartsinloggning erbjuds) |
| Butik | Play | App Store |
| Betalning | RevenueCat → Play Billing | RevenueCat → StoreKit (**samma SDK, ingen kodändring**) |
| Bakgrundsinspelning | mer tillåtande | hårt begränsad |

## Förberedelser som redan är gjorda

- CORS i `backend/src/index.ts` tillåter redan `capacitor://localhost`.
- RevenueCat-webhooken i `backend/src/webhook.ts` är plattformsagnostisk.
- `@capgo/capacitor-social-login` stödjer Apple-inloggning — samma plugin.

## Måste vara klart före iOS

**Identitet per leverantör.** Med dagens schema blir samma person två konton
med två prenumerationer om hen loggar in med Apple på iPhone och Google på
Android. Apples "Hide My Email" gör att kontona inte ens kan länkas via e-post
i efterhand. Se
[../decisions/0003-identitet-per-leverantor.md](../decisions/0003-identitet-per-leverantor.md).

## Att bevaka

- Bakgrundsinspelning: keep-alive-oscillatorn i `index.html` kan visa sig
  otillräcklig i en native-wrapper — kan kräva en riktig bakgrundsuppgift.
- `NSMicrophoneUsageDescription` måste sättas och formuleras begripligt;
  vag motivering är en vanlig orsak till avslag.
- Apple avslår oftare än Google vid första inlämningen. Räkna med en runda.
