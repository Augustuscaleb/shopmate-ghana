# Stage 1C-2 execution brief (screens): DRAFT for owner review

**Status: AUTHORISED (owner, 24 Nov 2026); in progress, one increment at a time.** The §7 points were decided by the owner on 24 Nov 2026 (recorded in [STAGE-1C-DECISIONS.md](STAGE-1C-DECISIONS.md) §3a; §7 below is kept as the record of the questions). Each increment is reported before the next starts. This brief adds no scope: every item comes from the approved Stage 1C plan, specification revision 5.1 or a recorded owner decision. Visual direction: [STAGE-1C-2-VISUAL-DESIGN.md](STAGE-1C-2-VISUAL-DESIGN.md).

**Baseline:** HEAD `7d29d4d`; [CI #51](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/45487659376) passed (database 1017/1017, API 133/133, app 25/25). Checkpoint 1C-1 (database) is complete in CI; its formal closure awaits the owner's review ([STAGE-1C-PLAN.md](STAGE-1C-PLAN.md) §5a). M2 is decided and implemented ([STAGE-1C-DECISIONS.md](STAGE-1C-DECISIONS.md) §4).

## 1. Scope (from STAGE-1C-PLAN §2 "Screens", §2 "Low stock" and Q2)

| Screen | Specification | What it does in 1C-2 |
|---|---|---|
| **S-30** Products | 03 S-30; F-03 | Search, category filter, list with name, selling price, stock colour; sort by name or low stock first. Category add / rename / archive (STAGE-1C-PLAN §2 "Categories", D5) |
| **S-31** Product form | 03 S-31; F-03; 04 §2.1 | Create (name, category, unit, selling price, optional cost, opening stock, low-stock level); edit; archive (D4) |
| **S-32** Quick price change | 03 S-32; F-04 | New selling price from the product list (audit-logged) |
| **S-33** Restock | 03 S-33; 04 §2.2 | Quantity or packs × per-pack, purchase cost (total or per unit), paid now, paid from, supplier, note; preview of the new stock level, stock value change and amount owed |
| **S-34** Stock adjustment | 03 S-34; 04 §2.3 | Counted quantity or ± change, reason, note; preview of the value effect |
| **S-35** Low stock | 03 S-35; F-07; Q2 | Items at or below their low-stock level; **Share list** as text through the Android share sheet |
| **S-36** Needs attention (inventory items only) | 03 S-36; 05 C-120 – C-126; D10 | Cards with what happened, the GH₵ effect and the action buttons; acknowledge where A1 allows. Shown on the dashboard and inside the stock area (D10; no fifth tab) |
| **S-37** Product detail | 03 S-37 | Stock, stock value, average cost, prices, margin, movement history with value effects; from a purchase row: Correct purchase, Return to supplier |
| **S-38** Unpaid purchases | 03 S-38; C-114; **M2 display rule** | Total owed, list (date, product, supplier, purchase cost per the M2 rule, paid, unpaid), Pay supplier, each purchase's payment history |
| **S-39** Correct purchase / Return to supplier | 03 S-39; 05 §12.2, C-117 | Cost or quantity correction with reason, the split, the change to the amount owed, the refund step; return with credit type |

**Navigation (03 §"Navigation"):** bottom tabs Today · Sell · Products · Customers · More. Only Today exists today (`app/src/screens/HomeScreen.tsx`, S-10).

## 2. Server functions each screen uses (all exist; one prepared change, below)

| Screen | Writes (server functions, idempotent with a request ID) | Reads |
|---|---|---|
| S-30 | categories: direct writes (RLS, Stage 1A); `set_product_archived` | `products`, `categories` (RLS); paginated |
| S-31, S-32 | `create_product`, `update_product`, `set_product_archived`; `set_cost` for "Correct cost price" | `products`, `categories` |
| S-33 | `restock` | `products` |
| S-34 | `adjust_stock` | `products`, `product_cost_history` (last average, for the preview) |
| S-35 | none | `low_stock_products` (paginated, T10) |
| S-36 | `acknowledge_attention` (A1–A3) | `attention_items` (RLS); open-item count for the dashboard |
| S-37 | none (actions open S-39) | `products`, `stock_movements`, `product_cost_history` (RLS); paginated |
| S-38 | `pay_supplier` | `unpaid_purchases` (with the M2 fields), `supplier_payments` (RLS) |
| S-39 | `correct_purchase`, `return_to_supplier` | `unpaid_purchases` (choosing a purchase), `products` |
| Today (S-10) | none | `inventory_summary` (already used), open attention count (D10) |

`check_stock_integrity` has no screen in the specification; it isn't needed by 1C-2.

**Prepared change (owner-approved for local preparation, 25 Nov 2026; NOT applied to any cloud project):** `update_product` gains a trailing `p_expected` argument (migration `20261125000300_update_product_expected_values.sql`). See the increment 2 status below.

## 3. Recommended order (each increment reviewed and CI-passed before the next)

| # | Increment | Screens |
|---|---|---|
| 1 | **Foundations:** navigation shell, an inventory service layer (typed result parsers that reject non-integer money, as `app/src/services/dashboard.ts` does), request IDs saved before each write and reused on retry (the `app/src/services/account.ts` pattern), plain-language error messages (07), online/offline state for 🌐 actions (the shell and the online state depend on §7 items 2, 7 and 8) | none visible beyond the shell |
| 2 | Products and categories | S-30, S-31, S-32 |
| 2b | **Multi-device freshness and verification** (owner decision, 25 Nov 2026; before increment 3) | Today, S-30 – S-32, categories, Correct cost price |
| 3 | Product detail and movement history | S-37 |
| 4 | Restock and stock adjustment | S-33, S-34 |
| 5 | Low stock and sharing | S-35 |
| 6 | Unpaid purchases and Pay supplier, with the M2 display rule | S-38 |
| 7 | Correct purchase and Return to supplier | S-39 |
| 8 | Needs attention and its dashboard entry | S-36, S-10 entry |
| 9 | Owner's device check of all screens (📱), including the KI-1 cold-start re-check on the installed build | all |

Reasons for the order: the service layer and error handling are shared by every screen; S-37 is the entry point for S-39; S-36's action buttons lead to S-31, S-33, S-34, S-37 and S-39, so it comes once those exist.

**Increment 1 status: committed in `0f13132` ([CI #53](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/45506392419) passed); owner-reported device checks complete on the local stack (25 Nov 2026; Samsung Galaxy A06, Android 16): all 14 checklist entries PASS.** Five-tab shell (D-7, D-8) with the More tab keeping Log out; pure navigation model; online-state monitor fed by request outcomes (`expo-network` **not installed**: needs separate approval, and a new development build to verify, D-2); server-error classifier; request-ID store (reuse on retry, release on a definite answer, hold back changed inputs after an unknown outcome); strict result readers; the message table ([STAGE-1C-2-ERROR-MESSAGES.md](STAGE-1C-2-ERROR-MESSAGES.md)); the visual foundation ([STAGE-1C-2-VISUAL-DESIGN.md](STAGE-1C-2-VISUAL-DESIGN.md)): tokens, reduced-motion-aware touch feedback, entrances and skeleton loading, using only React Native's built-in Animated API. A shared reduce-motion state (reduced until the phone's setting is known; one native check and subscription). Tests: app 66/66 (41 new), API 139/139 (6 new, `tests/app-error-handling.test.ts`), database 1017/1017; typecheck, scans and bundle export passed. No backend change. **Device check:** complete (owner-reported manual evidence, 25 Nov 2026): 14 PASS, 0 PARTIAL, 0 NOT TESTED, 0 BLOCKED, recorded in [DEVICE-TEST-LOG.md](../testing/DEVICE-TEST-LOG.md); automated evidence is CI #53. Not covered: partial animation scales and manufacturer motion settings, and the cloud project (D11 outstanding).

**Increment 2 status (25 Nov 2026): committed in `f6a405e` ([CI #55](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/45571055034) passed); owner-reported device checks on the Samsung Galaxy A06 (Android 16): 9 PASS, 4 PARTIAL, 11 NOT TESTED, 0 BLOCKED.** Scope S-30, S-31, S-32, category management from the S-30 filter (owner decision) and "Correct cost price" (`set_cost`, D-5). One backend change was prepared locally (the `update_product` concurrency protection below): it has been applied to the local stack only, **not to any cloud project** (D11). No new dependency.

*Implemented (code, committed in f6a405e):*
- **S-30 Products list:** server-paginated (`range` + exact count, 30 per page; never limited by `max_rows`); search; category chips (All, each category, No category, Manage categories); archived products; pull-to-refresh; loading, empty, error and offline states. **Sort: "A–Z" or "Lowest stock".** "Lowest stock" is a *sort* by stock quantity, lowest first. It is **not** a low-stock filter and does not compare stock with each product's low-stock level (PostgREST can't compare two columns). The owner accepted it as a temporary, accurately labelled option (25 Nov 2026). The true low-stock list is S-35 (increment 5, `low_stock_products`).
- **S-31 Add / Edit product:** add (`create_product`, with optional cost and opening stock); edit (`update_product`); archive and restore (`set_product_archived`); a read-only stock summary; "Correct cost price" (`set_cost`, reason required).
- **S-32 Quick price change** from the list.
- **Categories:** add, rename, archive (refused while in use, D5) and restore, written directly under RLS.
- **Android Back:** one screen at a time inside Products, then Today, then out of the app. Products keeps its screens (and typed input) while another tab is open.

*Data-integrity handling (review of 25 Nov 2026):*
- **Write outcomes are reported as one of:** confirmed; definitely not saved (a refusal, or offline so nothing was sent); may have been saved (sent, no answer: retry is safe); held back (an earlier attempt is unconfirmed); or changed by someone else (nothing sent). New messages, for owner review, are listed in [STAGE-1C-2-ERROR-MESSAGES.md](STAGE-1C-2-ERROR-MESSAGES.md).
- **Categories (read-back reconciliation; NOT request-ID idempotent):** the Stage 1A grant lets the app insert only `business_id` and `name`, so the app can't choose the row's id and category writes have no request ID.
  - After an add whose reply was lost, a retry refused as a duplicate (23505) reads the category back. If an active category with that name exists, the add is reported as saved, not "already used".
  - **Limitation:** that "lost add" note is kept in the app's memory only and does **not** survive an app restart. After a restart, the retry is refused as "That name is already used…", although the category exists and appears in the list.
  - Rename, archive and restore are safe to repeat. Archive and restore only touch a row still in the other state (so a repeat keeps the original archive time) and then read the row back to confirm.
- **Concurrent product edits: server-side protection (prepared locally).** `update_product` sets all five editable fields (name, selling price, category, unit, low-stock level) on every call. Migration `20261125000300_update_product_expected_values.sql` therefore adds `p_expected jsonb default null`: the five fields as the caller last read them.
  - **Comparison:** after the product row is locked `FOR UPDATE`, in the same transaction as the update, the server compares them with the current row. Any difference is refused with **`product_changed`**: no update, no audit entry, and the request ID is not used up.
  - **No unconditional path:** a caller that omits the values (or sends null) is refused with `expected_values_required`; malformed values are refused with `invalid_expected_values`. Both codes are internal, so the owner sees the general message.
  - **Deliberate behaviour change:** callers that omit the values are now refused. No deployed client calls `update_product` (the Stage 1C migrations are not in the cloud), and every existing test caller was updated to send the values.
  - **Unchanged:** authorisation, field validation and its error codes, the category and duplicate-name checks, the lock order, the audit entry, the response `{product_id, changed}`, and request-ID replay (a retry returns the stored result before any comparison).
  - **The function is dropped and recreated** (its argument list changes), with the same privileges: authenticated only.
- **The app:**
  - re-reads the product before saving and merges three-way: untouched fields take the server's current values, edited fields are sent as typed, and a clash on an edited field is a conflict;
  - sends the re-read values as `p_expected`, so a change landing between the re-read and the save is refused by the server and shown as "Someone else changed this product just now. Nothing was saved…" with the latest details;
  - keeps the request-ID fingerprint on the intended change only (not on `p_expected`), so a retry after a lost reply reuses its ID;
  - if the newer value may be this phone's own lost change, shows the "held back" message instead: "Your last change may already have been saved. Refresh the product and check its current details before trying again." (owner wording, 25 Nov 2026).

  Quick price change uses the same path. `set_cost` changes only the stock value (stock × cost, from the stock at that moment); the cost screen re-reads the stock first and asks again if it changed.
- **To use this on the phone,** the owner's local stack needs the new migration (`npx supabase migration up` on the owner's computer; a reset is not needed and would delete local test data). Otherwise every edit is refused by the old function with the generic message.

*Automated evidence (local, 25 Nov 2026):*

| Suite | Result |
|---|---|
| Database | 1051/1051, including 34 in `16_update_product_expected.test.sql`; the 25 existing `update_product` calls in files 05, 06, 07 and 13 now pass expected values, with their assertions unchanged |
| API | 160/160, including 21 in `tests/products-service.api.test.ts` |
| App | 97/97 |
| Checks | Typecheck, secret scan, dependency audit and Android bundle export passed |

The database tests cover the comparison under the lock, a change by a second member between read and save, retries, the refused request ID being reusable, missing and malformed values, and unauthorised and anonymous callers. The API tests run the real `ProductsService` against the local stack, including:
- another change injected between the app's re-read and its save, which is refused and not overwritten;
- two phones saving at the same moment, where exactly one wins, in five rounds;
- lost replies, duplicate names and isolation between shops.

*Manual device verification (owner-reported, reported 25 Nov 2026; corrected the same day):* on the Samsung Galaxy A06, Android 16, of the 24 checklist entries:
- **9 PASS** (owner-reported): tab, empty state, full add, search, filter, sort, edit, quick price, archive and restore;
- **4 PARTIAL**:
  - D2-03: the minimum-only add was not tested;
  - D2-05: three decimal places and cost without stock were not tested;
  - D2-15: duplicate category name was not tested;
  - D2-16: disabled save buttons and keeping typed input while offline were not verified.

**11 are NOT TESTED:**
- D2-10 paging: only one product exists;
- D2-06 duplicate product name;
- D2-14 Correct cost price;
- D2-17 and D2-18 two-phone edits;
- D2-19 the exact Back sequence;
- D2-20 typing kept through navigation;
- D2-21 130 % font size;
- D2-22 keyboard and the lower fields;
- D2-23 Remove animations;
- D2-24 Today figures after changes.

Some of this has automated evidence (for example PS-11 paging past 1,000 products, PS-17 – PS-19 concurrency), which doesn't count as a device check. These are owner-reported manual results, separate from the automated evidence above. There is no cloud verification: the migrations, including `20261125000300`, are not in any cloud project (D11). Results: [DEVICE-TEST-LOG.md](../testing/DEVICE-TEST-LOG.md), "Stage 1C-2 increment 2".

*Future UX improvement (owner suggestion, 25 Nov 2026; NOT implemented):* tapping a product should open a read-only product details view with an Edit button, instead of opening the edit form directly. To be considered with S-37 (increment 3), subject to the owner's approval.

**Increment 2b status (25 Nov 2026): committed in `75f8aa6` ([CI #57](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/45674601006) passed), including the iOS quick price sheet fix. Owner-reported device checks are partly done (see "Manual device verification" below); multi-device readiness is NOT claimed.** Owner decisions (25 Nov 2026):
- several devices on the same shop account are a core requirement, and the plan limit of 1, 2 or 3 devices stays in effect;
- iOS, iPad, a browser for Windows and Mac, and staff accounts are staged product requirements, kept on the roadmap but not built in this increment;
- offline changes beyond offline sales stay out of scope.

**Multi-device readiness is NOT claimed:** it needs the two-Android-phone checks (MD-01 – MD-18).

*Implemented (code, uncommitted). No migration, no new package, no native or EAS change, no Realtime:*
- **Freshness (spec SY-74):** `app/src/lib/freshness.ts` holds pure, unit-tested rules:
  - return to the app or to a screen: reload data older than 30 seconds;
  - a visible screen in an active app: reload every 15 minutes;
  - pull-to-refresh, Try again and this device's own save: always reload.

  `app/src/ui/useFreshness.ts` applies them with React Native's built-in AppState:
  - nothing reloads in the background, on a hidden screen, or while a save is in progress (a reload that falls due during a save runs after it);
  - applied to Today, the product list, the product form, Categories and Correct cost price.
- **"Updated hh:mm" (SY-06)** on Today and Products. After a failed refresh: "Last updated hh:mm · couldn't refresh" with a Try again button.
- **Data safety:**
  - a failed automatic refresh keeps the last data shown and never replaces a populated screen with an empty or error state;
  - search text, category filter, sort, scroll position, an open price pop-up and unsaved form fields are never reset;
  - the product list refreshes the rows already loaded, in place, up to 300;
  - the edit form re-bases only untouched fields (the existing `rebaseValues`) and says "This product was changed on another device. The latest details are shown.";
  - this device's own changes are not reported as another device's.
- **Conflict-safe categories (no migration):**
  - rename changes the row only if it is still active and still has the name the screen showed;
  - archive likewise, if it still has the name shown;
  - if nothing matched, the row is read back: already in the wanted state is confirmed (for example a retry after a lost reply); changed elsewhere is a conflict, and nothing is saved;
  - the conflict message, in the owner's wording: "This category was changed on another device. Nothing was saved. The list has been refreshed. Review it and try again.";
  - duplicate-name and in-use refusals are unchanged. Adding a category is unchanged (read-back after a lost reply; not request-ID idempotent; the lost-add note does not survive an app restart).
- **Seed script for local testing:** `scripts/seed-local-products.mjs` adds 35 fictitious products and 3 fictitious categories to one shop on the local stack.
  - It is a dry run by default; writing needs `--confirm-shop=<reference code>`.
  - It accepts only a loopback API address, signs in as the owner (no admin key), never reads `.env`, and never resets, updates or deletes anything.
  - It is idempotent: existing names are skipped, and request IDs are derived from the shop and the product name.

*Review fixes (independent code review, 25 Nov 2026; all seven applied, uncommitted):*
1. **Seed script on Windows or a path with spaces:** it exited silently without running. It now compares file URLs built the same way (`pathToFileURL`, symlinks resolved, Windows paths compared without regard to letter case) and starts `npx.cmd` through the shell on Windows.
2. **Product list:** "loading more" stayed on after a refresh that failed while it had replaced a load-more. It is now cleared.
3. **Product list:** no automatic refresh while a new search, filter or sort is loading, so the old filter's rows are never shown under the new filter.
4. **Form and cost screens:** no "changed on another device" note while this device still has an unconfirmed request for the product (the existing request-ID store, `hasUnconfirmed`). The own-change window is now measured from when the refresh starts.
5. **Product list:** no second refresh while one is running. A pull-down during it shows that refresh's spinner.
6. **Hook:** a refresh postponed during a save is dropped when the screen is hidden, replaced by any refresh that runs, and run at most once after the save.
7. **Seed script:** an archived seed category counts as present and is not re-created.

The list rules (`screens/products/productListState.ts`) and the postponed-refresh rules (`lib/freshness.ts`) are now pure functions with regression tests:
- LIST-01 – 06 and FRESH-20 – 23;
- SEED-05 – 08: Windows and space-containing paths; `npx.cmd`; a real run from a folder with a space and through a symlink; an end-to-end rerun with an archived seed category;
- PS-26: the unconfirmed state after a lost reply.

*Second-review fixes (25 Nov 2026):*
- **Pull-down spinner:** it belongs to one request, which turns it off when that request ends, whether it succeeds or fails. A search, filter or sort load that replaces it takes the spinner over. A pull-down during a running request joins that request. A replaced request can't turn the spinner off early, and it can no longer stay on (SPIN-01 – 06).
- **Seed instructions:** commands for macOS and Linux, Windows PowerShell, and Windows Command Prompt, in the script header and the device checklist.

*Outstanding requirement, NOT enforced:* the plan limit on devices logged in at once (1, 2 or 3; SEC-08). `register_device` does not check it, and there is no "log out other devices" (TC-SEC-07). It needs its own design and a migration, and has not been started.

*Automated evidence (local, 25 Nov 2026):* totals are in IMPLEMENTATION-STATUS. New tests:
- app: FRESH-01 – 05 and FRESH-10 – 13, MSG-03e, TC-DASH-12;
- API: PS-21 – PS-25, using two separate clients signed in to the same owner account; PS-03, PS-10 and PS-13 now pass the name the screen showed;
- seed script: SEED-01 – 08, including an automated end-to-end run on the local stack (dry run and wrong confirmation write nothing; 35 added; rerun adds 0; an archived seed category isn't re-created; 35 products, 35 names, 3 categories).

The React Native lifecycle wiring itself (AppState events, timers) can't be exercised by these tests: typecheck and the bundle check only.

*Manual device verification (owner-reported physical-device evidence, recorded 25 Nov 2026; separate from the automated results above):*
- **iPhone quick price sheet** (iPhone 13 Pro Max, Expo Go): QPS-D1 – QPS-D6, **6/6 PASS**.
- **Cross-device freshness:** **XD-01 PASS**. A product change made on one phone (iPhone or Galaxy A06) appeared on the other without a manual refresh or restart. The trigger was not recorded.
- **Two-phone checklist:** MD-01 and MD-04 **PARTIAL**; the remaining 16 (MD-02, MD-03, MD-05 – MD-18) **NOT TESTED**.
- **Increment 2 checks unchanged:** 9 PASS, 4 PARTIAL, 11 NOT TESTED.

Not every device check has passed. Details: [DEVICE-TEST-LOG.md](../testing/DEVICE-TEST-LOG.md), "Stage 1C-2 increment 2b".

## 4. Acceptance criteria and tests for every increment

- **Unit tests (app):** each service function's result parser (valid results, malformed results rejected, money as integer pesewas only), request-ID reuse on retry (as TC-AUTH-14 – 16), error-code to message mapping, and the screen state logic (as `dashboardState.test.ts`). Required by STAGE-1C-PLAN §4 ("UI unit tests").
- **Previews match the server:** the S-33 and S-34 previews are checked against the server's result in tests, using the same rounding rules (C-21; T6 S1). See §7 for S-39.
- **Scale:** every list is paginated on the server or through ranges; nothing counts or totals more than one page on the phone (owner requirement, STAGE-1C-PLAN §4; `max_rows` unchanged). Tested with more than 1,000 rows where a list can grow that large (products, movements).
- **Display rules:** GH₵ formatting with `formatCedis` (05 C-03); stock colours (08; see §7); M2 rule on S-38; C-123-style wording on S-36 cards.
- **Usability rules:** plain taps only, 56 dp buttons (TC-UX-03; Stage 1B rules), readable at 130 % font size (TC-DEV-03 / TC-UX-04, partial).
- **Online-only actions:** 🌐 actions are disabled when offline, with no queue (TC-COST-19). See §7.
- **Regression:** the full database, API and app suites, typecheck, secret scan, audit gate, bundle export and bundle scan pass; CI green.
- **Evidence levels:** "works end to end against the local stack" (STAGE-1C-PLAN §5 criterion 4) before 📱; **📱 only when the owner tests on the phone**, recorded in `docs/testing/DEVICE-TEST-LOG.md`.

## 5. Must remain unchanged

- All 17 migrations, `20261111000100` – `20261125000200`, and every server function's behaviour. In particular the **frozen T7 migration** (`20261124000300_supplier_payments.sql`) and the M2 migration's output contract.
- All existing database and API tests and their expected results.
- `max_rows = 1000` in `supabase/config.toml` (no raising it as a workaround).
- No new server function or migration unless the owner approves one (see §7, S-39 preview).

## 6. Explicitly excluded from 1C-2

- **Reports** and the **M3** specification clarification batch (09 §3, 05 §3.2, C-41, TC-PUR-13 wording, 09 §2 attention types).
- **Cloud migration and R-1 re-verification (D11):** needs the owner's separate approval. See §7, item 9, for its effect on device testing.
- Sales, voids, the offline outbox and sync, the **offline product cache** (STAGE-1C-PLAN §3: sync stage); negative-stock and other sale-created attention items (Stage 1D).
- Starter product lists (Q3); customers and credit; expenses; cash count and day closing; CSV export; backup (R-3); real shop data (gate G2).
- The weekly all-shops integrity run and alert (T10-I2); TC-ATTN-07 pilot usability.

## 7. Points put to the owner (decided 24 Nov 2026; see STAGE-1C-DECISIONS §3a)

| # | Point | Why it matters |
|---|---|---|
| 1 | **Go-ahead for 1C-2**, and formal closure of 1C-1 | Required before any 1C-2 work |
| 2 | **Navigation and network-status libraries:** the app has neither (`app/package.json`: no navigation or network package). Hand-built navigation is possible, as in `AppRoot.tsx`; detecting offline state for TC-COST-19 may need a package. Dependency changes need the owner's approval; earlier, `npx expo install` couldn't reach Expo's version service from Claude's environment (IMPLEMENTATION-STATUS note 3) | Decides increment 1 |
| 3 | **Offline views:** S-30 is marked 📴 (view) and S-35 🌐/📴, but the offline product cache belongs to the sync stage (STAGE-1C-PLAN §3). Are these online-only in 1C-2? | Scope of S-30 and S-35 |
| 4 | **S-39 split preview:** the screen "shows the split" before saving, but the split comes from the server's exact-rational walk (T9 C1, Q10), and there is no preview function. Options: show it only after saving (the result contains it), or approve a new read-only preview function (new server work) | Possible new migration |
| 5 | **S-32 "optionally cost":** a cost change goes through `set_cost`, which requires a reason (T4 D). Does the quick price change ask for a reason when cost is changed, or send the owner to "Correct cost price"? | S-32 design |
| 6 | **Stock colours:** S-30 names four states (green / amber / red / negative); 08 defines amber for low stock and red for negative stock only. What do red and negative each mean (for example, 0 versus below 0)? | S-30 display |
| 7 | **Tab naming:** 03 names the tab "Products"; D10 says "inside Stock". Assumed to mean the same tab; confirm | Navigation labels |
| 8 | **Sell and Customers tabs** belong to later stages: hidden, or shown as "coming later"? | Navigation shell |
| 9 | **Device testing needs a backend the phone can reach.** The 1C functions exist only on the local stack and in CI. A phone test against the development cloud project needs the Stage 1C migrations applied there first (D11). Testing against a local stack from the phone needs a network setup. Either way, an installed build (development build) is needed; EAS builds need the owner's approval | Blocks increment 9 (📱) |
| 10 | **"End to end against the local stack"** (criterion 4): there is no UI test framework in the repository. Is a manual run (emulator or development build against the local stack) plus the service-level tests enough evidence, or is a UI test tool wanted (a dependency decision)? | Evidence for criterion 4 |
