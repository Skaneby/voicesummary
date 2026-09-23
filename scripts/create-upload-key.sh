#!/bin/sh
# Engångssteg: skapar uppladdningsnyckeln som signerar Dianes Android-byggen.
# Kör själv i en terminal — keytool frågar efter lösenord interaktivt, och de
# ska aldrig passera någon annan väg. Nyckeln läggs UTANFÖR repot.
#
#   sh scripts/create-upload-key.sh
set -e

KEY_DIR="$HOME/.diane-signing"
KEY_FILE="$KEY_DIR/diane-upload.jks"
ALIAS="diane-upload"
PROPS="$(cd "$(dirname "$0")/.." && pwd)/android/keystore.properties"

# Skriv aldrig över den enda nyckeln — förlorad nyckel = krångligt återställningsärende hos Google
if [ -f "$KEY_FILE" ]; then
  echo "Nyckeln finns redan: $KEY_FILE — avbryter utan att röra den."
  exit 1
fi

KEYTOOL="keytool"
JBR="/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/keytool"
[ -x "$JBR" ] && KEYTOOL="$JBR"

mkdir -p "$KEY_DIR" && chmod 700 "$KEY_DIR"

printf "Välj lösenord för nyckeln (minst 6 tecken): "
stty -echo; read -r PASS; stty echo; echo
printf "Upprepa lösenordet: "
stty -echo; read -r PASS2; stty echo; echo
if [ "$PASS" != "$PASS2" ] || [ ${#PASS} -lt 6 ]; then
  echo "Lösenorden matchar inte eller är för korta."; exit 1
fi

"$KEYTOOL" -genkeypair -v -keystore "$KEY_FILE" -alias "$ALIAS" \
  -keyalg RSA -keysize 4096 -validity 10000 \
  -storepass "$PASS" -keypass "$PASS" \
  -dname "CN=Digitala Verkligheter, C=SE"
chmod 600 "$KEY_FILE"

# keystore.properties är gitignored — lösenordet stannar på den här datorn
cat > "$PROPS" <<PROPS_EOF
storeFile=$KEY_FILE
storePassword=$PASS
keyAlias=$ALIAS
keyPassword=$PASS
PROPS_EOF
chmod 600 "$PROPS"

echo
echo "Klart. Nyckeln: $KEY_FILE"
echo
echo "SÄKERHETSKOPIERA NU — utan nyckeln kan du inte ladda upp nya versioner:"
echo "  1. Spara lösenordet i din lösenordshanterare."
echo "  2. Kopiera $KEY_FILE till en andra plats (t.ex. krypterad USB eller lösenordshanteraren)."
echo "  3. Välj Play App Signing när du skapar appen i Play Console — då kan Google"
echo "     återställa en förlorad uppladdningsnyckel."
