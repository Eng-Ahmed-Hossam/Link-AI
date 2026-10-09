# Local checks (on your Windows PC)

What the cloud agent cannot do from its environment: download the Whisper and Ollama models, install the Python packages, run on Windows. Run these in order in a terminal at the repository root (PowerShell or Windows Terminal). Write down what the step asks for, and send back anything that does not match the expected output: the agent fixes it.

Before you start: Docker Desktop is running (WSL2), and nothing else uses ports 3000, 4000, 8081 (stop any `pnpm demo`).

| # | Run | Expected | Write down |
|---|---|---|---|
| 1 | `git pull` then `pnpm install` | `git pull` ends on `main` with no conflict; `pnpm install` ends with `Done in …` and no `ERR_PNPM_…` | — |
| 2 | `pnpm doctor` | Every check ✔ (Node 24+, pnpm, Docker running, uv, free ports, `.env.local`); a ✖ line names what to fix. *(Arrives with the setup branch; skip if the command is missing.)* | Any ✖ line |
| 3 | `pnpm setup` | Ends with a ✔ summary and the next command (`pnpm dev`). Running it a second time changes nothing. *(Same branch.)* | **Time** from start to the ✔ line |
| 4a | `cd apps/ai-service` then `uv run pytest -q` | `uv` creates `.venv` and installs the packages the first time; ends with `N passed` (no `failed`, no `error`) | The `N passed` line |
| 4b | still in `apps/ai-service`: `uv run mypy ai_service --ignore-missing-imports` then `cd ../..` | `Success: no issues found in … source files` | — |
| 5a | `pnpm ai:models` | One `→ name: repo` line, then `✔ name in Ns → …` for each of `large-v3-turbo`, `egy-turbo-ft`, `large-v3` (about 6 GB in all; re-running skips finished files). No `✖ … failed` | Download time |
| 5b | Optional, for the extraction and Ask Link: install Ollama, then `ollama pull qwen3:8b` | `success` | — |
| 5c | `pnpm dev` (leave it running; new terminal for the next line) | The banner lists the sign-in numbers, and `Voice notes  ai-service on 127.0.0.1:8090 (local Whisper)` | — |
| 5d | `pnpm voice:try` | A block starting `Voice note (sample audio: apps/ai-service/bench/audio/b01.wav, …)` with `upload …`, `uploaded → draft extraction …`, `speech-to-text …`, `language model …`, `items N (M matched to the roster)` | **Upload → draft time**, the **speech-to-text** and **language model** lines |
| 6 | The click list, steps 1–23, in [RUNNING §3](../RUNNING.md#3-click-it-yourself-steps-123) | Each step does what it says; step 22 uses your own voice on sample words only | The step number and what you saw, for any step that differs |

If `pnpm voice:try` says `ai-service is not answering`, step 5a did not finish or `pnpm dev` was started before it; restart `pnpm dev`. If it says `No record to fill`, use Demo controls → Reset story, then try again.

Send back: the table's "Write down" column, plus the full output of any step that failed.
