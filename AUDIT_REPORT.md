# Audit Report — ذات (zat-webview-app)

Audit of the source repository `reemmgbr/zat-app` (commit `d981905`), what was wrong, and what changed.

## Contents

1. [Original architecture](#1-original-architecture)
2. [Problems discovered](#2-problems-discovered)
3. [The iPhone reCAPTCHA issue](#3-the-iphone-recaptcha-issue)
4. [Fixes implemented](#4-fixes-implemented)
5. [Dependencies changed](#5-dependencies-changed)
6. [Security considerations](#6-security-considerations)
7. [Remaining limitations](#7-remaining-limitations)
8. [Testing results](#8-testing-results)

## 1. Original architecture

- An Expo **SDK 58** app (React Native 0.88.1, React 19.3, TypeScript 6) that wraps the website `https://zat-ksa.com/` in `react-native-webview` 14.0.1.
- There is one screen (`App.tsx`). It has no navigation library, no native authentication, no Firebase SDK, no environment variables, no `eas.json` and no lint setup.
- Login, OTP and reCAPTCHA all happen **on the website**, inside the WebView. The app has no auth code of its own.

## 2. Problems discovered

| # | Severity | Problem | Root cause |
|---|----------|---------|------------|
| 1 | **Critical (iOS)** | reCAPTCHA opens in Safari as a standalone "I'm not a robot" page and never completes | See [section 3](#3-the-iphone-recaptcha-issue) |
| 2 | High | `www.zat-ksa.com` and every subdomain are sent to Safari | The allow check was `url.startsWith('https://zat-ksa.com/')` |
| 3 | High | `npx tsc --noEmit` fails (TS2769: every WebView prop is `never`) | `react-native-webview` declares `class WebView<P = undefined>` with props `WebViewProps & P`. Under TS 6, `useRef<WebView>` gives `WebViewProps & undefined`, which is `never` |
| 4 | High | Any URL scheme is passed to `Linking.openURL`, including `intent:`, `file:` and `javascript:` | The fallback opened every non-matching URL. It also ran for iframes on iOS, so any embedded third-party frame could launch other apps |
| 5 | Medium | Any HTTP error (even a 404 sub-page) replaces the site with "no internet" | `onHttpError={() => setError(true)}` with a single offline message |
| 6 | Medium | "Retry" loses the user's place and history | The error screen unmounted the WebView, so it remounted on the home URL |
| 7 | Medium | Blank white screen after iOS reclaims WebKit memory; Android app crash when the renderer is killed | `onContentProcessDidTerminate` and `onRenderProcessGone` were not handled |
| 8 | Medium | iOS app crash when the site's `<input type="file">` offers "Take Photo" | `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription` and `NSMicrophoneUsageDescription` were missing |
| 9 | Low | The deprecated React Native `SafeAreaView` (warns at runtime, scheduled for removal) | Replaced by `react-native-safe-area-context` |
| 10 | Low | No automatic recovery when the connection comes back | No connectivity handling |
| 11 | Low | The loading overlay blocked touches | `ActivityIndicator` with `absoluteFill` and no `pointerEvents="none"` |
| 12 | Low | The Android back handler re-registered on every navigation | The `canGoBack` state was in the effect's dependencies |
| 13 | Low | No `eas.json`, no development build profile, no lint/typecheck/test scripts | Missing configuration |
| 14 | Low | `.env` was not git-ignored (only `.env*.local`) | `.gitignore` gap |

## 3. The iPhone reCAPTCHA issue

**Symptom:** on iPhone, the app opens a Google reCAPTCHA page showing "I'm not a robot". After you tap it, it keeps loading and login never completes.

**Root cause (verified in `react-native-webview` 14.0.1 source, `apple/RNCWebViewImpl.m`, `decidePolicyForNavigationAction`):**

1. On iOS, WKWebView asks `onShouldStartLoadWithRequest` about **every frame's navigation, including iframes**. The event carries `isTopFrame: false` for iframes. On Android, `shouldOverrideUrlLoading` only fires for the main frame. That is why only iPhone was affected.
2. reCAPTCHA (and Firebase phone auth's helper frames) render inside iframes from `https://www.google.com/recaptcha/…` (or `recaptcha.net`, `*.firebaseapp.com`).
3. The original `shouldLoad` rejected every URL not starting with `https://zat-ksa.com/` and called `Linking.openURL(url)` on it.
4. So the reCAPTCHA `anchor` iframe was **cancelled inside the page and opened in Safari** as a top-level page. Safari shows the checkbox. But the widget communicates with its parent page via `postMessage`, and in Safari there is no parent page. Verification spins forever, and the token can never reach the website's login form in the app.

**Not the cause:**

- **Expo Go.** `react-native-webview` is bundled with Expo Go, and the WebView is a standard WKWebView.
- **Firebase native modules.** The app contains none; whatever auth provider the site uses runs as web code.
- **CAPTCHA configuration on the server.** The same page works in mobile Safari.

**Fix (no CAPTCHA weakening):** `src/navigationPolicy.ts` now distinguishes frames:

- **Iframes** (`isTopFrame === false`) may load `https:`, `about:`, `blob:` and `data:` inside the page. reCAPTCHA therefore runs embedded, exactly as in a browser, with Google's normal checks. Iframes can never trigger other schemes (`tel:`, `intent:`, …) or plain `http:`.
- **Top-frame** navigations load in-app only for allow-listed hosts. That is `zat-ksa.com` and all its subdomains by default, configurable through `EXPO_PUBLIC_ALLOWED_HOSTS`. Other web links and `mailto:`/`tel:`/`sms:`/`whatsapp:` open in the system. Every other scheme is blocked.
- Cookies persist: `sharedCookiesEnabled` on iOS and `thirdPartyCookiesEnabled` on Android. reCAPTCHA and the site's session cookies survive app restarts.

**Expo Go vs. development build:** after this fix the flow does not need native capabilities missing from Expo Go. A development build (`expo-dev-client`, `eas.json` → `development`) is still configured and recommended, because it matches production: your own bundle ID, Info.plist permission strings and WebKit data store.

## 4. Fixes implemented

| File | Change |
|------|--------|
| `src/navigationPolicy.ts` (new) | Pure, unit-tested navigation policy with a strict URL parser. React Native's `URL` polyfill is regex-based and does not match WebKit's parser for `\` or `@` |
| `src/config.ts` (new) | `EXPO_PUBLIC_WEB_URL` / `EXPO_PUBLIC_ALLOWED_HOSTS`, with the original URL as default. Rejects non-HTTPS start URLs |
| `src/WebAppScreen.tsx` (new, from `App.tsx`) | Frame-aware navigation; WebView stays mounted under the error overlay (retry calls `reload()`); separate offline and server-error messages; NetInfo auto-retry; recovery from WebKit/renderer crashes; cookie persistence; file-access and mixed-content hardening; inline media; dev-only WebView inspection; touch-transparent loader; stable back handler; TS 6 typing fix |
| `src/ErrorBoundary.tsx` (new) | Catches render errors in the native shell and offers a retry |
| `App.tsx` | Now composes `SafeAreaProvider` → `ErrorBoundary` → `WebAppScreen` |
| `app.json` | iOS permission strings for WebView file uploads; `ITSAppUsesNonExemptEncryption: false`; Android `softwareKeyboardLayoutMode: resize`; `expo-dev-client` plugin; `scheme` for development builds. Bundle ID and package (`com.zat.app`) unchanged |
| `eas.json` (new) | `development`, `development-simulator`, `preview` (APK) and `production` (AAB / App Store) profiles |
| `eslint.config.js` (new) | `eslint-config-expo` flat config |
| `tsconfig.json` | Excludes `tests/` (run by Node with type stripping) |
| `package.json` | Scripts `lint`, `typecheck`, `test`, `doctor`, `start:go`; `engines.node >= 22.18` |
| `.gitignore` | Ignores `.env`, `.env.*` (keeps `.env.example`), keystores, `*.apk`/`*.aab`/`*.ipa`, Firebase/Google service files, `credentials.json` |
| `.env.example` (new) | Documents the two public variables |
| `tests/navigationPolicy.test.mts` (new) | 6 tests covering allow, external and block decisions, host-spoofing attempts and iframe rules |

## 5. Dependencies changed

All versions are the exact ranges pinned by Expo SDK 58's `bundledNativeModules.json`. No major upgrades.

| Package | Version | Type | Why |
|---------|---------|------|-----|
| `react-native-safe-area-context` | `~5.10.1` | dependency | Replaces the deprecated core `SafeAreaView` (included in Expo Go) |
| `@react-native-community/netinfo` | `12.0.1` | dependency | Offline detection and auto-retry (included in Expo Go) |
| `expo-dev-client` | `~58.0.17` | dependency | Expo development builds |
| `eslint`, `eslint-config-expo` | `^9.39.5`, `~58.0.4` | devDependency | `npx expo lint` |

No dependencies were removed.

> Note: with `expo-dev-client` installed, `npx expo start` targets the development build by default. Use `npm run start:go` (`expo start --go`) to keep using Expo Go.

## 6. Security considerations

- **Navigation:** the main frame is restricted to an allow-list. Iframes are limited to web schemes. Dangerous schemes (`intent:`, `javascript:`, `file:`, custom app schemes) are blocked. Ambiguous URLs with userinfo or backslashes are blocked. `originWhitelist={['*']}` ensures **every** URL goes through this policy. Otherwise the library would open non-matching URLs via `Linking` itself.
- **No JS bridge:** no `onMessage`, `injectedJavaScript` or `window.ReactNativeWebView` usage. The site cannot call native code.
- **WebView hardening:** `allowFileAccess`, `allowFileAccessFromFileURLs` and `allowUniversalAccessFromFileURLs` are `false`. `mixedContentMode="never"`. `javaScriptCanOpenWindowsAutomatically={false}`. Multiple windows are disabled. WebView debugging is on only in `__DEV__`.
- **HTTPS:** the start URL must be `https://`. iOS ATS and Android's default cleartext policy stay in force; no exceptions were added.
- **CAPTCHA:** unchanged and fully enforced by Google. Nothing is bypassed, and no user agent is spoofed.
- **Secrets:** the repository has none. `EXPO_PUBLIC_*` values are public by design (inlined into the bundle). `.env` and signing material are git-ignored.

## 7. Remaining limitations

- **No device testing was done in this audit.** The site `zat-ksa.com` was unreachable from the audit environment (network policy), so the live login page could not be inspected. The fix targets the verified mechanism above. Confirm it on a real iPhone (see README → Troubleshooting).
- **Google/Apple sign-in buttons, if the site adds them:** Google blocks OAuth inside embedded WebViews (`disallowed_useragent`). Those top-frame redirects go to the system browser, and the resulting session does not come back into the WebView. Supporting them needs a native flow (`expo-auth-session` / `expo-web-browser` plus a server endpoint that accepts the token). That is not implemented, because the current site's auth method could not be verified.
- **Third-party iframes:** iframes may load any HTTPS origin. That is required for reCAPTCHA, payment and map widgets, and they run inside the site's own CSP. Tighten the site's `frame-src` CSP if needed.
- **`userInterfaceStyle` / `backgroundColor`:** prebuild warns that these need `expo-system-ui` to take effect on Android. They were left as in the original (no new dependency added). The native shell is white with dark status-bar icons, as before.
- **`SYSTEM_ALERT_WINDOW`:** the Expo/React Native template adds it for the debug dev menu. Add it to `android.blockedPermissions` if Play Console review flags it.
- Splash screen: `assets/splash-icon.png` exists but is not configured, as in the original.

## 8. Testing results

Run in a Linux container (Node 22.22, npm 10.9). Nothing was run on a device or simulator.

| Check | Result |
|-------|--------|
| `npm ci` / `npm install` | ✅ Succeeds |
| `npx tsc --noEmit` | ✅ 0 errors (original: ❌ TS2769, TS7006) |
| `npx expo lint` | ✅ 0 problems |
| `npm test` (Node test runner) | ✅ 6/6 pass |
| `npx expo config --type public` | ✅ Resolves |
| `npx expo export --platform ios --platform android` | ✅ Both Hermes bundles build |
| `npx expo prebuild --no-install` (throwaway copy) | ✅ Generates `ios/` and `android/`. Info.plist strings, `adjustResize` and the dev-client scheme verified |
| `npx expo-doctor` | ⚠️ 18/20. The 2 failing checks need `exp.host` and `reactnative.directory`, which the audit network blocks. The same 2 failed on the untouched original |
| iOS device / simulator | ⛔ Not performed (no macOS/device available) |
| Android device / emulator | ⛔ Not performed |
| EAS build | ⛔ Not performed (needs your Expo account and credentials) |
