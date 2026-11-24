# Stage 1C-1, task T8: Return to supplier — plan and accounting reconciliation

**Status:** PLAN, for owner review. Not implemented. Owner decisions R1–R8, Q1 and O1 recorded 24 Nov 2026.
**Baseline:** commit `1d695f8` (T7), CI #45 passed. Specification revision 5.1.
**Scope:** `return_to_supplier` only. Purchase-cost corrections (`correct_purchase`) are a separate later task.

## 1. Requirements

| Rule | Text (summary) | Source |
|---|---|---|
| C-21 | Return to supplier: − qty, − round_half_up(qty × average) | 05 §3.2 |
| C-117 | Stock − qty, value − (qty × average). Credit is a refund (cash/MoMo in) **or** a reduction of a chosen purchase's unpaid amount. Any difference between credit and value removed is a visible cost adjustment (C-25c) | 05 §12 |
| C-25c | Refund differs from the value removed → the difference is a cost adjustment; reported as "Cost adjustments" | 05 §3.4 |
| §3.4 principle | Stock value never changes without a recorded movement; every automatic cost adjustment is dated when processed, reported, and raises a Needs attention item | 05 §3.4 |
| C-122, TC-ATTN-02 | A cost adjustment raises an item with amount and direction; automatic adjustments under GH₵0.10 appear as "Rounding" | 05 §3.4, 10 |
| C-112, TC-PUR-08 | Unpaid = cost − paid now − payments + corrections − return credits; never below 0 | 05 §12, 09 |
| C-80, C-115, TC-PUR-07 | Supplier refunds received in cash increase expected cash (computed at the cash count) | 05 §8, §12 |
| 09 §3 | `return_to_supplier(product, qty, credit_amount, credit_type, purchase?, reason)`; qty ≥ 1; credit ≥ 0 | 09 |
| 09 §4.2 | Lock order: claim → products → purchase row (3a: "returns that reduce unpaid") | 09 |
| SEC-12, SEC-21 | Server re-validates everything; audit-logged | 07 |
| C-116a | Later purchase corrections count returns as stock outflows (reads the movement history) | 05 §12.2 |

## 2. Owner decisions (24 Nov 2026)

| # | Decision |
|---|---|
| R1 | **Model 1:** ONE `supplier_return` movement: − qty, − V, V = round_half_up(qty × average). The difference D = C − V is a visible supplier-return cost adjustment, recorded and reported separately, and **must not cause a second stock-value adjustment** |
| R2 | A return larger than the available stock is refused: `insufficient_stock` |
| R3 | A `reduce_unpaid` credit larger than the purchase's outstanding balance is refused: `credit_exceeds_unpaid` |
| R4 | A supplied purchase must belong to the same shop **and** the same product. A purchase is optional for refunds |
| R5 | No per-purchase quantity limit; current stock is the limit |
| R6 | Archived products can be returned |
| R7 | Zero-credit returns are allowed |
| R8 | A Needs attention item (cost adjustment) when **abs(D) ≥ 10 pesewas** (GH₵0.10); smaller differences are "Rounding" |
| **Q1** | **Unknown-cost products are refused with `set_cost_first`.** With the cost unknown, V would be 0 and a positive credit would appear as artificial profit. The owner first sets or corrects the cost through the existing cost-correction rules (T4 `set_cost`, C-27/C-27a), then records the return |
| **O1** | **Known cost with stock value 0 is allowed.** A zero carrying value is not an unknown valuation: it can be genuine zero-cost stock (T3 opening stock or T5 R5 purchases at cost 0) or the result of a recorded negative-value correction (C-25b). The return is valued from the recorded stock valuation, so **V = 0**, and D = C − V is recorded and reported normally (a credit is a visible recovery against a zero carrying value). `set_cost_first` applies **only** when the cost is unknown (`cost_known = false`, Q1) |

## 3. Accounting treatment (Model 1)

### 3.1 Symbols and sign convention (used everywhere in this plan)

| Symbol | Meaning |
|---|---|
| Q, S | Stock quantity and stock value before the return (pesewas) |
| q | Units returned |
| **V** | **`value_removed`** = round_half_up(q × S ÷ Q), computed exactly in integers as ⌊(2·q·S + Q) ÷ 2Q⌋ (S ≥ 0 whenever Q > 0, C-25b). With a known cost and S = 0, V = 0 for any q (O1) |
| **C** | **`credit_amount`**: the supplier's credit (refund or unpaid reduction) |
| **D** | **D = C − V** (stored implicitly as `credit_amount − value_removed`) |
| **Cost impact** | **V − C = −D** (added to cost of items sold) |

- **Negative D** (credit below book value): cost impact positive → **cost increases, profit decreases**.
- **Positive D** (credit above book value): cost impact negative → **cost decreases, profit increases**.
- D = 0: no cost impact.

### 3.2 Stock movement versus financial difference

| | Stock movement | Financial difference |
|---|---|---|
| What | One `supplier_return` movement: − q units, **− V** | D = C − V |
| Changes stock value? | **Yes: by −V, and only this** | **No. Never.** |
| Where recorded | `stock_movements` (+ one `product_cost_history` row) | `supplier_returns` (`value_removed`, `credit_amount`); Needs attention item if abs(D) ≥ 10 |
| Where reported | Stock value; "Returns to supplier (at average)" in the conservation statement | Cost adjustments (cost impact −D); "Rounding" if abs(D) < 10 |

**The difference must not cause a second stock-value adjustment:** no `cost_adjustment` movement (or any other movement) is written for D.

Money and amount owed: `refund_cash` / `refund_momo` → C is money received (cash count, C-80). `reduce_unpaid` → the chosen purchase's unpaid amount falls by C (T7 helper).

### 3.3 Reconciliation

| Requirement | How Model 1 meets it |
|---|---|
| C-21 | The movement is exactly − q, − round_half_up(q × average) |
| C-117 | Stock − q, value − V; the credit is recorded as a refund or an unpaid reduction; the difference is reported |
| C-25c | D is recorded (`credit_amount − value_removed`) and reported as a cost adjustment (cost impact −D), with a Needs attention item when abs(D) ≥ 10 (R8) |
| §3.4 principle | Stock value changes only through the recorded `supplier_return` movement; D changes no stock value |
| **Conservation (05 §3.2)** | Closing value = … − Returns to supplier **(at average: Σ V)** … The identity holds exactly because the only stock-value term for a return is −V. **D has no stock-value component**, so its pool contribution is 0 |
| No double counting | Stock value sees V once (the movement); profit sees −D once (from the return row) |
| No automatic pool adjustment can follow | q ≤ Q and S ≥ 0 give 0 ≤ V ≤ S: the pool never goes negative (no C-25b), and returning all stock removes exactly S (no C-25a residue). The T1 helper still runs and would record any such adjustment visibly |

### 3.4 Specification recommendations (separate approval; the specification is NOT changed by this plan)

1. **05 §3.2 conservation statement:** its last line lists "supplier-return difference" among the **stock-value** cost adjustments. Under Model 1 it has no stock-value effect. Recommended wording: the line names only the movement-based cost adjustments (negative-stock revaluation, zero-stock residue, negative-value correction); the supplier-return difference is shown in the profit statement only.
2. **C-41 (Cost of items sold):** it lists cost adjustments "C-25 – C-25b" only. Recommended: add C-25c, i.e. + Σ (V − C) = + Σ (−D) for returns dated in the period; otherwise the difference would be visible in Needs attention but missing from profit. Needed before the Reports stage, not for T8's records.

### 3.5 Worked examples

**A. Cash refund below book value.** Sardine: 10 units / GH₵150.00 (avg GH₵15.00). Return 3, supplier refunds GH₵42.00 cash.
- V = round_half_up(3 × 15000 ÷ 10) = **4500**; C = **4200**
- Movement: **−3 units / −GH₵45.00**. Stock after: **7 units / GH₵105.00** (avg still GH₵15.00)
- D = 4200 − 4500 = **−300**; cost impact = V − C = **+300**: cost of items sold +GH₵3.00, profit −GH₵3.00
- abs(D) = 300 ≥ 10 → Needs attention item
- Expected cash (at the cash count): +GH₵42.00

**B. Credit above book value, against an unpaid purchase.** Milo: 12 units / GH₵180.00 (avg GH₵15.00). Purchase P: cost GH₵200.00, paid now GH₵50.00 → unpaid GH₵150.00. Return 2 against P, credit GH₵32.00 (`reduce_unpaid`).
- V = **3000**; C = **3200**
- Movement: **−2 units / −GH₵30.00**. Stock after: **10 units / GH₵150.00**
- D = 3200 − 3000 = **+200**; cost impact = **−200**: cost −GH₵2.00, profit +GH₵2.00
- abs(D) = 200 ≥ 10 → Needs attention item
- P unpaid: 15000 − 3200 = **11800** (GH₵118.00), through `private.purchase_unpaid`; no cash effect

**C. Rounding.** Biscuit: 3 units / GH₵10.00. Return 1, refund GH₵3.30 MoMo.
- V = round_half_up(1000 ÷ 3) = **333**; C = **330**
- Movement: **−1 unit / −GH₵3.33**. Stock after: **2 units / GH₵6.67**
- D = **−3**; cost impact **+3**; abs(D) = 3 < 10 → **no** Needs attention item; reported as "Rounding"

**D. Zero credit, entire stock (R7).** Biscuit cartons: **2 units / GH₵24.00** (avg GH₵12.00), all expired. Return both; the supplier gives no credit (type `refund_cash`, C = 0).
- V = round_half_up(2 × 2400 ÷ 2) = **2400**; C = **0**
- Movement: **−2 units / −GH₵24.00**. Stock after: **0 units / GH₵0.00** (no residue, so no C-25a adjustment)
- D = 0 − 2400 = **−2400**; cost impact **+2400**: cost +GH₵24.00, profit −GH₵24.00
- abs(D) ≥ 10 → Needs attention item; no cash effect

**E. Known cost, stock value 0 (O1).** Two cases with the same arithmetic:
- **E1, genuine zero-cost stock:** Promo pens created with cost price 0 and opening stock 5 → 5 units / GH₵0.00, cost known.
- **E2, value reset under C-25b:** Milk tins at 4 units / GH₵0.00 after a late sale left the value negative and T1's negative-value correction brought it to 0 (cost known; a "Cost check needed" item exists).

In each: return 2, supplier refunds GH₵20.00 cash (C = 2000).
- V = round_half_up(2 × 0 ÷ Q) = **0**
- Movement: **−2 units / −GH₵0.00** (a quantity-only movement; not empty, so T1 accepts it). Stock after: E1 **3 / GH₵0.00**, E2 **2 / GH₵0.00**
- D = 2000 − 0 = **+2000**; cost impact = **−2000**: cost −GH₵20.00, profit +GH₵20.00
- abs(D) ≥ 10 → Needs attention item; expected cash +GH₵20.00
- **No second stock-value adjustment:** the only movement has value 0; no movement is written for D; the pool stays at value 0 with positive stock (not negative, so C-25b does not trigger; not 0 units, so C-25a does not trigger)

## 4. Data records

No schema change is needed.

| Record | Fields written |
|---|---|
| `stock_movements` (via T1 `apply_movement`) | type `supplier_return`, qty_change −q, value **−V**, unit_cost = average (4 dp; the cost is always known, Q1; 0.0000 when the stock value is 0, O1), purchase_id = the supplied purchase (or null), reason **null** (required by the existing check: only adjustment / cost_adjustment carry reasons), note = the return reason, user_id |
| `product_cost_history` (by T1) | one row, cause `supplier_return` |
| `supplier_returns` (append-only) | product_id, movement_id (FK to the movement, written first), qty q, **value_removed = V**, **credit_amount = C**, credit_type, purchase_id (null allowed for refunds), reason (trimmed, 1–300), user_id. D is derived as `credit_amount − value_removed`; the date is `created_at` (no date column: returns are dated when recorded) |
| `attention_items` (only if abs(D) ≥ 10) | via `private.raise_attention`: type `cost_adjustment`, entity `supplier_return`, entity_id = the return's ID, message_data {rule C-25c, product_id, return_id, movement_id, qty, value_removed V, credit_amount C, credit_type, purchase_id, difference D, cost_impact −D} |
| `audit_log` | action `return_to_supplier`, entity `supplier_return`, entity_id = return ID; before {stock_qty, stock_value, unpaid (if a purchase)}; after {stock_qty, stock_value, qty, value_removed, credit_amount, credit_type, purchase_id, difference, unpaid (if a purchase), movement_id, attention_item_id}; reason = the return reason |
| `request_log` | the claim and the stored result |

**Attention without a second stock-value change:** the item is written by `raise_attention`, which only inserts into `attention_items`; no movement is written for D, so stock value changes once (−V). The schema's cost-adjustment reason `supplier_return_difference` stays unused (the check allows it; nothing requires it).

## 5. Reuse of `private.purchase_unpaid` (T7)

- No change to the helper: it already subtracts `credit_amount` of `supplier_returns` rows with `credit_type = 'reduce_unpaid'` on that purchase and shop, and ignores refunds.
- R3 check, under the purchase lock: refuse if C > greatest(purchase_unpaid, 0).
- After the insert, the helper's figure falls by exactly C; `pay_supplier` and `unpaid_purchases` see it immediately. No competing calculation.

## 6. Function and sequence

```
public.return_to_supplier(p_request_id uuid, p_business_id uuid, p_product_id uuid, p_qty integer,
  p_credit_amount bigint, p_credit_type text, p_reason text, p_purchase_id uuid default null) returns jsonb
```
SECURITY DEFINER, `search_path = ''`, executable by authenticated only.

1. `not_authenticated` (no user); `not_a_member` (no active membership)
2. `private.claim_request(p_request_id, 'return_to_supplier', p_business_id)`; a replay returns the stored result
3. Validation: `invalid_qty` (null, < 1, > 100,000); `invalid_credit_amount` (null, < 0, > GH₵1,000,000); `invalid_credit_type` (not one of the three codes); `reason_required` (blank after trimming); `reason_too_long` (> 300); `purchase_required` (`reduce_unpaid` without a purchase)
4. Lock the **product** `FOR UPDATE` (shop-scoped; deleted → `product_not_found`; archived allowed, R6)
5. `set_cost_first` **only** if the product's cost is unknown (`cost_known = false`), Q1. A known cost with stock value 0 passes (O1) and is valued at V = 0 in step 9
6. If a purchase is supplied: read it shop-scoped (`purchase_not_found`); `purchase_product_mismatch` if it is another product (R4). For `reduce_unpaid`, lock it `FOR UPDATE` (09 §4.2 step 3a), then compute the unpaid amount with the helper
7. `insufficient_stock` if stock ≤ 0 or q > stock (R2)
8. `credit_exceeds_unpaid` if `reduce_unpaid` and C > greatest(unpaid, 0) (R3)
9. V (exact); movement through `apply_movement` (−q, −V)
10. Insert the `supplier_returns` row; if abs(D) ≥ 10, `raise_attention` (R8)
11. Audit entry; store and return the result `{return_id, movement_id, qty, value_removed, credit_amount, credit_type, purchase_id, difference, cost_impact, unpaid_after (if a purchase), stock_qty, stock_value, attention_item_id}`

Any error rolls back everything, including the claim. The lock order (claim → product → purchase) matches 09 §4.2 and cannot deadlock with `pay_supplier` (purchase only) or `restock` / `adjust_stock` (product only).

## 7. Tests (planned)

| Behaviour | Tests |
|---|---|
| Value removed at average; refund in cash; difference is a cost adjustment | TC-PUR-07 (examples A, C, D) |
| Credit against unpaid; never below 0 (R3) | TC-PUR-08 (example B; credit = unpaid accepted; credit > unpaid refused; fully paid purchase refused for C > 0) |
| Only −V enters stock value; no movement is ever written for D | TC-COST-20; new TC-INV check |
| abs(D) ≥ 10 raises one item; smaller is rounding (R8) | TC-ATTN-02 (D = −10, −9, +9, +10, 0) |
| Exact rounding of V; returning all stock removes exactly S (example D: 0 / 0) | new TC-INV |
| Unknown cost refused (Q1); allowed again after `set_cost` | new TC-INV |
| Known cost, stock value 0 (O1): **E1** genuine zero-cost stock (created at cost 0) and **E2** stock whose value was reset to 0 by C-25b (fixture late sale) both pass validation, V = 0, D = C, one quantity-only movement, an attention item when abs(D) ≥ 10, and **no** other movement (no cost adjustment, no second stock-value change; pool conserved). Also a zero credit on such stock (V = 0, C = 0, D = 0: no item) | new TC-INV |
| R2, R4, R5, R6, R7 | new TC-INV (incl. purchase of another product, of another shop) |
| Validation and error codes | new TC-INV |
| Isolation: other shop, inactive membership, no user, anonymous; app cannot write returns directly | TC-SEC-02/04/08 extended |
| Idempotency: replay; another shop; another function; refused request writes nothing | TC-CONC-05 extended |
| Concurrency (API): parallel returns of the last units (only stock allows); a return credit and a payment racing on the same purchase cannot overpay; 5 copies of one request recorded once | TC-CONC-03/05 extended |
| Append-only returns, audit, history; T7 helper unchanged | new TC-INV |
| Deliberate faults | product lock removed; purchase lock removed; Q1 / R2 / R3 / R4 removed; Q1 widened to refuse known zero-value stock (O1 tests must fail); V at purchase cost instead of average; D written as a second stock-value movement; attention threshold wrong (e.g. D instead of abs(D)); membership removed; audit removed; claim removed |

## 8. Open items and limitations

| # | Item | Status / recommendation |
|---|---|---|
| O1 | Known cost but stock value 0 | **Decided** (§2): allowed, V = 0 |
| O2 (observation, no decision needed for T8) | In case E2 the C-25b "Cost check needed" item stays open after the return; the return's own C-25c item is separate. Neither resolves the other (same approach as T6's S5) | Flagged only; acknowledging items is a later task (`acknowledge_attention`) |
| Spec 1, 2 | 05 §3.2 and C-41 wording (§3.4) | Separate approval before the Reports stage |
| L1 (schema) | `supplier_returns` has no date column: a return (and a cash refund) is dated when recorded; no back-dating, so no closed-day adjustment arises | Accept for the MVP |
| L2 (schema) | One credit type per return: a credit cannot be split between a refund and an unpaid reduction (R3 refuses instead) | Accept (two returns can be recorded) |
| L3 | Cost-adjustment reports must read D from `supplier_returns` (not from movements) | Note for the Reports stage |
| L4 | T7 helper comments say "T8 corrections, T9 returns"; the task order is now returns first | Comment wording only; no behaviour change |
