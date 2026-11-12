# Stage 1C implementation plan: inventory foundations

**Status: PLAN ONLY, awaiting owner review. No implementation has started.**
**Baseline:** product specification revision 5.1 (approved). This stage implements existing rules only. It adds **no new features** and **no accounting changes**. Where the specification leaves a detail open, it's listed in §6 as a question for the owner, not decided by Claude.

## 1. Entry criteria (all needed before coding starts)

| # | Criterion | Status |
|---|---|---|
| E-1 | Stage 1B approved | ✅ 11 Nov 2026 |
| E-2 | This plan approved by the owner, with answers to §6 | ⏳ |
| E-3 | **Device journey TC-DEV-01 done, and any issues fixed and re-checked on the phone** (owner condition: fix before moving beyond the authentication foundation) | ⛔ Waiting for the owner's phone journey (R-2). R-1 cloud verification ✅ completed 12 Nov 2026 |

> If the owner prefers, Stage 1C could start before E-3 with the device fixes slotted in first. That's the owner's choice; by default Claude waits for E-3.

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
| **Low stock** | Low-stock list, shareable as text | F-07; S-35 (see Q2) |
| **Screens** | Products list (stock and value colours), product form, product detail with movement history, restock form, unpaid purchases and pay supplier, correct purchase / return to supplier, stock adjustment, Needs attention list (inventory items only) | 03 S-30 – S-39, S-36 |
| **Server functions** | `create_product`, `update_product`, `set_cost`, `restock`, `pay_supplier`, `correct_purchase`, `return_to_supplier`, `adjust_stock`, `acknowledge_attention`, `check_stock_integrity`. All transactional, idempotent, with the approved lock order | 09 §3, §4 |

## 3. Out of scope for 1C (later stages, unchanged)
- Sales, the offline outbox and sync, sale-time costing for uploaded sales, discrepancies caused by sales
- Customers and credit, expenses, cash count and closing, reports, CSV export
- Offline product cache (part of the sync stage)
- Backup implementation (its own stage after R-1)
- Starter product lists (see Q3)

**Note on testing allocation without sales:** proportional purchase-cost allocation must account for goods already sold. Sales don't exist until a later stage, so the 1C **database** tests create fictitious sale movements directly as fixtures to exercise the algorithm. The same tests are re-run end-to-end once real sales exist.

## 4. Tests in scope

| Planned tests | Coverage in 1C |
|---|---|
| TC-COST-01 – 10, 13, 17, 19, 20, 21 | Full |
| TC-COST-11, 12, 14 – 16, 18 (need uploaded sales or sale times) | Later stage |
| TC-PUR-01 – 09, 11 – 16 | Full (PUR-12/13 with fixture sales) |
| TC-PUR-10 (expense form steering) | Later: the expense form is a later stage |
| TC-LOSS-01, 02 | Full; TC-LOSS-03 (needs sales discrepancies) later |
| TC-ATTN-02, 03, 05, 06 (inventory items) | Full; TC-ATTN-01, 04 and 07 partly (negative stock from sales comes later) |
| TC-SEC-02, 04, 08; TC-CONC-03 (restock part), 05 | Extended to every new function |
| New TC-INV-xx | Categories and products: create, edit, archive, unique names, RLS for every new function, and UI unit tests |

Each test is recorded with its true evidence level (📝 / 🛠 / 🟢 / ✅ / ☁️ / 📱).

## 5. Exit criteria
1. Every in-scope test is ✅ **CI passed**, with a local evidence log and a CI link.
2. `check_stock_integrity()` and the conservation statement (TC-COST-20) pass after every test.
3. If the cloud project exists by then: the new migrations are applied, and **cloud verification is re-run** (☁️). Otherwise this is listed as outstanding under R-1.
4. Screens work end-to-end against the local stack. Screens are 📱 device-verified only when the owner tests them on the phone.
5. Test tracker, implementation status and release-readiness pages updated; report presented for review before the next stage.

## 6. Questions for the owner (clarifications only; no rule changes proposed)

| # | Question | Claude's suggestion |
|---|---|---|
| Q1 | **Stock-reducing adjustments beyond current stock** (e.g. "damaged: 5" when the app shows 3). The specification doesn't say. Allow (stock goes negative and raises the negative-stock item), or refuse with "Only 3 in stock: correct the count first"? | **Refuse**, except "count correction", which sets an absolute count ≥ 0. Negative stock should come only from real sales |
| Q2 | Include the **low-stock list** (F-07, S-35) in 1C? It's in the approved MVP | Include: small, purely inventory |
| Q3 | **Starter product lists** at shop setup (S-05; the specification marks the item lists as assumptions to refine with pilot shops) | **Defer** until real item names and prices can be gathered; skipping is already allowed |
| Q4 | **Purchase date:** a restock can record a different `purchased_on` date (e.g. entering yesterday's market trip today), but costing uses the time it's recorded (cost events are online and server-timed, decision 32). Confirm | Confirm as stated |
| Q5 | **Units:** one selling unit per product plus a pack multiplier at restock (spec 5.5). Confirm that's sufficient for 1C | Confirm |

## 7. Rough size
About 2–3 weeks of part-time work equivalent:
- 3–4 migrations (functions, attention-item generation)
- about 10 screens
- about 60–80 automated tests

Work will be presented in two checkpoints: **1C-1** database functions and tests; **1C-2** screens. Each will be reported with its evidence.
