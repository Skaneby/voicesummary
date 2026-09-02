# Butikstext till Google Play

Utkast att klistra in i Play Console. Justera fritt — men behåll det som är
markerat som policyskäl, de finns där för att undvika avslag.

## Kort beskrivning (max 80 tecken)

```
Spela in möten och få en AI-sammanfattning på ditt eget språk
```
*(61 tecken)*

## Fullständig beskrivning

```
Diane lyssnar, du slipper anteckna.

Tryck på inspelning, lägg telefonen på bordet och prata på. När mötet är
slut får du en färdig text — inte en rå utskrift, utan en genomarbetad
sammanfattning i det format du behöver.

VÄLJ FORMAT EFTER SITUATION
• Mötesprotokoll med beslut och åtgärdspunkter
• Säljmöte med kundinfo, situation och nästa steg
• Kort sammanfattning eller detaljerad analys
• Bloggpost, inlägg för sociala medier, formellt brev
• Och flera till

Vill du ha något lättsammare finns sex format på skoj — insändare,
predikan, konspirationsteori. De är avstängda från början och slås på i
inställningarna, så formatväljaren håller sig saklig tills du vill
annat.

FRÅGA OM MÖTET
Ett protokoll kan bli långt. Diane sparar hela mötet och svarar på frågor
om det efteråt — "vad lovade vi kunden?", "vad kostade offerten?" — även
om detaljen inte kom med i sammanfattningen.

BYGGD FÖR RIKTIGA MÖTEN
• Inspelningen fortsätter med skärmen släckt och telefonen i fickan
• Pausa och återuppta mitt i
• Sammanfattningarna sparas på din enhet och går att läsa utan nät
• Dela direkt till mejl, kalender eller valfri app

DITT SPRÅK, AUTOMATISKT
Diane hör vilket språk du talar och svarar på samma språk. Ingen
inställning att leta efter.

PRIS
7 dagar gratis. Därefter 47 kr per månad, eller 470 kr per år — då får
du två månader på köpet. Provperioden övergår automatiskt i den
prenumeration du valt om du inte avslutar den, och du avslutar när som
helst i Google Play. Ingår gör 100 sammanfattningar och 60 minuter ljud
varje månad.

INTEGRITET
Ljudet skickas krypterat till Google Gemini för att skapa din
sammanfattning och sparas aldrig på våra servrar. Dina sammanfattningar
ligger på din egen enhet. Du kan radera ditt konto när som helst, direkt
i appen.
```

## Varför texten ser ut som den gör

**Policy 4.3 (Minimum Functionality)** avslår appar som bara är en webbplats
i ett skal. Stycket "Byggd för riktiga möten" finns där för att göra det
konkret att appen gör sådant en webbsida inte kan: inspelning med släckt
skärm, lokal historik utan nät, delning till systemets appar. Ta inte bort
det.

**Prenumerationsvillkoren** står utskrivna eftersom Play kräver att pris,
provperiodens längd och att den övergår i betalning framgår tydligt.

**Integritetsstycket** speglar prominent disclosure-dialogen i appen och
integritetspolicyn. De tre ska säga samma sak — motsäger de varandra är det
en avslagsgrund.

## Skärmbilder

Minst 2, rekommenderat 4–6. Förslag, i den ordningen:

1. Startskärmen med inspelningsknappen — visar vad appen är
2. Pågående inspelning med vågform och tidräknare
3. Ett färdigt protokoll — själva värdet
4. Formatväljaren — visar bredden
5. "Fråga om mötet" med en fråga och ett svar — den funktion ingen annan har

Funktionsgrafik 1024×500 krävs också.

## Data Safety-formuläret

Svara så här. Felaktiga svar är grund för borttagning även efter publicering.

| Fråga | Svar |
|---|---|
| Samlas ljud in? | Ja |
| Delas ljudet med tredje part? | **Ja** — Google Gemini, för att skapa sammanfattningen |
| Lagras ljudet? | Nej — behandlas och kastas |
| Samlas e-postadress in? | Ja, för kontohantering |
| Samlas appaktivitet in? | Ja — antal sammanfattningar och inspelad tid, för kvoten |
| Krypteras data under överföring? | Ja |
| Kan användaren begära radering? | Ja — i appen och via webbadress |
| Samlas plats in? | Nej |
| Annonsering? | Nej |

## Övriga fält

| Fält | Värde |
|---|---|
| Appnamn | Diane |
| Kategori | Produktivitet |
| Målgrupp | 13+ |
| Innehållsklassificering | Alla / PEGI 3 |
| Integritetspolicy | `<publik URL>/privacy.html` |
| Kontoradering | `<publik URL>/delete-account.html` |
| Support-e-post | johan@skaneby.se |
| Land | Sverige |
| Produkt, månad | `diane_premium_monthly` — 47 kr |
| Produkt, år | `diane_premium_annual` — 470 kr |
| Provperiod | 7 dagar, endast nya prenumeranter |

**App access:** appen ligger bakom inloggning och betalvägg. Lämna ett
testkonto med aktiv prenumeration, annars ser granskaren en låst skärm och
avslår. Sätt `sub_active = 1` på kontot i D1 innan du lämnar in.
