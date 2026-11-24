# Stage 1C implementation plan: inventory foundations

**Status: ✅ APPROVED by the owner (23 Nov 2026)**, with the answers to §6, the implementation decisions in §6a and the limited E-3 exception below. **Checkpoint 1C-1 (database) may proceed. E-3 was closed on 23 Nov 2026 by owner-approved exception, so checkpoint 1C-2 (screens) is no longer blocked by E-3; it starts only when the owner authorises it.**
**Progress (24 Nov 2026):** checkpoint 1C-1 (T1–T10, test gaps, M2) is **closed** by the owner for its local/CI scope (§5a), with cloud verification outstanding (D11). **Checkpoint 1C-2 is authorised** and in progress, one increment at a time ([STAGE-1C-2-EXECUTION-BRIEF.md](STAGE-1C-2-EXECUTION-BRIEF.md); decisions in [STAGE-1C-DECISIONS.md](STAGE-1C-DECISIONS.md) §3a). Current HEAD `44d9d55`.
**Baseline:** product specification revision 5.1 (approved). This stage implements existing rules only. It adds **no new features** and **no accounting changes**. Where the specification leaves a detail open, it's listed in §6 as a question for the owner, not decided by Claude.

## 1. Entry criteria (all needed before coding starts)

| # | Criterion | Status |
|---|---|---|
| E-1 | Stage 1B approved | ✅ 11 Nov 2026 |
| E-2 | This plan approved by the owner, with answers to §6 | ✅ 23 Nov 2026 (answers in §6, decisions in §6a) |
| E-3 | **Device journey TC-DEV-01 done, and any issues fixed and re-checked on the phone** (owner condition: fix before moving beyond the authentication foundation) | ✅ **CLOSED — owner-approved exception (23 Nov 2026).** All TC-DEV-01 steps, TC-DEV-02 and the owner-required TC-DEV-03 checks are 📱 device verified (Samsung Galaxy A06; installed Android builds, 15 and 23 Nov 2026; owner-reported). Issue #1 was fixed and re-checked. Issue #2 (intermittent session restoration in **Expo Go only**) is **not fixed**: the two Expo Go failures remain unexplained; development-build restarts (15 Nov) and repeated installed-build cold starts (reported 23 Nov) passed. The owner explicitly approved accepting it as an Expo Go-only development-environment limitation (decision 52); it stays in [KNOWN-ISSUES.md](../KNOWN-ISSUES.md) as KI-1. *History:* waived for 1C-1 database work only on 23 Nov 2026 (decision 51) before closure. R-1 cloud verification ✅ completed 12 Nov 2026 |

> If the owner prefers, Stage 1C could start before E-3 with the device fixes slotted in first. That's the owner's choice; by default Claude waits for E-3.
>
> **Owner decision (23 Nov 2026):** E-3 is waived **only** for checkpoint 1C-1 (database functions, migrations and their automated tests on the local stack and CI). This does not mark TC-DEV-01 complete or any device issue resolved. Checkpoint 1C-2 (Android screens) starts only after E-3 is fully closed.
>
> **E-3 closed (owner decision, 23 Nov 2026):** closed by owner-approved exception, accepting issue #2 as an Expo Go-only limitation (not fixed). The E-3 precondition for checkpoint 1C-2 is therefore met; 1C-2 itself still needs the owner's go-ahead.

## 2. Scope (from the approved specification)

| Area | What gets built | Spec references |
|---|---|---|
| **Categories** | Add, rename, archive (direct writes already allowed and RLS-protected) | 03 S-30, 09 |
| **Products** | Create (name, category, unit, selling price, optional cost, opening stock, low-stock level); edit name, category, unit, price; archive; quick price change (audit-logged); owner cost correction | F-03, F-04; 04 §2.1; 05 C-21, C-27, C-27a |
| **Value pool** | Every stock change is a movement with an exact value; stock value in pesewas; average = value ÷ quantity; one cost-history row per movement | 05 §3.2 (C-20 – C-22); 09 |
| **Purchases (restock)** | Quantity (with pack multiplier); **purchase cost** (full acquisition cost); amount paid now; paid from; supplier name; negative-stock re-valuation (C-25) | F-05; 04 §2.2; 05 §12 (C-110 – C-112) |
| **Supplier credit** | Unpaid purchases list; **Pay supplier** (partial payments, any number); never stock value, never an expense | F-27; 05 §12.1 (C-113) |
| **Purchase corrections** | Cost correction with **proportional allocation** (remaining / already sold / losses / own use / supplier returns); approximate allocations **flagged with reasons and audited**; refund entry if the amount owed would go below zero; quantity correction | 05 §12.2 (C-116 – C-116f) |
| **Return to supplier** | Value removed at average; credit as refund or reduction of the amount owed; difference as a visible cost adjustment | 05 C-117, C-25c |
| **Stock adjustments** | Damaged, expired, missing/theft, count correction (losses at average); **own use** (separate, below net profit); stock found (information only) | F-06; 04 §2.3; 05 C-30, C-31, C-37 |
| **Visible adjustments** | Cost adjustments (C-25, C-25a, C-25b, C-25c) and their Needs attention items (cost adjustment, cost check, cost missing, purchase correction) | 05 §3.4 (C-120 – C-126 as relevant) |
| **Low stock** | Low-stock list, shareable as text | F-07; S-35 (included: Q2) |
| **Screens** | Products list (stock and value colours), product form, product detail with movement history, restock form, unpaid purchases and pay supplier, correct purchase / return to supplier, stock adjustment, Needs attention list (inventory items only) | 03 S-30 – S-39, S-36 |
| **Server functions** | `create_product`, `update_product`, `set_cost`, `restock`, `pay_supplier`, `correct_purchase`, `return_to_supplier`, `adjust_stock`, `acknowledge_attention`, `check_stock_integrity`. All transactional, idempotent, with the approved lock order | 09 §3, §4 |

## 3. Out of scope for 1C (later stages, unchanged)
- Sales, the offline outbox and sync, sale-time costing for uploaded sales, discrepancies caused by sales
- Customers and credit, expenses, cash count and closing, reports, CSV export
- Offline product cache (part of the sync stage)
- Backup implementation (its own stage after R-1)
- Starter product lists (deferred: Q3, until real product names and prices are gathered from pilot shops)

**Note on testing allocation without sales:** proportional purchase-cost allocation must account for goods already sold. Sales don't exist until a later stage, so the 1C **database** tests create fictitious sale movements directly as fixtures to exercise the algorithm. The same tests are re-run end-to-end once real sales exist.

## 4. Tests in scope

| Planned tests | Coverage in 1C |
|---|---|
| TC-COST-01 – 10, 13, 17, 19, 20, 21 | Full (TC-COST-07, void returns the line cost, with fixture sales only; end-to-end with real voids in 1D: D9) |
| TC-COST-11, 12, 14 – 16, 18 (need uploaded sales or sale times) | Later stage |
| TC-PUR-01 – 09, 11 – 16 | Full (PUR-12/13 with fixture sales) |
| TC-PUR-10 (expense form steering) | Later: the expense form is a later stage |
| TC-LOSS-01, 02 | Full; TC-LOSS-03 (needs sales discrepancies) later |
| TC-ATTN-02, 03, 05, 06 (inventory items) | Full; TC-ATTN-01, 04 and 07 partly (negative stock from sales comes later) |
| TC-SEC-02, 04, 08; TC-CONC-03 (restock part), 05 | Extended to every new function |
| New TC-INV-xx | Categories and products: create, edit, archive, unique names, RLS for every new function, and UI unit tests |

Each test is recorded with its true evidence level (📝 / 🛠 / 🟢 / ✅ / ☁️ / 📱).

**Requirement: dashboard counts at scale (owner-approved, 23 Nov 2026).** The Today dashboard (`app/src/services/dashboard.ts`) currently reads product rows and counts them on the phone. The Supabase API returns at most 1,000 rows per request (`max_rows = 1000` in `supabase/config.toml`), so beyond 1,000 active products the **product count** and **low-stock count** would silently undercount. Before this stage is complete:
- these dashboard counts must use **server-side aggregation** (an exact count or aggregate query, or a read-only database function), not rows totalled on the phone;
- tests must cover **more than 1,000 products**, and check the exact count and low-stock count;
- **raising Supabase's `max_rows` limit is not an acceptable workaround.**

## 5. Exit criteria
1. Every in-scope test is ✅ **CI passed**, with a local evidence log and a CI link.
2. `check_stock_integrity()` and the conservation statement (TC-COST-20) pass after every test.
3. If the cloud project exists by then: the new migrations are applied, and **cloud verification is re-run** (☁️). Otherwise this is listed as outstanding under R-1.
4. Screens work end-to-end against the local stack. Screens are 📱 device-verified only when the owner tests them on the phone.
5. Test tracker, implementation status and release-readiness pages updated; report presented for review before the next stage.
6. The dashboard product and low-stock counts use server-side aggregation and pass tests with more than 1,000 products (see the requirement in §4).
7. No migration is applied to the cloud project without the owner's separate approval (D11). Until then, exit criterion 3 is recorded as outstanding.

## 5a. Checkpoint 1C-1 assessment (24 Nov 2026): **CLOSED by the owner** for its local/CI scope, cloud verification outstanding

Owner-approved approach (24 Nov 2026): the §5 criteria apply to the **1C-1 scope** (database functions, migrations and their automated tests). Screens, Reports and usability requirements belong to 1C-2 and later stages and are not marked complete here.

| # | Criterion | 1C-1 status | Evidence |
|---|---|---|---|
| 1 | In-scope tests ✅ CI passed, with a local log and CI link | **PASS for the 1C-1 scope** | Local log [2026-11-24-stage1c1-local.log](../test-evidence/2026-11-24-stage1c1-local.log) and [CI #49](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/45431840081), both at `230c029`. Every in-scope test is ✅, or 🛠 with only its later-stage part outstanding, or 📝 because it needs screens, Reports, sales or a pilot ([test plan §0d](../product-specification/10-test-plan.md)) |
| 2 | `check_stock_integrity()` and the conservation statement after every test | **PASS, with limits** | Integrity checks at the end of database files 03, 05, 07–12 and seven API files (T10 §7.2), and in files 13 and 14; pool conservation in every Stage 1C suite. Run at the end of each file, not after each individual test (as approved for T10 I3). The period-level statement (TC-COST-20) needs Reports |
| 3 | Cloud migration and re-verification, or listed as outstanding under R-1 | **Outstanding (D11)** | Not applied; listed in [RELEASE-READINESS.md](../RELEASE-READINESS.md) R-1 |
| 4 | Screens end to end | **Not applicable to 1C-1** | 1C-2 |
| 5 | Tracker, status and release-readiness pages updated; report presented | **PASS** | Committed in `44d9d55` after the owner's review; closure recorded 24 Nov 2026 |
| 6 | Dashboard counts server-side, tested above 1,000 products | **PASS** | `inventory_summary` (D7): `04_inventory_summary`, `inventory-summary.api` |
| 7 | No cloud migration without owner approval | **PASS** | None applied |

**Closure (owner, 24 Nov 2026):** checkpoint 1C-1 is closed for its local/CI scope. Fresh local verification at `44d9d55` (including M2): [2026-11-24-stage1c1-closure-local.log](../test-evidence/2026-11-24-stage1c1-closure-local.log) (database 1017/1017, API 133/133, app 25/25). Criterion 3 stays **outstanding** (D11). Stage 1C-2 decisions: [STAGE-1C-DECISIONS.md](STAGE-1C-DECISIONS.md) §3a.

**Open:** M3 (before Reports), cloud re-verification (D11), findings L1–L3 and I6 ([STAGE-1C-DECISIONS.md](STAGE-1C-DECISIONS.md) §4–5).

## 6. Questions for the owner (clarifications only; no rule changes proposed)

| # | Question | Claude's suggestion | **Owner decision (23 Nov 2026)** |
|---|---|---|---|
| Q1 | **Stock-reducing adjustments beyond current stock** (e.g. "damaged: 5" when the app shows 3). The specification doesn't say. Allow (stock goes negative and raises the negative-stock item), or refuse with "Only 3 in stock: correct the count first"? | **Refuse**, except "count correction", which sets an absolute count ≥ 0. Negative stock should come only from real sales | **Refuse** stock-reducing adjustments that exceed available stock, except count corrections, which set an absolute count of zero or higher |
| Q2 | Include the **low-stock list** (F-07, S-35) in 1C? It's in the approved MVP | Include: small, purely inventory | **Include** in Stage 1C |
| Q3 | **Starter product lists** at shop setup (S-05; the specification marks the item lists as assumptions to refine with pilot shops) | **Defer** until real item names and prices can be gathered; skipping is already allowed | **Defer** until actual product names and prices are gathered from pilot shops |
| Q4 | **Purchase date:** a restock can record a different `purchased_on` date (e.g. entering yesterday's market trip today), but costing uses the time it's recorded (cost events are online and server-timed, decision 32). Confirm | Confirm as stated | **Confirmed.** A different purchase date is allowed; costing uses the server time at which the transaction is recorded |
| Q5 | **Units:** one selling unit per product plus a pack multiplier at restock (spec 5.5). Confirm that's sufficient for 1C | Confirm | **Confirmed.** One selling unit per product, with a pack multiplier during restocking |

## 6a. Implementation decisions (owner-approved, 23 Nov 2026)

These settle implementation details within the approved specification. None changes a business or accounting rule.

| # | Decision |
|---|---|
| D3 | A restock leaves `purchases.movement_id` empty and links the stock movement to its purchase (`stock_movements.purchase_id`). Reason: the two links reference each other, neither foreign key can be deferred, and purchases are append-only, so `purchases.movement_id` can never be filled in. No schema change |
| D4 | Products are archived with `active = false`. `deleted_at` is not used for products in 1C. An archived product keeps its name reserved |
| D5 | A category cannot be archived while any active product still uses it; the refusal gives a clear message |
| D6 | Input limits, enforced in the server functions: quantity at most 100,000 per movement; purchase cost and other entered amounts at most GH₵ 1,000,000 (the existing selling-price cap); `low_stock_level` at most 100,000. In addition, every change to `stock_qty` and `stock_value` is range-checked before it is written, so no calculation can overflow its column |
| D7 | The dashboard's product count and low-stock count come from a read-only database function, `inventory_summary`, with exact database-side counts. Tested with more than 1,000 products, including through the API (where the 1,000-row limit applies). `max_rows` is not changed. Test TC-DASH-05 is narrowed to allow only this read-only call |
| D8 | Duplicate open attention items (same shop, type and item) are prevented by a unique database index on open items, which is safe under concurrent requests |
| D9 | Void-related costing (TC-COST-07) is tested with fixture sales in 1C; end-to-end testing with real voids follows in 1D |
| D10 | Needs attention is shown on the dashboard and inside Stock; no fifth tab |
| D11 | Migrations run on the local Supabase stack and in CI only. Applying them to the cloud project needs the owner's separate approval |
| D12 | The dashboard's sales figures stay unchanged until Stage 1D |

## 7. Rough size
About 2–3 weeks of part-time work equivalent:
- 3–4 migrations (functions, attention-item generation)
- about 10 screens
- about 60–80 automated tests

Work will be presented in two checkpoints: **1C-1** database functions and tests; **1C-2** screens. Each will be reported with its evidence.
