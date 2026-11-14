# Physical device test log (TC-DEV), requirement R-2

**Rule:** a step counts as 📱 **Device verified** only when the owner has done it on a real Android phone and recorded the result here. Use **fictitious details only**, e.g. a test email address you control and the shop name "Test Shop".

## Before you start
1. The Supabase cloud project exists and its cloud verification has run (R-1). ✅ Done 12 Nov 2026 ([cloud run 43260965124](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43260965124)). The phone talks to the cloud project; it can't reach Claude's local test database.
2. `app/.env` contains the cloud **URL and anon key only** ([setup guide](../setup/SUPABASE-CLOUD-SETUP.md) §4).
3. Choose how to run the app:
   - **Expo Go** (quickest; free; install "Expo Go" from Play Store; run `npm --prefix app start` on your computer and scan the QR code). Limitation: links in emails can't open the app in Expo Go. The confirmation link still confirms the email, but afterwards you log in manually. Password reset by link can't be tested in Expo Go.
   - **Development build** (complete test, including email links): built with Expo's EAS service on its free tier (needs a free Expo account), or locally with Android Studio. Claude can prepare the steps when needed.

## Journey TC-DEV-01 (record each attempt)

| # | Step | Expected result | Result (✅ / ❌) | Notes / screenshot |
|---|---|---|---|---|
| 1 | Open the app | Welcome screen: "ShopMate Ghana", two buttons | | |
| 2 | Create account with a common password (e.g. `password123`, or `password`) | Refused: "This password is too common…"; no account created in Supabase | | |
| 3 | Create account with a strong password | "Check your email" screen (if email confirmation is on) | | |
| 4 | Open the confirmation email and tap the link | Email confirmed. Development build: app opens and continues. Expo Go: a browser page; then return to the app | | |
| 5 | Log in with the wrong password | "Email or password is not correct." (doesn't say which) | | |
| 6 | Log in correctly | "Your shop" setup screen | | |
| 7 | Enter shop details (try an invalid phone like `12345` first) | Invalid phone refused with a clear message; valid details saved | | |
| 8 | Home screen | Shop name, reference `SM-…`, "Device A", "Pilot" | | |
| 9 | Close the app completely and reopen it | Still logged in, Home screen (session restored from secure storage) | | |
| 10 | Log out | Welcome screen | | |
| 11 | Log in again | Home screen with the same shop and "Device A" (no second shop or device) | | |
| 12 | Readability check | Text readable at arm's length; buttons easy to tap | | |

**Phone model and Android version:** ______  **App build:** ______  **Date:** ______

## Issues found

| # | Date | Step | What happened | Severity (blocker / major / minor) | Fix (commit) | Re-checked on phone (date) |
|---|---|---|---|---|---|---|
| 1 | 2026-11-14 | 2 | `password123` was accepted and the "Check your email" screen appeared (Expo Go, Android). Cause: the app's common-password check matched exact list entries only, and `password123` isn't on the list | Major (weak password allowed; app-side rule only) | Rule extended: a listed password followed by numbers or symbols is also rejected (`app/src/auth/passwordPolicy.ts`, TC-AUTH-18). Local tests pass; **not yet committed** | Pending |
| 2 | 2026-11-14 | 9 | **Intermittent session restoration (open).** Two earlier attempts at closing Expo Go completely and reopening it returned to the login screen. Logging in again showed the same shop and "Device A", confirming that the shop and device registration were retained. Later attempts restored the session, after about 2–3 minutes and after more than 70 minutes. A reload (`r`) also restored it. Cause unknown; not reproduced in the latest attempts. Fails safe (the owner logs in again; no data exposed) | Major | None yet (no code change). Keep open until step 9 is re-checked in a **development build** (and, if useful, with development-only diagnostics that log event names only) | Pending (development build) |

All issues must be fixed and re-checked on the phone before work moves beyond the authentication foundation (owner condition, Stage 1B approval).

### Resolved configuration problems (not application defects)

- **2026-11-14, initial registration failure.** Tapping "Create account" showed "Something went wrong on our side…" and no user was created in Supabase. Cause, found by the owner: the Supabase URL in the local app configuration (`app/.env` on the owner's computer, not in the repository) incorrectly ended with `/rest/v1`. Correcting it to the project URL resolved the problem, and registration and email confirmation then succeeded. **Resolved (configuration).** Separate note: the app's generic message hid the underlying error; development-only diagnostics were proposed but not implemented.
