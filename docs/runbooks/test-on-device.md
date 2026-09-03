# Runbook — testa appen på din egen Android

Bygget kräver Android SDK, som inte finns i den här utvecklingsmiljön
(Googles domäner är blockerade av nätverkspolicyn). Bygg därför lokalt.

## Engångsinstallation

1. Installera [Android Studio](https://developer.android.com/studio) — den tar
   med sig SDK, build-tools och emulator.
2. Öppna Android Studio en gång så att den hämtar SDK-komponenterna
   (platform 36 krävs — projektet riktar sig mot Android 16).
3. Sätt telefonen i utvecklarläge (stegen nedan).

## Utvecklarläge på telefonen

Testat på Pixel 6; samma steg på de flesta Android-telefoner.

1. **Inställningar → Om telefonen**
2. Scrolla längst ner till **Version** (*Build number*) och tryck på den
   **sju gånger**
3. Ange PIN-kod. Texten *"Du är nu utvecklare!"* visas
4. **Inställningar → System → Utvecklaralternativ** → slå på **USB-felsökning**
5. Anslut USB-kabeln. På telefonen: **Tillåt USB-felsökning?** → **Tillåt**,
   och kryssa i *"Tillåt alltid från den här datorn"*

Kommer dialogen inte upp: dra ner notisfältet, tryck på USB-notisen och välj
**Filöverföring** i stället för "Endast laddning".

Kontrollera att datorn ser telefonen:

```bash
adb devices      # ska lista enheten som "device", inte "unauthorized"
```

## Bygg och installera

Öppna en terminal (Terminal på Mac, Git Bash eller PowerShell på Windows) och
kör raderna en i taget:

```bash
git clone https://github.com/Skaneby/voicesummary.git
cd voicesummary
git checkout mobile-app
npm install
npm run android:sync        # speglar roten till www/ + cap sync
npm run android:open        # öppnar projektet i Android Studio
```

Vad raderna gör: hämtar hem koden, går in i mappen, byter till grenen där
mobilappen ligger (`main` är webbversionen), laddar ner biblioteken appen
behöver, kopierar in webbfilerna i Android-projektet och öppnar det i
Android Studio.

**Har du redan repot på datorn** hoppar du över `git clone` och kör i stället
`git pull origin mobile-app` i mappen du redan har.

**Föredrar du grafiskt gränssnitt:** Android Studio kan klona åt dig via
*File → New → Project from Version Control* med samma adress. Du behöver ändå
köra `npm install` och `npm run android:sync` i terminalen efteråt.

Kräver att [Node.js](https://nodejs.org) och [Git](https://git-scm.com) finns
installerat — kontrollera med `node -v` och `git -v`.

Anslut telefonen med USB, välj den i enhetslistan uppe i Android Studio och
tryck ▶ Run. Appen installeras och startar.

**Utan Android Studio**, om du hellre kör terminal:

```bash
npm run android:debug       # bygger debug-APK
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

## Vad som fungerar i debug-bygget just nu

| Funktion | Status |
|---|---|
| Inspelning, format, sammanfattning | ja — via proxyn |
| Google-inloggning | ja — kräver att SHA-1 är registrerad, se nedan |
| Q&A, Kopiera mail, kalender, alla format | ja |
| Köp av prenumeration | **nej** — knappen visar en toast (Fas 3) |

Eftersom köpflödet inte finns än måste ditt konto flaggas som betalande
manuellt för att komma förbi betalväggen:

```bash
cd backend
npx wrangler d1 execute diane-prod --remote \
  --command "UPDATE users SET sub_active=1, period_end=strftime('%s','now')+2592000 WHERE email='din@epost.se'"
```

Logga in i appen först en gång så att raden skapas, kör sedan kommandot och
starta om appen.

## SHA-1 för Google-inloggning

Google vägrar native-inloggning från en app den inte känner igen. Debug-bygget
signeras med datorns egen nyckel, och den måste registreras. **Detta är den
vanligaste snubbeltråden vid första körningen på riktig enhet** — inloggningen
misslyckas direkt utan den.

### 1. Hämta fingeravtrycket

```bash
cd android && ./gradlew signingReport      # Windows: gradlew signingReport
```

Leta upp stycket med `Variant: debug` / `Config: debug` och kopiera raden som
börjar med `SHA1:`.

Alternativ, om Gradle strular:

```bash
keytool -list -v -keystore ~/.android/debug.keystore \
  -alias androiddebugkey -storepass android -keypass android | grep SHA1
```

### 2. Registrera i Google Cloud Console

1. [console.cloud.google.com](https://console.cloud.google.com) → projektet
   `diane-prod-skaneby`
2. **APIs & Services → Credentials**
3. **+ CREATE CREDENTIALS → OAuth client ID**
4. Application type: **Android**
   - Name: `Diane Android debug`
   - Package name: `se.skaneby.diane`
   - SHA-1: raden från steg 1
5. **Create**

### Varför två klienter

Android-klienten auktoriserar *appen* mot Google. Web-klient-ID:t i
`index.html` avgör vem ID-token är utställd till, och är det backend
verifierar. **Byt inget i koden** — Android-klienten behöver bara existera.

Ingen ombyggnad krävs efteråt; starta om appen. Ge Google 5–10 minuter att
slå igenom.

Inför release tillkommer samma sak för **Play App Signing-nyckelns** SHA-1,
som du hittar i Play Console under Setup → App integrity.

## Att titta efter

- Mikrofondialogen: kommer den, och fungerar inspelning efter godkännande?
- Lång inspelning med släckt skärm — avbryts den?
- Bakåtknappen: **stänger den appen mitt i något?** (känt, åtgärdas i Fas 3)
- Ritas innehåll under status- eller navigeringsfältet? (edge-to-edge)
- Överlever inloggningen att appen dödas och startas om?
