# Stage 1C decisions register (checkpoint 1C-1)

**Purpose:** one place for every owner decision made during Stage 1C checkpoint 1C-1 (database functions and tests). Each decision is quoted in summary from its source; the source stays authoritative. Recorded 24 Nov 2026 (review finding M1). No decision here changes a business or accounting rule of specification revision 5.1.

**Naming:** decision codes repeat between tasks (for example T5 R1 and T8 R1; T10 L1 and review finding L1). Always quote them with their task: "T5-R1", "T8-R1", "T10-L1", "finding L1".

## 1. Stage-level decisions (23 Nov 2026)

Source: [STAGE-1C-PLAN.md](STAGE-1C-PLAN.md) §6, §6a; [PLAN.md](../PLAN.md) decisions 50–52.

| # | Decision (summary) |
|---|---|
| Q1 | Stock-reducing adjustments beyond available stock are refused, except count corrections to an absolute count ≥ 0 |
| Q2 | The low-stock list is in Stage 1C |
| Q3 | Starter product lists deferred until real product names and prices are gathered from pilot shops |
| Q4 | A purchase date may differ from today; costing uses the server time of recording |
| Q5 | One selling unit per product, with a pack multiplier at restock |
| D3 – D12 | Implementation decisions: purchase/movement link (D3), archive with `active = false` (D4), category archive guard (D5), input limits (D6), server-side dashboard counts via `inventory_summary` (D7), unique open attention items (D8), void costing with fixture sales in 1C and end-to-end in 1D (D9), Needs attention in dashboard and Stock (D10), **migrations local and CI only; cloud needs separate owner approval (D11)**, dashboard sales figures unchanged until 1D (D12) |

## 2. Task decisions

| Task (commit) | Decisions (summary) | Source |
|---|---|---|
| **T4** set_cost (`a62baa9`), 23 Nov 2026 | **A** stock 0 refused (`zero_stock`); **B** stock below 0 refused (`negative_stock`); **C** same cost is "no change" (no movement, history row or audit entry); **D** reason required, trimmed, 1–300 characters; **E** archived products allowed when stock is positive; plus: a first cost of 0 for an unknown-cost product is refused (`zero_cost_for_unknown_cost`) | `supabase/migrations/20261123000500_set_cost.sql` header |
| **T5** restock (`4212e94`), 24 Nov 2026 | **R1** server takes the total purchase cost; **R2** server takes total units; **R3** purchase date defaults to today (Ghana, UTC); future dates and dates before the shop existed refused; costing uses recording time (Q4); **R4** archived products refused; **R5** zero-cost purchases accepted; **R6** positive stock with unknown cost refused (`set_cost_first`); **R7** negative stock with unknown cost revalued by C-25 at the purchase's unit cost | `20261124000100_restock.sql` header |
| **T6** adjust_stock (`bd59bee`), 24 Nov 2026 | **S1** stock found while stock ≤ 0 is valued at the last known average (none: 0, cost stays unknown); **S2** archived products can be adjusted; missing and deleted products not found; **S3** "other" needs a trimmed non-empty note, both directions; **S4** a count equal to current stock is "no change" (no movement or audit entry; result stored for retries); **S5** only stock discrepancies are resolved here; negative-stock and other items are resolved in Stage 1D | `20261124000200_adjust_stock.sql` header |
| **T7** pay_supplier and unpaid_purchases (`1d695f8`), 24 Nov 2026 | **P1** payment date defaults to today; future dates and dates before the purchase refused; **P2** no closed-day adjustment yet (day closing doesn't exist); **P3** no payment reversal or correction; **P4** ONE shared unpaid-balance helper `private.purchase_unpaid`; **P5** read-only, server-paginated `unpaid_purchases` with totals over all qualifying purchases; **P6** purchases of archived products can be paid; **P7** no reference column (note used) | `20261124000300_supplier_payments.sql` header (frozen file; see finding L2) |
| **T8** return_to_supplier (`5d807cd`), 24 Nov 2026 | **R1** Model 1: one `supplier_return` movement at the average; the credit difference D is recorded separately and causes no second stock-value adjustment; **R2** return above stock refused; **R3** `reduce_unpaid` credit above the balance refused; **R4** a supplied purchase must be the same shop and product; optional for refunds; **R5** no per-purchase quantity limit; **R6** archived products can be returned; **R7** zero-credit returns allowed; **R8** attention item when abs(D) ≥ 10 pesewas; **Q1** unknown-cost products refused (`set_cost_first`); **O1** known cost with stock value 0 allowed (V = 0) | [STAGE-1C-T8-RETURN-TO-SUPPLIER-PLAN.md](STAGE-1C-T8-RETURN-TO-SUPPLIER-PLAN.md) §2 |
| **T9** correct_purchase (`2b3bb4a`), 24 Nov 2026 | **C1** Model A: one `purchase_correction` movement carries the remaining-stock share R; consumed shares S, L, U, T live only in `purchase_corrections.allocation`; **C2** `purchase_unpaid` extended in a new T9 migration to add back correction refunds (T8 return refunds not counted; T7 file not modified); **Q3 – Q10** allocation walk, quantity and refund rules, archived allowed, one attention item per correction, movement ID in allocation and audit, exact rationals; **U1** exactly six T7 expectations changed (TC-INV-88c, d, e, g, h, i); **U2** quantity correction to exactly 0 allowed, below 0 refused; **U3** quantity decrease to another purchase allocated to L for the arithmetic only, flagged approximate; **U4** the GH₵1,000,000 limit applies to abs(ΔC) and the corrected cost; **U5** no history-size limit; performance measured in TC-PUR-13 | [STAGE-1C-T9-CORRECT-PURCHASE-PLAN.md](STAGE-1C-T9-CORRECT-PURCHASE-PLAN.md) §2 |
| **T9** TC-PUR-13 clarification, 24 Nov 2026 | Exact rational equivalence is the primary check; integer parts sum exactly to ΔC; rounding bounds, inclusive: consumed parts ≤ 0.5 pesewa, remaining stock ≤ 2 pesewas. Replaces the "≤ 1 pesewa per part" wording, which still stands in [10-test-plan.md](../product-specification/10-test-plan.md) TC-PUR-13 until the M3 batch is approved | T9 plan §11 |
| **T10** acknowledge_attention, check_stock_integrity, low_stock_products (`ba565e7`), 24 Nov 2026 | **A1** acknowledgeable types: cost_adjustment, cost_check, purchase_correction, time_uncertain, closed_day_changed; negative_stock, stock_discrepancy and cost_missing refused (`not_acknowledgeable`); **A2** an already acknowledged or resolved item returns a no-change result with the original details and no audit entry; **A3** one audit entry per actual change; **I1** nine documented integrity checks; **I2** weekly all-shops run and admin alert deferred; **I3** additive integrity assertions in existing suites only as listed in T10 §7.2; **L1** separate paginated `low_stock_products`; **L2** order by shortfall, name, ID; **L3** no index now; **M2** `unpaid_purchases` display fields deferred: an owner decision is required before Stage 1C-2 (since decided: Option B, implemented in `7d29d4d`; §4) | [STAGE-1C-T10-ATTENTION-INTEGRITY-LOWSTOCK-PLAN.md](STAGE-1C-T10-ATTENTION-INTEGRITY-LOWSTOCK-PLAN.md) §2 |
| Security fix (`91f084a`), 23 Nov 2026 | Idempotency replays are scoped to the business (`private.claim_request` checks the business) | `20261123000400_claim_request_business_check.sql` |

## 3. Checkpoint 1C-1 closure approach (owner-approved, 24 Nov 2026)

- **Scope of the exit criteria:** STAGE-1C-PLAN §5 is applied to the 1C-1 scope (database functions, migrations, their automated tests, local and CI). Screens (criterion 4), Reports and usability requirements belong to Stage 1C-2 and later stages and are **not** marked complete.
- **Test gaps closed in 1C-1** (`230c029`, tests only): TC-COST-07 as a deterministic shared-helper simulation with a fixture void (end-to-end void in Stage 1D, D9); TC-COST-13 for restock, set_cost and purchase corrections (later uploads in 1D); TC-COST-17's GH₵ effect on the "Cost check needed" item (late-sale trigger in 1D).
- **Coverage mapped, not duplicated:** TC-ATTN-03 and TC-SEC-02 are covered by existing tests; TC-SEC-08 and TC-CONC-03 are partial (see the test plan §0d).

## 4. Open decisions and conditions

| # | Item | Needed before | Status |
|---|---|---|---|
| **M2** | `unpaid_purchases` display fields. **Option B approved by the owner and implemented** (24 Nov 2026): four integer fields (pesewas) added to every purchase row of `unpaid_purchases`: `corrected_cost`, `cost_corrections`, `refunds_received`, `return_credits` (`reduce_unpaid` credits only; cash and MoMo return refunds excluded). Every row satisfies `unpaid = corrected_cost − paid + refunds_received − return_credits`; `unpaid` still comes from `private.purchase_unpaid`. Existing fields, filters, ordering, pagination, totals, errors and privileges unchanged. Migration `20261125000200_unpaid_purchases_display.sql`, commit `7d29d4d`; [CI #51](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/45487659376) passed (database 1017/1017, API 133/133, app 25/25). The frozen T7 migration is untouched. **S-38 display rule (approved, for Stage 1C-2; not yet implemented in any screen):** show the corrected cost as "Purchase cost", with "originally GH₵ X" when it differs; show "Refund received" and "Return credit" only when not zero; Paid and Unpaid unchanged. **Not applied to the cloud project** (D11 outstanding) | **Stage 1C-2** (the S-38 screen) | ✅ **Decided and implemented** (screen rule pending 1C-2; cloud pending D11) |
| **M3** | Specification clarification batch: 09 §3 (Model A: correction shares in `allocation`, not movements); 05 §3.2 conservation line (supplier-return difference is not a stock-value adjustment); C-41 to include C-25c; 10 TC-PUR-13 wording (clarification above); 09 §2 `attention_items.type` list lacks `purchase_correction` | **Reports stage** | ⛔ **Open: owner approval** |
| D11 / R-1 | Applying migrations `20261123000100` – `20261125000200` to the cloud project and re-running cloud verification | Before cloud use of Stage 1C | ⛔ **Outstanding: separate owner approval** |
| T10-I2 | Weekly all-shops integrity run and administrator alert (06 SY-75) | Separate planning | Deferred |

## 5. Review findings carried forward (monitoring, not blocking 1C-1)

| Finding | Status |
|---|---|
| **L1** long-history locking: one purchase correction over a 2,000-movement history holds the product and purchase locks for about 4.4 – 4.7 s locally and 4.9 – 5.7 s in CI (CI #48: 5,660 ms; CI #49: 4,864 ms) | Monitor; optimise later if needed |
| **L2** stale comments in the frozen T7 migration (`20261124000300_supplier_payments.sql`): correction refunds described as not part of the amount owed (superseded by T9-C2); old "T8 corrections / T9 returns" naming | Recorded only; the T7 file stays unchanged |
| **L3** concurrency tests depend on timing; overlap isn't guaranteed (indirect evidence: lock-removal faults are caught). The test plan's "repeat at least 100 times" for section 6 is **not** met | Consider deterministic lock-wait tests later |
| **I6** the deliberate-fault harnesses (T5 – T10 and the 1C-1 closure tests) live outside the repository, so the fault results can't be reproduced from it | Open |
