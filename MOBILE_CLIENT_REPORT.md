# Mobile Client Report: CS160 Bank (React Native + Expo)

Prepared 2026-10-06 from a full read of the repository at commit `bc9c48b` (branch `main`). Every source file was reviewed: `app/`, `src/`, `backend/`, the config files, `ReadMe.md`, and `PROJECT_HANDOFF.md`.

---

## 1. TL;DR

- **The web UI is already a React Native app.** It is built with Expo and React Native Web, so every screen uses `View`, `Text`, `Pressable`, `TextInput`, and `StyleSheet`, not HTML. In principle the existing code already runs on iOS and Android. Most of the mobile client is **adapting** code, not rewriting it.
- **Roughly 70–80% of the client code can be reused as is:** the API client, app state and business logic, validation, theme, UI primitives, demo data, and most screen layouts.
- **About 20–30% needs mobile-specific work:**
  1. Secure, persistent session storage (the refresh token is lost when the app closes on native).
  2. Mobile navigation (bottom tabs instead of the web's horizontal scroll menu).
  3. Safe-area handling for the notch and status bar.
  4. Native date pickers.
  5. Keyboard handling.
  6. Notifications as a modal or screen.
  7. Automatic token refresh.
  8. **Check deposit**, a mobile-only feature that doesn't exist anywhere yet, on either the client or the backend.
- **The backend is only partly done.** Auth works end to end against Supabase. The `/accounts`, `/transfers`, `/bill-payments`, `/notifications`, `/atm`, MFA, deposit, and profile-update routes **don't exist yet**. Until they do, the mobile app can only do real login, registration, and logout, and everything else must run in **demo mode**.
- **Nobody has run this app on a phone yet.** The handoff only mentions browser smoke tests, and `node_modules` isn't installed in this checkout, so I couldn't bundle it for Android or iOS. Your first job is to run it on a device and confirm what breaks (Section 8).

---

## 2. What the project is

CS160 Bank is a class online-banking project with three parts:

| Part | Tech | Location | Owner |
| --- | --- | --- | --- |
| Web client | Expo SDK 57, React Native 0.86, React 19, Expo Router, React Native Web | Repository root (`app/`, `src/`) | Teammate (done for the UI) |
| Backend API | Python FastAPI + Supabase (Auth + PostgreSQL) | `backend/` | Backend team (auth only so far) |
| **Mobile client** | **React Native + Expo** | **Not started** | **You** |

The request flow, which is the same for web and mobile:

```text
Screen (app/*.jsx)
  -> useApp() action in src/state/AppState.jsx
  -> bankingApi.* in src/services/api.js   (fetch + "Authorization: Bearer <JWT>")
  -> FastAPI route (backend/main.py, backend/auth.py)
  -> get_current_user / require_role checks
  -> Supabase (Auth + Postgres)
```

### Two run modes

These matter a lot for you:

- **Demo mode:** `EXPO_PUBLIC_API_URL` is **not** set. There is no backend. Login opens a sample dashboard built from [src/data/demo.js](src/data/demo.js), and transfers, payments, and so on only change in-memory React state. **This is how you can build almost every mobile screen today**, without waiting for the backend.
- **API mode:** `EXPO_PUBLIC_API_URL` is set. There is real login and registration through FastAPI. Banking lists come back **empty**, because those routes don't exist yet (`loadData()` swallows the errors on purpose).

---

## 3. Inventory: what's done

### 3.1 Backend (`backend/`)

| Route | Status | Notes |
| --- | --- | --- |
| `GET /health`, `GET /health/db` | ✅ Done | Connectivity checks |
| `POST /auth/register` | ✅ Done | Creates a Supabase Auth user and a `public.users` row; always `customer` |
| `POST /auth/login` | ✅ Done | Returns `access_token`, `refresh_token`, `expires_in`, `profile` |
| `POST /auth/refresh` | ✅ Done | Exchanges a refresh token for a new session |
| `GET /auth/me` | ✅ Done | Returns `{ profile }` |
| `POST /auth/logout` | ✅ Done | Revokes the session (204) |
| `POST /auth/forgot-password` | ✅ Done | Sends the Supabase reset email (204). **No `redirect_to` is passed**, see §6.9 |
| `GET /manager/customers` | ✅ Done | Admin only |
| `/accounts` (GET, POST, DELETE), `/accounts/{id}/transactions` | ❌ Not built | No tables either |
| `POST /transfers` | ❌ Not built | |
| `/bill-payments` (GET, POST, DELETE) | ❌ Not built | |
| `/notifications`, `PATCH /notifications/{id}/read` | ❌ Not built | |
| `GET /atm/search` | ❌ Not built | Needs a Maps/Places API |
| `POST /auth/mfa/verify` | ❌ Not built | UI exists, backend doesn't |
| Profile update (for example `PATCH /auth/me`) | ❌ Not built | Not even specified yet |
| `/manager/accounts`, `/manager/reports` | ❌ Not built | The manager screen errors in API mode |
| **Check deposit (`POST /deposits` or similar) + image storage** | ❌ **Not built or designed** | **This is your main mobile-only feature** |
| Push-notification device registration | ❌ Not built or designed | Only needed if you add push |

Database: only `public.users` exists (schema in [ReadMe.md](ReadMe.md)). Roles are `customer` and `admin`.

Important for mobile: the backend uses **CORS**, which only affects browsers. Native `fetch` calls from a phone **ignore CORS**, so you don't need the backend team to add your origin.

### 3.2 Client (shared web code)

| File | What it does | Done? |
| --- | --- | --- |
| [app/_layout.jsx](app/_layout.jsx) | Root layout: providers, shows `LoginScreen` or `AppShell` + `<Slot/>` | ✅ |
| [app/index.jsx](app/index.jsx) | Overview: hero, total balance, account cards, quick actions, recent activity | ✅ |
| [app/accounts.jsx](app/accounts.jsx) | Account list, open account, two-step close | ✅ UI (backend missing) |
| [app/transfer.jsx](app/transfer.jsx) | Internal transfer form with validation | ✅ UI (backend missing) |
| [app/payments.jsx](app/payments.jsx) | Schedule, list, and cancel bill payments | ✅ UI (backend missing) |
| [app/activity.jsx](app/activity.jsx) | Transaction list with account, search, type, and date filters | ✅ UI (backend missing) |
| [app/atms.jsx](app/atms.jsx) | ATM search by text, "Directions" opens Google Maps | ✅ UI (backend missing) |
| [app/profile.jsx](app/profile.jsx) | Profile form (editable only in demo) | ✅ UI (backend missing) |
| [app/manager.jsx](app/manager.jsx) | Staff dashboard: customers, accounts, report summary | ✅ UI (partly backed) |
| [app/checks.jsx](app/checks.jsx) | **Placeholder only.** Says "use the mobile app" | ⚠️ Placeholder, **yours to build** |
| [src/components/LoginScreen.jsx](src/components/LoginScreen.jsx) | Sign in, register, forgot password, MFA views | ✅ |
| [src/components/AppShell.jsx](src/components/AppShell.jsx) | Header, sidebar (wide) or horizontal tab strip (narrow), notifications panel | ✅ web, ⚠️ needs a mobile version |
| [src/components/AccountCard.jsx](src/components/AccountCard.jsx), [ActivityRows.jsx](src/components/ActivityRows.jsx) | Reusable cards and rows | ✅ |
| [src/state/AppState.jsx](src/state/AppState.jsx) | **All** state, auth flow, validation, and actions in one React Context | ✅ |
| [src/services/api.js](src/services/api.js) | `fetch` wrapper, bearer token, refresh-token storage, `bankingApi` methods | ✅ web, ⚠️ storage is web-only |
| [src/ui/primitives.jsx](src/ui/primitives.jsx) | `Icon`, `Action`, `LinkButton`, `Card`, `Divider`, `Field`, `Choice`, `SectionHeading`, `Status`, `Notice` | ✅ |
| [src/theme.js](src/theme.js) | Color tokens, `money()`, `dateLabel()` | ✅ |
| [src/styles/appStyles.js](src/styles/appStyles.js) | One big `StyleSheet` for everything | ✅ (a few web-only bits, see §6) |
| [src/data/demo.js](src/data/demo.js) | Sample profile, accounts, transactions, payments, notifications, ATMs, manager data | ✅ |
| [src/navigation/nav.js](src/navigation/nav.js) | Menu items: path, label, Ionicons name | ✅ |

---

## 4. Reuse plan: what you can take from the web UI

### 4.1 Reuse as is (no changes)

| What | Why it just works |
| --- | --- |
| `src/theme.js` | Plain JS. `Intl.NumberFormat` and `toLocaleDateString` are supported by Hermes, React Native's JS engine |
| `src/data/demo.js` | Plain data |
| `src/navigation/nav.js` | Plain data. You can feed it into a tab bar |
| `bankingApi` in `src/services/api.js` | `fetch` exists in React Native |
| Validation helpers in `AppState.jsx` (`validEmail`, `validMoney`, `validDate`) | Plain JS |
| All actions in `AppState.jsx` (`signIn`, `register`, `submitTransfer`, `submitPayment`, `createAccount`, `closeAccount`, `markRead`, …) | Pure React + fetch. Same behavior on mobile |
| `src/ui/primitives.jsx` | Built on RN primitives + `@expo/vector-icons`, which work natively |
| `AccountCard`, `ActivityRows` | Built on RN primitives |
| `LoginScreen` | Works, but needs keyboard handling (§6.6) |
| Screen bodies (`app/*.jsx`) | Already switch to a stacked layout when `compact` is true, and phones are always `compact` (width < 860) |

### 4.2 Reuse with small changes

| What | Change needed | Section |
| --- | --- | --- |
| `src/services/api.js` | Replace `localStorage` with `expo-secure-store` on native, add auto-refresh on 401, add a `FormData` upload helper | §6.1, §6.2, §7.1 |
| `src/state/AppState.jsx` | Restore the session from secure storage (async), reset all lists on sign-out, refresh the token when the app returns to the foreground | §6.1, §6.2, §10 |
| Date fields in `payments.jsx` and `activity.jsx` | Swap the `YYYY-MM-DD` text field for a native date picker | §6.5 |
| `appStyles.js` | Add native shadows (`elevation` and `shadow*`); `boxShadow` is wrapped in `Platform.select({ web })` | §6.7 |

### 4.3 Replace or build new for mobile

| What | Why |
| --- | --- |
| `AppShell` | The web shell is a sidebar or horizontal scroll strip with a hard-coded header. Mobile users expect **bottom tabs** + a safe-area header |
| Notifications panel | An absolutely positioned dropdown. On mobile it should be a `Modal` or its own screen |
| `app/checks.jsx` (check deposit) | Real camera capture, image upload, and review. All new |
| ATM screen (optional upgrade) | "Use my location" (`expo-location`) and maybe an in-app map (`react-native-maps`) |
| Password-reset deep link landing screen | Doesn't exist on web either |

---

## 5. The big decision: how to structure the mobile app

Make this decision with the team **before** writing code. There are two realistic options.

### Option A (recommended): one Expo project, web and mobile together

Expo is designed to build web, iOS, and Android from **one codebase**. You keep everything in the repository root and add mobile-specific pieces with:

- **`Platform.OS` checks**: `if (Platform.OS === 'web') … else …` (already used in `AppState.jsx` and `appStyles.js`).
- **Platform-specific files**: Metro, the bundler, picks `Foo.native.jsx` on iOS/Android and `Foo.jsx` on web. For example, `src/components/AppShell.native.jsx` would give mobile its own shell while web keeps the current one, and the import (`'../components/AppShell'`) stays the same.
- Expo Router also supports platform-specific route and layout files (for example `app/_layout.native.jsx` next to `app/_layout.jsx`). A non-platform version of the file must still exist. **Check the current Expo Router docs ("Platform-specific modules") before relying on this.**

Pros: maximum reuse, a bug fix in `AppState` fixes both apps, one `npm install`.
Cons: you and the web dev edit the same files, so you need to coordinate through branches and PRs. Use `.native.jsx` files to stay out of each other's way.

### Option B: a separate `mobile/` Expo project in the same repository

Run `npx create-expo-app mobile` and copy or share `src/`.

Pros: complete independence, so you can't break web.
Cons: copying means two diverging copies of `AppState`/`api.js`. Truly sharing needs a monorepo setup (npm workspaces + Metro `watchFolders` config), which is painful for an Expo beginner.

**Recommendation: Option A.** The handoff explicitly says the web was built on Expo "so the UI framework can be shared with mobile work." Put mobile-only UI in `*.native.jsx` files and keep shared logic in `src/state`, `src/services`, and `src/ui`.

---

## 6. Native-readiness audit: concrete issues in the current code

These are problems that **will** or **may** show up when the existing code runs on a phone. File and line references are as of `bc9c48b`.

### 6.1 Session is lost every time the app closes (must fix)

[src/services/api.js:6](src/services/api.js#L6) only stores the refresh token if `localStorage` exists. It doesn't on iOS or Android, so on native **users must log in every time they open the app**.

**Fix:** install `expo-secure-store` (iOS Keychain / Android Keystore, the right place for a bank token) and use it on native.

```js
// sketch: src/services/tokenStorage.native.js
import * as SecureStore from 'expo-secure-store';
const KEY = 'bank_refresh_token';
export const readRefreshToken = () => SecureStore.getItemAsync(KEY);          // async!
export const writeRefreshToken = (t) => t ? SecureStore.setItemAsync(KEY, t) : SecureStore.deleteItemAsync(KEY);
```

Pair it with a `tokenStorage.js` (web) that wraps `localStorage` in the same async interface. **Note:** SecureStore is **async**, but `storedRefreshToken()` is currently called synchronously in [AppState.jsx:152](src/state/AppState.jsx#L152). That `useEffect` must `await` it. This is a small but shared change, so coordinate with the web dev.

### 6.2 No automatic token refresh (must fix)

The access token expires (`expires_in`, typically one hour). `api()` throws on 401 and nothing refreshes it. Phone apps stay open in the background for hours, so users will hit "Your session has expired" constantly.

**Fix:**
- In `api()`, on a 401, call `/auth/refresh` with the stored refresh token **once**, save the new session, and retry the request. If that fails, sign out.
- Also refresh when the app comes back to the foreground, using React Native's `AppState` API (`AppState.addEventListener('change', …)`). Don't confuse it with the project's own `src/state/AppState.jsx`.

### 6.3 `localhost` doesn't mean your computer on a phone (setup)

[.env.example](.env.example) uses `EXPO_PUBLIC_API_URL=http://localhost:8000`. On a real phone, `localhost` is **the phone itself**.

- **Physical phone (Expo Go):** use your PC's LAN IP, for example `EXPO_PUBLIC_API_URL=http://192.168.1.23:8000` (find it with `ipconfig` on Windows). Run the backend with `uvicorn main:app --reload --host 0.0.0.0` so it accepts connections from the network. You may need to allow Python through Windows Firewall.
- **Android emulator:** `http://10.0.2.2:8000` points to your PC.
- **iOS simulator (Mac only):** `localhost` works.
- Restart Expo after changing `.env` (`npx expo start -c` clears the cache).
- Plain `http://` works in Expo Go for development. A production or EAS build needs HTTPS (or Android cleartext and iOS ATS exceptions).

### 6.4 The app shell isn't built for phones (should fix)

[src/components/AppShell.jsx](src/components/AppShell.jsx):
- **No safe area.** The header fakes a status-bar gap with `paddingTop: 28` ([appStyles.js:7](src/styles/appStyles.js#L7), `headerMobile`). On iPhones with a notch or Dynamic Island this is wrong. `react-native-safe-area-context` is already installed and `SafeAreaProvider` is already in `_layout.jsx`, so use `useSafeAreaInsets()` or `<SafeAreaView>`.
- **Navigation** is a horizontally scrolling text strip ([AppShell.jsx:60](src/components/AppShell.jsx#L60)). Mobile banking apps use **bottom tabs** (Overview, Accounts, Pay & Transfer, Deposit, More). Expo Router has a built-in `Tabs` layout (`import { Tabs } from 'expo-router'`). Put the less common screens (Activity, ATM, Profile, Manager) under a "More" tab or a stack.
- **Header buttons** (bell, avatar, "Sign out" link) are crowded on a phone. Move Sign out to Profile.
- **Notification panel** ([AppShell.jsx:71](src/components/AppShell.jsx#L71)) is an absolutely positioned box. Use a React Native `Modal` (slide-up sheet) or a `/notifications` screen.
- `<Slot />` has no native back gesture or stack transitions. Using `Stack`/`Tabs` from expo-router gives you native navigation behavior.

### 6.5 Date inputs are typed text (should fix)

[app/payments.jsx:24](app/payments.jsx#L24) and [app/activity.jsx:25-26](app/activity.jsx#L25-L26) ask users to type `YYYY-MM-DD`. On mobile, use `@react-native-community/datetimepicker` (install with `npx expo install`). Convert the picked `Date` to `YYYY-MM-DD` so the existing `validDate()` and the API payloads stay the same.

### 6.6 Keyboard covers inputs (should fix)

Forms (login, register, transfer, payments) aren't wrapped in `KeyboardAvoidingView`. On iOS especially, the keyboard will hide the lower fields and the submit button. Wrap the form screens in `<KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>`. `keyboardShouldPersistTaps="handled"` is already set on the ScrollViews.

### 6.7 Web-only styles (cosmetic)

- `boxShadow` is web-only, so cards on native have **no shadow** ([appStyles.js:12](src/styles/appStyles.js#L12), [:17](src/styles/appStyles.js#L17)). Add `elevation: 2` (Android) and `shadowColor/shadowOpacity/shadowRadius/shadowOffset` (iOS) in the `default:` branch of `Platform.select`.
- `outlineStyle: 'none'` on `input` exists to hide the browser focus ring. Check that it doesn't warn on native.
- Hero font sizes (31–43 px) and the login screen's two-column layout are tuned for desktop. Check them on a small phone and with large accessibility text.
- `app.json` has `"orientation": "default"`. Most banking apps lock to `"portrait"` on phones.

### 6.8 Shared-state bugs you'll notice (tell the web dev)

These affect web too, but they're more visible on mobile, where the app is never "reloaded":

1. **Sign-out doesn't clear everything.** [AppState.jsx:178-183](src/state/AppState.jsx#L178-L183) resets profile, accounts, and transactions, but **not** `payments`, `notifications`, `managerData`, or the form drafts. If user A signs out and user B signs in on the same phone, B briefly sees A's data. The web hides this with page reloads.
2. **`selectedAccount` is shared** between the Activity filter and the Bill-payment "Pay from" choice (see [AppState.jsx:217](src/state/AppState.jsx#L217)). Changing one changes the other.
3. **Notice color is guessed from the message text** (for example `notice.includes('completed')`), and one global `notice` string is shared by all screens. With tabs, a message from one tab can show up on another. Consider a toast or snackbar on mobile.
4. `isManager` checks `'manager' | 'employee' | 'admin'` ([AppState.jsx:74](src/state/AppState.jsx#L74)), but the backend only has `customer | admin`. This is harmless, just be aware.
5. `today` is computed once at module load ([AppState.jsx:10](src/state/AppState.jsx#L10)). If the app stays open past midnight, date validation is off by a day. Compute it inside `submitPayment`.

### 6.9 Password reset has nowhere to land (backend + mobile)

[backend/auth.py:162](backend/auth.py#L162) calls `reset_password_for_email(email)` **without `redirect_to`**, so the email link goes to the Supabase default Site URL. There is no "set new password" screen on web or mobile. For mobile you'd want a deep link. `app.json` already has `"scheme": "cs160bank"`, so a link like `cs160bank://reset-password?...` could open the app. This needs a design decision with the backend team (Section 11).

### 6.10 Expo Go version compatibility (setup)

The project is on **Expo SDK 57**. The Expo Go app from the App Store or Play Store only supports specific SDK versions. If Expo Go says the project is incompatible, either install a matching Expo Go or make a **development build** (`npx expo run:android` needs Android Studio; `eas build --profile development` builds in the cloud). Some libraries (`react-native-maps` with Google keys, push notifications) also need a development build rather than Expo Go.

---

## 7. Mobile-only features to build

### 7.1 Check deposit ⭐ your headline feature

The design reserves this for mobile ([app/checks.jsx](app/checks.jsx) just says so). **Nothing exists yet**: no UI, no API route, no storage bucket, no table.

**Client steps:**
1. Pick the account and enter the amount (reuse `Choice`, `Field`, and `validMoney`).
2. Capture the **front** of the check, then the **back** (endorsed). Use `expo-camera` (custom camera with a check-shaped overlay) or the simpler `expo-image-picker` (`launchCameraAsync`). Handle camera permission denial gracefully.
3. Review screen: thumbnails, amount, account, with options to retake or submit.
4. Upload as `multipart/form-data`. **`api()` currently forces `Content-Type: application/json`** ([api.js:21](src/services/api.js#L21)), so add an `upload()` helper that sends `FormData` and lets `fetch` set the multipart boundary itself. React Native's file format is `{ uri, name: 'front.jpg', type: 'image/jpeg' }`.
5. Show the result (pending, accepted, or rejected) and refresh accounts and transactions.
6. Optional: compress or resize images first (`expo-image-manipulator`) so uploads are small.

**Backend needs (ask the backend team, or build it yourself if you're full-stack):**
- `POST /deposits` (multipart: `account_id`, `amount`, `front_image`, `back_image`), behind `get_current_user`, with an account-ownership check.
- A Supabase Storage bucket (private) for check images, plus a `deposits` table (`id, user_id, account_id, amount, status, front_path, back_path, created_at`).
- Optional OCR or amount verification; the handoff mentions an "OCR/check service." For a class project, a `pending` status that an admin approves in the manager dashboard is a reasonable substitute.
- `GET /deposits` for history.

### 7.2 Secure session + biometric unlock

- `expo-secure-store` for the refresh token (§6.1).
- Optional and impressive in a demo: `expo-local-authentication` (Face ID / fingerprint) to unlock the app when it reopens, before using the stored refresh token. This is **not** a replacement for the backend MFA, just a convenience lock.

### 7.3 ATM finder upgrades

- "Use my current location" with `expo-location`. The backend `/atm/search` contract may need `lat`/`lng` instead of `location` text; the handoff already flags this (assumption #5).
- Optional in-app map with `react-native-maps` (demo ATMs already include `latitude`/`longitude`).
- "Directions" ([app/atms.jsx:29](app/atms.jsx#L29)) uses a Google Maps web URL, which works on both platforms. On iOS you could open Apple Maps (`maps://?q=…`) instead.

### 7.4 Push notifications (optional / stretch)

- `expo-notifications` for "transfer completed," "payment due," and similar alerts.
- Needs a backend route to save the device's Expo push token and code that sends pushes. Not designed yet. Treat it as a stretch goal; the in-app notifications list (§6.4) is the must-have.

### 7.5 Deep links

- `scheme: "cs160bank"` already exists in `app.json`. Use it for the password-reset landing (§6.9) and possibly email-confirmation links.

---

## 8. Getting started (Expo for beginners)

### 8.1 One-time setup

1. Install **Node 20+** (already required by the ReadMe).
2. On your phone, install **Expo Go** (App Store or Play Store). Optionally install **Android Studio** for an emulator. The iOS simulator needs a Mac.
3. From the repository root:
   ```bash
   npm install
   npx expo start          # starts Metro; shows a QR code
   ```
4. Scan the QR code with the Camera app (iOS) or Expo Go (Android). Your phone and PC must be on the **same Wi-Fi**. If that doesn't work (for example on campus Wi-Fi), use `npx expo start --tunnel`.
5. With no `.env`, the app runs in **demo mode**. Tap "Open demo dashboard." This is your first milestone: see the existing web UI on your phone.

### 8.2 Connect to the real backend

1. Follow ReadMe §2 to set up `backend/.env` (ask a teammate for the Supabase keys).
2. Run `uvicorn main:app --reload --host 0.0.0.0` in `backend/`.
3. Create `.env` in the root: `EXPO_PUBLIC_API_URL=http://<your-PC-LAN-IP>:8000`.
4. Run `npx expo start -c`, then register an account and log in from the phone.

### 8.3 Installing libraries

**Always use `npx expo install <pkg>`**, not `npm install <pkg>`, for native libraries. It picks the version compatible with SDK 57. Libraries you'll likely need:

```bash
npx expo install expo-secure-store expo-image-picker expo-camera expo-location \
  @react-native-community/datetimepicker expo-local-authentication expo-image-manipulator
# optional: react-native-maps expo-notifications
```

Each permission-based library (camera, location) needs a permission message in `app.json` under its plugin config. Each library's Expo docs page shows what to add.

### 8.4 Debugging

- Shake the phone (or press `m` in the terminal) for the dev menu, then **Open JS debugger**.
- `console.log` output shows in the terminal running `npx expo start`.
- Red screen = JS error with a stack trace. Yellow box = warning.
- If things get weird, run `npx expo start -c` (clear cache).

---

## 9. React Native cheat sheet for web developers

| Web | React Native | Notes |
| --- | --- | --- |
| `<div>` | `<View>` | Flexbox by default, **`flexDirection: 'column'`** by default (web defaults to row) |
| `<p>`, `<span>` | `<Text>` | **All text must be inside `<Text>`**, or it crashes |
| `<button onClick>` | `<Pressable onPress>` | The project wraps this as `Action` and `LinkButton` |
| `<input>` | `<TextInput>` | `onChangeText` gives the string directly. The project wraps this as `Field` |
| CSS files | `StyleSheet.create({...})` | camelCase, numbers are density-independent pixels, no cascade, no `%` for everything, no hover |
| `overflow: scroll` | `<ScrollView>` / `<FlatList>` | Use `FlatList` for long lists (transactions), since it only renders visible rows |
| `localStorage` | `expo-secure-store` (secrets), `@react-native-async-storage/async-storage` (non-secret) | Both are **async** |
| `window.location`, `<a href>` | `expo-router`'s `router.push('/x')`, `<Link>` | Already used: `navigate()` in AppState |
| `alert()` / `confirm()` | `Alert.alert(title, msg, buttons)` | Handy for "Close this account?" confirmations |
| Media queries | `useWindowDimensions()` | Already used: `compact = width < 860` |
| `.env` → `process.env.X` | Only `EXPO_PUBLIC_*` variables are exposed | Embedded in the app bundle, so **never** put secrets there |

**Expo Router basics:** each file in `app/` is a route (`app/transfer.jsx` → `/transfer`). `_layout.jsx` wraps the routes in that folder. Folders in parentheses like `app/(tabs)/` group routes without changing the URL, which is how you'd add a tab bar.

---

## 10. Suggested step-by-step plan (checklist)

### Phase 0: decide and set up (day 1–2)
- [ ] Agree with the team on **Option A vs B** (§5). Create a branch (for example `mobile`).
- [ ] `npm install`, `npx expo start`, open the app in Expo Go in **demo mode**.
- [ ] Click through **every** screen on the phone and write down what looks broken. This replaces the native test I couldn't run.
- [ ] Confirm Expo Go supports SDK 57, or set up a development build (§6.10).

### Phase 1: mobile shell (week 1)
- [ ] Mobile layout with **bottom tabs** via expo-router `Tabs` (`app/(tabs)/_layout.jsx` or a `.native` layout, depending on §5).
- [ ] Mobile header with **safe-area insets**, bell icon, and avatar.
- [ ] Notifications as a `Modal` or screen.
- [ ] Move Sign out to Profile.
- [ ] Native card shadows. Lock to portrait.

### Phase 2: auth that works like a real app (week 1–2)
- [ ] `expo-secure-store` token storage (§6.1), with an async restore on launch and a splash/loading state while restoring (already exists: `restoring`).
- [ ] Auto-refresh on 401 + on app foreground (§6.2).
- [ ] Clear **all** state on sign-out (§6.8.1).
- [ ] Keyboard handling on Login and Register (§6.6).
- [ ] Test against the real backend over LAN (§8.2): register, login, kill and reopen the app (still logged in?), logout.
- [ ] Optional: biometric unlock (§7.2).

### Phase 3: polish existing screens for touch (week 2)
- [ ] Native date pickers for Payments and Activity (§6.5).
- [ ] `FlatList` for Activity, plus pull-to-refresh (`refreshControl` calling `loadData`) on Overview, Accounts, and Activity.
- [ ] `Alert.alert` confirm for close account and cancel payment.
- [ ] Toast/snackbar or per-screen notices instead of one global `notice` (§6.8.3).
- [ ] Check with large accessibility text and a small phone (iPhone SE size).

### Phase 4: check deposit (week 3+, depends on the backend)
- [ ] Agree on the `/deposits` contract with the backend team (§7.1, §11).
- [ ] Build the capture flow: account and amount → front photo → back photo → review → submit.
- [ ] Add a `FormData` upload helper to `api.js`.
- [ ] Add a demo-mode fake (add a pending transaction locally) so it can be demoed before the backend exists.

### Phase 5: wire up the backend as routes land (ongoing)
- [ ] As each route (`/accounts`, `/transfers`, `/bill-payments`, `/notifications`, `/atm/search`, profile update, MFA) is built, test it in API mode on the phone. Most of the client code already calls them via `bankingApi`.
- [ ] ATM "use my location" (§7.3) once the ATM API shape is known.

### Phase 6: ship and demo
- [ ] Add `ios.bundleIdentifier` and `android.package` to `app.json`, plus app icon and splash assets (none exist yet).
- [ ] `eas build` for an installable APK (Android) to demo, or use Expo Go for class demos.
- [ ] Point `EXPO_PUBLIC_API_URL` at a deployed HTTPS backend for anything beyond your laptop.

---

## 11. Things to coordinate with other teams

**Backend team:**
1. Contract and timeline for `/accounts`, `/transfers`, `/bill-payments`, `/notifications`. The client already assumes the payload shapes listed in `PROJECT_HANDOFF.md` ("Assumptions for routes not built yet").
2. **Check-deposit API + storage** (§7.1). Nothing exists yet, so the design should start now.
3. `/atm/search` inputs: text `location` or `lat`/`lng`?
4. A profile update route (`PATCH /auth/me`?).
5. MFA design: `mfa_required` on login and `/auth/mfa/verify`.
6. Password-reset `redirect_to` and whether it should deep-link into the mobile app (§6.9).
7. Whether the backend will be deployed somewhere reachable over HTTPS for demos.
8. (Stretch) A push-token registration route.

**Web dev:**
1. Agree on file ownership: mobile-only UI in `*.native.jsx`, shared logic changes via PR.
2. Shared changes you'll need in `api.js` and `AppState.jsx` (async token storage, 401 refresh, full sign-out reset, `today` fix). These help web too.

---

## 12. Open questions

- Does the course require **both** iOS and Android, or is one enough? (iOS builds on real devices need an Apple developer account; Expo Go avoids that for demos.)
- Should the manager dashboard exist on mobile, or is it web-only? (It works today, but staff tools are usually desktop.)
- Is real OCR needed for check deposit, or is "pending, admin approves" acceptable?
- Are push notifications in scope?
- Is a deployed backend planned, or will demos run on a laptop over LAN?

---

## 13. Quick reference: key files for you

| You want to… | Look at |
| --- | --- |
| See how API calls are made | [src/services/api.js](src/services/api.js) |
| See all app state and actions | [src/state/AppState.jsx](src/state/AppState.jsx) |
| Reuse buttons, inputs, cards | [src/ui/primitives.jsx](src/ui/primitives.jsx) |
| Reuse colors and money formatting | [src/theme.js](src/theme.js) |
| See the nav menu definition | [src/navigation/nav.js](src/navigation/nav.js) |
| See how the shell and nav are drawn (to replace on mobile) | [src/components/AppShell.jsx](src/components/AppShell.jsx) |
| See the root layout | [app/_layout.jsx](app/_layout.jsx) |
| See the auth API and rules | [backend/auth.py](backend/auth.py) |
| See the sample data you'll build against | [src/data/demo.js](src/data/demo.js) |
| Read the original design notes | [PROJECT_HANDOFF.md](PROJECT_HANDOFF.md), [ReadMe.md](ReadMe.md) |
