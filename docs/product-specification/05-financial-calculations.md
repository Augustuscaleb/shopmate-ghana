# 05 — Financial Calculations

Every rule here becomes an automated test before the pilot.

## 1. Money representation (C-01 – C-04)

| ID | Rule |
|---|---|
| C-01 | All amounts are stored and calculated as **integer pesewas** (GH₵1 = 100 pesewas). No floating-point numbers are used for money anywhere |
| C-02 | Display format: `GH₵ 1,240.50` (thousands separator, 2 decimals). Negative amounts are shown as `−GH₵ 5.00` |
| C-03 | Input: owners type cedis (e.g. `12.5`), converted exactly to pesewas (`1250`). Inputs with more than 2 decimals are rejected |
| C-04 | Maximum single amount: GH₵ 1,000,000.00 (sanity limit, to catch typing errors) |

## 2. Sale calculations (C-10 – C-16)

| ID | Formula |
|---|---|
| C-10 | `line_total = qty × unit_price` (exact integer) |
| C-11 | `subtotal = Σ line_total` |
| C-12 | Percentage discount → `discount = round_half_up(subtotal × percent / 100)` to the nearest pesewa |
| C-13 | `0 ≤ discount ≤ subtotal`; `total = subtotal − discount` |
| C-14 | `line_cost = qty × unit_cost` (cost snapshot at the time of sale) |
| C-15 | `sale_cost = Σ line_cost` |
| C-16 | `sale_gross_profit = total − sale_cost` (can be negative; shown in red) |

**Rounding:** C-12 is the only rounding step, using **round half up**, implemented in one shared, tested function.

**Discount allocation (for best-seller profit only):**
- The discount is spread across lines in proportion to line totals.
- Remainder pesewas are given to the largest line, so line figures always add up exactly to the sale total.

## 3. Cost price (C-20 – C-22)

| ID | Rule |
|---|---|
| C-20 | **Last-cost method (MVP):** a product's cost price = the unit cost from its most recent restock, or as entered manually |
| C-21 | `unit_cost` from restock total: `round_half_up(total_cost / qty)` |
| C-22 | If cost price is unknown (0 / not set), the sale's cost is treated as 0, and reports show a warning: "Profit may be too high — 3 products have no cost price." |

*Why last-cost:* it is simple to understand. Weighted average is more accurate when prices change and is a candidate future feature **[A]**.

## 4. Report formulas for a period (C-30 – C-41)

All figures exclude voided sales. Periods use Ghana time (UTC+0) and the sale's **occurred_at**.

| ID | Figure | Formula |
|---|---|---|
| C-30 | **Sales** | Σ sale `total` (all payment methods, including credit) |
| C-31 | **Cost of goods sold** | Σ `sale_cost` |
| C-32 | **Gross profit** | Sales − Cost of goods sold |
| C-33 | **Expenses** | Σ expense amounts (non-deleted) dated in the period |
| C-34 | **Net profit** | Gross profit − Expenses |
| C-35 | **Cash received** | Cash sales + cash paid-now + cash repayments |
| C-36 | **MoMo received** | MoMo sales + MoMo paid-now + MoMo repayments |
| C-37 | **Credit given** | Σ (credit sale total − paid now) |
| C-38 | **Repayments received** | Σ repayment amounts (excluding paid-now at time of sale) |
| C-39 | **Credit outstanding** (at end of period) | Σ all customer balances as at period end |
| C-40 | **Stock losses** | Σ (qty × unit cost) for adjustments with reasons damaged / expired / missing / own use |
| C-41 | **Credit written off** | Σ write-off adjustments |

**Not included in Net profit (MVP):** stock losses (C-40) and written-off credit (C-41) are **shown separately**, not subtracted.
- Reason: keeps "profit" easy to understand.
- Shown with the note "Not included in profit above".
- **Decision for review:** should these be subtracted?

**Revenue recognition:**
- Credit sales count as **Sales** on the day of the sale.
- Repayments are **money received**, not new sales. This avoids counting the same sale twice.

**Stock purchases** are not expenses (see 04 §4). They reach profit through cost of goods sold.

## 5. Dashboard "Today" (C-50)

- Uses C-30 to C-36 for today.
- Includes **pending sales stored on this phone** (computed locally with the same formulas) plus synced server figures, without double counting. Pending sale IDs are excluded from the server results.
- Shows the label "includes N sales not yet uploaded".

## 6. Customer ledger (C-60 – C-64)

| ID | Entry type | Amount sign |
|---|---|---|
| C-60 | `credit_sale` | + sale total |
| C-61 | `repayment` (including paid-now) | − amount |
| C-62 | `adjustment` | + or − (reason required) |
| C-63 | `void_reversal` | − (sale total − paid now), i.e. cancels the credit created by that sale |
| C-64 | **Balance** = Σ entries. The UI never shows a negative balance; the server prevents it (repayment ≤ balance; adjustments may not take the balance below 0) |

**Void after repayments (example):**
- A credit sale of GH₵100 had GH₵30 paid now. The customer later paid GH₵50 more, so the balance is GH₵20 (assuming no other debt).
- The sale is voided. The reversal is −GH₵70 (100 − 30), which would leave −GH₵50.
- Because the balance cannot go below 0, the server **reverses only the remaining balance attributable**: −GH₵20.
- The app tells the owner: "Kofi had already paid GH₵50 towards this sale. Refund it in cash or keep it as a balance adjustment." Recording the refund is a manual note in the MVP.
- This edge case is flagged as **[A] — validate with pilot**.

## 7. Cash count (C-70 – C-72)

| ID | Formula |
|---|---|
| C-70 | Expected cash = opening cash + cash sales + cash paid-now + cash repayments − expenses paid from cash drawer (same day) |
| C-71 | Difference = counted − expected |
| C-72 | Voided sales and deleted expenses are excluded; a void after closing the day does **not** rewrite the saved count, but appears in the next day's notes |

## 8. Worked example (one day)

| Event | Detail |
|---|---|
| Opening cash | GH₵ 200.00 |
| Sale 1 | 2 × Milo @ 5.00 + 1 × Sugar @ 12.00 = 22.00, Cash. Costs 2 × 4.00 + 9.50 = 17.50 |
| Sale 2 | 3 × Sardine @ 15.00 = 45.00, discount 5 % → 2.25 → total 42.75, MoMo. Costs 3 × 11.00 = 33.00 |
| Sale 3 | Rice @ 85.00, Credit to Kofi, paid now 20.00 Cash. Cost 70.00 |
| Repayment | Esi repays 30.00 MoMo |
| Expense | Transport 15.00 paid from cash drawer |

| Result | Calculation | Value |
|---|---|---|
| Sales (C-30) | 22.00 + 42.75 + 85.00 | **GH₵ 149.75** |
| Cost of goods (C-31) | 17.50 + 33.00 + 70.00 | GH₵ 120.50 |
| Gross profit (C-32) | 149.75 − 120.50 | GH₵ 29.25 |
| Expenses (C-33) | | GH₵ 15.00 |
| **Net profit** (C-34) | 29.25 − 15.00 | **GH₵ 14.25** |
| Cash received (C-35) | 22.00 + 20.00 | GH₵ 42.00 |
| MoMo received (C-36) | 42.75 + 30.00 | GH₵ 72.75 |
| Credit given (C-37) | 85.00 − 20.00 | GH₵ 65.00 |
| Expected cash (C-70) | 200.00 + 22.00 + 20.00 − 15.00 | **GH₵ 227.00** |

These figures will be used as a test case.
