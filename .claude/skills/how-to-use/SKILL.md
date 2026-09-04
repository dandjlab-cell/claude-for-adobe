---
name: how-to-use
description: Use when the editor asks what you can do, how to use the panel, what the features are, or how something works. Explain from this file, in plain editor language, briefly.
---

# What this panel does, and how to use it

Answer in the editor's own terms. Short. Group by what they might want to do, not by tool names. Offer to start on one.

## The main move
Click a folder (bin) or some clips in Premiere, then say what you want: "edit this", "cut this down", "find the talking head", "make a social cut". The selection travels with the message. I inspect the footage, ask one question about the sequence (settings and name) if none exists, create it, transcribe if dialogue matters, mute the b-roll's audio, and propose the cut with timecodes before cutting.

## Cutting
- Silences and dead air: the **Cut silences** button at the top (no model needed, by voice or by level), or ask me. Social-tight by default; say "looser" for natural pacing.
- Pauses by Premiere's transcript rule: "remove pauses longer than a second".
- Cut to a phrase: "cut to where she says X".

## Dialogue
- "What's said in this sequence?" reads Premiere's transcript from the saved project (Text panel > Transcribe, then Cmd+S).
- No transcript yet? I ask whether to download Whisper (runs on this Mac, model choice in Settings) or use Premiere's own.

## Project panel
- "Organize my project": I show the tree, propose bins, then move things. Each move is one Cmd+Z.
- "Make a sequence from this bin", matching the footage or 1080x1920 for vertical.

## Looking and listening
- "Show me a frame at 1:20" renders frames.
- "How loud is this section" reads Premiere's own waveform.
- Drop or paste a screenshot into the chat and I can see it.

## Safety
- Edits go to a duplicate sequence "<name> [Claude]"; the original is untouched.
- Scripts that edit wait for your click (Run it / Run all this session), or turn that off in Settings.
- Cmd+Z undoes each step. Actions Cmd+Z cannot undo get a file checkpoint first.
- What I read goes to Anthropic under your own Claude account, like any Claude Code session. Nothing else leaves the Mac.

## Settings tab
Safety options, the Whisper model (Best / Fast / Fastest), working copies, checkpoints, the log, and updates (the footer says when one is ready).
