# Repo map

What lives where today (2026-10-07). The target architecture is in [docs/05](../05-architecture.md) and [ADR-0004](../adr/ADR-0004-monorepo-layout.md); this page describes the code that exists.

## Apps

| Path | What | Runs as |
|---|---|---|
| `apps/web` | Next.js: the **landing page** (`/{lang}`, try it, request a pilot), the **owner web** (`/{lang}/centre/…`), the **parent PWA** (`/{lang}/welcome`, `/search`, `/children`…), the dev route index (`/{lang}/dev`, demo only) and `POST /api/pilot-request` | `pnpm demo` (mock server), API mode `mock` (MSW in the browser), or the pilot build (`.next-pilot`) |
| `apps/teacher-app` | Expo (React Native) teacher app: Today, session records, voice notes, groups, records history; `/try` for the website demo | Expo web on :8081 in the demo; static web export in the pilot (`dist-pilot`) |
| `apps/pilot` | The **concierge pilot** server for one centre (ADR-0008): PIN sign-in, JSON store + append-only log, backups, start-up check, preflight, practice centre | `pnpm pilot:*` (runbook: [docs/pilot/runbook.md](../pilot/runbook.md)) |
| `apps/ai-service` | Python FastAPI: local speech-to-text (Whisper), name matching, extraction with rules + local LLM (Ollama), leak check (ADR-0007) | Started by `pnpm demo` / `pnpm pilot:start` when voice is on; 127.0.0.1 only |
| `apps/core-api` | The future backend: SQL migrations and seeds only so far (ADR-0006) | — |
| `apps/ops` | The future ops console: placeholder | — |

## Packages

| Path | What |
|---|---|
| `packages/mocks` | The domain in memory: marketplace and follow-up (records, rules, cases, messages, voice), MSW handlers, the demo scenario, the pilot's handler subset |
| `packages/api-client` | Typed API client and React Query hooks, shared by web and teacher app |
| `packages/ui` | Web components (Tailwind), including `Link Web / Button` and `FAQ item`; Storybook |
| `packages/ui-native` | React Native components for the teacher app |
| `packages/tokens` | Design tokens (colours, type, spacing) → CSS and RN |
| `packages/i18n` | Arabic and English messages (ICU), formatters, the review export |
| `packages/config` | Shared ESLint and TypeScript config |

## Python

| Path | What |
|---|---|
| `py/link_nlp` | The Arabic NLP core: normalisation, roster matching, rules, redaction and the leak check ([docs/ai/link-nlp.md](../ai/link-nlp.md)) |
| `evals/` | The evaluation kit: gold v1 set (locked), dev set, runner, reports ([docs/pilot/accuracy.md](../pilot/accuracy.md)) |

## Other

| Path | What |
|---|---|
| `scripts/` | Repo scripts: `demo`, `demo:warm`, env and RTL checks, screenshots, the pilot guides' PDFs, landing shots and social cards |
| `infra/` | Local Docker Compose for the future backend; Terraform placeholders |
| `docs/` | Product and engineering docs (00–14), ADRs, the pilot pack (`docs/pilot`), frontend plan and screen log (`docs/frontend`), the hands-on walkthrough (`docs/testing`), prompts (`docs/prompts`) |
