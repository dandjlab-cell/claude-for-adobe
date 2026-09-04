#!/bin/sh
# Developer install: a SECOND panel, "Claude for Premiere (dev)", wired to this repo by symlinks so edits show on
# reload, with its own extension id so it runs side by side with the shipped copy from the zip.
# The dev panel refuses in-app updates (it is a git checkout); publish from the repo instead.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ID="com.claude-for-adobe.premiere.dev"
DEST="$HOME/Library/Application Support/Adobe/CEP/extensions/$ID"
rm -rf "$DEST"; mkdir -p "$DEST/CSXS"
for f in assets bin host src licenses docs .claude index.html panel.js package.json README.md; do ln -s "$ROOT/$f" "$DEST/$f"; done
ln -s "$ROOT/.git" "$DEST/.git"   # marks it as a checkout: the updater will refuse to overwrite it
sed -e "s/com\.claude-for-adobe\.premiere/$ID/g" -e 's/<Menu>Claude for Premiere<\/Menu>/<Menu>Claude for Premiere (dev)<\/Menu>/' -e 's/ExtensionBundleName="Claude for Adobe"/ExtensionBundleName="Claude for Adobe (dev)"/' "$ROOT/CSXS/manifest.xml" > "$DEST/CSXS/manifest.xml"
printf '<?xml version="1.0" encoding="UTF-8"?>\n<ExtensionList>\n  <Extension Id="%s">\n    <HostList>\n      <Host Name="PPRO" Port="9296"/>\n    </HostList>\n  </Extension>\n</ExtensionList>\n' "$ID" > "$DEST/.debug"
for v in 11 12 13; do defaults write com.adobe.CSXS.$v PlayerDebugMode 1; done
echo "Dev panel installed -> $DEST"
echo "Restart Premiere, then Window > Extensions > Claude for Premiere (dev). DevTools: http://localhost:9296"
echo "Reload after edits: close and reopen the dev panel, or restart Premiere for host script changes."
