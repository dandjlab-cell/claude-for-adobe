#!/bin/sh
# Double-click to install Claude for Premiere. Copies this folder into Premiere's CEP extensions
# directory and enables unsigned panels. Requires Claude Code: the desktop app (logged in) or the CLI.
set -e
SRC="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/Library/Application Support/Adobe/CEP/extensions/com.claude-for-adobe.premiere"
mkdir -p "$(dirname "$DEST")"
rm -rf "$DEST"
cp -R "$SRC" "$DEST"
xattr -dr com.apple.quarantine "$DEST" 2>/dev/null || true   # let the bundled VAD binary run
for v in 11 12 13; do defaults write com.adobe.CSXS.$v PlayerDebugMode 1; done
echo ""
echo "Installed to: $DEST"
command -v claude >/dev/null 2>&1 || [ -x "$HOME/.local/bin/claude" ] || [ -x /opt/homebrew/bin/claude ] || ls "$HOME/Library/Application Support/Claude/claude-code"/*/claude.app >/dev/null 2>&1 || echo "NOTE: Claude Code was not found. Install the Claude desktop app and open Claude Code in it once (or install the CLI): https://claude.com/claude-code"
echo "Restart Premiere Pro, then open Window > Extensions > Claude for Premiere."
