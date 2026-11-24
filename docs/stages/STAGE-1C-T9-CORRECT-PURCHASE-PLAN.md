# Stage 1C-1, task T9: Correct purchase — plan

**Status:** APPROVED DESIGN. All fifteen owner decisions (C1, C2, Q3–Q10, U1–U5) approved 24 Nov 2026. **Not implemented.** No owner decision is outstanding; §13 lists routine implementation details only.
**Baseline:** commit `5d807cd` (T8), CI #46 passed. Specification revision 5.1.
**Legend:** **[REQ]** established by the specification or an earlier approved decision · **[DEC]** owner-approved for T9 · **[REC]** recommendation, not yet approved · **[OPEN]** needs an owner decision.

## 1. Purpose and scope

[REQ] Let the owner correct a recorded purchase without editing it (C-116): a **cost correction** (the agreed price was different) with proportional allocation of the difference, or a **quantity correction** (a different quantity was received, total cost unchanged, C-116f). Server function `correct_purchase(purchase, type, qty_change or cost_change, reason, refund?)` (09 §3). Online-only (S-39 🌐).

Out of scope: see §12.

## 2. Owner decisions (all approved 24 Nov 2026)

| # | Decision [DEC] |
|---|---|
| **C1** | **Model A.** ONE `purchase_correction` movement carries the remaining-stock share R (qty 0, value R; none if R = 0). The consumed shares (already sold S, stock losses L, own use U, returns to supplier T) are recorded in `purchase_corrections.allocation`, **not** as stock movements |
| **C2** | **Extend `private.purchase_unpaid`** in a NEW T9 migration (`CREATE OR REPLACE`, same signature) so it adds back refunds recorded against purchase corrections. T8 cash / MoMo supplier-return refunds are **not** counted. The T7 migration file is **not** modified |
| **Q3** | In the allocation walk, quantity corrections **to other purchases** count as inflows (increase) or outflows (decrease). Quantity corrections **to the purchase being corrected** are ignored for f, and the allocation is flagged approximate (reason `quantity_correction`) |
| **Q4** | A quantity decrease that would leave insufficient stock is **refused** (`insufficient_stock`); the boundary is set by U2 |
| **Q5** | The corrected quantity (purchase qty + Σ qty changes) must be **at least 1** |
| **Q6** | When a cost reduction exceeds what is owed, the refund must be **exactly the excess paid** |
| **Q7** | Corrections are **allowed** for archived products |
| **Q8** | **One Needs attention item per correction** (C-116d), whatever the amount (reconciliation with TC-ATTN-02: §10) |
| **Q9** | The movement ID is stored in `allocation` and in the audit entry; **no schema change** |
| **Q10** | Allocation arithmetic uses **exact rationals** (integer numerator and denominator); rounding only at C-116c |
| **U1** | During T9 implementation, exactly six T7 test expectations may change: **TC-INV-88c, 88d, 88e, 88g, 88h and 88i**, as listed in §5.4. **No other T7 expectation may change.** Not changed by this plan |
| **U2** | A quantity correction that takes stock to **exactly 0** is allowed (C-25a then applies through T1); one that would take stock **below 0** is refused with `insufficient_stock` |
| **U3** | A quantity **decrease** to **another** purchase is allocated to the **stock-loss share (L)** for the arithmetic. This is an **accounting allocation only, not evidence that physical stock was lost**. The allocation is marked **approximate** (reason `quantity_correction`) |
| **U4** | The GH₵1,000,000 limit (100,000,000 pesewas, D6) applies to both **abs(ΔC)** and the **corrected purchase cost** (purchase_cost + Σ cost_change + ΔC), validated in integer pesewa arithmetic |
| **U5** | No history-size limit for the rational walk for now; performance is **measured in TC-PUR-13 and reported** |

**Consistency note (U3 and Q3).** Q3 required the approximate flag for quantity corrections to the purchase being corrected. U3 additionally requires it for quantity **decreases** to other purchases (described in U3 as following Q3). Both apply: the flag (reason `quantity_correction`) is set in either case. Quantity **increases** to other purchases remain ordinary inflows and do not set the flag (C-116a: inflows don't change f).

## 3. Requirements and existing behaviour

### 3.1 Requirements [REQ]

| Rule | Summary | Source |
|---|---|---|
| C-116 | A price correction ΔC (± pesewas) is recorded against the original purchase (never edited), with a reason; processed and **dated now** | 05 §12.2 |
| C-116a | Remaining fraction f from 1; walk the movements since the purchase in recorded order. Outflow (sale, stock loss, own use, return to supplier) of q with stock before Q > 0: share = f × q ÷ Q, f ← f × (Q − q) ÷ Q. Inflows (later purchases, stock found, voids) don't change f. An outflow taking stock to 0 or below takes all of f; f ← 0. Exact, no floating point | 05 §12.2 |
| C-116b | R = f × ΔC added to stock value; S as a cost adjustment; L added to stock losses; U added to own use; T as a supplier-return difference | 05 §12.2 |
| C-116c | Each part rounded half up; the leftover goes to R (or to S if f = 0); parts sum to ΔC exactly | 05 §12.2 |
| C-116d | No history rewritten; all parts dated at the correction; a Needs attention item lists each part | 05 §12.2 |
| C-116e | The unpaid amount changes by ΔC; if a reduction would make it negative, a refund received (cash / MoMo) is recorded in the same step; no "supplier owes you" balance | 05 §12.2 |
| C-116f | Quantity correction: stock qty changes by the difference, no value change; C-25a / C-120 apply at 0 or below; a Needs attention item explains the effect | 05 §12.2 |
| Conservation | "± Purchase price corrections: remaining-stock share only" | 05 §3.2 |
| C-103 | Corrections are dated when processed, never day adjustments | 05 §11 |
| L8 / Stage 1C plan | Exact for in-order history; approximations flagged with reasons and audited | 05 §12.2, STAGE-1C-PLAN §2 |
| L9 | A supplier forgiving part of a debt is a cost correction (lower cost) | 05 §12.2 |
| 09 §3, §4.2 | `correct_purchase` inputs and validation; lock order claim → products → purchase (3a) | 09 |
| Tests | TC-PUR-05, 06, 12, 13, 14, 15, 16; TC-COST-20; TC-ATTN-02, 04 | 10 |

### 3.2 Existing schema and code

- `purchase_corrections` (`core_tables.sql:92–113`, append-only, RLS read, no app writes): type `cost` / `quantity`; `qty_change`; `cost_change`; reason (1–300); `allocation` (required for cost); `allocation_exact` (required for cost); `approximation_reasons` (required when not exact); `refund_amount` ≥ 0; `refund_method` `cash` / `momo` (required with a refund). Cost ⇒ qty_change = 0 and cost_change ≠ 0; quantity ⇒ cost_change = 0 and qty_change ≠ 0. No `movement_id` and no date column.
- Movement type and history cause `purchase_correction`, and attention type `purchase_correction`, exist. The cost-adjustment reason `purchase_correction_after_sale` exists but is **not used** under Model A.
- `purchases` is append-only (T5). T1 `apply_movement`; T6 adjustments; T8 `supplier_return` movements and `reduce_unpaid` credits.
- T7 `private.purchase_unpaid` (`20261124000300_supplier_payments.sql:47–64`): cost − paid now − payments + Σ cost_change − Σ reduce_unpaid return credits.

## 4. Accounting treatment

### 4.1 Cost correction (C1, Model A)

| Part | Amount | Recorded in | Effect |
|---|---|---|---|
| Remaining stock | R = f × ΔC (+ rounding leftover) | **one `purchase_correction` movement** (qty 0, value R, purchase_id) | **the only stock-value change** |
| Already sold | S | `allocation` | cost of items sold (cost adjustment), today |
| Stock losses | L | `allocation` | stock losses, today |
| Own use | U | `allocation` | goods taken for own use (below net profit), today |
| Returns to supplier | T | `allocation` | supplier-return difference, today |
| **Total** | **ΔC** exactly | | unpaid amount + ΔC |

Conservation (05 §3.2) holds: stock value changes by R only; S, L, U and T have no stock-value component and are reported from `allocation` (no double counting). The type `purchase_correction` keeps these separate from T4's owner cost corrections (`value_correction`, C-57).

**Worked example (TC-PUR-12):** pool 10 / 8000; P: 10 for 10000 → 20 / 18000; sale 5 (sold share 0.25; f 0.75); own use 1 (0.05; f 0.70); purchase of 6 (inflow); sale 4 (0.14; f 0.56) → 16 / 14880. ΔC = +2000: S = 780, U = 100, R = 1120; movement +1120 → **16 / 16000**, as a full recalculation gives. P's unpaid +2000. One attention item lists 780 / 100 / 1120.

### 4.2 Walk mapping (C-116a, Q3)

| Movement after the purchase's restock movement | Treatment | Part |
|---|---|---|
| `sale` | outflow | S |
| `adjustment` decrease: damaged, expired, missing, count correction, other | outflow | L |
| `adjustment` decrease: own_use | outflow | U |
| `supplier_return` | outflow | T |
| `restock`, `opening`, `adjustment` increase, `void` | inflow | — |
| `purchase_correction` with qty ≠ 0 **for another purchase** [DEC Q3, U3] | increase: inflow; decrease: outflow, `allocation_exact = false`, reason `quantity_correction` | decrease: L (an accounting allocation only, not evidence of physical loss) |
| `purchase_correction` with qty ≠ 0 **for this purchase** [DEC Q3] | ignored for f; `allocation_exact = false`, reason `quantity_correction` | — |
| qty-0 movements (`cost_adjustment`, `value_correction`, `purchase_correction` cost parts) | ignored | — |

Q (stock before each outflow) is read from the product's history in recorded order. Approximation flags (L8): `negative_stock`, `void`, `late_upload` (fixtures only in 1C), `quantity_correction` (Q3, U3).

### 4.3 Exact arithmetic (Q10)

f and every share are kept as rationals (integer numerator / denominator, PostgreSQL `numeric` integers). Parts are computed as ΔC × numerator ÷ denominator and rounded half up exactly (integer arithmetic, as in T6 / T8), then C-116c's leftover rule is applied. There is no history-size limit (U5); the size of the numbers and the run time on long histories are measured in TC-PUR-13 and reported.

### 4.4 Quantity correction

[REQ C-116f] One `purchase_correction` movement: qty Δq, value 0; the purchase's total cost stays in the pool, so the average adjusts; the unpaid amount is unchanged. Q4 / U2: a decrease to exactly 0 is allowed; one that would take stock below 0 is refused (`insufficient_stock`). Q5: the corrected quantity must stay ≥ 1. If stock reaches 0 with value left, T1 posts the C-25a residue (with its own item if ≥ GH₵0.10).

## 5. Unpaid amount (C2)

### 5.1 Revised formula [DEC]

```
unpaid = purchase_cost
       − paid_now
       − Σ supplier_payments.amount                       (T7)
       + Σ purchase_corrections.cost_change                (T7; quantity corrections add 0)
       + Σ purchase_corrections.refund_amount              (NEW in T9: money the supplier gave back)
       − Σ supplier_returns.credit_amount  where credit_type = 'reduce_unpaid'   (T7 / T8)
```

T8 `refund_cash` / `refund_momo` returns stay **excluded**: they pay for goods handed back, not for an overpayment of this purchase.

### 5.2 Why: worked refund example

| Step | Event | Old T7 formula | Revised formula |
|---|---|---|---|
| 1 | Purchase: cost GH₵10.00, paid now GH₵10.00 | 0 | 0 |
| 2 | Cost correction −GH₵3.00. It would make the amount owed −3.00, so the supplier refunds exactly GH₵3.00 (Q6) | 1000 − 1000 − 300 = **−300** (shown as 0) | 1000 − 1000 − 300 + 300 = **0** |
| 3 | Later cost correction +GH₵2.00 | 1000 − 1000 − 100 = **−100**: "nothing owed" (wrong) | 1000 − 1000 − 100 + 300 = **200** |

**Why GH₵2.00 is owed after step 3:** the agreed cost is now 1000 − 300 + 200 = GH₵9.00. The owner paid GH₵10.00 and received GH₵3.00 back, so net paid GH₵7.00. GH₵9.00 − GH₵7.00 = **GH₵2.00 owed**. Without the refund term, the GH₵3.00 refund is effectively counted as still paid, understating the debt.

**Invariant:** with T9 requiring exactly the excess as a refund (Q6), and T7 / T8 refusing payments and credits above the amount owed, the revised figure never becomes negative through the functions.

### 5.3 Refund rule [DEC Q6]

For a cost correction, excess = max(0, −(unpaid before + ΔC)), using the revised helper under the purchase lock. Excess > 0: a refund of **exactly** the excess with method cash / MoMo is required. Excess = 0: no refund is accepted. Quantity corrections never take a refund.

### 5.4 Effect on existing T7 tests

The revised helper changes six expectations in `supabase/tests/database/10_supplier_payments.test.sql`. **U1 authorises exactly these six to change during T9 implementation, and no other T7 expectation.** Their fixtures (written in T7 before T9's rules existed) record refunds that T9 itself would refuse: on `p_frm` a 200 refund with a −500 correction when nothing was overpaid; on `p_neg` a 1500 refund. **The tests are not changed by this plan**; they are updated only during T9 implementation (U1).

| Test | Fixture state | Current expectation | Expected under the revised helper |
|---|---|---|---|
| TC-INV-88c | p_frm after −500 correction with 200 refund | unpaid 6000 | **6200** (+200 refund) |
| TC-INV-88d | + a quantity correction | 6000 | **6200** |
| TC-INV-88e | + 1000 reduce_unpaid credit (refund returns excluded) | 5000 | **5200** |
| TC-INV-88g | pay_supplier above the amount owed | 5001 refused | **5201** refused (5001 would then succeed) |
| TC-INV-88h | the exact payoff | 5000 pays it off | **5200** pays it off |
| TC-INV-88i | p_neg after −1500 correction with 1500 refund | helper −1500 | **0** |

Unaffected: 88a, 88b, 88f, 88j (still "nothing owed"), 88k, 88l, and all other T7 tests. T8 tests are unaffected (their purchases have no correction refunds).

## 6. Effects summary

| | Cost correction | Quantity correction |
|---|---|---|
| Purchase row | never edited; corrected cost = purchase_cost + Σ cost_change | never edited; corrected qty = qty + Σ qty_change (≥ 1) |
| Stock quantity | unchanged | + Δq (may reach 0; never below 0, Q4 / U2) |
| Stock value | + R only | unchanged |
| Unpaid | + ΔC (+ refund if any, §5) | unchanged |
| Payments | unchanged; no payment row | unchanged |
| Cash / MoMo | refund received (cash count) | none |
| Profit (reported from `allocation`) | S, L, U, T, dated today | none (C-25a residue if stock reaches 0) |

## 7. Interactions with T7 and T8

- `pay_supplier`, `unpaid_purchases` and T8's R3 check all read the revised helper: one calculation, no competitor.
- T8 return shares become T in the allocation; `reduce_unpaid` credits stay in the helper; T8 refunds stay excluded.
- The correction applies to the purchase's own product (from the purchase row).

## 8. Validation and errors

| Check | Error | Basis |
|---|---|---|
| Not signed in / not an active member | `not_authenticated` / `not_a_member` | [REQ] conventions |
| Type not `cost` / `quantity` | `invalid_correction_type` | [REQ] schema |
| Cost: ΔC null or 0 | `invalid_cost_change` | [REQ] schema |
| Cost: abs(ΔC) > 100,000,000 pesewas (GH₵1,000,000) | `invalid_cost_change` | [DEC] U4 |
| Cost: corrected cost < 0 | `invalid_corrected_cost` | [REQ] C-110 |
| Cost: corrected cost > 100,000,000 pesewas (GH₵1,000,000) | `invalid_corrected_cost` | [DEC] U4 (integer pesewa arithmetic) |
| Quantity: Δq null or 0, or abs(Δq) > 100,000 | `invalid_qty_change` | [REQ] schema, D6 |
| Quantity: corrected quantity < 1 | `invalid_corrected_qty` | [DEC] Q5 |
| Quantity: stock would go below 0 (exactly 0 allowed) | `insufficient_stock` | [DEC] Q4, U2 |
| The field of the other type supplied | `change_mismatch` | [REC] |
| Reason blank / > 300 | `reason_required` / `reason_too_long` | [REQ] |
| Purchase not in this shop | `purchase_not_found` | [REQ] conventions |
| Refund needed but missing or not exactly the excess | `refund_required` (detail: the amount) | [DEC] Q6 |
| Refund given when not needed (or on a quantity correction) | `refund_not_needed` | [DEC] Q6 |
| Refund method not cash / momo | `invalid_refund_method` | [REQ] schema |
| Archived product | allowed | [DEC] Q7 |

Error-code names are [REC] (routine).

## 9. Transaction order, locks, idempotency, security

1. Sign-in, active membership, `claim_request('correct_purchase', business)`; a replay returns the stored result
2. Input validation
3. Read the purchase (shop-scoped) for its product; lock the **product** `FOR UPDATE`, then the **purchase** `FOR UPDATE` (09 §4.2; same order as T8)
4. Under the locks: corrected cost / qty, stock, unpaid (revised helper) and refund checks
5. Cost: walk and allocate; `purchase_corrections` row (allocation with the movement ID, exactness, reasons, refund); one `purchase_correction` movement for R (if R ≠ 0). Quantity: the row; one movement (Δq, 0)
6. One attention item; one audit entry; stored result

Any error rolls back everything, including the claim. While the product is locked, no other function can add movements to it, so the walk sees a consistent history. SECURITY DEFINER, `search_path = ''`, executable by authenticated only; the helper stays internal. [REQ conventions]

## 10. Audit and attention

- **Audit** (SEC-21): action `correct_purchase`, entity `purchase_correction`; before / after: corrected cost or qty, unpaid, stock qty / value, R / S / L / U / T, f, exactness and reasons, refund, **movement ID** (Q9).
- **Attention** [DEC Q8]: exactly one item per correction, type `purchase_correction`, entity `purchase_correction`, entity_id = the correction's ID; message lists each part (or the quantity effect and new average), exactness and reasons.
- **TC-ATTN-02 reconciliation:** TC-ATTN-02 ("every automatic cost adjustment ≥ GH₵0.10 raises an item; smaller ones appear as Rounding") applies to **automatic** adjustments (C-25, C-25a, C-25b, C-25c). A purchase correction is **owner-initiated**, and C-116d requires an item listing each part, so no threshold applies. The tests will assert: (a) a correction of any size, including ±1 pesewa, creates exactly one `purchase_correction` item; (b) any automatic adjustment triggered by a correction (a C-25a residue after a quantity correction to 0) still follows TC-ATTN-02's ≥ GH₵0.10 rule through T1's existing code; (c) T6 / T8 behaviour (C-25c threshold) is unchanged.

## 11. Test strategy

**Database (pgTAP; fixture sales and voids allowed, Stage 1C plan §3):**
- TC-PUR-05, 06, 12 (780 / 100 / 1120; 16 / 16000), 14, 15, 16
- Each outflow and inflow kind; Q3 both cases; L8 flags; rounding (thirds, halves; leftover to R or to S)
- Q4 / U2 (decrease to exactly 0 accepted, below 0 refused), Q5, Q6, Q7, Q8 (1-pesewa correction still one item), Q9 (movement ID in allocation and audit), U3 (another purchase's decrease → L, flagged approximate), U4 (abs(ΔC) and corrected cost at 100,000,000 accepted, 100,000,001 refused)
- Isolation, idempotency, refused requests write nothing, append-only, one audit entry, conservation (stock value changes by R only; no movement for S / L / U / T)

**Extended helper (C2), preserving T1–T8:**
- New T9 assertions: §5.2's three-step example (0, 0, 200); correction refunds added back; T8 `refund_cash` / `refund_momo` still excluded; `reduce_unpaid` credits still subtracted; payments still subtracted; shop scoping (another shop's purchase → null); signature unchanged; still not executable by app roles
- Regression: all T7 tests with only the six §5.4 expectations changed (U1; any other T7 change is out of scope); all T8 tests unchanged; T1–T6 unchanged
- API: `pay_supplier`, `unpaid_purchases` and T8 `reduce_unpaid` see the revised figure after a refund

**API (local):** worked example end to end; refund flow; validation; isolation; idempotency; concurrency (a correction racing a payment on the same purchase; a correction racing an adjustment on the product; 5 copies of one request)

**TC-PUR-13 (equivalence):** random in-order histories; split versus full recalculation with the corrected cost. Also records the history length, numerator / denominator sizes and run time, reported with the T9 results (U5).
- **Owner-approved clarification (24 Nov 2026, replaces the earlier "≤ 1 pesewa per part" wording):** the primary check is **exact rational equivalence**: every share × ΔC equals the independent full recalculation's difference exactly. The integer parts must **sum exactly to ΔC**, and the stock-value movement must **equal the integer remaining-stock part R**; conservation checks are unchanged. Rounding bounds against the exact values: **consumed parts (already sold, stock losses, own use, returns to supplier) ≤ 0.5 pesewa; remaining stock ≤ 2 pesewas** (both inclusive). The wider remaining-stock bound follows from C-116c assigning the rounding leftover to that part: its difference equals minus the sum of the four consumed parts' rounding errors, so it can reach exactly 2 when all four are exact halves in the same direction (e.g. ΔC = 10 with consumed shares 0.05 / 0.15 / 0.25 / 0.35 and remaining 0.20 gives R = 0 against an exact 2). Exact halves likewise reach exactly 0.5. This is the final whole-pesewa allocation required by C-116c, **not accumulated rounding error or lost value**. C-116c and the accounting model are unchanged.

**Deliberate faults:** product / purchase lock, claim, membership, audit removed; f with rounded division; leftover to the wrong part; consumed parts written as stock-value movements; refund check removed or not exact; helper without the refund term; helper counting T8 refunds; Q3 / Q4 / Q5 checks removed; threshold added to the attention item

## 12. Out of scope, limitations, specification clarification

- **T9 changes (to be implemented):** the `correct_purchase` function, the T9 migration (including the helper extension, C2), T9 database and API tests, and the six T7 test expectations authorised by U1.
- **Not T9 (separate future specification clarification):** 09 §3 says `correct_purchase` writes "cost adjustment, loss and own-use entries" to `stock_movements`; under Model A those parts live in `allocation`. 09 §3 (and the T8 recommendations for 05 §3.2 and C-41) need wording changes approved separately. **The numbered specification documents are not changed by T9.**
- Reports (later stage) must read S, L, U, T from `purchase_corrections.allocation`.
- L8 approximations are flagged, not corrected; sales and voids are fixtures until Stage 1D.
- No date column: corrections are dated when recorded (C-116, C-103). No "supplier owes you" balance (C-116e).
- Screens (Stage 1C-2), T10 and later tasks are out of scope.

## 13. Remaining implementation details (no owner decision outstanding)

All fifteen owner decisions are approved (§2). The items below are routine details, marked [REC]; any that turn out to affect accounting, security or scope will be raised before implementation rather than decided silently.

| Item | Recommendation [REC] |
|---|---|
| Error-code names (§8) | as listed in §8 |
| Approximation reason codes | `negative_stock`, `void`, `late_upload`, `quantity_correction` |
| `allocation` JSON layout | {f (numerator, denominator), parts R / S / L / U / T, per-part shares, movement_id, exact, reasons} |
| Attention message wording | plain-language parts list, following T8's C-25c item |
