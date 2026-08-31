# Arkitektur

## Systemöversikt

```
                        ┌──────────────────────────┐
                        │      index.html          │
                        │  (samma fil, två lägen)  │
                        └────────┬─────────────────┘
                                 │
              webbläge ──────────┼────────── appläge
                    │                              │
                    ▼                              ▼
        ┌───────────────────┐        ┌──────────────────────────┐
        │  Gemini API       │        │  Cloudflare Worker       │
        │  användarens      │        │  diane-api               │
        │  egen nyckel      │        │  · verifierar ID-token   │
        └───────────────────┘        │  · kollar rättighet      │
                                     │  · räknar kvot           │
                                     │  · proxar till Gemini    │
                                     └────┬──────────────┬──────┘
                                          │              │
                                          ▼              ▼
                                   ┌───────────┐  ┌─────────────┐
                                   │ Gemini    │  │ D1-databas  │
                                   │ vår nyckel│  │ users +     │
                                   └───────────┘  │ sub_events  │
                                                  └──────▲──────┘
                                                         │ webhook
                                                  ┌──────┴──────┐
                                                  │ RevenueCat  │
                                                  │ Play + App  │
                                                  └─────────────┘
```

## Dataflöde: en inspelning

1. `startRecording()` — gate: webbläge kräver API-nyckel, appläge kräver
   inloggning + aktiv prenumeration.
2. `MediaRecorder` spelar in. Wake Lock + keep-alive-oscillator håller sidan vid
   liv (kritiskt på iOS).
3. `onStop` → `blobToBase64()` → `process()`.
4. `generate()` skickar ljud + prompt. **Här, och bara här, skiljer sig lägena.**
5. Svaret parsas identiskt i båda lägena — proxyn skickar tillbaka Geminis
   svar oförändrat. `TITLE:`-raden plockas ut, resten saneras via
   `sanitizeHtml()` och renderas.
6. Resultatet sparas i historiken (`localStorage`, nyckel `vs_history`).

## Varför proxyn returnerar Gemini rått

`backend/src/index.ts` skickar tillbaka Geminis svarskropp oförändrad.
Det är ett medvetet val: klientens svarsparsning blir **identisk** i båda
lägena, vilket är det som gör en gemensam kodbas praktiskt möjlig.
Bryt inte detta — inför man ett eget svarsformat i proxyn måste klienten
plötsligt hantera två format.

## Vad som är gemensamt kontra lägesspecifikt

Ungefär 85 % av klientkoden är lägesoberoende: inspelning, teman, format-
prompter, sanering, historik, delning, redigering, Q&A.

Lägesspecifikt är i praktiken bara fyra ställen:

| Ställe | Webb | App |
|---|---|---|
| anropet i `generate()` | Gemini direkt | `POST /summarize` |
| gate i `startRecording()` | API-nyckel finns? | inloggad + prenumererar? |
| inställningspanelen | nyckel, modell | konto, prenumeration |
| skärmlistan | `setup` | `signin`, `paywall` |

Håll den listan kort. Växer den är det ett tecken på att något byggs i fel lager.

## Säkerhetsgränser

- **All AI-genererad HTML måste gå genom `sanitizeHtml()`** före insättning.
  Vitlista: `article, section, h2, p, ul, ol, li, strong, em, br`. Alla
  attribut strippas. Sätt aldrig `innerHTML` på rått Gemini-svar.
- I appläget ser klienten **aldrig** vår Gemini-nyckel — den finns bara som
  Worker-secret.
- ID-token skickas som `Authorization: Bearer`, verifieras mot leverantörens
  JWKS i `backend/src/auth.ts`.
