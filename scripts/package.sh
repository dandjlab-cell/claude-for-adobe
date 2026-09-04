#!/bin/sh
# Builds dist/PremiereClaude-<version>.zip: the runtime files only (no tests, docs, git).
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION=$(sed -n 's/.*ExtensionBundleVersion="\([^"]*\)".*/\1/p' "$ROOT/CSXS/manifest.xml" | head -1)
PKG=$(sed -n 's/.*"version": "\([^"]*\)".*/\1/p' "$ROOT/package.json" | head -1)
[ "$VERSION" = "$PKG" ] || { echo "version mismatch: manifest $VERSION vs package.json $PKG" >&2; exit 1; }
STAGE="$(mktemp -d)/Claude for Adobe"
mkdir -p "$STAGE" "$ROOT/dist"
for f in CSXS assets bin host src licenses .claude docs index.html panel.js package.json README.md LICENSE THIRD_PARTY.md Install.command; do cp -R "$ROOT/$f" "$STAGE/"; done
find "$STAGE" -name '.DS_Store' -delete
OUT="$ROOT/dist/ClaudeForAdobe-$VERSION.zip"
rm -f "$OUT"
(cd "$(dirname "$STAGE")" && zip -qr "$OUT" "Claude for Adobe")
rm -rf "$(dirname "$STAGE")"
cp "$OUT" "$ROOT/dist/ClaudeForAdobe.zip"   # constant name: releases/latest/download/ClaudeForAdobe.zip always gets the newest
echo "$OUT ($(du -h "$OUT" | cut -f1))"
