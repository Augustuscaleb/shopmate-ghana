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

## 2. Server functions each screen uses (all exist; none needs changing)

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

## 3. Recommended order (each increment reviewed and CI-passed before the next)

| # | Increment | Screens |
|---|---|---|
| 1 | **Foundations:** navigation shell, an inventory service layer (typed result parsers that reject non-integer money, as `app/src/services/dashboard.ts` does), request IDs saved before each write and reused on retry (the `app/src/services/account.ts` pattern), plain-language error messages (07), online/offline state for 🌐 actions (the shell and the online state depend on §7 items 2, 7 and 8) | none visible beyond the shell |
| 2 | Products and categories | S-30, S-31, S-32 |
| 3 | Product detail and movement history | S-37 |
| 4 | Restock and stock adjustment | S-33, S-34 |
| 5 | Low stock and sharing | S-35 |
| 6 | Unpaid purchases and Pay supplier, with the M2 display rule | S-38 |
| 7 | Correct purchase and Return to supplier | S-39 |
| 8 | Needs attention and its dashboard entry | S-36, S-10 entry |
| 9 | Owner's device check of all screens (📱), including the KI-1 cold-start re-check on the installed build | all |

Reasons for the order: the service layer and error handling are shared by every screen; S-37 is the entry point for S-39; S-36's action buttons lead to S-31, S-33, S-34, S-37 and S-39, so it comes once those exist.

**Increment 1 status: committed in `0f13132` ([CI #53](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/45506392419) passed); owner-reported device checks complete on the local stack (25 Nov 2026; Samsung Galaxy A06, Android 16): all 14 checklist entries PASS.** Five-tab shell (D-7, D-8) with the More tab keeping Log out; pure navigation model; online-state monitor fed by request outcomes (`expo-network` **not installed**: needs separate approval, and a new development build to verify, D-2); server-error classifier; request-ID store (reuse on retry, release on a definite answer, hold back changed inputs after an unknown outcome); strict result readers; the message table ([STAGE-1C-2-ERROR-MESSAGES.md](STAGE-1C-2-ERROR-MESSAGES.md)); the visual foundation ([STAGE-1C-2-VISUAL-DESIGN.md](STAGE-1C-2-VISUAL-DESIGN.md)): tokens, reduced-motion-aware touch feedback, entrances and skeleton loading, using only React Native's built-in Animated API. A shared reduce-motion state (reduced until the phone's setting is known; one native check and subscription). Tests: app 66/66 (41 new), API 139/139 (6 new, `tests/app-error-handling.test.ts`), database 1017/1017; typecheck, scans and bundle export passed. No backend change. **Device check:** complete (owner-reported manual evidence, 25 Nov 2026): 14 PASS, 0 PARTIAL, 0 NOT TESTED, 0 BLOCKED, recorded in [DEVICE-TEST-LOG.md](../testing/DEVICE-TEST-LOG.md); automated evidence is CI #53. Not covered: partial animation scales and manufacturer motion settings, and the cloud project (D11 outstanding).

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
