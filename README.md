# ذات — Zat WebView App

An Android and iOS app that presents [zat-ksa.com](https://zat-ksa.com/) in a secure, full-screen WebView. Built with Expo SDK 58, React Native 0.88, TypeScript and `react-native-webview`.

See [AUDIT_REPORT.md](./AUDIT_REPORT.md) for the audit of the original project, the iPhone reCAPTCHA root cause, and test results.

## Contents

- [Architecture](#architecture)
- [Requirements](#requirements)
- [Installation](#installation)
- [Environment variables](#environment-variables)
- [Local development](#local-development)
- [Expo development build](#expo-development-build)
- [Android builds](#android-builds)
- [iOS builds](#ios-builds)
- [WebView configuration](#webview-configuration)
- [Authentication](#authentication)
- [Troubleshooting](#troubleshooting)

## Architecture

```
index.ts                  registerRootComponent(App)
App.tsx                   SafeAreaProvider → ErrorBoundary → WebAppScreen
src/
  config.ts               EXPO_PUBLIC_WEB_URL / EXPO_PUBLIC_ALLOWED_HOSTS (validated)
  navigationPolicy.ts     Pure allow / external / block decision for every navigation
  WebAppScreen.tsx        WebView, back button, loading, offline and error states
  ErrorBoundary.tsx       Fallback UI for native-shell render errors
tests/
  navigationPolicy.test.mts   Node test runner unit tests
app.json                  Expo config (bundle ID / package: com.zat.app)
eas.json                  EAS Build profiles
```

The website owns all business logic, login and OTP. The app is a hardened browser shell with **no JavaScript bridge** to native code.

## Requirements

- Node.js **22.18+** (the tests use Node's built-in TypeScript type stripping)
- npm 10+
- For device builds: an [Expo account](https://expo.dev/signup) and `npx eas-cli@latest`
- iOS store builds: an Apple Developer Program membership
- Android store builds: a Google Play Console account
- Optional local native builds: Xcode 16+ (macOS) and/or Android Studio with JDK 17

## Installation

```bash
git clone https://github.com/<your-account>/zat-webview-app.git
cd zat-webview-app
npm ci
cp .env.example .env   # optional; defaults point at https://zat-ksa.com/
```

Add packages with `npx expo install <pkg>` so versions stay compatible with SDK 58.

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `EXPO_PUBLIC_WEB_URL` | `https://zat-ksa.com/` | Start page. Must be `https://`, or the app refuses to start |
| `EXPO_PUBLIC_ALLOWED_HOSTS` | host of the start URL without `www.` | Comma-separated hosts allowed in the main frame. Subdomains are included automatically |

`EXPO_PUBLIC_*` values are **inlined into the app bundle**. Never put secrets in them. For EAS builds, set them in the `env` block of the profile in `eas.json` or as EAS environment variables (`npx eas-cli@latest env:create`). `.env` files are git-ignored.

## Local development

```bash
npm run start:go      # Expo Go (scan the QR code with the Expo Go app)
npm start             # development build (after installing one, see below)
npm run typecheck     # tsc --noEmit
npm run lint          # expo lint
npm test              # navigation policy unit tests
npm run doctor        # expo-doctor (needs internet access to exp.host)
```

The app works in Expo Go: every native module it uses is bundled there. Because `expo-dev-client` is installed, plain `npm start` targets a development build. Use `start:go` for Expo Go.

## Expo development build

A development build is your own app binary (`com.zat.app`) with the dev menu. It matches production more closely than Expo Go: same Info.plist permissions, same WebKit data store, same cookies.

```bash
npx eas-cli@latest login
npx eas-cli@latest init                       # links the project, writes extra.eas.projectId
npx eas-cli@latest build --profile development --platform android   # installable APK
npx eas-cli@latest build --profile development --platform ios       # registered devices (ad hoc)
npx eas-cli@latest build --profile development-simulator --platform ios  # iOS Simulator
npm start                                     # then open the build and connect to the dev server
```

For iOS device builds, register the iPhone first with `npx eas-cli@latest device:create`. To build locally instead: `npx expo run:android` / `npx expo run:ios` (requires Android Studio / Xcode). This generates `android/` and `ios/`, which are git-ignored (Continuous Native Generation); don't edit them by hand.

## Android builds

```bash
npx eas-cli@latest build --profile preview --platform android      # APK for direct install / QA
npx eas-cli@latest build --profile production --platform android   # AAB for Google Play
npx eas-cli@latest submit --platform android --profile production  # upload to Play Console
```

EAS generates and stores the upload keystore on first build. Back it up via `npx eas-cli@latest credentials`.

**Test on Android:** install the APK from the EAS build page (QR code) or `adb install <file>.apk`. Check login and OTP, the hardware back button (goes back in web history, then exits), offline mode (airplane mode shows the offline screen; turning it off reloads automatically), external links and `tel:`/`mailto:`, file uploads, and that the session survives an app restart.

## iOS builds

```bash
npx eas-cli@latest build --profile preview --platform ios          # ad hoc build for registered devices
npx eas-cli@latest build --profile production --platform ios       # App Store / TestFlight build
npx eas-cli@latest submit --platform ios --profile production      # upload to App Store Connect / TestFlight
```

EAS manages certificates and provisioning profiles with your Apple ID on first build. The `com.zat.app` bundle identifier must be available to your Apple team. If it isn't, change `ios.bundleIdentifier` in `app.json`.

**Test on iPhone:** install through TestFlight, or the ad hoc build's install link (Settings → Privacy & Security → Developer Mode must be on for development builds). Run the same checklist as on Android, and pay special attention to the reCAPTCHA / OTP login (see [Authentication](#authentication)). Also check the swipe-back gesture and file upload (camera and photo library prompts appear in Arabic).

## WebView configuration

Everything lives in `src/WebAppScreen.tsx` and `src/navigationPolicy.ts`.

| Navigation | Decision |
|------------|----------|
| Main frame, `https://` allow-listed host or subdomain | Loads in the app |
| Main frame, other `https://` / `http://` URL | Opens in the system browser |
| Main frame, `mailto:`, `tel:`, `sms:`, `whatsapp:` | Opens the matching app |
| Iframe (iOS reports these), `https:` / `about:` / `blob:` / `data:` | Loads inside the page (reCAPTCHA, embeds) |
| Anything else (`intent:`, `javascript:`, `file:`, custom schemes, ambiguous URLs) | Blocked |

Other behavior:

- Full screen, with safe-area insets for the notch and home indicator
- Keyboard: Android uses `adjustResize`; iOS is handled by WKWebView
- Persistent cookies and local storage (`sharedCookiesEnabled`, `thirdPartyCookiesEnabled`, `domStorageEnabled`)
- Loading spinner on first load; offline and server-error overlays with retry; automatic reload on reconnect
- Recovery when iOS terminates the WebKit process (reload) or the Android renderer dies (remount)
- Android back button walks web history; iOS supports the swipe-back gesture; pull to refresh
- File-scheme access and mixed content disabled; no native bridge; WebView inspection only in development

## Authentication

Authentication is implemented **by the website** and runs inside the WebView. The app adds no auth provider of its own.

- **reCAPTCHA / OTP:** works embedded. The original iPhone bug was the app forcing the reCAPTCHA iframe out to Safari (details in [AUDIT_REPORT.md](./AUDIT_REPORT.md#3-the-iphone-recaptcha-issue)). CAPTCHA is not bypassed or weakened.
- **Firebase (if the site uses it):** add every domain that serves the site (`zat-ksa.com`, `www.zat-ksa.com`) under Firebase Console → Authentication → Settings → Authorized domains. Add the same domains to the reCAPTCHA key's domain list in the Google reCAPTCHA admin console. No app-side domain is needed; the page origin is the website.
- **Session persistence:** cookies persist across launches. Logging out on the site clears them as in a browser.
- **"Sign in with Google/Apple" on the site (if added):** Google blocks OAuth inside embedded WebViews. Such redirects open in the system browser, and the session will not return to the app. Supporting them needs a native flow (`expo-auth-session` / `expo-web-browser` and a backend token exchange).

## Troubleshooting

| Symptom | Check |
|---------|-------|
| reCAPTCHA still spins on iPhone | Confirm you're running this version (Expo Go: reload with `npm run start:go`). In a dev build, inspect the page from Safari → Develop → [device] (dev builds only) and look for console errors. Confirm the domain is in the reCAPTCHA key's / Firebase authorized domains |
| A page from the site opens in Safari | Its host isn't allow-listed. Add it to `EXPO_PUBLIC_ALLOWED_HOSTS` |
| "تعذر الاتصال بالإنترنت" with a working connection | The site's TLS or DNS failed. Open the URL in Safari/Chrome on the same device |
| App crashes on start with "EXPO_PUBLIC_WEB_URL must be a valid https:// URL" | Fix the value in `.env` or `eas.json` |
| `npx expo start` opens the dev-client screen instead of Expo Go | Use `npm run start:go` |
| iOS build fails on bundle identifier | `com.zat.app` belongs to another team. Change `ios.bundleIdentifier` |
| `expo-doctor` network errors | It needs access to `exp.host` and `reactnative.directory` |
