# ADR-0005 · Frontend stack

- **Status:** Accepted for Phase 1 frontend work (task owner, 2026-10-03)
- **Date:** 2026-10-03
- **Deciders:** Task owner; implemented by the frontend build

## Context

Phase 1 screens are built from Figma against **mock data** while the backend does not exist. ADR-0004 fixes the repo layout; this ADR records the frontend choices it leaves open.

## Gate waiver

`CLAUDE.md` says no application code until the team has reviewed `docs/13` and `docs/12`. The task owner confirmed on 2026-10-03 that the docs review is done **for frontend purposes**. The remaining Round 2 items are backend-only (payment retry, rent adjustment, triggers, ledger) and do not affect mock-data UI work. The gate stays in force for backend code.

## Decisions

| # | Decision | Why |
|---|---|---|
| 1 | Tokens live in their own package `packages/tokens` (TS object + generated CSS variables + a Tailwind `@theme static` file). Web and native both consume it. | One source for both platforms. |
| 2 | `packages/ui` is **web only**. Native components are in `packages/ui-native`. No shared component code. | Different primitives and styling models. |
| 3 | Next.js 16 (App Router, Turbopack), React 19.2, TypeScript strict. | Current stable. |
| 4 | Tailwind CSS v4, CSS-first `@theme`, mapped to the Figma variable names (`bg-blueSoft`, `rounded-12`, `shadow-card`). Logical utilities only. | Task owner choice. |
| 5 | RTL lint: `scripts/check-rtl.mjs` (part of `pnpm lint`) fails on physical left/right in Tailwind classes, CSS and React Native style keys (RTL-02). Escape hatch: a `rtl-ignore` comment on the line. | A script covers CSS and class strings, which ESLint selectors miss. |
| 6 | Radix primitives (`@radix-ui/react-direction`) wrapped in `LinkProvider`; `<html lang dir>` is set server-side in `app/[lang]/layout.tsx`. | RTL-01. |
| 7 | URLs carry the language: `/{lang}/…`, default `ar`. `proxy.ts` redirects paths without a prefix. | 11 §5. |
| 8 | Fonts: Cairo and Plus Jakarta Sans (OFL), self-hosted from `@fontsource/*` (one file per script subset, Arabic + Latin for Cairo, `font-display: swap`) on web, `@expo-google-fonts/*` in the app. | No third-party font requests. |
| 9 | i18n: ICU MessageFormat via `intl-messageformat`; flat keys `<surface>.<screen>.<element>`; `pnpm i18n:check` fails on missing keys, mismatched placeholders, and Arabic plurals without `few`/`many`. Arabic strings built from glossary "Proposed" terms are listed in `messages/proposed.ar.json` for copywriter review. | RTL-08, RTL-11. |
| 10 | Mocks: MSW 3. Web uses the browser worker. **React Native:** MSW 3 has no `msw/native` entry and its node/browser entries do not resolve under Metro, so `@link/mocks/native` wraps `fetch` and routes through MSW core `getResponse` with the same handlers. Unverified on a device until Batch 3. | Keeps one handler set. |
| 11 | Server state: TanStack Query. `packages/api-client` is hand-written and marked DRAFT; E0-13 replaces it. | Task owner choice. |
| 12 | Teacher app: Expo SDK 57 + Expo Router, RN 0.86. One React version is forced across the workspace with `pnpm` overrides (react 19.2.3, `@types/react` 19.2.4) because Expo pins them. | A single React copy avoids hook errors. |
| 13 | Storybook 10 (`@storybook/react-vite`) for `packages/ui`, with a toolbar toggle for language and direction. Scope for Batch 0: the primitives P01–P03 need. | Task owner scope. |
| 14 | Screenshots: Playwright library script (`scripts/screenshots.mjs`). axe checks start in Batch 1 with the first parent pages. | No parent page exists yet. |
| 15 | Windows-safe: `.gitattributes` (`eol=lf`), node scripts instead of bash, `packageManager` pin, `.tool-versions`. | Task owner's machine is Windows. |

## Consequences

- ✅ Tokens cannot drift between web and native.
- ⚠️ The React Native mock layer is not MSW's official path; revisit if MSW ships a native entry.
- ⚠️ Node 24 is pinned in `.tool-versions`; the dev machine currently runs Node 26.
