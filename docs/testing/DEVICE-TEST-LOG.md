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
| 1 | Open the app | Welcome screen: "ShopMate Ghana", two buttons | ✅ Development build (15 Nov 2026) | The Welcome screen displayed before logging in (Samsung Galaxy A06, Android 16; owner-reported) |
| 2 | Create account with a common password (e.g. `password123`, or `password`) | Refused: "This password is too common…"; no account created in Supabase | ✅ Development build (Samsung Galaxy A06; date not recorded) | Common-password rejection re-tested on the phone after the fix in `6e4ba2c` and refused (owner-reported; date not recorded). See issue #1 |
| 3 | Create account with a strong password | "Check your email" screen (if email confirmation is on) | ✅ Development build (15 Nov 2026) | A new fictitious account with a strong password reached the "Check your email" screen (Samsung Galaxy A06, Android 16; owner-reported). Test email address not recorded. See "Development build attempts" |
| 4 | Open the confirmation email and tap the link | Email confirmed. Development build: app opens and continues. Expo Go: a browser page; then return to the app | ✅ Development build (15 Nov 2026) | Tapping the link in the real sign-up confirmation email opened the browser briefly, then redirected automatically into ShopMate; the confirmation succeeded (owner-reported). See TC-DEV-02 below |
| 5 | Log in with the wrong password | "Email or password is not correct." (doesn't say which) | ✅ Development build (Samsung Galaxy A06; date not recorded) | The app showed exactly: "Email or password is not correct." (owner-reported) |
| 6 | Log in correctly | "Your shop" setup screen | | Immediately after the successful email confirmation (step 4), the newly confirmed account, which had no shop, reached the "Your shop" setup screen (owner-reported). This was **not** a separate manual-login test, so step 6 remains pending. Logging in with the correct password was verified in step 11 with the existing `Topboy` account. Accounts that already have a shop go to Home instead (see steps 8 and 11) |
| 7 | Enter shop details (try an invalid phone like `12345` first) | Invalid phone refused with a clear message; valid details saved | ✅ Development build (15 Nov 2026) | Phone `12345` was refused with the message "Enter a Ghana phone number". A valid Ghana phone number was then accepted (number not recorded) and the fictitious shop `Test Shop` was created. Home showed reference `SM-0008`, device `Device A` and plan `Pilot` (owner-reported) |
| 8 | Home screen | Shop name, reference `SM-…`, the registered device identifier, "Pilot" | ✅ Development build (15 Nov 2026) | All four details were visible: shop name `Topboy`, reference `SM-0006`, device `Device B`, plan `Pilot` (Samsung Galaxy A06, Android 16; owner-reported) |
| 9 | Close the app completely and reopen it | Still logged in, Home screen (session restored from secure storage) | ✅ Development build (15 Nov 2026) | Two successful full cold restarts in the development build; details below under "Development build attempts". Earlier Expo Go failures remain recorded as issue #2 |
| 10 | Log out | Welcome screen | ✅ Development build (15 Nov 2026) | Tapping "Log out" returned the app to the Welcome screen (Samsung Galaxy A06, Android 16; owner-reported) |
| 11 | Log in again | Home screen with the same shop and the **same device identifier as before logout** (whatever its label, e.g. "Device A" or "Device B"); no second shop or device | ✅ Development build (15 Nov 2026) | The existing account logged in again after logout: shop `Topboy`, reference `SM-0006` and device `Device B` were unchanged, and no duplicate shop or device was observed. See "Development build attempts" |
| 12 | Readability check | Text readable at arm's length; buttons easy to tap | ✅ Development build (15 Nov 2026) | At about 130% phone font size, the Welcome, Login and Home (`Topboy`) screens stayed readable and usable, with no clipping, overlapping or usability problems; the original font setting was restored afterwards (Samsung Galaxy A06, Android 16; owner-reported). See TC-DEV-03 |

**Phone model and Android version:** Samsung Galaxy A06, Android 16  **App build:** EAS development build  **Date:** 15 November 2026

*These details apply to the development-build tests recorded in this log (steps 1, 3, 4, 5 and 7, the step 2 re-check, steps 8, 9, 10, 11 and 12, TC-DEV-02, the TC-DEV-03 font-size check and "Development build attempts" below), not necessarily to every step of the original journey. Earlier Expo Go testing was on an Android phone whose model wasn't recorded. Where a test's date wasn't recorded, it is marked "date not recorded".*

## Development build attempts

**Device:** Samsung Galaxy A06, Android 16. **App build:** EAS development build (profile `development`). Fictitious data only (shops `Topboy` and `Test Shop`).

| Date | Test | Procedure | Result |
|---|---|---|---|
| 15 Nov 2026 | Step 9: session restoration after a full app closure (cold restart), attempt 2 | Opened ShopMate and confirmed the `Topboy` home screen; swiped the app away from Recent Apps; waited about 10 seconds; reopened it from the app icon | ✅ **PASS**: opened directly into `Topboy` without asking to log in. Owner reports this is the **second** successful full cold-restart test on the development build (details of the first attempt not recorded here) |
| 15 Nov 2026 | Step 10: log out | Tapped "Log out" | ✅ **PASS**: the app returned to the Welcome screen |
| 15 Nov 2026 | TC-DEV-03: readability at about 130% font size | Increased the phone's font size to about 130%, checked the login screen, then restored the phone's original font setting | ✅ **PASS**: login-screen text, buttons and input fields stayed readable, with no clipping or overlapping. Only the login screen was checked |
| 15 Nov 2026 | Step 11: log in again after logout | Samsung Galaxy A06 (SM-A065F), Android 16. Logged out, then logged in with the existing account | ✅ **PASS**: shop name stayed `Topboy`, reference stayed `SM-0006`, device stayed `Device B`; no duplicate shop or device observed |
| 15 Nov 2026 | Step 8: Home screen details | Samsung Galaxy A06 (SM-A065F), Android 16. Checked the Home screen | ✅ **PASS**: shop name `Topboy`, reference `SM-0006`, device `Device B` and plan `Pilot` all visible |
| 15 Nov 2026 | TC-DEV-03 / step 12: readability at about 130% font size, expanded | Samsung Galaxy A06 (SM-A065F), Android 16. Set the phone's font size to about 130%; checked the Welcome, Login and Home (`Topboy`) screens; restored the original font setting | ✅ **PASS**: all three screens readable and usable; no clipping, overlapping or usability problems observed |
| 15 Nov 2026 | Steps 3, 4, 6 and 7: new-account journey | Samsung Galaxy A06 (SM-A065F), Android 16. Signed up a new fictitious account with a strong password; tapped the real confirmation link in the email; reached shop setup; entered phone `12345` and tapped save; then entered a valid Ghana phone number and saved the fictitious shop `Test Shop`. The test email address and phone number are not recorded | ✅ **PASS**: "Check your email" shown; the confirmation link opened the browser briefly, then redirected automatically into ShopMate and the confirmation succeeded; the account with no shop reached "Your shop"; `12345` refused with "Enter a Ghana phone number"; the valid number was accepted and the shop created; Home showed `SM-0008`, `Device A` and `Pilot` |

## TC-DEV-02: email links and password reset (development build)

**Device:** Samsung Galaxy A06, Android 16. **App build:** EAS development build. Owner-reported results; fictitious data only.

| Check | Expected result | Result | Notes |
|---|---|---|---|
| Password-reset email link opens the app | Tapping the link in the email opens ShopMate automatically | ✅ PASS (date not recorded) | ShopMate opened automatically from the reset link, without opening the app manually. *Earlier attempt (date not recorded): the link was tapped but ShopMate was then opened manually from the app icon, so routing wasn't shown at that time* |
| Password reset completion | A new password can be set from the reset link | ✅ PASS (date not recorded) | New password set successfully |
| Previous password rejected | Logging in with the old password fails | ✅ PASS (date not recorded) | Login with the previous password was rejected |
| Log in with the new password | Logging in with the new password succeeds | ✅ PASS (date not recorded) | Login with the newly set password succeeded |
| Sign-up callback deep-link routing (**ADB simulation**) | Android opens ShopMate for `shopmate://auth-callback` and the app processes the callback | ✅ PASS (15 Nov 2026) | Samsung Galaxy A06 (SM-A065F), Android 16. Wireless ADB targeted to the A06, opening `shopmate://auth-callback?code=TESTONLY12345`. ShopMate opened automatically and showed its expired/invalid-link message, confirming Android routed the URI into the installed app and the app processed the callback. **Limitation:** a simulated callback with a deliberately fake code. It does **not** verify that Supabase's real sign-up confirmation email contains the correct redirect URL, or that it completes account confirmation |
| Email **confirmation** link opens the app (step 4) | Tapping the sign-up confirmation link opens ShopMate and continues | ✅ PASS (15 Nov 2026) | Real sign-up confirmation email: tapping the link opened the browser briefly, then redirected automatically into ShopMate, and the confirmation succeeded. *Earlier sign-up attempts (date not recorded) were refused with "Too many attempts. Please wait a few minutes and try again."; the exact Supabase rate-limit category wasn't confirmed* |

**Still pending in the development build:**
- Step 6: manual login with a newly confirmed account that has no shop has not yet been separately tested in the development build. The account reached shop setup immediately after email confirmation, but this does not verify the separate manual-login procedure.
- TC-DEV-03:
  - Readability at 130% font size: ✅ **passed in the development build** on the Welcome, Login and Home screens (15 Nov 2026; see "Development build attempts"). Also passed in earlier testing (owner-reported; date not recorded). Screens not covered by these checks (sign-up, forgot password, check email, set new password, shop setup) have not been checked at 130%
  - Ghana cedi (GH₵) display: **pending** until a screen that displays money is implemented (no current screen shows amounts)

## Issues found

| # | Date | Step | What happened | Severity (blocker / major / minor) | Fix (commit) | Re-checked on phone (date) |
|---|---|---|---|---|---|---|
| 1 | 2026-11-14 | 2 | `password123` was accepted and the "Check your email" screen appeared (Expo Go, Android). Cause: the app's common-password check matched exact list entries only, and `password123` isn't on the list | Major (weak password allowed; app-side rule only) | Rule extended: a listed password followed by numbers or symbols is also rejected (`app/src/auth/passwordPolicy.ts`, TC-AUTH-18). **Committed in `6e4ba2c`**; CI passed ([run 43637374568](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43637374568)) | ✅ **Passed**: common-password rejection re-tested on the phone and refused (owner-reported; date not recorded) |
| 2 | 2026-11-14 | 9 | **Intermittent session restoration (open).** Two earlier attempts at closing Expo Go completely and reopening it returned to the login screen. Logging in again showed the same shop and "Device A", confirming that the shop and device registration were retained. Later attempts restored the session, after about 2–3 minutes and after more than 70 minutes. A reload (`r`) also restored it. Cause unknown; not reproduced in the latest attempts. Fails safe (the owner logs in again; no data exposed) | Major | None yet (no code change). **Development build:** two full cold-restart session-restoration tests passed (Samsung Galaxy A06, Android 16; see "Development build attempts"). The earlier Expo Go failures **remain unexplained**. **Kept open pending further assessment** (if useful, with development-only diagnostics that log event names only) | Development build: ✅ 2 passes (latest 15 Nov 2026). Issue **still open** |

All issues must be fixed and re-checked on the phone before work moves beyond the authentication foundation (owner condition, Stage 1B approval).

### Resolved configuration problems (not application defects)

- **2026-11-14, initial registration failure.** Tapping "Create account" showed "Something went wrong on our side…" and no user was created in Supabase. Cause, found by the owner: the Supabase URL in the local app configuration (`app/.env` on the owner's computer, not in the repository) incorrectly ended with `/rest/v1`. Correcting it to the project URL resolved the problem, and registration and email confirmation then succeeded. **Resolved (configuration).** Separate note: the app's generic message hid the underlying error; development-only diagnostics were proposed but not implemented.
