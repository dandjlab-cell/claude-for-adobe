# Third-party components

Bundled in `bin/` and `assets/` so the voice-based silence cutter works without any extra installs (Apple Silicon builds). Full licence texts ship in `licenses/`.

| Component | What | Licence |
|---|---|---|
| [whisper.cpp](https://github.com/ggml-org/whisper.cpp) `whisper-vad-speech-segments`, `libwhisper` | Runs the voice-activity model | MIT, `licenses/whisper.cpp-LICENSE` |
| [ggml](https://github.com/ggml-org/ggml) `libggml`, `libggml-base`, `libggml-cpu-*` | Tensor runtime for whisper.cpp | MIT, `licenses/ggml-LICENSE` |
| [Silero VAD](https://github.com/snakers4/silero-vad) v6.2 (`assets/silero-vad-v6.2.0-ggml.bin`) | Voice-activity model | MIT, `licenses/silero-vad-LICENSE` |
| [LLVM OpenMP](https://openmp.llvm.org/) `libomp.dylib` | Threading runtime used by ggml | Apache-2.0 with LLVM exception, `licenses/llvm-openmp-LICENSE.TXT` |

Not bundled: Claude Code (the panel launches the copy installed by the Claude desktop app or the CLI, under the user's own account), and Adobe's transcript JSON schema (the test suite fetches it from schemas.adobe.com at run time).
