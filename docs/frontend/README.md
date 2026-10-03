# Frontend — how to run

Needs Node 24+ and pnpm 12 (`npm install -g --allow-scripts=pnpm pnpm@12.8.1`; without the flag the Windows shim is broken).

```bash
pnpm install
pnpm --filter @link/tokens build      # regenerate tokens.css / theme.css after editing tokens
pnpm --filter @link/web dev           # http://localhost:3000/ar/search   (parent PWA, centre web)
pnpm --filter @link/ops dev           # http://localhost:3001/ar/sign-in
pnpm --filter @link/teacher-app web   # Expo web preview, http://localhost:8081
pnpm --filter @link/teacher-app android
pnpm storybook                        # http://localhost:6006
pnpm lint && pnpm typecheck && pnpm test && pnpm i18n:check
node scripts/screenshots.mjs          # with all four servers running
```

Mocks are on by default (`NEXT_PUBLIC_USE_MOCKS=false` / `EXPO_PUBLIC_USE_MOCKS=false` turns them off). A "Mock data" badge shows whenever they are on. OTP code in mock mode: `123456`.
