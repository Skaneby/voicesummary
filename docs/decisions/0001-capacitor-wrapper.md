# 0001 — Capacitor som paketering

**Status:** antagen · 2026-05-13

## Beslut

Paketera den befintliga webbappen som native-app med Capacitor, i stället för
att skriva om den i React Native, Flutter eller native.

## Varför

Appen är redan en fungerande PWA i en enda fil. Capacitor kör exakt samma
`index.html` i en WebView och ger tillgång till native-plugins där det behövs
(inloggning, köp, lagring). Android först, `npx cap add ios` för iOS senare.

## Följder

- Webb och app delar kodbas — en funktion byggs en gång.
- Native-ytan begränsas till plugins; inspelning sker fortfarande med
  `MediaRecorder` i WebView:n.
- Capacitor kräver en `webDir`, vilket ger en spänning mot principen "inget
  byggsteg". Löses i [0002](0002-en-kodbas-tva-lagen.md).
