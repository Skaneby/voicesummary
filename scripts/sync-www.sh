#!/bin/sh
# Kopierar webbtillgångarna till www/ som Capacitor använder som webDir.
# Webbversionen (GitHub Pages) rör inte detta — den serverar repo-roten direkt,
# så "ändra en fil, pusha, klart" gäller fortfarande för PWA:n.
set -e
mkdir -p www
cp index.html sw.js manifest.json icon.svg icon-192.png icon-512.png www/
echo "www/ synkad från repo-roten"
