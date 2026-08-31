# Designprinciper — Diane som Android-app

Appen och webbtjänsten delar kodbas men inte förutsättningar. Webben lever i en
webbläsare med adressfält, flikar och en bakåtknapp som användaren äger. Appen
lever i en helskärmsyta där *vi* äger varje pixel och varje gest — och där
Google har åsikter om hur det ska kännas.

Principerna nedan är sorterade efter hur dyrt det blir att strunta i dem.

---

## 1. Appen måste vara mer än webbsidan

Play-policy 4.3 (Minimum Functionality) tillämpas hårt sedan 2026: appar som
bara visar en webbplats i en WebView avslås. Capacitor-paketering är i sig
tillåten — men bara när appen tillför något som webben inte kan.

**Diane har den grunden, och den ska synas:**

| Native-värde | Syns för användaren som |
|---|---|
| Inspelning som överlever släckt skärm | "spela in ett helt möte, lägg telefonen i fickan" |
| Native inloggning | ett tryck, inget lösenord, ingen API-nyckel |
| Prenumeration i Play | betalning användaren redan litar på |
| Historik på enheten | fungerar utan nät |
| Delning till systemets delningsmeny | mail, kalender, valfri app |

**Princip:** varje release ska kunna svara på frågan *"vad gör den här appen
som webbsidan inte gör?"* — och svaret ska synas i gränssnittet, inte bara i
koden.

## 2. Följ systemets navigation, inte webbens

Diane är en enda sida som växlar mellan skärmar (`show('idle')`,
`show('result')` …). I en webbläsare är det oproblematiskt. I en app betyder
det att **bakåtknappen och bakåtgesten stänger hela appen** — mitt i en
inspelning, om användaren råkar svepa.

Från Android 16 är dessutom *predictive back* påslaget som standard: systemet
animerar en förhandsvisning av vad som händer bakåt. Appar som fångar
bakåthändelser måste göra det via de stödda API:erna, annars blir animationen
fel eller uteblir.

**Princip:** varje skärmväxling ska ha en definierad bakåtväg.
Resultat → startsida. Betalvägg → inloggning. Öppen panel → stängd panel.
Bara från startskärmen ska bakåt avsluta appen — och aldrig under pågående
inspelning utan en fråga.

## 3. Kant-till-kant är inte valfritt

Appar som riktar sig mot Android 16 kan inte längre välja bort edge-to-edge.
Innehållet ritas under statusfältet och navigeringsfältet, och det är vi som
måste hålla undan.

**Princip:** all fast placerad layout — knappraden, bottenpaneler, sidfoten —
ska respektera systemets insets. Diane har redan en `--sb`-variabel för säker
botten; den principen ska gälla åt alla fyra håll, och testas på en enhet med
gestnavigering *och* en med knappnavigering.

## 4. Tummen är den enda inmatningsenheten

En telefon hålls i en hand. Det som används ofta ska nås utan att flytta
greppet: inspelningsknappen i mitten-nedre delen, panelerna som bottenark
(vilket Diane redan gör), destruktiva val aldrig där tummen råkar landa.

**Princip:** minst 48 dp träffyta på allt som går att trycka på. Primär åtgärd
i nedre halvan. Radera-konto och liknande får kosta en extra bekräftelse.

## 5. Be om mikrofonen som en människa

Ett kallt systemdialogfönster direkt vid start är det snabbaste sättet att bli
nekad — och nekas mikrofonen är hela appen värdelös.

**Princip:** förklara först, fråga sedan. En kort svensk mening om *varför*
innan systemdialogen visas. Nekas åtkomsten: visa vad som går förlorat och en
väg till systeminställningarna, inte en återvändsgränd.

## 6. Prenumerationen ska vara omöjlig att missförstå

Play kräver att pris och villkor är tydliga, att användaren lätt hittar hur man
säger upp, och att köpflödet inte lurar någon att trycka fel. Namn som "Free
Trial" är uttryckligen förbjudna på en produkt som sedan börjar kosta pengar.

**Princip:** ett pris, en skärm, en knapp. Skriv rakt ut: *"40 kr/månad efter 7
dagars gratis provperiod. Avslutas när som helst i Google Play."* Ingen
mellanskärm som bara finns för att öka konverteringen. Länk till hantering av
prenumerationen ska finnas i inställningarna, inte bara i betalväggen.

## 7. Långa åtgärder behöver synlig status

En inspelning kan pågå i en timme med släckt skärm. Användaren måste kunna
kontrollera att den *faktiskt* pågår utan att öppna appen.

**Princip:** pågående inspelning ska ha en beständig systemnotis med tid och en
stoppmöjlighet. Det är också vad `FOREGROUND_SERVICE_MICROPHONE` kräver för att
Android inte ska avbryta inspelningen.

## 8. Teman är varumärket — men systemet bestämmer första intrycket

Dianes tre teman är en produktegenskap och ska vara kvar. Men en app som öppnas
i bländande ljust läge på en telefon inställd på mörkt läge känns fel byggd.

**Princip:** systemets läge avgör *förvalet* vid första start. Därefter äger
användarens val. Alla tre teman ska klara både ljus och mörk systeminställning
utan att bli oläsliga.

## 9. Tillgänglighet är inte en efterhandsfråga

**Princip:** layouten ska hålla vid 200 % textstorlek utan att klippa innehåll.
Kontrast minst 4,5:1 för brödtext. Ingen information får bäras av enbart färg —
formatkorten skiljs redan åt av text, inte bara av sin färg. Knappar utan
synlig etikett behöver `aria-label`.

## 10. Fel ska vara begripliga och gå att agera på

**Princip:** varje felläge svarar på tre frågor — vad hände, varför, vad gör
jag nu. På svenska, utan felkoder som huvudbudskap. Kvot slut, nätet borta,
prenumerationen utgången och mikrofonen nekad är de fyra som måste vara
genomtänkta, eftersom de faktiskt inträffar.

---

## Vad detta betyder rent konkret

Ingen omskrivning av gränssnittet. Dianes visuella uttryck — de tre temana, de
stora knapparna, bottenpanelerna — är redan i grunden mobilanpassat. Det som
saknas är **systemintegrationen**: bakåtnavigering, insets, notis för pågående
inspelning, behörighetsdialog med förklaring, och ett betalflöde som möter
Plays krav.

Det är den listan som blir UI-arbetet inför Play Store, och den är kort just
för att grunden redan är byggd för telefon.
