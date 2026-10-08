# Runbook — bjuda in användare gratis

Administratörer (listan `ADMINS` i `backend/wrangler.jsonc`) kan ge gratis
åtkomst till Diane i **10 dagar** eller **för alltid**.

## Bjuda in

1. Logga in med ditt admin-konto (webben eller appen).
2. Inställningar → **Administratör — bjud in**.
3. Skriv personens e-postadress, välj 10 dagar eller För alltid, tryck **Bjud in**.
4. **Kopiera inbjudan** och skicka texten till personen (mejl, sms).

Personen loggar in med Google på samma adress och kommer direkt förbi
betalväggen. Inbjudan kan skapas innan personen loggat in. En ny inbjudan
på samma adress ersätter den gamla (t.ex. för att förlänga 10 dagar till
för alltid).

## Regler

- Matchas mot den **Google-intygade** e-posten i inloggningen — en annan
  person kan inte utge sig för att vara den inbjudna.
- Inbjudna har **samma kvot som betalande** (30 sammanfattningar och 3 h
  ljud per 30 dagar); den nollställs automatiskt var 30:e dag.
- Har personen en egen prenumeration gäller den, inte inbjudan.
- **Ta bort** stänger åtkomsten direkt vid nästa anrop.

## Google-inloggningen

Så länge Googles samtyckesskärm står i **testläge** kan bara tillagda
testanvändare logga in. Samtyckesskärmen ska vara **publicerad**:
console.cloud.google.com/auth/audience?project=diane-prod-skaneby →
Publish app. Diane begär bara icke-känsliga scopes (openid, e-post, profil och
`drive.appdata`, som Google klassar som *Non-sensitive* i
developers.google.com/workspace/drive/api/guides/api-specific-auth), så
ingen granskning eller varning för overifierad app krävs. Varumärkes-
verifiering (namn och logga i inloggningsrutan) är ett separat, frivilligt
steg som kräver en egen domän verifierad i Search Console.

## Teknik

Tabell `grants` (backend/migrations/002-grants.sql), logik i
backend/src/grants.ts, API `GET /admin/grants`, `POST /admin/grants`,
`POST /admin/grants/revoke` (kräver admin, annars 403).
