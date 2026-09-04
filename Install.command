#!/bin/sh
# Double-click to install Claude for Premiere. Copies this folder into Premiere's CEP extensions
# directory and enables unsigned panels. Requires Claude Code: the desktop app (logged in) or the CLI.
set -e
SRC="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/Library/Application Support/Adobe/CEP/extensions/com.claude-for-adobe.premiere"
if [ "$SRC" = "$DEST" ]; then echo "This is the installed copy already. Download the zip and run Install.command from there."; exit 0; fi
mkdir -p "$(dirname "$DEST")"
STAGE="$DEST.new.$$"
rm -rf "$STAGE"
cp -R "$SRC" "$STAGE"                                    # copy first; the old install is untouched if this fails
xattr -dr com.apple.quarantine "$STAGE" 2>/dev/null || true   # let the bundled binaries run
rm -rf "$DEST.old" && { [ -e "$DEST" ] && mv "$DEST" "$DEST.old" || true; }
mv "$STAGE" "$DEST"
rm -rf "$DEST.old"
for v in 11 12 13; do defaults write com.adobe.CSXS.$v PlayerDebugMode 1; done
echo ""
echo "Installed to: $DEST"
command -v claude >/dev/null 2>&1 || [ -x "$HOME/.local/bin/claude" ] || [ -x /opt/homebrew/bin/claude ] || ls "$HOME/Library/Application Support/Claude/claude-code"/*/claude.app >/dev/null 2>&1 || echo "NOTE: Claude Code was not found. Install the Claude desktop app and open Claude Code in it once (or install the CLI): https://claude.com/claude-code"
echo "Restart Premiere Pro, then open Window > Extensions > Claude for Premiere."
