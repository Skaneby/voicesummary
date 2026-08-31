# 0004 — Publik adress bör lösgöras från repo-namnet

**Status:** föreslagen

## Problem

Webbappen ligger på `https://skaneby.github.io/voicesummary/`. Adressen är en
direkt funktion av repots namn. Döps repot om till `Diane` blir adressen
`https://skaneby.github.io/Diane/`, och **GitHub Pages vidarebefordrar inte**
den gamla adressen — till skillnad från git-fjärradresser, som redirectas
permanent.

Det som faktiskt går sönder vid ett namnbyte:

| Sak | Effekt |
|---|---|
| Installerade PWA:er på hemskärmen | `start_url` pekar på gamla sökvägen → dör |
| Delade länkar | 404 |
| Integritetspolicyns URL | ändras — och Play sparar den vid inlämning |
| `git push` från befintliga kloner | fungerar, GitHub redirectar |
| Användarnas nyckel och historik | **överlever** — `localStorage` är bunden till origin (`skaneby.github.io`), inte till sökvägen |
| Play-appen | opåverkad, applikations-id `se.skaneby.diane` är oberoende |
| Backend, Cloudflare, RevenueCat | opåverkade |

## Beslut

Sätt en **egen domän på GitHub Pages** innan repot byter namn, och innan
appen lämnas in till Play.

Detta är enklare än det tidigare uppskjutna Cloudflare-arbetet: en custom
domain för *Cloudflare Workers* kräver att zonen ligger på Cloudflares DNS,
men **GitHub Pages nöjer sig med en vanlig CNAME-post** hos nuvarande
DNS-leverantör. Ingen migrering behövs.

Med en egen adress blir repo-namnet en intern angelägenhet som kan ändras
när som helst.

## Följder

- `APP_URL` i `index.html` är enda stället adressen står — ett namnbyte är
  en rad att ändra.
- `manifest.json` använder relativa sökvägar och påverkas inte.
- Integritetspolicyns adress måste vara **stabil innan** den anges i Play
  Console; ändras den efteråt måste butiksposten uppdateras.
- Byter man ändå namn utan egen domän: lägg ett litet repo `voicesummary`
  med en vidarebefordrande sida, så överlever gamla länkar och installerade
  appar.
