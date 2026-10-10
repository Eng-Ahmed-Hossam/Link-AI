# Teacher app: an Android preview build

How to put the teacher app (`apps/teacher-app`, Expo) on Android phones **before the app stores** (PRODUCT_BRIEF §5: no store yet): an `.apk` file that teachers install directly. Two kinds:

| Profile (`apps/teacher-app/eas.json`) | Talks to | Data | Use it for |
|---|---|---|---|
| `preview` | core-api on your server (`EXPO_PUBLIC_API_BASE_URL`, live mode, bearer tokens) | Real accounts, once the server is live | A teacher pilot on real phones |
| `preview-demo` | Nothing: the sample world runs on the phone (mock mode) | Sample only; code `123456` for every number | Showing the app to a teacher or a centre |

Before `preview`, set `EXPO_PUBLIC_API_BASE_URL` in `eas.json` to your server (`https://<LINK_DOMAIN>`; Caddy sends `/v1` to core-api). The app sends `Authorization: Bearer`, so no CORS setting is needed for a phone.

## A. With Expo's build service (simplest; needs a free Expo account)

Account: Ahmed creates one at expo.dev (free tier builds Android in the cloud; nothing to install but Node).

```bash
cd apps/teacher-app
npx eas-cli@latest login                     # the Expo account
npx eas-cli@latest init                      # once: links the project (adds an id to app.json)
npx eas-cli@latest build -p android --profile preview-demo   # or --profile preview
```

At the end EAS prints a link and a QR code to the `.apk`. Open it on the phone, allow "install unknown apps" for the browser once, install. EAS keeps the signing key for you (the same key must sign every later build, or phones refuse the update).

## B. On your own machine (no account; needs Android Studio)

Needs: JDK 17 and the Android SDK (install Android Studio, then SDK Platform 35 and the build tools). On Windows, use PowerShell; paths are the same.

```bash
cd apps/teacher-app
# The mode is fixed at build time:
EXPO_PUBLIC_API_MODE=mock npx expo prebuild -p android --clean     # or API_MODE=live + EXPO_PUBLIC_API_BASE_URL=…
cd android && ./gradlew assembleRelease
# → android/app/build/outputs/apk/release/app-release.apk
```

`prebuild` writes an `android/` folder (git-ignored; delete it after). For a preview, the release build is signed with the debug key; **for anything shared beyond a few phones, make your own release key** (`keytool -genkeypair …`, then `android/app/build.gradle` `signingConfigs`) and keep it safe with the other keys — Play Store later must use the same one.

## C. Check it on the phone

1. Open Link → sign in: `preview-demo` with `0100 000 0002` and `123456` (Ms Salma); `preview` with the teacher's real number (the code arrives by SMS once the SMS adapter exists, S4).
2. Today → a record → hold the mic: Android asks for the microphone once. Voice notes need ai-service on the server (`--profile ai`); without it the app says "Type the note instead".
3. Earnings: the payout account and payouts (S3).
4. Turn on aeroplane mode, save a record, turn it off: it syncs (the offline queue).

## Later: the stores

Play Store: a developer account (one-time fee, Ahmed), the same signing key, a privacy policy URL (docs/legal/privacy.md once approved), the data-safety form (phones, children's first names, voice notes deleted after 30 days). Then `eas build --profile production` with `"buildType": "app-bundle"` and `eas submit -p android`. iOS needs an Apple developer account and is out of scope until then.
