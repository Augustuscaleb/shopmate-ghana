# ShopMate Ghana — master completion roadmap

**Status: DRAFT for owner review (24 Nov 2026). Not approved.** Once approved, this page is the single tracking reference from the current repository state to final release. It **adds no scope**: every item comes from the approved baseline (specification revision 5.1, [PLAN.md](PLAN.md) v7.1 and its decision log), a stage plan or a recorded owner decision. Later suggestions are labelled **[suggestion]** and are not scope.

**Authoritative sources (this page summarises them; they win on any conflict):** the [product specification](product-specification/README.md) (01–10), [PLAN.md](PLAN.md) (§11 stages, §14 decisions), [IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md), [RELEASE-READINESS.md](RELEASE-READINESS.md), the [test plan](product-specification/10-test-plan.md), [stages/](stages/STAGE-1C-PLAN.md), [STAGE-1C-DECISIONS.md](stages/STAGE-1C-DECISIONS.md), [KNOWN-ISSUES.md](KNOWN-ISSUES.md), [testing/DEVICE-TEST-LOG.md](testing/DEVICE-TEST-LOG.md), [testing/CLOUD-SETUP-LOG.md](testing/CLOUD-SETUP-LOG.md), [operations/BACKUP-AND-RESTORE.md](operations/BACKUP-AND-RESTORE.md).

## 0. Status labels and evidence rules

| Label | Meaning | Evidence required |
|---|---|---|
| **COMPLETED AND VERIFIED** | Built, and passed in **every** environment its requirement names | Commit + CI run; plus ☁️ / 📱 where the requirement needs them |
| **IMPLEMENTED, NOT FULLY VERIFIED** | Built and CI-passed (or similar), but a required level is missing (cloud, device, owner approval) or part of the requirement is outstanding | Commit + CI run; the missing part named |
| **IN PROGRESS** | Work started in a current stage, not finished | |
| **NOT STARTED** | No code exists | |
| **BLOCKED** | Can't proceed until a named dependency is met | The blocker |
| **DEFERRED** | Moved out of the MVP or a stage by an owner decision | The decision |
| **REQUIRES OWNER DECISION** | Can't be planned or built without the owner's choice | The question (§9) |

Rules kept from the project: a plan mentioning an item is **not** evidence; CI or local passes say nothing about the cloud or a phone (test plan §0); a local or CI migration is **not** a cloud migration; cloud and production operations need separate authorisation (D11); frozen migrations and approved behaviour are preserved.

## 1. Current-state summary (24 Nov 2026; repository facts updated 25 Nov 2026)

- **Repository:** branch `claude/elegant-babbage-a2rfd2`, HEAD `75f8aa6` (Stage 1C-2 increment 2b); [CI #57](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/45674601006) passed (secret scan, dependency audit, typecheck, database tests, API tests, app unit tests, Android bundle export and bundle scan). The local runs on that tree: database 1051/1051 (16 files), API 177/177 (21 files), app 124/124 (23 files). No pull request; nothing merged. *(Before: HEAD `7d29d4d`, CI #51 on 24 Nov 2026.)*
- **Done:**
  - Stage 1A (foundation) and 1B (login and onboarding) approved;
  - Today dashboard built and owner-tested on a phone;
  - Stage 1C-1 (inventory **database** functions, T1–T10, plus M2) built, CI-passed and **closed by the owner for its local/CI scope (24 Nov 2026)**, with fresh local evidence at `44d9d55`;
  - Stage 1C-2 increments 1 (`0f13132`), 2 (`f6a405e`) and 2b (`75f8aa6`) committed and CI-passed. Increment 2b includes the `update_product` expected-values migration `20261125000300`, **local and CI only**.
- **Cloud:** the development project has only the **5 Stage 1 migrations** (☁️ cloud run 43260965124, 12 Nov 2026). The **13 Stage 1C migrations** (`20261123000100` – `20261125000300`; 18 migration files in the repository) are **not** applied (D11). There is **no production project** yet (CLOUD-SETUP-LOG: "a separate production project will be created before real data").
- **In progress:**
  - Stage 1C-2 screens (authorised 24 Nov 2026): increments 1, 2 and 2b done.
  - Owner decision P-1 (25 Nov 2026): **Stage 1C-3** (Product Experience & Visual Redesign; [plan](stages/STAGE-1C-3-PLAN.md); **G-1 approved 25 Nov 2026 for increment 1C-3.1 only**: committed in `7064d4d` with the Edit-pencil correction `225044d`, device checks partly done; 1C-3.2 committed (design system and gallery), C-1b approved 26 Nov 2026; 1C-3.3 (Today, navigation and Products) committed 26 Nov 2026, device checks NOT TESTED; 1C-3.4 (sign-in, onboarding) onwards not started) runs **before** the remaining 1C-2 increments.
- **Not started:** sales and offline sync (1D); credit; expenses; cash count and closing; reports; CSV export; settings, subscription, help; backup (R-3); pilot; PC and browser access (PW-1).
- **Gates:** G1, G2, G3 **not reached**. **Real shop data is not allowed** (G2 needs R-1, R-2, R-3, among others).
- **Next decisions:**
  - D11 cloud migration;
  - `expo-network` installation and any development build it needs (D-2);
  - approval to start Stage 1C-3 (G-1) and the other open items in its plan (§10 there);
  - the remaining items in §9.

## 2. Phase overview and order

| # | Phase (source) | Status | Depends on |
|---|---|---|---|
| P0 | Stage 0 — validation (PLAN §11) | **IN PROGRESS**: desk research and specification done; competitor tests and survey not evidenced in the repository | Owner |
| P1A | Stage 1A — foundation | **COMPLETED AND VERIFIED** (☁️ 91/91) | — |
| P1B | Stage 1B — login, onboarding, cloud tooling | **IMPLEMENTED, NOT FULLY VERIFIED**: approved, ☁️ 4 safeguard tests, 📱 TC-DEV-01–03; open sub-items in §3.2 | — |
| P1C-1 | Stage 1C checkpoint 1 — inventory database | **IMPLEMENTED, NOT FULLY VERIFIED**: CI-passed and locally verified; **checkpoint closed** by the owner (24 Nov 2026); not ☁️ (D11 outstanding) | — |
| P1C-2 | Stage 1C checkpoint 2 — inventory screens | **IN PROGRESS** (authorised 24 Nov 2026; decisions in [STAGE-1C-DECISIONS.md](stages/STAGE-1C-DECISIONS.md) §3a); increment 1 committed (`0f13132`), device checks 14/14 PASS; increment 2 committed (`f6a405e`, CI #55): main flows manually exercised on the phone (owner-reported): 9 PASS, 4 PARTIAL, 11 detailed device checks NOT TESTED; increment 2b (multi-device freshness, iOS quick price fix) committed (`75f8aa6`, CI #57); iPhone quick price sheet 6/6 scenarios PASS and cross-device freshness XD-01 PASS (owner-reported); two-phone checklist MD-01 – MD-18: 2 PARTIAL, 16 NOT TESTED. **Remaining increments (S-37 movement history, S-33/34, S-35, S-38, S-39, S-36) paused until after Stage 1C-3** (P-1) | P1C-1 closure ✅ |
| P1C-3 | **Stage 1C-3 — Product Experience & Visual Redesign** ([plan](stages/STAGE-1C-3-PLAN.md)): read-only Product Details (read-only part of S-37); design system v2 (system font); redesign of all existing screens; portrait **and** landscape on all phones and tablets (Android, iOS); motion and accessibility | **IN PROGRESS: 1C-3.1 (Product Details) implemented in `7064d4d` and `225044d` (CI passed), device checks partly done; 1C-3.2 (design system and gallery) committed `cdae923`, C-1b APPROVED 26 Nov 2026; 1C-3.3 (Today, navigation and Products) committed 26 Nov 2026, device checks NOT TESTED; 1C-3.4 – 1C-3.6 NOT started** (owner decisions P-1 – P-5, S-1, M-1, R-1, W-1, 25 Nov 2026; G-1 approved 25 Nov 2026 for 1C-3.1 only) | 1C-2 increments 1 – 2b ✅; owner approval (G-1) ✅ for 1C-3.1; spec 08 revision 2 **approved at C-1a** (25 Nov 2026; specification set 5.2); the physical gallery review **C-1b** (A06 and iPhone, after 1C-3.2) still required before screen redesign; Android development build approval (B-1) in 1C-3.5. **iOS release (plan rev. 6, §6.5 item 4):** final iPhone and iPad checks (orientation, safe areas, release-readiness) on an approved iOS development or TestFlight build, required before the iOS release gate and before release for real-shop use; they block the **iOS release only, not Stage 1C-3 acceptance**; Apple account and iOS build need separate approval (**B-2**); which gate is the iOS release gate is still an owner decision (**IG-1**) |
| PW-1 | **PC and browser access (Windows and macOS)**: browser access, desktop layouts and navigation, secure browser sessions, larger-screen workflows, browser testing (§3.6a) | **NOT STARTED**: required product direction (owner, 25 Nov 2026); scheduled **after Stage 1C-3** (scheduling decision W-1); detailed plan not yet written | P1C-3 complete (design system); **D11 before any cross-network testing**; owner decisions on the technical basis, browser session security and hosting |
| Ops-1 | Backup and restore, first restore drill (R-3, mandatory) | **REQUIRES OWNER DECISION** (start approval); designed only | Cloud project (exists) |
| P1D+ | Stage 1 remaining: sales and offline sync, voids, cancellations, credit, expenses, closing, reports, export, settings, subscription, help (PLAN §11 "1D onwards") | **NOT STARTED**; sub-stage split **not yet planned** | P1C (stock functions); 1D plan |
| Cloud | Apply migrations to the cloud and re-verify after each (decision 42, R-1, D11) | **REQUIRES OWNER DECISION** per batch | Owner approval |
| G2 | Stage 1 exit: gate G2 "real data allowed" | **BLOCKED** | All Stage 1 work, R-1 – R-3, all G2 tests |
| P2 | Stage 2 — pilot (5–10 shops, 30–60 days, free) | **BLOCKED** | G2 (and G3 to expand beyond 2–3 shops) |
| P3 | Stage 3 — refinement | **BLOCKED** | Pilot results |
| P4 | Stage 4 — paid launch | **BLOCKED** | Stage 2 checkpoint |
| P5 | Stage 5 — growth | **DEFERRED** (01 §3) | Paid launch |

**Required order and why:**
1. **1C-1 closure → 1C-2**: screens need the stock functions and the owner's 1C-2 decisions.
   - **1C-2 increments 1 – 2b → Stage 1C-3 → the remaining 1C-2 increments** (owner decision P-1, 25 Nov 2026). The remaining inventory screens, and the S-37 movement history, are built once, in the new design system.
   - **Stage 1C-3 → PW-1** (scheduling decision W-1): browser support uses the 1C-3 design system. PW-1 needs **D11** before any cross-network testing. Its position relative to 1D is decided when its own plan is written.
2. **1C-2 before 1D** follows the PLAN §11 stage order. The hard technical dependency of sales is on **1C-1** (products, the stock pool and sale-time cost); 1C-2 is what lets an owner create and stock products in the app, so a usable New Sale (S-20) needs it.
3. **1D (sales, outbox, sync)** before credit, closing and reports: credit sales, voids, cancellations, cash count and every report line depend on recorded sales (05 §4 – §11).
4. **Expenses** before **cash count and reports** (C-80, C-47).
5. **Reports** need the **M3** clarification batch first (C-41, 05 §3.2, 09 §3).
6. **Ops-1 (backup)** can run in parallel any time after owner approval, but **must pass before G2**.
7. **Cloud migration (D11)** should follow each verified backend batch, and must be done before any device test against the cloud and before G2 (decision 42).
8. **G2 → pilot → refinement → paid launch** in that order (PLAN §11).

## 3. Phase-by-phase checklist

### 3.1 Stage 0 — validation (PLAN §11)

| Item | Status | Evidence / remaining work |
|---|---|---|
| Desk research, competitor analysis | COMPLETED (document) | [market-research/](market-research/STAGE-0-REPORT.md); the report itself is marked "Draft for review — not yet approved" (contradiction with PLAN's ✅; §8) |
| Product specification and design direction | COMPLETED (approved 11 Nov 2026, revision 5.1) | [product-specification/](product-specification/README.md) |
| Hands-on tests of 3–5 competitor apps; app-store review mining | **NOT STARTED** (no evidence in the repository) | Owner task; Stage 0 report §"go/no-go" |
| WhatsApp survey: 30+ responses, 50 %+ clear problem, 10+ pilot volunteers, ≥ 3 pilot shops | **NOT STARTED** (no evidence) | Owner task; results "should be in before the pilot starts" (Stage 0 report) |

### 3.2 Stage 1A and 1B (approved)

| Item | Status | Evidence | Remaining |
|---|---|---|---|
| Schema (30 tables), constraints, append-only triggers, RLS on every table, privileges | COMPLETED AND VERIFIED | `20261111000100` – `000500`; [CI 43077043749](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43077043749); ☁️ [cloud run 43260965124](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43260965124) (77 + 14) | — |
| `create_business`, `register_device` | COMPLETED AND VERIFIED | same | — |
| Login, sign-up, confirmation, reset, shop setup screens (S-01 – S-04) | COMPLETED AND VERIFIED | Stage 1B `1aee353`, [CI 43081513053](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43081513053); 📱 TC-DEV-01 – 03 ([device log](testing/DEVICE-TEST-LOG.md)) | Check email and Set new password not checked at 130 % (TC-DEV-03 note) |
| Secure session storage (SEC-05) | COMPLETED AND VERIFIED | TC-AUTH-09 – 13 ✅; 📱 TC-DEV-01 step 9 | KI-1 (Expo Go only) monitored |
| Password rules (SEC-01, app side) | IMPLEMENTED, NOT FULLY VERIFIED | Revised rules ✅ CI #48/#49; 📱 step 2 | Server-side check: **decision 49 / R-4 open** |
| Cloud verification tooling (TC-CLOUD-00 – 03) | IMPLEMENTED, NOT FULLY VERIFIED | ☁️ 01 – 03; revised preflight ✅ CI | Revised preflight (TC-CLOUD-00) not yet run in the cloud |
| Starter products at setup (S-05, F-02 sample lists) | **DEFERRED** (Q3) | — | Until pilot shops' real names and prices are gathered |
| Quick tour (S-06) | **NOT STARTED** | — | Not assigned to a stage (§8) |
| Today dashboard (S-10, F-17) | IMPLEMENTED, NOT FULLY VERIFIED | `4b8bb6d`, [CI 45173572606](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/45173572606); owner-tested on the phone (23 Nov 2026); counts from `inventory_summary` (D7) | Sales figures still read rows on the phone; **1D must move today's count and revenue to the server** (PLAN §11 requirement); profit, payment split, money owed and Needs attention parts need later stages |

### 3.3 Stage 1C-1 — inventory database (CI-passed; not in the cloud)

All rows: evidence [test plan §0d](product-specification/10-test-plan.md) (Stage 1C: 940 database + 80 API tests), [CI #49](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/45431840081) / [#51](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/45487659376), local log [2026-11-24-stage1c1-local.log](test-evidence/2026-11-24-stage1c1-local.log). Status of each: **IMPLEMENTED, NOT FULLY VERIFIED** (not ☁️; no screens).

| Task | Commit | Migration | Functions |
|---|---|---|---|
| T1 shared helpers | `253d489` | `20261123000100` | internal stock pool helpers |
| T2 dashboard counts (D7) | `2aeb500` | `20261123000200` | `inventory_summary` |
| T3 products, categories | `40cf83d` | `20261123000300` | `create_product`, `update_product`, `set_product_archived` |
| Idempotency fix | `91f084a` | `20261123000400` | `claim_request` (internal) |
| T4 cost correction | `a62baa9` | `20261123000500` | `set_cost` |
| T5 restock | `4212e94` | `20261124000100` | `restock` |
| T6 stock adjustment | `bd59bee` | `20261124000200` | `adjust_stock` |
| T7 supplier payments (**frozen**) | `1d695f8` | `20261124000300` | `pay_supplier`, `unpaid_purchases` |
| T8 return to supplier | `5d807cd` | `20261124000400` | `return_to_supplier` |
| T9 purchase correction | `2b3bb4a` | `20261124000500` | `correct_purchase` |
| T10 attention, integrity, low stock | `ba565e7` | `20261125000100` | `acknowledge_attention`, `check_stock_integrity`, `low_stock_products` |
| 1C-1 test gaps | `230c029` | — | tests only |
| M2 display fields | `7d29d4d` | `20261125000200` | `unpaid_purchases` (additive) |

**Remaining for 1C-1:** checkpoint **closed** by the owner (24 Nov 2026; [STAGE-1C-PLAN.md](stages/STAGE-1C-PLAN.md) §5a; local evidence [2026-11-24-stage1c1-closure-local.log](test-evidence/2026-11-24-stage1c1-closure-local.log)). Still outstanding: cloud application and re-verification (D11); monitoring findings L1 – L3, I6 ([STAGE-1C-DECISIONS.md](stages/STAGE-1C-DECISIONS.md) §5).

### 3.4 Stage 1C-2 — inventory screens (IN PROGRESS; authorised 24 Nov 2026) and Stage 1C-3 (PLANNED)

Scope and order: [STAGE-1C-2-EXECUTION-BRIEF.md](stages/STAGE-1C-2-EXECUTION-BRIEF.md). Screens S-30 – S-39, Needs attention on the dashboard (D10). All backend functions exist (§4). Decisions D-0 – D-10 approved (§9).

**Sequence (owner decision P-1, 25 Nov 2026):**
1. Increments 1, 2 and 2b are committed (`0f13132`, `f6a405e`, `75f8aa6`).
2. **Stage 1C-3** ([STAGE-1C-3-PLAN.md](stages/STAGE-1C-3-PLAN.md)) is in progress: 1C-3.1 committed (device checks partly done); 1C-3.2 committed and C-1b approved; 1C-3.3 committed (NOT device-tested); 1C-3.4 onwards need their own go-ahead.
3. The remaining 1C-2 increments follow Stage 1C-3, in the new design system: S-37 movement history, S-33/34, S-35, S-38, S-39, S-36.

**Multi-device (owner decisions, 25 Nov 2026):** several devices on the same shop account are a **core requirement**, and the plan limit of 1, 2 or 3 devices stays in effect.
- **Increment 2b** (freshness on return, visibility and every 15 minutes; "Updated" indicators; conflict-safe categories; iOS quick price fix): **committed** (`75f8aa6`, CI #57).
  - Device evidence (owner-reported): cross-device freshness **XD-01 PASS** (iPhone and Galaxy A06: a product change appeared on the other phone without a manual refresh or restart); iPhone quick price sheet **6/6 scenarios PASS**.
  - The two-phone checklist is **partly** done: MD-01 and MD-04 PARTIAL, MD-02, MD-03 and MD-05 – MD-18 NOT TESTED.
  - Multi-device readiness is not claimed until the remaining checks are done.
- **Staged product requirements:**
  - **iPhone, and Android tablet and iPad layouts, in portrait and landscape:** planned in **Stage 1C-3** (responsive layouts and the orientation unlock in increment 1C-3.5; final iPhone and iPad checks on an approved iOS development or TestFlight build before the iOS release gate and before release for real-shop use, which block the iOS release only, not Stage 1C-3 acceptance; separate approval **B-2**; the iOS release gate itself, G2 or the pilot gate, is owner decision **IG-1**);
  - **a browser experience for Windows and Mac:** milestone **PW-1** (§3.6a), after Stage 1C-3;
  - **staff accounts with roles,** so that several people can work without overwriting each other: not yet planned in detail.
- **Outstanding, NOT enforced:** the plan device limit (SEC-08) and "log out other devices" (SEC-06, TC-SEC-07).
- **Out of scope for now:** offline changes beyond offline sales.

### 3.5 Ops-1 — backup and restore (R-3, mandatory before real data)

| Item | Status | Remaining |
|---|---|---|
| Design | Documented ([operations/BACKUP-AND-RESTORE.md](operations/BACKUP-AND-RESTORE.md); PLAN §10) | — |
| Weekly encrypted dump workflow (roles, schema, data), private storage, failure alert (TC-BAK-01, 02, 04) | **NOT STARTED** | Needs owner approval to start; the decryption key held by the owner; a private storage location |
| Restore drill on a separate target, with counts, totals, integrity, RLS tests, login (TC-BAK-03); recorded in [RESTORE-LOG.md](RESTORE-LOG.md) (TC-BAK-05) | **NOT STARTED** | After the workflow; repeat monthly during the pilot and after major schema changes |

### 3.6 Stage 1 remaining scope ("1D onwards", PLAN §11) — NOT STARTED

The PLAN lists these as one block; their split into sub-stages and their order inside the block are **not yet planned** (needs a 1D plan, decision D-12 in §9). Dependency order from §2 applies.

| Module | Features | Screens | Server functions (09 §3) | Key tests |
|---|---|---|---|---|
| Sales (online and offline) | F-08, F-09, F-10, F-21 | S-20, S-21, S-22 | `record_sale`, `sync_heartbeat` | TC-FIN, TC-COST-11 – 18, TC-TIME, TC-SYNC, TC-CONC-01 – 04, 07 |
| Offline outbox and sync | F-21; 06 SY-01 – SY-75 | banners (SY-05), S-74 | device store (`expo-sqlite`, PLAN §2) | TC-SYNC-01 – 20 |
| Sales history, receipts, void, safe cancellation | F-11, F-12 | S-23, S-24, S-25 | `void_sale`, `cancel_unsent_sale`, `get_sale_status` | TC-CANCEL, TC-COST-07 (end to end), TC-SEC-09 |
| Stock discrepancies from sales | F-22 | S-36 (sale items) | inside `record_sale`; resolved by `adjust_stock` | TC-ATTN-01, 04, TC-LOSS-03 |
| Dashboard sales figures at scale | F-17 | S-10 | server-side count **and** revenue sum (PLAN §11) | > 1,000 sales in a day |
| Customers and credit | F-13, F-14, F-15 | S-40 – S-44 | `record_payment`, `adjust_balance`, `write_off`, `undo_write_off` | TC-CRED-01 – 12, TC-CONC-06 |
| Expenses | F-16 | S-50, S-51 | `save_expense`, `delete_expense` | TC-PUR-10 (expense form part) |
| Cash count and day closing | F-19 | S-61, S-62 | `close_day`, `record_cash_recount`, `add_day_adjustment` | TC-CLOSE-01 – 09, TC-CASH-01 |
| Reports | F-18 | S-60 | read functions (not yet specified in 09 §3; §8) | TC-COST-21, TC-COST-20 (period), TC-FIN, TC-CLOSE-09 |
| CSV export | F-20 | S-63 | `export_csv` | SEC-33 warning |
| Settings, subscription, help, log out | F-23, F-24, F-25, F-26 | S-70 – S-74 | subscription: admin role (SEC-16) | TC-SEC-07 |
| Security items not yet built | SEC-06, 07, 08, 26, 30, 32 – 35 | | | TC-SEC-06, 07, 09 |

### 3.6a Future milestone PW-1: PC and browser access (Windows and macOS) — NOT STARTED

**Owner decisions (25 Nov 2026):** browser access on Windows PCs and Macs is a **required product direction** and a **separate milestone**, scheduled **after Stage 1C-3** ([STAGE-1C-3-PLAN.md](stages/STAGE-1C-3-PLAN.md) §11). It is not part of Stage 1C-3. A phone app that adapts to a wide window is not treated as a PC experience.

| Area | To be planned and delivered |
|---|---|
| Browser access | The app in current Chrome, Edge, Firefox and Safari on Windows and macOS. Technical basis to be decided (Expo web with `react-native-web` and `react-dom`, which are new packages, or a separate web front end) |
| Desktop layouts and navigation | Side navigation instead of the bottom tab bar; multi-column screens; wide, sortable tables for products and stock; no stretched phone layouts |
| Secure browser authentication and sessions | A reviewed design, because the phones' secure storage (SEC-05) isn't available in browsers: where the session lives, protection against cross-site scripting and request forgery, timeouts, "log out of this browser", shared shop computers. SEC-01 – SEC-08 applied to browsers; browsers counted in the device-limit requirement |
| Larger-screen workflows | Keyboard-first entry and shortcuts, faster bulk work, printing or exporting lists, mouse and hover behaviour |
| Compatibility and performance testing | A browser matrix (Windows 10/11 with Chrome and Edge; macOS with Safari and Chrome; Firefox), 1280 – 1920 px widths, 100 – 200 % zoom, NVDA and VoiceOver, keyboard-only use, load time on a modest PC and a slow connection; shop isolation, concurrency and freshness re-verified with a browser and a phone together |

**Dependencies:**
- Stage 1C-3 complete (shared design system);
- **D11 addressed before any cross-network testing:** the Stage 1C migrations applied to the cloud and re-verified, with the owner's approval per batch;
- owner decisions on the technical basis, browser session security and hosting;
- its own detailed plan, reviewed and approved before any browser work starts.

### 3.7 Gates, pilot and launch

| Item | Status | Criteria (source) |
|---|---|---|
| **G1 — internal build** | NOT REACHED | Every TC-FIN, COST, TIME, CLOSE, PUR, ATTN, LOSS, CRED, CASH test ✅ (test plan §10) |
| **G2 — real data allowed** (Stage 1 exit) | NOT REACHED | G1 + all TC-SYNC, CANCEL, CONC, SEC, BAK, CLOUD ✅; R-1, R-2, R-3 (test plan §10; PLAN §11; RELEASE-READINESS) |
| Production cloud project | NOT STARTED | Separate from development (CLOUD-SETUP-LOG); migrations and cloud verification there too (decision 42) |
| Legal: consent, privacy notice (SEC-32), Data Protection Commission registration investigated (PLAN §8.2) | NOT STARTED | Before pilot data (consent, notice); before charging (DPC) |
| **Stage 2 pilot** | BLOCKED (G2) | 5–10 shops (start 2–3; expand after **G3**), 30–60 days free; checkpoint: ≥ half use it daily after 3 weeks, ≥ 3 would pay (PLAN §11) |
| **G3 — pilot expansion** | NOT REACHED | G2 + TC-SYNC-20 on pilot devices + no open critical bugs |
| Usability targets TC-UX-01 – 04; TC-ATTN-07 | NOT STARTED | Pilot |
| **Stage 3 refinement** | BLOCKED | Fix pilot problems; PLAN's "likely additions" (manager/cashier accounts, top pilot requests) are not yet committed scope (Q-19) |
| **Stage 4 paid launch** | BLOCKED | Stage 2 checkpoint passed; manual MoMo subscriptions live (PLAN §9.1); buy Google Play, Supabase Pro, domain, email/SMS provider; replace built-in email before public launch (PLAN §8.1); plan limits and SEC-08 enforced only from paid launch (01 §4) |
| **Stage 5 growth** | DEFERRED | Payment automation research, phone OTP, barcode, suppliers, more offline, branches, Twi (PLAN §11; 01 §3). **iOS and web are no longer Stage 5 items** (owner decisions, 25 Nov 2026): iPhone and iPad support is planned in Stage 1C-3 (P1C-3), and browser access on Windows and macOS is milestone PW-1 (§3.6a) |

### 3.8 Original MVP features (01 §2) — coverage

| ID | Feature | Status | Where |
|---|---|---|---|
| F-01 | Email registration, login, reset | COMPLETED AND VERIFIED | §3.2 |
| F-02 | Business setup with shop type; **sample product lists** | Setup COMPLETED AND VERIFIED; sample lists **DEFERRED** (Q3) | §3.2 |
| F-03 | Products: create, edit, archive; costs; category; unit; low-stock level | Backend IMPLEMENTED, NOT FULLY VERIFIED; screens NOT STARTED (1C-2) | §3.3, §3.4 |
| F-04 | Quick price change | Backend as F-03; screen NOT STARTED (1C-2) | S-32 |
| F-05 | Restock with pack multiplier, purchase cost, paid now | Backend IMPLEMENTED, NOT FULLY VERIFIED; screen NOT STARTED | S-33 |
| F-06 | Stock adjustment with reason; resolves negative-stock flags | Backend IMPLEMENTED, NOT FULLY VERIFIED (sale-created flags: 1D); screen NOT STARTED | S-34 |
| F-07 | Low-stock list, shareable | Backend IMPLEMENTED, NOT FULLY VERIFIED; screen NOT STARTED | S-35 |
| F-08 | New Sale, offline | NOT STARTED | §3.6 |
| F-09 | Optional MoMo reference | NOT STARTED (schema column exists, Stage 1A) | §3.6 |
| F-10 | Credit sale with paid now | NOT STARTED | §3.6 |
| F-11 | Sales history, receipts, share, safe cancellation | NOT STARTED | §3.6 |
| F-12 | Void a sale (online) | NOT STARTED (TC-COST-07 helper simulation only) | §3.6 |
| F-13 | Customers | NOT STARTED (table and direct-write RLS exist, Stage 1A) | §3.6 |
| F-14 | Balances, record payment, write-off, undo | NOT STARTED | §3.6 |
| F-15 | WhatsApp balance reminder | NOT STARTED | S-42 |
| F-16 | Expenses | NOT STARTED | §3.6 |
| F-17 | Today dashboard | IMPLEMENTED, NOT FULLY VERIFIED (sales figures at scale in 1D; other parts later) | §3.2 |
| F-18 | Reports | NOT STARTED; needs M3 and a reports design (Q-1) | §3.6 |
| F-19 | Cash count (close the day) | NOT STARTED | §3.6 |
| F-20 | CSV export, all plans | NOT STARTED | §3.6 |
| F-21 | Offline outbox with statuses | NOT STARTED | §3.6 |
| F-22 | Stock discrepancy flags and reconciliation | Reconciliation backend IMPLEMENTED, NOT FULLY VERIFIED (T6); flag creation with sales NOT STARTED | §3.6 |
| F-23 | Settings | NOT STARTED | S-71 |
| F-24 | Subscription screen, manual MoMo | NOT STARTED (`subscription_payments` table exists) | S-72 |
| F-25 | Help and WhatsApp support | NOT STARTED | S-73 |
| F-26 | App lock (if practical) | NOT STARTED | SEC-07 |
| F-27 | Unpaid purchases, Pay supplier, corrections, returns | Backend IMPLEMENTED, NOT FULLY VERIFIED (incl. M2); screens NOT STARTED | S-38, S-39 |
| F-28 | Needs attention list | Backend IMPLEMENTED, NOT FULLY VERIFIED (inventory types); screen NOT STARTED; sale-related types 1D | S-36 |

Future items (01 §3: automated payments and reports, OTP, barcode, partial returns, decimals, suppliers, printing, photos, Twi, branches, dark mode) are **DEFERRED**. Staff accounts, web and iOS (including iPad) are **staged product requirements** (owner decisions, 25 Nov 2026; §3.4): **iOS and iPad in Stage 1C-3** ([plan](stages/STAGE-1C-3-PLAN.md)), **web as milestone PW-1** (§3.6a), **staff accounts** not yet planned in detail; out-of-scope items (online store, lending, VAT/GRA invoicing, in-app payments) are **not planned**.

## 4. Screen → backend → tests map

| Screen | Status | Backend | Tests |
|---|---|---|---|
| S-01 Welcome; S-02 Sign up; S-03 Log in / reset; S-04 Shop details | COMPLETED AND VERIFIED (📱) | Supabase Auth; `create_business`, `register_device` | TC-AUTH-01 – 18; TC-DEV-01 – 03 |
| S-05 Starter products | DEFERRED (Q3) | — | — |
| S-06 Quick tour | NOT STARTED | — | — |
| S-10 Today | IMPLEMENTED, NOT FULLY VERIFIED | `inventory_summary`; sales by row reads (to replace in 1D) | TC-DASH-01 – 11 |
| S-20 New Sale; S-21 Payment; S-22 Sale complete | NOT STARTED | `record_sale`; local outbox | TC-FIN, TC-SYNC, TC-TIME, TC-COST-11 – 18 |
| S-23 Sales history; S-24 Sale detail; S-25 Cancel unsent sale | NOT STARTED | `void_sale`, `cancel_unsent_sale`, `get_sale_status` | TC-CANCEL, TC-SEC-09 |
| S-30 Products | IMPLEMENTED (`f6a405e`), NOT FULLY VERIFIED: list, search, filter, sort and archived manually exercised (owner-reported); categories and offline PARTIAL; paging and the 130 %, keyboard, reduced-motion and Today-figure checks NOT TESTED | `products`, `categories` reads; category direct writes; `set_product_archived` | TC-INV-20 – 32, 40 – 43 (backend); UI tests to add |
| S-31 Product form; S-32 Quick price change | IMPLEMENTED (`f6a405e`), NOT FULLY VERIFIED: full add, edit, quick price, archive and restore manually exercised (owner-reported); minimum-only add and some field checks PARTIAL; duplicate name, Correct cost price, two-phone edits, Back sequence and typing-through-navigation checks NOT TESTED | `create_product`, `update_product`, `set_product_archived`, `set_cost` | TC-INV-20 – 32, 40 – 43, 50 – 57; TC-COST-05, 08 |
| S-33 Restock | NOT STARTED (1C-2) | `restock` | TC-INV-60 – 68; TC-COST-01, 02, 09; TC-PUR-01, 02 |
| S-34 Stock adjustment | NOT STARTED (1C-2) | `adjust_stock` | TC-INV-70 – 80; TC-COST-06; TC-LOSS-01, 02; TC-PUR-09 |
| S-35 Low stock | NOT STARTED (1C-2) | `low_stock_products` | TC-INV-122, 132 |
| S-36 Needs attention | NOT STARTED (1C-2: inventory items; 1D: sale items) | `attention_items` reads; `acknowledge_attention` | TC-ATTN-02, 03, 05, 06; TC-INV-120, 130 |
| S-37 Product detail | NOT STARTED. **Read-only Product Details planned in Stage 1C-3 (1C-3.1)**; movement history follows Stage 1C-3 (1C-2) | `products`, `stock_movements`, `product_cost_history` reads | TC-COST-04 (history rows); no read-specific tests yet (planned in 1C-3.1) |
| S-38 Unpaid purchases | NOT STARTED (1C-2) | `unpaid_purchases` (M2 fields), `pay_supplier`, `supplier_payments` reads | TC-INV-81 – 90; TC-PUR-03, 04, 10, 11; M2-01 – 70, M2-API-1 – 2 |
| S-39 Correct purchase / Return to supplier | NOT STARTED (1C-2) | `correct_purchase`, `return_to_supplier` | TC-INV-91 – 110; TC-PUR-05 – 08, 12 – 16 |
| S-40 Customers; S-41 Customer form; S-42 Customer detail; S-43 Record payment; S-44 Balance change | NOT STARTED | `record_payment`, `adjust_balance`, `write_off`, `undo_write_off`; customers direct writes | TC-CRED-01 – 12 |
| S-50 Expenses; S-51 Expense form | NOT STARTED | `save_expense`, `delete_expense` | TC-PUR-10 (part) |
| S-60 Reports | NOT STARTED | not yet specified (§8) | TC-COST-21, TC-FIN, TC-CLOSE-09 |
| S-61 Close the day; S-62 Cash count history | NOT STARTED | `close_day`, `record_cash_recount` | TC-CLOSE-01 – 08, TC-CASH-01 |
| S-63 Export data | NOT STARTED | `export_csv` | SEC-33 |
| S-70 More; S-71 Settings; S-72 Subscription; S-73 Help; S-74 Log out | NOT STARTED (S-74 partly: log out exists in the Stage 1B Home screen, without the pending-sales block) | subscription reads; admin payment recording (SEC-16) | TC-SEC-07; SY-43 |

## 5. Database migrations

| Migration | Local / CI | Cloud (development) | Production |
|---|---|---|---|
| `20261111000100` – `20261111000500` (Stage 1A) | ✅ | ☁️ applied and verified (12 Nov 2026) | no project yet |
| `20261123000100` – `20261125000100` (T1 – T10) | ✅ CI #48 – #51 | **not applied** (D11) | no project yet |
| `20261125000200` (M2) | ✅ CI #51 | **not applied** (D11) | no project yet |
| `20261125000300` (`update_product` expected values, Stage 1C-2 increment 2) | ✅ CI #55 – #57; fresh-database check on a disposable local stack | **not applied** (D11) | no project yet |
| Stage 1D+ migrations | not written | — | — |

**Frozen / must not change:** every committed migration, in particular `20261124000300_supplier_payments.sql` (T7). Later changes only through new additive migrations, as T9-C2 and M2 did.

## 6. Security, offline/sync and release requirements

| Area | Requirements and status (07, 06, RELEASE-READINESS) |
|---|---|
| Login | SEC-01 password rules (app ✅ CI, 📱; server side **decision 49 / R-4**); SEC-02 rate limits (Supabase defaults; **review before the pilot**: NOT STARTED); SEC-03 no account enumeration (✅ TC-AUTH-06); SEC-04 email confirmation (on; 📱 TC-DEV-01 step 4) |
| Sessions and devices | SEC-05 secure storage (✅, 📱); SEC-06 log out other devices (NOT STARTED, TC-SEC-07); SEC-07 app lock (NOT STARTED, F-26); SEC-08 device limit per plan (owner decision 25 Nov 2026: stays in effect; **NOT enforced yet**: `register_device` doesn't check it; outstanding requirement) |
| Data isolation and server rules | SEC-10, 14 (✅ CI for all current tables and 16 functions; ☁️ Stage 1 only); SEC-11, 12, 24, 25 (✅ CI for every current function); SEC-13 server recalculates sale totals (with `record_sale`, NOT STARTED) |
| Secrets and admin | SEC-15 (✅ CI repository and bundle scans; decision 43); SEC-16 separate admin role for subscription payments (NOT STARTED) |
| Integrity and audit | SEC-20 append-only (triggers created in Stage 1A for every append-only table, ☁️; Stage 1C writes to them re-checked ✅ CI); SEC-21 audit (✅ CI for current actions; rest with their functions, TC-SEC-08 partial); SEC-22 constraints (☁️ Stage 1); SEC-23 soft delete, outbox kept until confirmed (with 1D); SEC-26 re-authentication for cancellation (NOT STARTED, TC-SEC-09); SEC-27 closings immutable (☁️ TC-CLOSE-08) |
| Privacy | SEC-30 crash reports without personal data (NOT STARTED; TC-SEC-06); SEC-31 data minimisation (schema has no ID or address fields; not separately verified); SEC-32 privacy notice; SEC-33 CSV warning; SEC-34 deletion on request; SEC-35 shared texts; all NOT STARTED. SEC-36 local encryption: accepted as future [A] |
| Transport, backup, dependencies | SEC-40 HTTPS (Supabase endpoints; not separately tested); SEC-41 backups with restore (**R-3 open**, §3.5); SEC-42 dependency alerts (✅ CI gate; Dependabot configured); **R-5: PRs #1, #2 open; #3, #4 auto-closed before the instruction: owner decision** |
| Offline / sync | 06 SY-01 – 75; F-21: NOT STARTED (needs `expo-sqlite`, a dependency decision, D-17) |
| Cloud verification | Decision 42; R-1: Stage 1 ☁️; re-verification outstanding for the 13 Stage 1C migrations (D11) |
| Device journey | R-2: closed by owner-approved exception; KI-1 re-check on every installed build |
| Tracker accuracy | R-6: in place (test plan §0, §0d; §0d includes the M2 tests and CI #51) |

## 7. Measurable acceptance criteria

| Phase | Done when |
|---|---|
| **1C-1 closure** | Owner accepts the §5a assessment ([STAGE-1C-PLAN.md](stages/STAGE-1C-PLAN.md)); outstanding items recorded (D11, M3, findings) |
| **1C-2** | S-30 – S-39 and the dashboard Needs attention entry implemented with app unit tests; previews match server results; lists paginated (> 1,000 rows tested); online-only actions disabled offline (TC-COST-19); full regression and CI green; screens work end to end against the local stack (criterion 4); 📱 recorded by the owner; KI-1 re-check passed on the installed build; unchanged backend |
| **Ops-1** | TC-BAK-01 – 05 ✅; drill recorded in RESTORE-LOG with counts, totals, integrity, RLS tests and login |
| **Each backend batch in the cloud** | Owner-approved migration; TC-CLOUD-01 (parity), 02 (all database tests), 03 (API isolation) ☁️ on that batch |
| **1D+ (each module)** | Its planned tests ✅ CI with local evidence; dashboard sales figures server-side with > 1,000 sales; integrity and conservation after every suite |
| **G1** | Every TC-FIN, COST, TIME, CLOSE, PUR, ATTN, LOSS, CRED, CASH test ✅ |
| **G2 / Stage 1 exit** | G1 + every TC-SYNC, CANCEL, CONC, SEC, BAK, CLOUD test ✅ (test plan §10); R-1 (every migration ☁️), R-2, R-3 closed (RELEASE-READINESS); the production project created, migrated and cloud-verified before any real data (CLOUD-SETUP-LOG; decision 42) |
| **Pilot (Stage 2) entry** | G2 passed; informed consent from each pilot shop and a published privacy notice (PLAN §8.2; SEC-32); pilot shops told it is a test version; Supabase email rate limits reviewed (SEC-02) |
| **Pilot (Stage 2) checkpoint** | ≥ half of pilot shops use it daily after 3 weeks; ≥ 3 say they would pay (PLAN §11); usability targets TC-UX-01 – 04 measured (test plan §9) |
| **G3** | G2 + TC-SYNC-20 on pilot devices + no open critical bugs |
| **Final release (Stage 4 paid launch)** | Stage 2 checkpoint passed; prices and limits finalised from pilot evidence; manual MoMo subscription flow live with admin recording (SEC-16); production email provider in place; Google Play listing, Supabase Pro and domain bought; Data Protection Commission registration investigated (PLAN §8.2); backups running, with monthly restore drills during the pilot (PLAN §10.4); [suggestion] every G2 test re-run ✅ on the release build |

## 8. Requirement issues found (missing, contradictory, duplicated, obsolete)

| # | Issue | Sources | Suggested handling |
|---|---|---|---|
| Q-1 | **Reports have no server functions** in 09 §3, though S-60 needs period figures beyond the 1,000-row limit | 09 §3; 03 S-60; PLAN §11 scale requirement | Specify in the Reports plan (owner decision) |
| Q-2 | **No 1D plan or sub-stage split** for "1D onwards" | PLAN §11 | Owner to approve a 1D plan (D-12) |
| Q-3 | 09 §3 says `correct_purchase` writes loss / own-use movements; Model A keeps them in `allocation` | 09 §3; T9-C1 | M3 batch |
| Q-4 | 05 §3.2 conservation line and C-41 (C-25c) need wording changes | T8 §3.4 | M3 batch |
| Q-5 | TC-PUR-13 wording ("≤ 1 pesewa") superseded by the approved clarification | test plan; T9 §11 | M3 batch |
| Q-6 | 09 §2 attention types omit `purchase_correction` | T10 §14 | M3 batch |
| Q-7 | C-112's formula omits return credits and correction refunds, now in the helper (P4, C2) | 05 C-112; T7/T9 | M3 batch [suggestion: add it] |
| Q-8 | Stage 0 report is "Draft for review", while PLAN marks desk research ✅ | STAGE-0-REPORT; PLAN §11 | Owner to confirm approval |
| Q-9 | PLAN §11 row 1B said "R-2 – R-6 not yet closed", but R-2 is closed by exception (decision 52) and R-6 is in place | PLAN §11; RELEASE-READINESS | **Fixed in this review** (dated update added) |
| Q-10 | PLAN §10.1 said "no Supabase project exists yet" (outdated since 12 Nov) | PLAN §10.1 | **Fixed in this review** (dated update; backup still not executed) |
| Q-11 | PLAN decision 29 said "currently all Documented" (outdated; refined by 46) | PLAN §14 | **Fixed in this review** (dated note; decision text kept) |
| Q-12 | S-06 Quick tour and F-02 sample lists: S-06 isn't assigned to any stage; F-02 deferred (Q3) | 03 S-06; 01 F-02 | Owner to assign S-06 |
| Q-13 | S-30 and S-35 are marked offline views, but the offline cache is in the sync stage | 03; STAGE-1C-PLAN §3 | **Resolved:** online-only in 1C-2 (D-3) |
| Q-14 | S-30 four stock colours vs two defined in 08 | 03 S-30; 08 | **Resolved:** four states defined (D-6) |
| Q-15 | Tab name "Products" (03) vs "Stock" (D10) | 03; D10 | **Resolved:** "Products" (D-7) |
| Q-16 | SEC-01 says "1,000 most common passwords"; the app uses 2,087 (stricter) | 07 SEC-01; IMPLEMENTATION-STATUS | Accept as stricter, record |
| Q-17 | PLAN §2 lists Sentry, `expo-sqlite`, EAS Update; none is installed | PLAN §2; `app/package.json` | Dependency decisions when the features start |
| Q-18 | Near-duplicate risks in PLAN §13A ("Wrong or manipulated phone clocks" and "Wrong phone clock"); their mitigations differ and don't conflict | PLAN §13A | No change needed; merge when §13 is next revised |
| Q-19 | Stage 3 "likely additions: manager/cashier accounts" (PLAN §11) vs staff accounts "Stage 3+" (01 §3): consistent, but not committed scope | PLAN §11; 01 §3 | Decide after the pilot |

## 9. Owner decisions (D-0 – D-10 approved 24 Nov 2026; the rest open)

| # | Decision | Needed before | Owner / action |
|---|---|---|---|
| D-0 | **Formal closure of Stage 1C-1** | 1C-2 | **Approved 24 Nov 2026:** closed for the local/CI scope; D11 outstanding |
| D-1 | **Go-ahead for Stage 1C-2** | 1C-2 | **Approved 24 Nov 2026** |
| D-2 | Navigation and network-status libraries (dependency approval) | 1C-2 increment 1 | **Approved in principle:** hand-built navigation + `expo-network`; installation and any development build need separate approval |
| D-3 | Offline views S-30 / S-35 in 1C-2: online-only? | 1C-2 | **Approved:** online-only |
| D-4 | S-39 split preview: after saving, or a new read-only preview function | 1C-2 increment 7 | **Approved:** Option A |
| D-5 | S-32 cost change: reason prompt or route to "Correct cost price" | 1C-2 increment 2 | **Approved:** `update_product` for price; `set_cost` separate |
| D-6 | Stock colours: meaning of red vs negative | 1C-2 increment 2 | **Approved:** green OK, amber Low, red Out of stock, red "Negative" |
| D-7 | Tab name: Products or Stock | 1C-2 increment 1 | **Approved:** Products |
| D-8 | Sell and Customers tabs: hidden or "coming later" | 1C-2 increment 1 | **Approved:** five tabs; Sell and Customers "coming later" |
| D-9 | Device-test backend: cloud (needs D11 first) or local stack; installed build (EAS needs approval) | 1C-2 increment 9 | **Approved:** local development stack; D11 separate |
| D-10 | Evidence for "end to end against the local stack" (manual vs UI test tool) | 1C-2 | **Approved:** automated tests + manual checklists; no UI automation |
| D-11 | **Cloud migration of the 13 Stage 1C migrations** (including `20261125000300`) and cloud re-verification (D11, R-1) | Device tests against the cloud; G2 | Owner approves the cloud batch; then cloud verification run |
| IG-1 | **Which gate is the iOS release gate:** G2, or the pilot gate if iPhones take part in the pilot. Not yet decided: there's no evidence yet on whether iPhones will participate in the pilot | iOS release for real-shop use (Stage 1C-3 plan §6.5 item 4) | Owner decides, once pilot device plans are known |
| D-12 | **1D plan** and the split of "1D onwards" into sub-stages | 1D | Claude drafts a 1D plan on request; owner approves |
| D-13 | **M3** specification clarification batch (Q-3 – Q-7) | Reports | Claude drafts the clarification batch; owner approves |
| D-14 | **Ops-1 start** (backup implementation, R-3) | G2 | Owner approves Ops-1 start |
| D-15 | Server-side password check (decision 49, R-4) | G2 / release | Owner chooses an option in PASSWORD-POLICY-SERVER-SIDE.md |
| D-16 | Dependabot PRs: #1, #2 open; #3, #4 handling (R-5) | Release | Owner decides how to handle the PRs |
| D-17 | Offline storage dependency (`expo-sqlite`) and crash reporting (Sentry) adoption | 1D; pilot | Owner approves when the feature starts |
| D-18 | Production Supabase project creation | G2 | Owner creates the project (Claude cannot reach supabase.com) |
| D-19 | Weekly all-shops integrity run and admin alert (T10-I2) | Pilot [suggested timing] | Owner decides timing |
| D-20 | S-06 Quick tour stage | Pilot | Owner assigns a stage |
| D-21 | Stage 0 report approval; survey and competitor tests (owner tasks) | Pilot | Owner approves the report; owner runs the survey and tests |

## 10. Change control for this page

- Update this page whenever a phase, gate or decision changes status, citing the evidence.
- Never mark an item complete from a plan; never mark a test passed without evidence; never count a local or CI migration as a cloud migration.
- Additions to scope need an owner decision recorded in [PLAN.md](PLAN.md) §14 first.
