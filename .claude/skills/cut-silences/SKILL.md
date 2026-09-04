---
name: cut-silences
description: Use when the editor asks to remove silences, gaps, pauses, dead air, or tighten a talking-head sequence. Plan, show, confirm, apply.
---

# Cut silences

1. `remove_silences` with `dry_run: true` (method `vad`, voice detection; no transcription needed). Default to social-tight: `min_silence_s: 0.3`, `pad_s: 0.04`. If the editor says "loose", "natural", or "leave some air", use `0.6` and `0.15`.
2. One short message: number of ranges, seconds removed, new duration. Ask to proceed.
3. After the go, `remove_silences` with the same parameters and `dry_run: false`.
4. Report the tool's result: ranges cut, new duration, "Cmd+Z undoes one range at a time".

Use `method: "db"` only if asked. Use `remove_pauses` only when the editor wants Premiere's transcript rule (word gaps). Do not call `sequence_overview` or `analyze_audio` first.

For 'clean up the audio' / 'remove the ums': `remove_fillers` first (plan, one line, apply), then the silence pass.
