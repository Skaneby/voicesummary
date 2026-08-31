# Diane — dokumentation

Läs-först-karta över projektet. Varje fil är självständig: du ska kunna läsa
*en* fil och veta vad du behöver för den uppgiften.

| Fil | Läs när du ska… |
|---|---|
| [architecture.md](architecture.md) | förstå hur helheten hänger ihop, eller ändra dataflödet |
| [modules/client.md](modules/client.md) | ändra i appens gränssnitt eller logik (`index.html`) |
| [modules/backend.md](modules/backend.md) | ändra i Cloudflare Worker, kvoter, rättigheter |
| [modules/android.md](modules/android.md) | bygga, signera eller felsöka Android-appen |
| [modules/ios.md](modules/ios.md) | arbeta med iOS-porten |
| [design-principles.md](design-principles.md) | designa gränssnitt för appen |
| [conventions.md](conventions.md) | skriva kod eller commits i repot |
| [decisions/](decisions/) | förstå *varför* något är som det är |
| [runbooks/](runbooks/) | deploya, släppa eller åtgärda ett driftläge |

## Produkten i en mening

Diane spelar in ljud i webbläsaren, skickar det till Googles Gemini och
renderar en AI-skriven sammanfattning i ett av flera förvalda format.
Gränssnittet är på svenska.

## Två produkter, en kodbas

| | Webb (gratis) | App (betald) |
|---|---|---|
| Var | GitHub Pages, `main` | Play Store / App Store |
| Gemini-nyckel | användarens egen | vår, bakom proxy |
| Inloggning | ingen | Google (Android), Apple (iOS) |
| Betalning | — | RevenueCat, 40 kr/mån |

Samma `index.html` kör båda lägena. Se
[decisions/0002-en-kodbas-tva-lagen.md](decisions/0002-en-kodbas-tva-lagen.md).

## Regel

**Ändrar du arkitekturen — uppdatera motsvarande fil här i samma commit.**
En dokumentation som släpar efter koden är värre än ingen alls.
