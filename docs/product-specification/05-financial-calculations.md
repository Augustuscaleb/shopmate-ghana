# 05 — Financial Calculations

**Revision 2.** Stock losses and bad debts now reduce estimated net profit; the cost method is weighted average.

Every rule here has a matching automated test in [10-test-plan.md](10-test-plan.md). Database fields are defined in [09-data-model.md](09-data-model.md).

## 1. Money representation (C-01 – C-05)

| ID | Rule |
|---|---|
| C-01 | All **money amounts** (prices, totals, payments, expenses, balances) are stored as **integer pesewas** (GH₵1 = 100 pesewas) |
| C-02 | **Average cost** is the only non-integer money value. It is stored as an exact decimal in pesewas with 4 decimal places (database `NUMERIC(18,4)`, e.g. `1132.7273`). **Floating-point numbers are never used for money** |
| C-03 | Display: `GH₵ 1,240.50`; negative amounts `−GH₵ 5.00` |
| C-04 | Input: owners type cedis (e.g. `12.5`), converted exactly to pesewas (`1250`). More than 2 decimals is rejected |
| C-05 | Sanity limit: GH₵ 1,000,000.00 per amount |

**Rounding:** **round half up** everywhere, in one shared, tested function per platform:
- prices and discounts to whole pesewas
- average cost to 4 decimal places

## 2. Sale amounts (C-10 – C-13)

| ID | Formula |
|---|---|
| C-10 | `line_total = qty × unit_price` (exact integer) |
| C-11 | `subtotal = Σ line_total` |
| C-12 | Percentage discount: `discount = round_half_up(subtotal × percent / 100)`. Rule: `0 ≤ discount ≤ subtotal` |
| C-13 | `total = subtotal − discount` |

## 3. Cost method: weighted average (C-20 – C-29)

### 3.1 Assessment

**Question:** can weighted-average costing be implemented reliably in the MVP?

**Conclusion: yes. Recommended for the MVP, with the documented limitations below.**

| Factor | Assessment |
|---|---|
| Where cost changes happen | Only in server functions we already need (`restock`, `record_sale`, `void_sale`, `adjust_stock`, `set_cost`). No extra moving parts |
| Concurrency | Each function locks the affected product rows (`SELECT … FOR UPDATE`, in product-ID order to avoid deadlocks), so two phones cannot corrupt the average |
| Determinism | Exact decimal arithmetic (C-02), so results are reproducible and testable |
| Extra effort vs last-cost | About 4 formulas, 1 extra product field, about 12 additional tests. Small compared with the sync work |
| Accuracy benefit | Profit isn't distorted when a restock price differs from older stock still on the shelf |

**Fallback:** if pilot testing shows a reliability problem, revert to last-restock pricing (§3.4). The schema supports both, because the per-sale cost snapshot is stored either way.

### 3.2 Rules

| ID | Rule |
|---|---|
| C-20 | Each product has `avg_cost` (NUMERIC(18,4) pesewas, may be *unknown* = null) |
| C-21 | **Opening stock or new product:** `avg_cost` = cost entered by the owner (or unknown) |
| C-22 | **Restock** of `q` units at unit cost `u` (`u = total_cost / q`, exact to 4 dp), with current stock `s`:<br>• if `s > 0` and `avg_cost` is known: `avg_cost = round4((s × avg_cost + q × u) / (s + q))`<br>• otherwise (stock is zero or negative, or cost is unknown): `avg_cost = u` |
| C-23 | **Sale:** the **server** sets each line's `unit_cost = avg_cost` at the moment it processes the sale. `line_cost = round_half_up(qty × unit_cost)` (integer pesewas). Sales do **not** change `avg_cost` |
| C-24 | **Unknown cost:** `unit_cost = 0`, the line is flagged `cost_missing`, and reports warn "Profit may be too high — N products have no cost price." |
| C-25 | **Stock adjustments** (in or out) do **not** change `avg_cost`. Their value is `round_half_up(qty × avg_cost)`, stored on the movement |
| C-26 | **Void:** returned quantity is re-blended using the **original line's `unit_cost`** with the same formula as C-22 |
| C-27 | **Manual cost correction** (`set_cost`): the owner sets `avg_cost` directly, e.g. when the cost was wrong or missing. Audit-logged. Past sales keep their recorded cost |
| C-28 | **Phone (provisional) cost:** a pending offline sale shows profit using the phone's cached `avg_cost`. After sync, the server's cost replaces it. Today's figures may change slightly; they are always labelled "estimated" |
| C-29 | Past sales are **never re-costed**. A sale's cost is fixed when the server records it |

### 3.3 Limitations of weighted average (documented)

1. **Offline ordering:** an offline sale made *before* a restock but uploaded *after* it gets the post-restock average. The effect is small unless the restock price differs a lot. The sale's recorded time is unaffected.
2. **Negative stock:** while stock is negative, sold items use the last known average. The next restock resets the average to the new unit cost (C-22). This is a simplification [A].
3. **Unknown costs** make profit too high until the owner enters a cost (C-24 warning).
4. **No historical re-costing:** correcting a cost does not fix profit already reported for earlier sales (C-29).

### 3.4 Fallback method: last-restock pricing (if adopted)

- `avg_cost` = the most recent restock unit cost.
- **Effect:** when prices rise, older cheaper stock is costed at the newer, higher price, so profit is *understated*; when prices fall, profit is *overstated*.
- For example, 10 units bought at GH₵11.00, then 12 at GH₵11.60. Selling 3 of the older units is costed at GH₵34.80 instead of about GH₵33.98 (weighted).
- This limitation would be shown in Help.

## 4. Losses (C-30 – C-34)

| ID | Rule |
|---|---|
| C-30 | **Stock losses** = stock-reducing adjustments with reason *damaged*, *expired*, *missing/theft*, *own use*, or *count correction (decrease)*, valued per C-25 |
| C-31 | **Stock found** (increasing count corrections) is **not** counted as income. It is shown for information only, a deliberate conservative choice [A]. Reason: extra items usually mean an unrecorded restock or a wrong earlier count, not profit |
| C-32 | Resolving a **negative-stock discrepancy** with an *increasing* correction has **no profit effect**. The items' cost was already counted in cost of goods sold when they were sold |
| C-33 | **Bad debts written off** = Σ `write_off` ledger entries (amount owed that the owner gives up), net of `write_off_reversal` entries |
| C-34 | Ordinary **balance corrections** (`adjustment`, e.g. fixing a typing error) do **not** affect profit |

## 5. Report figures for a period (C-40 – C-55)

All figures exclude voided sales and deleted expenses. Periods use Ghana time (UTC+0); sales by `occurred_at`; adjustments, write-offs and expenses by their dates.

| ID | Figure | Formula |
|---|---|---|
| C-40 | **Sales** | Σ sale `total` (all methods, including credit) |
| C-41 | **Cost of items sold** | Σ `line_cost` |
| C-42 | **Gross profit** | Sales − Cost of items sold |
| C-43 | **Operating expenses** | Σ expense amounts |
| C-44 | **Stock losses** | C-30 |
| C-45 | **Bad debts written off** | C-33 |
| C-46 | **Total losses** | Stock losses + Bad debts written off |
| C-47 | **Net profit (estimated)** | Gross profit − Operating expenses − Stock losses − Bad debts written off |
| C-48 | **Cash received** | Cash sales + cash paid-now + cash repayments |
| C-49 | **MoMo received** | MoMo sales + MoMo paid-now + MoMo repayments |
| C-50 | **Credit given** | Σ (credit sale total − paid now) |
| C-51 | **Repayments received** | Σ repayment entries (excluding paid-now at sale time) |
| C-52 | **Credit outstanding** | Σ customer balances at the end of the period |
| C-53 | **Stock found** (info) | C-31 |
| C-54 | **Cost-missing warning** | Count of sale lines with `cost_missing` in the period |
| C-55 | **Stock value** (info, current) | Σ max(stock, 0) × avg_cost over active products |

**How profit is shown** (Reports and the Today detail view), with each type of loss on its own line:

```
Sales                          GH₵ 149.75
− Cost of items sold           GH₵ 121.48
= Gross profit                 GH₵  28.27
− Operating expenses           GH₵  15.00   (rent, transport, ECG…)
− Stock losses                 GH₵   9.50   (damaged, expired, missing, own use)
− Bad debts written off        GH₵  12.00
= Net profit (estimated)      −GH₵   8.23
```

**Why "estimated":** costs use weighted averages, some products may lack a cost price, and pending offline sales use provisional costs. A ⓘ link explains this in plain words.

**Revenue rule:** credit sales count as Sales on the day of sale. Repayments are money received, not new sales.

**Stock purchases** are not expenses (see 04 §4). They enter profit via cost of items sold, or as stock losses.

## 6. Dashboard "Today" (C-60)

- Today's figures use C-40 to C-49 for today.
- **"Today's profit" = Net profit (estimated) for today**, including today's operating expenses, stock losses and write-offs. The card caption reads "after expenses & losses".
- Pending sales on this phone are included using provisional costs (C-28), without double counting.

## 7. Customer ledger (C-70 – C-76)

| ID | Entry type | Sign | Affects profit? |
|---|---|---|---|
| C-70 | `credit_sale` | + (sale total) | No (the sale itself is counted in Sales) |
| C-71 | `repayment` (including paid-now) | − | No |
| C-72 | `adjustment` (correction, reason required) | ± | No |
| C-73 | `write_off` | − (amount given up) | **Yes**: bad debt (C-33) |
| C-74 | `write_off_reversal` (customer paid after all) | + (≤ amount previously written off for this customer) | **Yes**: reduces bad debts in the period it happens |
| C-75 | `void_reversal` | − (the outstanding credit from that sale; see below) | No (the voided sale leaves Sales) |
| C-76 | **Balance** = Σ entries; never below 0 (server-enforced) | | |

**Recovering a written-off debt:**
1. Record a `write_off_reversal` for the amount the customer will pay. This restores the balance.
2. Record a normal `repayment`.

**Void after repayments:** reverse at most the customer's current balance. If the customer had already paid towards the voided sale, the app tells the owner to settle the refund manually [A — validate in pilot].

## 8. Cash count (C-80 – C-82)

| ID | Formula |
|---|---|
| C-80 | Expected cash = opening cash + cash sales + cash paid-now + cash repayments − operating expenses paid from cash drawer (same day) |
| C-81 | Difference = counted − expected. **Not** added to profit automatically; recorded for the owner's information [A]. Repeated shortages are highlighted in the cash count history |
| C-82 | Voided sales and deleted expenses are excluded. A void after the day is closed does not rewrite the saved count |

## 9. Worked example (test case TC-FIN-01)

**Start of day:**

| Product | Stock | avg_cost |
|---|---|---|
| Milo sachet | 40 | 400.0000 (GH₵4.00) |
| Sugar 1kg | 20 | 950.0000 (GH₵9.50) |
| Sardine tin | 10 | 1100.0000 (GH₵11.00) |
| Rice 5kg | 5 | 7000.0000 (GH₵70.00) |

Opening cash: GH₵200.00. Customer Yaw owes GH₵12.00.

| # | Event | Calculation |
|---|---|---|
| 1 | Restock 12 Sardine, total GH₵139.20 → u = 1160.0000 | avg = (10×1100 + 12×1160)/22 = 24920/22 = **1132.7273** |
| 2 | Sale: 2 Milo @5.00 + 1 Sugar @12.00 = **22.00**, Cash | cost = 2×400 + 1×950 = **17.50** |
| 3 | Sale: 3 Sardine @15.00 = 45.00, 5% discount = 2.25 → **42.75**, MoMo | cost = round(3×1132.7273 = 3398.1819) = **33.98** |
| 4 | Sale: 1 Rice @85.00, **Credit** to Kofi, paid now 20.00 Cash | cost = **70.00** |
| 5 | Esi repays 30.00, MoMo | — |
| 6 | Expense: transport 15.00, paid from cash drawer | — |
| 7 | Adjustment: 1 Sugar damaged | loss = 1×950 = **9.50** |
| 8 | Write off Yaw's debt of 12.00 | bad debt = **12.00** |

| Result | Value |
|---|---|
| Sales (C-40) | 22.00 + 42.75 + 85.00 = **GH₵149.75** |
| Cost of items sold (C-41) | 17.50 + 33.98 + 70.00 = **GH₵121.48** |
| Gross profit (C-42) | **GH₵28.27** |
| Operating expenses (C-43) | GH₵15.00 |
| Stock losses (C-44) | GH₵9.50 |
| Bad debts written off (C-45) | GH₵12.00 |
| **Net profit (estimated)** (C-47) | 28.27 − 15.00 − 9.50 − 12.00 = **−GH₵8.23** (a loss day, shown in red) |
| Cash received (C-48) | 22.00 + 20.00 = GH₵42.00 |
| MoMo received (C-49) | 42.75 + 30.00 = GH₵72.75 |
| Credit given (C-50) | 85.00 − 20.00 = GH₵65.00 |
| Expected cash (C-80) | 200.00 + 22.00 + 20.00 − 15.00 = **GH₵227.00** |
| End stock | Milo 38, Sugar 18, Sardine 19 (avg 1132.7273), Rice 4 |
