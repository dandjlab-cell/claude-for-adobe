#!/bin/sh
# Symlinks this repo into the CEP extensions folder and enables unsigned-panel loading.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$HOME/Library/Application Support/Adobe/CEP/extensions/com.claude-for-adobe.premiere"
mkdir -p "$(dirname "$DEST")"
if [ -e "$DEST" ] && [ ! -L "$DEST" ]; then echo "$DEST exists and is not a symlink; remove it first." >&2; exit 1; fi
ln -sfn "$ROOT" "$DEST"
defaults write com.adobe.CSXS.12 PlayerDebugMode 1
defaults write com.adobe.CSXS.11 PlayerDebugMode 1
command -v claude >/dev/null || [ -x "$HOME/.local/bin/claude" ] || echo "warning: claude CLI not found on PATH or ~/.local/bin" >&2
echo "Installed -> $DEST"
echo "Restart Premiere, then Window > Extensions > Claude for Premiere. Debug: http://localhost:9295"
