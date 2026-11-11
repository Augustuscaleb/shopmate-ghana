# 05 — Financial Calculations

**Revision 3.**
- Point-in-time ("as-of") costing for offline sales.
- Undoing a write-off is separate from recovering a written-off debt.
- Stock losses and bad debts reduce estimated net profit.

Every rule here is linked to test cases in [10-test-plan.md](10-test-plan.md). **Those tests are documented only, not yet implemented or run.** Database fields are defined in [09-data-model.md](09-data-model.md).

## 1. Money representation (C-01 – C-05)

| ID | Rule |
|---|---|
| C-01 | All **money amounts** (prices, totals, payments, expenses, balances) are stored as **integer pesewas** (GH₵1 = 100 pesewas) |
| C-02 | **Average cost** is the only non-integer money value. It is an exact decimal in pesewas with 4 decimal places (`NUMERIC(18,4)`, e.g. `1132.7273`). **Floating-point numbers are never used for money** |
| C-03 | Display: `GH₵ 1,240.50`; negatives `−GH₵ 5.00` |
| C-04 | Input in cedis (e.g. `12.5`) is converted exactly to pesewas (`1250`). More than 2 decimals is rejected |
| C-05 | Sanity limit: GH₵ 1,000,000.00 per amount |

**Rounding:** round half up, in one shared function per platform:
- prices, discounts and line costs to whole pesewas
- average cost to 4 decimal places

## 2. Sale amounts (C-10 – C-13)

| ID | Formula |
|---|---|
| C-10 | `line_total = qty × unit_price` |
| C-11 | `subtotal = Σ line_total` |
| C-12 | Percentage discount: `discount = round_half_up(subtotal × percent / 100)`. Rule: `0 ≤ discount ≤ subtotal` |
| C-13 | `total = subtotal − discount` |

## 3. Cost method: weighted average (C-20 – C-29)

### 3.1 Assessment (approved in principle)

Weighted-average costing is feasible in the MVP:
- All average-cost changes happen inside server functions, under row locks (see 09 §4).
- Arithmetic uses exact decimals.
- Each sale's cost is fixed when it is recorded.

**Fallback:** last-restock pricing (§3.6).

### 3.2 Average-cost changes

| ID | Rule |
|---|---|
| C-20 | Each product has a current `avg_cost` (nullable = unknown). **Every change** to `avg_cost` also appends a row to `product_cost_history` (product, `effective_at` = server time, new avg_cost, cause, link to the movement or event). History rows are never edited |
| C-21 | **Opening stock / new product:** `avg_cost` = cost entered (or unknown) |
| C-22 | **Restock** of `q` units at unit cost `u` (`u = total_cost / q`, exact to 4 dp), current stock `s`:<br>• `s > 0` and cost known → `avg_cost = round4((s × avg_cost + q × u) / (s + q))`<br>• otherwise → `avg_cost = u` |
| C-25 | **Stock adjustments** (in or out) do **not** change `avg_cost`. Value = `round_half_up(qty × avg_cost)` |
| C-26 | **Void:** returned quantity is re-blended at the original line's `unit_cost` (C-22 formula) |
| C-27 | **Manual cost correction** (`set_cost`): sets `avg_cost` directly; audit-logged |

### 3.3 Cost of a sale: point-in-time ("as-of") costing

**Problem:** an offline sale made before a restock, but uploaded after it, could be costed at the newer average. Its profit would then depend on *when the phone synced* rather than *when the sale happened*.

**Solution:** the server costs each sale **as at the moment the sale happened**, using the cost history.

| ID | Rule |
|---|---|
| C-23 | **Cost basis time:** `cost_basis_at = occurred_at` (phone time of the sale), except:<br>• if `occurred_at` is later than `received_at` → use `received_at`<br>• if the sale has a clock flag (SY-50) → use `received_at`<br>The sale records which basis was used: `cost_basis` = `occurred_at` / `received_at` |
| C-23a | **Cost lookup:** for each line, `unit_cost` = the `avg_cost` from the **latest `product_cost_history` row with `effective_at ≤ cost_basis_at`**. If no row is that early (e.g. the phone clock is minutes behind the product's creation), the **earliest** row is used and the line is marked `cost_basis_adjusted` |
| C-23b | `line_cost = round_half_up(qty × unit_cost)` |
| C-23c | **Phone's provisional cost:** the phone sends the cost it used for its own display (`device_unit_cost`). It is **stored for audit only** and never used for reports. If it differs from the server's cost, the difference is visible in the sale detail ("Cost updated from GH₵ X to GH₵ Y on upload: this phone's price list was out of date") |
| C-24 | **Unknown cost** at the basis time → `unit_cost = 0`, `cost_missing = true`, report warning (C-54) |
| C-28 | Today's figures for **pending** sales use the phone's provisional cost and are labelled "estimated" until synced |
| C-29 | **Fixed once recorded:** a recorded sale's `unit_cost` and `line_cost` are **never recalculated**. A later restock, a cost correction or another device's late upload never changes them |

**Why this works:**
- `occurred_at` is captured on the phone at the moment of sale and travels with the sale.
- Restocks and cost corrections are online-only, so their `effective_at` is reliable server time.
- The lookup is deterministic: re-sending the same sale (idempotent retry) returns the same stored cost.

### 3.4 Limitations of the as-of approach (documented)

| # | Limitation | Effect | Mitigation |
|---|---|---|---|
| L1 | **Phone clock accuracy.** `occurred_at` comes from the phone | A wrong clock could select the wrong cost period | Large errors are flagged and fall back to `received_at` (C-23). Small errors (minutes) matter only for sales within minutes of a restock |
| L2 | **The current average is not re-blended for late sales.** When a restock was blended, an offline sale made earlier had not yet reduced the stock count, so the blend used a slightly larger old-stock quantity | The *current* average (used for future sales) can be slightly off. Past recorded sales are unaffected (C-29) | Accepted for the MVP. The error shrinks as stock turns over. A prospective correction ("re-blend on late arrival") is a candidate future improvement, applied only to future costs |
| L3 | **Negative stock.** While stock is negative, sales use the last known average; the next restock resets it (C-22) | Simplification | Discrepancy flow (04 §1.3) |
| L4 | **Unknown cost** | Profit too high | Warning (C-54); owner sets a cost |
| L5 | **Cost corrections are not retroactive** | Earlier profit keeps the old cost | Intentional: history is not silently changed |

### 3.5 Example: offline sale before a restock (test TC-COST-11)

- **09:00** Phone A goes offline. Sardine avg = GH₵11.00 (history row at 08:00).
- **10:00** Phone A sells 3 Sardine offline (`occurred_at` = 10:00).
- **11:00** Phone B (online) records a restock of 12 at GH₵11.60. New avg = 11.3273, history row `effective_at` = 11:00.
- **14:00** Phone A reconnects; the sale is received at 14:00.

**Result:**
- `cost_basis_at` = 10:00, so the lookup finds the 08:00 row (11.00).
- Line cost = 3 × 11.00 = **GH₵33.00**, not 33.98.
- The current avg remains 11.3273 (L2).

### 3.6 Fallback: last-restock pricing (only if weighted average is abandoned)

- `avg_cost` = most recent restock unit cost; as-of lookup unchanged.
- **Effect:** when prices rise, older stock is costed at the newer price and profit is understated; when prices fall, profit is overstated.
- For example, selling 3 older units bought at GH₵11.00 after a restock at GH₵11.60 is costed at GH₵34.80, not about GH₵33.98 (weighted) or GH₵33.00 (actual older cost).

## 4. Losses and recoveries (C-30 – C-36)

| ID | Rule |
|---|---|
| C-30 | **Stock losses** = stock-reducing adjustments with reason *damaged*, *expired*, *missing/theft*, *own use*, *count correction (decrease)*, valued per C-25 |
| C-31 | **Stock found** (increasing count corrections) is **not** income; information only (approved) |
| C-32 | Resolving a negative-stock discrepancy by an increasing correction has no profit effect |
| C-33 | **Bad debts written off** (period) = Σ `write_off` amounts dated in the period − Σ `write_off_undo` amounts dated in the period |
| C-34 | Balance **corrections** (`adjustment`) do not affect profit |
| C-35 | **Recovered bad debts** (period) = Σ `debt_recoveries` amounts dated in the period. Money received for a debt that was **correctly** written off. Shown as its own positive line |
| C-36 | Undo and recovery are **different events** (§7.2); one payment is never counted as both |

## 5. Report figures for a period (C-40 – C-56)

Voided sales, sales cancelled before upload and deleted expenses are excluded. Periods use Ghana time; sales by `occurred_at`; other events by their dates.

| ID | Figure | Formula |
|---|---|---|
| C-40 | **Sales** | Σ sale totals |
| C-41 | **Cost of items sold** | Σ line_cost |
| C-42 | **Gross profit** | C-40 − C-41 |
| C-43 | **Operating expenses** | Σ expenses |
| C-44 | **Stock losses** | C-30 |
| C-45 | **Bad debts written off** | C-33 |
| C-46 | **Recovered bad debts** | C-35 |
| C-47 | **Net profit (estimated)** | Gross profit − Operating expenses − Stock losses − Bad debts written off + Recovered bad debts |
| C-48 | **Cash received** | Cash sales + cash paid-now + cash repayments + cash recoveries |
| C-49 | **MoMo received** | MoMo sales + MoMo paid-now + MoMo repayments + MoMo recoveries |
| C-50 | **Credit given** | Σ (credit sale total − paid now) |
| C-51 | **Repayments received** | Σ repayment entries (excluding paid-now) |
| C-52 | **Credit outstanding** | Σ customer balances at period end |
| C-53 | **Stock found** (info) | C-31 |
| C-54 | **Cost-missing warning** | Count of lines with `cost_missing` |
| C-55 | **Stock value** (info) | Σ max(stock, 0) × avg_cost |
| C-56 | **Late uploads note** | Count of sales in the period with `received_at` after the period ended |

**C-56 (late uploads):** a sale uploaded late is **added** to the period in which it happened. That is a new record, not a change to existing records. Reports state "Includes 2 sales uploaded after this period ended", so a changed total is never silent.

**Profit statement layout** (Reports and the Today detail view):

```
Sales                          GH₵ 149.75
− Cost of items sold           GH₵ 121.48
= Gross profit                 GH₵  28.27
− Operating expenses           GH₵  15.00
− Stock losses                 GH₵   9.50
− Bad debts written off        GH₵  12.00
+ Recovered bad debts          GH₵   0.00
= Net profit (estimated)      −GH₵   8.23
```

**Revenue rule:**
- Credit sales count as Sales on the day of sale.
- Repayments are money received, not new sales.
- Recoveries are a separate profit line, because the written-off amount was previously deducted.

## 6. Dashboard "Today" (C-60)

"Today's profit" = C-47 for today. Pending sales are included with provisional costs (C-28) and the caption "after expenses & losses (estimated)".

## 7. Customer ledger, write-offs and recoveries (C-70 – C-79)

### 7.1 Ledger entries (these affect the balance)

| ID | Entry type | Balance effect | Profit effect |
|---|---|---|---|
| C-70 | `credit_sale` | + sale total | None (sale is in Sales) |
| C-71 | `repayment` (including paid-now) | − | None |
| C-72 | `adjustment` (correct a mistake) | ± | None |
| C-73 | `write_off` | − (amount given up) | Bad debt (C-33) |
| C-74 | `write_off_undo` (write-off was **a mistake**) | + (restores balance) | Reduces bad debts in the period of the undo (C-33) |
| C-75 | `void_reversal` | − outstanding credit from the voided sale (≤ current balance) | None |
| C-76 | **Balance** = Σ entries; never below 0 (server-enforced) | | |

### 7.2 Undo vs recovery

| | **Undo write-off** (C-74) | **Recover written-off debt** (C-77) |
|---|---|---|
| When | The write-off itself was an error (wrong customer, wrong amount, owner changed mind before giving up) | The write-off was correct, but the customer **later pays** some or all of it |
| Money received? | **No** | **Yes** (cash or MoMo) |
| Balance | Restored (+) | **Unchanged** (stays as it is; the debt was already given up) |
| Profit | Bad debts reduced, in the period of the undo | **Recovered bad debts** line (+), in the period of payment |
| Cash count / money received | No effect | Included (C-48, C-49, C-80) |
| Limit | ≤ the un-undone amount of the **specific** write-off entry it references | ≤ customer's **recoverable amount** (C-78) |
| Stored in | `customer_ledger` (`write_off_undo`, linked to the write-off entry) | `debt_recoveries` table (not the ledger, because it doesn't change the balance) |

| ID | Rule |
|---|---|
| C-77 | **Recovery** creates a `debt_recoveries` row (customer, amount, method, MoMo reference, date) |
| C-78 | **Recoverable amount** = Σ write_off − Σ write_off_undo − Σ debt_recoveries (for that customer). A recovery above this is rejected |
| C-79 | **Payment larger than the balance** (customer also had written-off debt): the app proposes a split: first **repayment up to the current balance**, then **recovery up to the recoverable amount**. Anything above both is rejected ("Kofi owes GH₵ 20.00 and has GH₵ 40.00 written off. The most you can record is GH₵ 60.00"). The owner confirms the split; both parts are saved in **one transaction** with one idempotency key |

**Why there are no duplicates:**
- A payment is either a repayment (reduces the balance) or a recovery (reduces the recoverable amount), never both. The split in C-79 is computed by the server under a lock on the customer row.
- Undo never records money, so a payment after an undo is an ordinary repayment against the restored balance.
- Every request carries an idempotency key (09 §4), so a double-tap or retry never records the payment twice.

**Void after repayments:** reverse at most the current balance; any money already paid towards the voided sale is settled manually [A — validate in pilot].

## 8. Cash count (C-80 – C-82)

| ID | Formula |
|---|---|
| C-80 | Expected cash = opening + cash sales + cash paid-now + cash repayments + cash recoveries − operating expenses paid from the cash drawer (same day) |
| C-81 | Difference = counted − expected; informational, not added to profit [A] |
| C-82 | Voided and cancelled-before-upload sales, and deleted expenses, are excluded. Late changes do not rewrite a saved count |

## 9. Worked example (test TC-FIN-01)

**Start of day:** Milo 40 @ 400.0000; Sugar 20 @ 950.0000; Sardine 10 @ 1100.0000; Rice 5 @ 7000.0000. Opening cash GH₵200.00. Yaw owes GH₵12.00. All sales are online, so the as-of cost equals the current cost.

| # | Event | Calculation |
|---|---|---|
| 1 | Restock 12 Sardine, total GH₵139.20 (u = 1160.0000) | avg = 24920/22 = **1132.7273** |
| 2 | Sale 2 Milo @5.00 + 1 Sugar @12.00 = **22.00** Cash | cost 17.50 |
| 3 | Sale 3 Sardine @15.00 = 45.00 − 5% (2.25) = **42.75** MoMo | cost round(3398.1819) = 33.98 |
| 4 | Sale 1 Rice @85.00, **Credit** Kofi, paid now 20.00 Cash | cost 70.00 |
| 5 | Esi repays 30.00 MoMo | — |
| 6 | Expense: transport 15.00, cash drawer | — |
| 7 | Adjustment: 1 Sugar damaged | loss 9.50 |
| 8 | Write off Yaw's GH₵12.00 | bad debt 12.00 |

| Result | Value |
|---|---|
| Sales | **149.75** |
| Cost of items sold | **121.48** |
| Gross profit | 28.27 |
| Operating expenses | 15.00 |
| Stock losses | 9.50 |
| Bad debts written off | 12.00 |
| Recovered bad debts | 0.00 |
| **Net profit (estimated)** | **−8.23** |
| Cash received | 42.00 |
| MoMo received | 72.75 |
| Credit given | 65.00 |
| Expected cash | **227.00** |

## 10. Worked example: write-off undo vs recovery (test TC-CRED-08)

Ama (customer) owes **GH₵100**.

| Day | Event | Balance | Recoverable | Profit effect |
|---|---|---|---|---|
| 1 | Write off 40 (correct decision) | 60 | 40 | Bad debts +40 |
| 2 | Write off 60 **by mistake** (meant another customer) | 0 | 100 | Bad debts +60 |
| 3 | **Undo** the day-2 write-off (60) | 60 | 40 | Bad debts −60 (day 3) |
| 4 | Ama pays **GH₵80** cash → split: repayment **60** + recovery **20** | 0 | 20 | Recovered bad debts +20 |
| 5 | Ama pays **GH₵20** MoMo → recovery 20 | 0 | 0 | Recovered +20 |
| 6 | Ama tries to pay GH₵5 more | — | — | **Rejected**: nothing owed or recoverable |

**Totals:**
- Money received = 80 + 20 = GH₵100 (each pesewa counted once).
- Net bad-debt effect on profit over days 1–5 = +40 +60 −60 −20 −20 = **0**. Correct, because Ama paid everything.
