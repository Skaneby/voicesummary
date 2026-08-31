# Runbook — vad Play kräver av Diane

Play är mer förlåtande än App Store, men inte kravlöst. Listan nedan är
sorterad: först det som **stoppar** en publicering, sedan det som drar ner
kvalitetsbetyg och synlighet.

## Hårda krav — utan dessa blir det avslag

### 1. Integritetspolicy på publik URL
Obligatorisk för alla appar som rör mikrofonen. Måste vara nåbar utan
inloggning. Kan ligga på `skaneby.github.io/voicesummary/privacy.html`.

### 2. Webbadress för kontoradering
Appar med konton måste erbjuda radering **både i appen och via en publik
webbsida**. Sidan måste vara HTTPS, nåbar utan inloggning, länka direkt till
raderingen utan mellansteg, och beskriva vad som raderas, vad som sparas och
hur länge.

Diane har raderingen i appen (`deleteAccount()` → `POST /account/delete`).
**Webbsidan saknas** och är ett hårt krav.

### 3. Prominent disclosure för ljud
Mikrofon räknas som känslig persondata. Att skriva det i integritetspolicyn
räcker inte — det krävs en **dialog i appen, före första inspelningen**, som
säger rakt ut att ljudet skickas till Google Gemini för bearbetning, och att
användaren aktivt godkänner det.

Detta är en vanlig avslagsorsak och saknas i Diane idag.

### 4. Data Safety-formuläret ifyllt sanningsenligt
Måste deklarera: ljudinspelning, e-postadress, användningsdata — och att ljud
**delas med tredje part** (Google Gemini). Felaktigt ifyllt formulär är grund
för borttagning även efter publicering.

### 5. Testkonto åt granskarna
Diane ligger bakom både inloggning och betalvägg. Utan fungerande
testinloggning ser granskaren en låst skärm och avslår. Anges under
**App access** i Play Console.

### 6. Prenumerationen tydligt beskriven
Pris, provperiodens längd och att den övergår i betalning ska framgå på
köpskärmen. Produktnamn som "Free Trial" är uttryckligen förbjudna på något
som sedan kostar. *Klart* — betalväggen har nu explicit villkorstext.

### 7. Policy 4.3 — appen måste vara mer än webbplatsen
Rena WebView-omslag avslås sedan 2026. Capacitor är tillåtet när appen tillför
något webben inte kan.

**Dianes försvar, som ska synas i gränssnittet och i butikstexten:**
inspelning som överlever släckt skärm, konto och prenumeration i stället för
API-nyckelfummel, historik som fungerar offline, delning till systemets
delningsmeny. Detta är starkt nog — men bara om det syns.

### 8. Målnivå Android 16 (API 36)
Krav sedan 31 augusti 2026. *Klart* — projektet ligger på 36.

## Kvalitetskrav — inte avslag, men sänkta betyg

### Bakåtnavigering
Diane växlar skärmar utan att röra historiken, så bakåtgesten stänger appen —
även mitt i en inspelning. Från Android 16 är predictive back påslaget som
standard och kräver de stödda API:erna.

### Edge-to-edge
Går inte att välja bort på Android 16. All fast placerad layout måste
respektera systemets insets, uppe och nere.

### Systemnotis under inspelning
En inspelning kan pågå i en timme med släckt skärm. Utan en förgrundstjänst
kan Android avbryta den — och användaren har ingen aning om att den pågår.

Kräver `FOREGROUND_SERVICE_MICROPHONE` **plus en faktisk förgrundstjänst**.
Deklarera inte behörigheten innan tjänsten finns: den utlöser ett eget
deklarationsformulär i Play Console.

### Mikrofondialog med förklaring
Ett kallt systemdialogfönster ger fler nekanden. Förklara först, fråga sedan.

## Processkrav

- **Play Console-konto**, 25 USD engångsavgift.
- **Stängd testning med minst 20 testare i 14 sammanhängande dagar** innan
  produktion kan öppnas, för nya personliga utvecklarkonton. Ren kalendertid —
  starta rekryteringen tidigt.
- Innehållsklassificering, målgrupp (13+), annonsdeklaration (ingen annonsering).

## Status

| Krav | Läge |
|---|---|
| Målnivå API 36 | klart |
| Prenumerationsvillkor på köpskärm | klart |
| Kontoradering i appen | klart |
| Integritetspolicy | **saknas** |
| Webbsida för kontoradering | **saknas** |
| Prominent disclosure för ljud | **saknas** |
| Testkonto åt granskare | görs vid inlämning |
| Bakåtnavigering | **kvar** |
| Edge-to-edge-insets | **kvar** |
| Förgrundstjänst för inspelning | **kvar** |
| Köpflöde (RevenueCat) | **kvar — Fas 3** |
