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
| 6 | Log in correctly | "Your shop" setup screen | ✅ Installed Android build (reported 23 Nov 2026) | **Separate manual login verified:** logged in manually with a confirmed account that has no shop; the app showed "Your shop" (Samsung Galaxy A06; installed Android build (EAS; build profile not stated by the owner); test date not stated; owner-reported). *History:* on 15 Nov 2026 the newly confirmed account reached "Your shop" straight after email confirmation, which was not a manual-login test. Accounts that already have a shop go to Home instead (see steps 8 and 11) |
| 7 | Enter shop details (try an invalid phone like `12345` first) | Invalid phone refused with a clear message; valid details saved | ✅ Development build (15 Nov 2026) | Phone `12345` was refused with the message "Enter a Ghana phone number". A valid Ghana phone number was then accepted (number not recorded) and the fictitious shop `Test Shop` was created. Home showed reference `SM-0008`, device `Device A` and plan `Pilot` (owner-reported) |
| 8 | Home screen | Shop name, reference `SM-…`, the registered device identifier, "Pilot" | ✅ Development build (15 Nov 2026) | All four details were visible: shop name `Topboy`, reference `SM-0006`, device `Device B`, plan `Pilot` (Samsung Galaxy A06, Android 16; owner-reported) |
| 9 | Close the app completely and reopen it | Still logged in, Home screen (session restored from secure storage) | ✅ Development build (15 Nov 2026); ✅ installed Android build (reported 23 Nov 2026) | Two successful full cold restarts in the development build (15 Nov 2026), then several more full closes and reopenings of the installed app, each restoring the signed-in session (on 23 Nov the account had no shop, so it returned to "Your shop", the correct screen for that account). Details below under "Development build attempts". The earlier **Expo Go** failures remain recorded, unexplained, as issue #2 |
| 10 | Log out | Welcome screen | ✅ Development build (15 Nov 2026) | Tapping "Log out" returned the app to the Welcome screen (Samsung Galaxy A06, Android 16; owner-reported) |
| 11 | Log in again | Home screen with the same shop and the **same device identifier as before logout** (whatever its label, e.g. "Device A" or "Device B"); no second shop or device | ✅ Development build (15 Nov 2026) | The existing account logged in again after logout: shop `Topboy`, reference `SM-0006` and device `Device B` were unchanged, and no duplicate shop or device was observed. See "Development build attempts" |
| 12 | Readability check | Text readable at arm's length; buttons easy to tap | ✅ Development build (15 Nov 2026) | At about 130% phone font size, the Welcome, Login and Home (`Topboy`) screens stayed readable and usable, with no clipping, overlapping or usability problems; the original font setting was restored afterwards (Samsung Galaxy A06, Android 16; owner-reported). See TC-DEV-03 |

**Phone model and Android version:** Samsung Galaxy A06, Android 16  **App build:** EAS development build  **Date:** 15 November 2026

*These details apply to the development-build tests recorded in this log (steps 1, 3, 4, 5 and 7, the step 2 re-check, steps 8, 9, 10, 11 and 12, TC-DEV-02, the TC-DEV-03 font-size check and "Development build attempts" below), not necessarily to every step of the original journey. The tests reported on 23 Nov 2026 used the same Samsung Galaxy A06 with the **installed Android build**; the owner did not state whether it was the development or the preview build, or the test dates. Earlier Expo Go testing was on an Android phone whose model wasn't recorded. Where a test's date wasn't recorded, it is marked "date not recorded".*

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

### Installed Android build, reported 23 Nov 2026

**Device:** Samsung Galaxy A06. **App build:** installed Android build (EAS; build profile not stated by the owner). **Test dates:** not stated (reported 23 Nov 2026). Owner-reported results; fictitious data only.

| Test | Procedure | Result |
|---|---|---|
| Step 6: manual login, account with no shop | Logged in manually with a confirmed account that has no shop | ✅ **PASS**: "Your shop" displayed |
| Step 9: session restoration after a full close | Closed the installed app completely and reopened it, several times | ✅ **PASS** every time: the signed-in session was restored and the app returned to "Your shop" without asking to log in. The number of attempts was not recorded |
| TC-DEV-03: readability at about 130% font size | Checked "Your shop", Sign-up (Create account) and Forgot password | ✅ **PASS**: all three readable and usable |
| TC-DEV-03: Ghana cedi (GH₵) display | Viewed the app's amounts (the Today dashboard is the only screen that shows money) | ✅ **PASS**: the GH₵ symbol and amount formatting displayed correctly |
| TC-DEV-02 re-check: sign-up confirmation link | Tapped the link in a genuine confirmation email | ✅ **PASS**: the browser opened briefly, then redirected into ShopMate |
| TC-DEV-02 re-check: password-reset link | Tapped the link in a password-reset email | ✅ **PASS**: redirected back into ShopMate |

**Outside the Android E-3 test (inconclusive):** a confirmation link was also opened on an **iPhone** through Gmail. ShopMate is not installed on that iPhone, so the link could not open the app. This is not an Android result and not an Android failure; iOS is not in the MVP device scope tested here.

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

**Status of the remaining checks (updated 23 Nov 2026):**
- Step 6: ✅ separate manual login verified in the installed Android build (see "Installed Android build, reported 23 Nov 2026").
- TC-DEV-03:
  - Readability at 130% font size: ✅ Welcome, Login and Home (development build, 15 Nov 2026); ✅ Your shop, Sign-up and Forgot password (installed Android build, reported 23 Nov 2026). These are the six screens checked; the owner required Create account, Forgot password and Your shop for R-2. **Not checked at 130%:** Check email and Set new password
  - Ghana cedi (GH₵) display: ✅ verified (installed Android build, reported 23 Nov 2026), on the Today dashboard, the only screen that shows amounts. Only one device was used, so TC-UX-04 (3+ low-end devices) is still not met

## Stage 1C-2 increment 1 — local development stack (owner-reported, 2026-11-25)

**Device:** Samsung Galaxy A06, Android 16 (owner-confirmed). **Test date:** 25 November 2026. **App:** the installed EAS development build, loading the JavaScript of commit `0f13132` from the local Expo dev server on the owner's computer. **Backend:** the local Supabase stack on that computer (owner decision D-9), reached by the phone over a private local-network address; not the cloud project. **Data:** a new fictitious account and shop. **Evidence:** owner-reported manual results only; no screenshots, timings or device logs were captured. This is separate from the automated evidence for the same commit ([CI #53](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/45506392419)).

Statuses: **PASS** (the owner confirmed it), **PARTIAL**, **NOT TESTED**, **BLOCKED**. Totals count checklist entries (one row each). PASS rows are 📱 Device verified (owner-reported).

| ID | Check | Expected | Status | What the owner reported |
|---|---|---|---|---|
| Setup-1 | App loads from the local dev server; phone reaches the local API | The development build opens the app; `…:54321/rest/v1/` answers in the phone's browser | **PASS** | App opened from the installed development build through the local Expo server; the phone reached the local Supabase REST API |
| Setup-2 | Welcome, sign-up and shop setup on the local stack | Welcome screen; account created; shop created; Today opens | **PASS** | Welcome/authentication screen shown; registration succeeded; shop creation succeeded; the dashboard opened, with sensible figures and empty states |
| D1-01 | Five tabs | Today · Sell · Products · Customers · More, each with an icon and a word | **PASS** | All five tabs were navigable; layout, cards, icons and the bottom navigation displayed correctly |
| D1-02 | Placeholder tabs | Sell, Products, Customers show their "later" text and a working **Back to Today** button | **PASS** | **Sell:** heading "Sell", subtitle "Record sales and give receipts", the Stage 1D "coming in a later update" label, the not-ready statement and the planned features (product tiles, cash/MoMo/credit payments, offline sales uploaded later, WhatsApp receipts), and the notice "Nothing has been recorded. This screen only shows what is planned."; Back to Today returned to Today. **Customers:** heading "Customers", subtitle "Your credit book", the "coming in a later update" label, the not-ready statement and the planned features (customer balances, cash/MoMo repayments, WhatsApp balance reminders), and the same notice; Back to Today returned to Today. **Products:** placeholder wording and Back to Today verified |
| D1-03 | Selected state, transition and press feedback | The selected tab shows a tint pill and a bold green label (switched without animation; an animated selected pill was only proposed and is not an increment 1 requirement); tab content fades in and rises (`FadeIn`); Quick-action tiles and tab items shrink slightly on press (`PressableScale`) | **PASS** | Selected-tab visual state, the FadeIn transition and PressableScale feedback verified |
| D1-04 | 130 % font size | All five tab labels fit and stay readable | **PASS** | About 130 % font scaling verified without layout problems |
| D1-05 | Skeleton and pull-to-refresh | Pulsing blocks while Today first loads; pull-to-refresh reloads the figures | **PASS** | Loading skeleton and pull-to-refresh verified (pull-to-refresh also completed without errors in the first session) |
| D1-06 | Remove animations on | No fade, no press shrink, no pulsing | **PASS** | Android's Remove animations enabled; behaviour verified |
| D1-07 | Remove animations changed while the app is open or in the background | Animations follow the setting after each change | **PASS** | Changing the animation setting while ShopMate was open: behaviour verified. **Background case (separately tested):** with ShopMate left running in the background, the Remove animations setting was changed, the owner returned to ShopMate through Recent Apps, and the changed setting took effect in ShopMate |
| D1-08 | Offline banner | No banner while online; an offline banner after a genuine network failure | **PASS** | No unexpected banner while online. With Airplane mode on, the expected offline banner appeared; the owner described it as "no internet connection; reconnect to update Today's figures". *For reference, the app's texts on Today in that state are the banner "You're offline. Figures may be out of date; actions that need internet are paused." and, when earlier figures are kept, the notice "We couldn't update the figures. These are from your last update at … Check your internet connection, then try again."* |
| D1-09 | Recovery | After reconnecting and pulling to refresh, the banner clears and figures load | **PASS** | After reconnecting, the dashboard recovered and refresh worked |
| D1-10 | Android Back | (a) closes the avatar panel; (b) returns to Today from another tab; (c) on Today, leaves the app | **PASS** | (a) Avatar panel and Back verified; (b) Back from Products returned to Today; (c) Back on Today returned to the phone's home screen |
| D1-11 | More tab and Log out | Shop, reference, device and plan rows; seven items marked "Later"; Log out returns to Welcome; logging in again shows the same shop and device | **PASS** | More, account details, the later-update items, Log out and the following login verified |
| D1-12 | KI-1 cold start | Closed completely and reopened 3 times: Today each time, still logged in | **PASS** | Three successful cold starts; ShopMate reopened each time and Today loaded |

**Totals (14 checklist entries):** 14 PASS, 0 PARTIAL, 0 NOT TESTED, 0 BLOCKED. **Defects reported:** none. **Not covered by this check:** partial animation scales and manufacturer-specific motion settings stay unverified (STAGE-1C-2-VISUAL-DESIGN §5); the cloud project (D11) wasn't used. KI-1 stays an accepted Expo Go-only limitation: these three cold starts in an installed development build add to its monitoring evidence and don't change its status.

## Stage 1C-2 increment 2 — Products and categories (owner-reported, reported 2026-11-25)

**Status: 9 PASS, 4 PARTIAL, 11 NOT TESTED, 0 BLOCKED** (corrected twice on 25 Nov 2026 at the owner's request; first recorded as 23 PASS, 1 NOT TESTED, then 13 PASS, 11 NOT TESTED). **Device:** Samsung Galaxy A06, Android 16 (owner-reported). **Reported:** 25 November 2026; the test date was not stated separately. **Evidence:** owner-reported manual results only. No screenshots, timings, device logs or per-check observations were recorded, so the rows below give the status only. **The 9 PASS rows rest on the owner's report** that these checks were exercised on the phone. The 4 PARTIAL rows give what was and wasn't verified. The 11 NOT TESTED rows are checks that were not separately verified. The owner did not separately record the build, the commit loaded, the backend, or the migration step in this report.

This is separate from:
- the automated evidence for the code (commit `f6a405e`, [CI #55](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/45571055034) passed; local runs: database 1051/1051, API 160/160, app 97/97; see [STAGE-1C-2-EXECUTION-BRIEF.md](../stages/STAGE-1C-2-EXECUTION-BRIEF.md));
- cloud verification: **none**. The Stage 1C migrations, including `20261125000300`, are not applied to any cloud project (D11).

Planned setup, as for increment 1:
- the installed EAS development build, loading the JavaScript of the commit under test from the local Expo dev server;
- the local Supabase stack (D-9);
- a fictitious account and shop;
- **the owner's local stack must first have the new migration `20261125000300_update_product_expected_values.sql`** (`npx supabase migration up`; no reset). It is prepared and applied locally only, not in the cloud. Without it, every edit and price change is refused with the general error message.

For the two-phone checks (D2-17, D2-18), a second signed-in session of the same shop is needed: a second phone, or a browser session against the local API.

| ID | Check | Expected | Status |
|---|---|---|---|
| D2-01 | Products tab opens | Products list with header, search, category chips, sort and Archived chips; "+ Add product"; the old "coming later" preview is gone | **PASS** (owner-reported) |
| D2-02 | Empty state | New shop: "No products yet" and "Add your first product" | **PASS** (owner-reported) |
| D2-03 | Add product (minimum) | Name and selling price only: saved; green "… added" message; listed with "0 · Out of stock" | **PARTIAL**: a fully populated product was created and saved; the minimum-only path (name and selling price only) was not tested |
| D2-04 | Add product (full) | Category, unit, cost, opening stock and low-stock level saved; stock chip shows the right word (In stock / Low) | **PASS** (owner-reported) |
| D2-05 | Field checks | Empty name, price 0, three decimals, cost without stock: clear messages under the fields; nothing typed is cleared | **PARTIAL**: several validations were tested (invalid name and price, negative stock, negative low-stock level, a zero quick-change price); three decimal places and cost without stock were not tested |
| D2-06 | Duplicate product name | "You already have a product with this name. Use a different name." (not the general duplicate text) | **NOT TESTED**: duplicate product name handling was not separately verified |
| D2-07 | Search | Results narrow about a third of a second after typing stops; the keyboard stays open; "No products match" when nothing matches | **PASS** (owner-reported) |
| D2-08 | Category filter | Each chip shows only its products; "No category" shows uncategorised ones | **PASS** (owner-reported) |
| D2-09 | Sort | "A–Z" sorts by name. **"Lowest stock" sorts by quantity, fewest first. It is a sort, not a low-stock filter:** products above their low-stock level still appear | **PASS** (owner-reported) |
| D2-10 | Scrolling and paging | With more than 30 products, more load when scrolling; "All N shown" at the end | **NOT TESTED**: only one product exists in the test shop, so a list of more than 30 products, scrolling to load more and the "All N shown" end could not be exercised. Paging past 1,000 rows has automated evidence only (PS-11) |
| D2-11 | Edit product | Changes saved; "No changes to save" when nothing changed; stock shown read-only | **PASS** (owner-reported) |
| D2-12 | Quick price change | "Change price" on a row: new price saved and shown; the row's other details unchanged | **PASS** (owner-reported) |
| D2-13 | Archive and restore | Confirmation dialog; archived product leaves the list and appears under "Archived"; Restore brings it back | **PASS** (owner-reported) |
| D2-14 | Correct cost price | Reason required; the estimate updates while typing; the result shows the server's new stock value; with no stock, an explanation and Save disabled | **NOT TESTED**: Correct cost price (reason required, estimate, stock behaviour) was not separately verified |
| D2-15 | Categories | Add, rename, archive and restore; duplicate name refused; archiving a category in use refused with "This category still has products…" | **PARTIAL**: add, rename, archive protection (category in use), archive and restore were exercised; duplicate category-name validation was not separately tested |
| D2-16 | Offline | Airplane mode: grey offline bar; save buttons disabled; typed text kept; "Check again" after reconnecting | **PARTIAL**: the offline banner, the offline refresh message, reconnection and refresh were observed; disabled save buttons and keeping typed form input were not independently verified |
| D2-17 | Change on another phone (no clash) | Phone 2 changes the name; phone 1 (opened before) changes only the price: both changes survive | **NOT TESTED**: two-phone editing without a clash was not performed |
| D2-18 | Change on another phone (clash) | Both change the price: phone 1 sees "Someone else changed the price to …" (or, if the change landed at the moment of saving, "Someone else changed this product just now…"); nothing saved; the new price is shown; saving again works | **NOT TESTED**: simultaneous or conflicting edits from two phones were not performed |
| D2-19 | Android Back | Cost → product → list → Today → leaves the app; Back closes the price pop-up and dialogs first | **NOT TESTED**: the exact Back sequence (cost → product → list → Today → out of the app; pop-up and dialogs first) was not separately verified |
| D2-20 | Typing survives navigation | Half-typed add form, open Manage categories and come back, or switch to Today and back: the typing is still there | **NOT TESTED**: keeping half-typed form input through navigation was not separately verified |
| D2-21 | 130 % font size | List rows, chips, forms, the price pop-up and Categories readable; nothing clipped; buttons usable | **NOT TESTED**: 130 % font scaling was not separately verified for these screens |
| D2-22 | Keyboard | Lower fields (low-stock level, reason) stay visible above the keyboard (Android 16 draws edge to edge) | **NOT TESTED**: keyboard visibility for the lower form fields was not separately verified |
| D2-23 | Remove animations on | No fades, press shrinking or pulsing on the new screens | **NOT TESTED**: behaviour with Remove animations on was not separately verified |
| D2-24 | Today after changes | Back on Today, product count and low-stock figures reflect the changes | **NOT TESTED**: the Today figures after product changes were not separately verified |

**Not testable by hand on demand:**
- a reply lost *after* the server saved (covered by automated tests PS-08, PS-09, PS-09b, PS-12, PS-13);
- a change landing in the moment between the app's re-read and its save, and two simultaneous saves (covered by PS-18, PS-19 and database tests UPX-30 – UPX-37);
- a lost category add followed by an app restart: known limitation, reported as "already used" (see the brief).

**Totals (24 checklist entries):** 9 PASS, 4 PARTIAL, 11 NOT TESTED, 0 BLOCKED. PASS rows are 📱 device-verified (owner-reported). PARTIAL: D2-03, D2-05, D2-15, D2-16. NOT TESTED: D2-06, D2-10, D2-14, D2-17 – D2-24. **Defects reported:** none.

**Still to do (manual):**
- D2-10, once the test shop has more than 30 products;
- the missing parts of D2-03, D2-05, D2-15 and D2-16 (see their rows);
- D2-06, D2-14, D2-19 – D2-24 on one phone;
- D2-17 and D2-18 with a second signed-in session of the same shop.

Automated evidence exists for some of the same behaviour (for example PS-02 duplicate names, PS-07 and PS-17 cost correction, PS-14 – PS-19 concurrent edits), but it doesn't replace the manual checks.

**UX suggestion from the owner (future improvement; NOT implemented, no change made):** tapping a product in the list should open a **read-only product details view with an Edit button**, rather than opening the edit form directly. Recorded for a later increment. Increment 3 (S-37 product detail and movement history) is the natural place to consider it, subject to the owner's approval.

## Issues found

| # | Date | Step | What happened | Severity (blocker / major / minor) | Fix (commit) | Re-checked on phone (date) |
|---|---|---|---|---|---|---|
| 1 | 2026-11-14 | 2 | `password123` was accepted and the "Check your email" screen appeared (Expo Go, Android). Cause: the app's common-password check matched exact list entries only, and `password123` isn't on the list | Major (weak password allowed; app-side rule only) | Rule extended: a listed password followed by numbers or symbols is also rejected (`app/src/auth/passwordPolicy.ts`, TC-AUTH-18). **Committed in `6e4ba2c`**; CI passed ([run 43637374568](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43637374568)) | ✅ **Passed**: common-password rejection re-tested on the phone and refused (owner-reported; date not recorded) |
| 2 | 2026-11-14 | 9 | **Intermittent session restoration in Expo Go. Accepted limitation — not fixed** (owner decision, 23 Nov 2026). Two earlier attempts at closing Expo Go completely and reopening it returned to the login screen. Logging in again showed the same shop and "Device A", confirming that the shop and device registration were retained. Later attempts restored the session, after about 2–3 minutes and after more than 70 minutes. A reload (`r`) also restored it. Cause unknown; not reproduced in the latest attempts. Fails safe (the owner logs in again; no data exposed) | Major | None yet (no code change). **Development build:** two full cold-restart session-restoration tests passed (Samsung Galaxy A06, Android 16; see "Development build attempts"). **Installed Android build (reported 23 Nov 2026):** several more full closes and reopenings, all restoring the session. **No code fix was made, and the issue is not fixed.** The two earlier Expo Go failures **remain unexplained** and were never reproduced outside Expo Go. **Owner decision (23 Nov 2026):** accepted as an **Expo Go-only development-environment limitation**, with explicit owner approval, as an exception to the "fixed and re-checked" rule. Kept for monitoring as **KI-1** in [KNOWN-ISSUES.md](../KNOWN-ISSUES.md) | Development build: ✅ 2 passes (15 Nov 2026). Installed Android build: ✅ several passes (reported 23 Nov 2026). Expo Go: 2 failures, then passes (13–14 Nov 2026). **Accepted limitation — not fixed** (owner, 23 Nov 2026) |

All issues must be fixed and re-checked on the phone before work moves beyond the authentication foundation (owner condition, Stage 1B approval). **Owner-approved exception (23 Nov 2026):** issue #2 is accepted as an Expo Go-only development-environment limitation without a fix (decision 52 in [PLAN.md](../PLAN.md)); issue #1 was fixed and re-checked. With this, the journey requirement **R-2 / E-3 is closed**.

### Resolved configuration problems (not application defects)

- **2026-11-14, initial registration failure.** Tapping "Create account" showed "Something went wrong on our side…" and no user was created in Supabase. Cause, found by the owner: the Supabase URL in the local app configuration (`app/.env` on the owner's computer, not in the repository) incorrectly ended with `/rest/v1`. Correcting it to the project URL resolved the problem, and registration and email confirmation then succeeded. **Resolved (configuration).** Separate note: the app's generic message hid the underlying error; development-only diagnostics were proposed but not implemented.
