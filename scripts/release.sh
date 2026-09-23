#!/bin/sh
# Släpper en ny Android-version av Diane: tester → versionslyft → synk →
# signerad AAB → commit + git-tagg → push. Taggen gör att det alltid går att
# se exakt vilken kod som ligger i Play.
#
#   npm run release -- 1.0.0            # skarp release
#   npm run release -- 1.0.0 --dry-run  # bygger och verifierar, men återställer
#                                        # versionen och committar/pushar inget
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
GRADLE_FILE="android/app/build.gradle"
AAB_OUT="android/app/build/outputs/bundle/release/app-release.aab"

fail() { echo "✗ $1" >&2; exit 1; }
step() { echo; echo "── $1"; }

VERSION="$1"
DRY_RUN=0
[ "$2" = "--dry-run" ] && DRY_RUN=1

# ── 1. Förkontroller ───────────────────────────────────────────────────────
step "Förkontroller"
echo "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' \
  || fail "Ange version som X.Y.Z, t.ex.: npm run release -- 1.0.0"

CUR_NAME=$(sed -n 's/.*versionName "\(.*\)".*/\1/p' "$GRADLE_FILE")
CUR_CODE=$(sed -n 's/.*versionCode \([0-9][0-9]*\).*/\1/p' "$GRADLE_FILE")
[ -n "$CUR_CODE" ] || fail "Hittar inte versionCode i $GRADLE_FILE"

# Versionen måste vara högre än nuvarande (sort -V jämför semver-delar numeriskt)
HIGHEST=$(printf '%s\n%s\n' "$CUR_NAME" "$VERSION" | sort -V | tail -1)
[ "$HIGHEST" = "$VERSION" ] && [ "$VERSION" != "$CUR_NAME" ] \
  || fail "$VERSION är inte högre än nuvarande version $CUR_NAME"

git rev-parse -q --verify "refs/tags/v$VERSION" >/dev/null \
  && fail "Taggen v$VERSION finns redan"

BRANCH=$(git branch --show-current)
[ "$BRANCH" = "mobile-app" ] || fail "Släpp från grenen mobile-app (du står på $BRANCH)"

# Skarp release kräver rent träd i synk med origin; dry run bara varnar,
# så att flödet går att prova innan allt är committat
strict() { if [ "$DRY_RUN" = 1 ]; then echo "! (dry run) $1"; else fail "$1"; fi; }

git diff --quiet && git diff --cached --quiet \
  || strict "Det finns ocommittade ändringar — committa eller stasha dem först"

git fetch -q origin   # alla grenar — main och web-app jämförs i steg 7
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/mobile-app)" ] \
  || strict "mobile-app är inte i synk med origin/mobile-app — pulla eller pusha först"

[ -f android/keystore.properties ] \
  || fail "android/keystore.properties saknas — kör först: sh scripts/create-upload-key.sh"

echo "✓ $CUR_NAME (versionCode $CUR_CODE) → $VERSION"

# ── 2. Tester ──────────────────────────────────────────────────────────────
step "Tester"
TEST_OUT=$(npm test 2>&1) || { echo "$TEST_OUT" | grep -E '✗|RESULTAT'; fail "Klienttesterna gick inte igenom"; }
echo "$TEST_OUT" | grep -q '0 underkända' || { echo "$TEST_OUT" | grep -E '✗|RESULTAT'; fail "Klienttesterna gick inte igenom"; }
(cd backend && npm test >/dev/null 2>&1) || fail "Backendtesterna gick inte igenom — kör cd backend && npm test"
echo "✓ klient och backend gröna"

# ── 3. Versionslyft ────────────────────────────────────────────────────────
NEW_CODE=$((CUR_CODE + 1))
step "Versionslyft: $VERSION (versionCode $NEW_CODE)"
# Dry run: återställ build.gradle från en kopia oavsett hur skriptet slutar.
# Kopia i stället för git checkout — annars raderas ocommittade ändringar i filen.
if [ "$DRY_RUN" = 1 ]; then
  cp "$GRADLE_FILE" "$GRADLE_FILE.dryrun-bak"
  trap 'mv -f "$GRADLE_FILE.dryrun-bak" "$GRADLE_FILE"' EXIT
fi
sed -i '' "s/versionCode $CUR_CODE/versionCode $NEW_CODE/" "$GRADLE_FILE"
sed -i '' "s/versionName \"$CUR_NAME\"/versionName \"$VERSION\"/" "$GRADLE_FILE"
grep -q "versionCode $NEW_CODE" "$GRADLE_FILE" && grep -q "versionName \"$VERSION\"" "$GRADLE_FILE" \
  || fail "Versionslyftet i $GRADLE_FILE misslyckades"

# ── 4. Synk ────────────────────────────────────────────────────────────────
step "Synkar webbkoden in i Android-projektet"
npm run android:sync >/dev/null
diff -q index.html android/app/src/main/assets/public/index.html >/dev/null \
  || fail "Android-projektets index.html matchar inte roten efter synk"
echo "✓ synkad"

# ── 5. Bygg ────────────────────────────────────────────────────────────────
step "Bygger signerad AAB"
# Capacitor kräver JDK 21+. En redan satt JAVA_HOME kan peka på en äldre JDK
# (t.ex. Homebrews 17) — kontrollera versionen och fall annars tillbaka på
# Android Studios inbyggda JDK.
java_major() { "$1/bin/java" -version 2>&1 | sed -n 's/.*version "\([0-9]*\).*/\1/p' | head -1; }
AS_JBR="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
if [ -z "$JAVA_HOME" ] || [ "$(java_major "$JAVA_HOME")" -lt 21 ] 2>/dev/null; then
  [ -x "$AS_JBR/bin/java" ] || fail "Hittar ingen JDK 21+ — installera Android Studio eller sätt JAVA_HOME"
  export JAVA_HOME="$AS_JBR"
fi
echo "JDK $(java_major "$JAVA_HOME"): $JAVA_HOME"
rm -f "$AAB_OUT"
(cd android && ./gradlew -q bundleRelease) || fail "Gradle-bygget misslyckades"
[ -f "$AAB_OUT" ] || fail "Hittar inte $AAB_OUT efter bygget"

# ── 6. Verifiera signaturen ────────────────────────────────────────────────
step "Verifierar signaturen"
"$JAVA_HOME/bin/jarsigner" -verify "$AAB_OUT" 2>&1 | grep -q "jar verified" \
  || fail "AAB:n är inte korrekt signerad"
mkdir -p releases
OUT="releases/diane-v$VERSION-$NEW_CODE.aab"
cp "$AAB_OUT" "$OUT"
echo "✓ signerad: $OUT"

if [ "$DRY_RUN" = 1 ]; then
  echo
  echo "Dry run klar — versionen återställd, inget committat, taggat eller pushat."
  exit 0
fi

# ── 7. Commit, tagg, push ──────────────────────────────────────────────────
step "Commit, tagg och push"
git add "$GRADLE_FILE"
git commit -q -m "release: v$VERSION (versionCode $NEW_CODE)"
git tag -a "v$VERSION" -m "Diane v$VERSION (versionCode $NEW_CODE)"
git push -q origin mobile-app "v$VERSION"

# Håll main och web-app i fas — bara fast-forward, aldrig force
for B in main web-app; do
  if git merge-base --is-ancestor "origin/$B" HEAD 2>/dev/null; then
    git push -q origin "HEAD:$B" && git branch -f "$B" HEAD && echo "✓ $B uppdaterad"
  else
    echo "! $B har commits som inte finns på mobile-app — uppdatera den manuellt"
  fi
done

echo
echo "✓ v$VERSION släppt och taggad."
echo "  Nästa steg: ladda upp $OUT i Play Console"
echo "  (Test and release → välj spår → Create new release)."
