# 05 — Financial Calculations

**Revision 4.**
- **Value-pool weighted average** with sale-time costing. This replaces the stored running average, and fixes the late-sale average problem.
- Time-confidence checks for phone timestamps.
- Day-close snapshots, so confirmed reports are never rewritten.
- Unchanged from revision 3: undo vs recovery of write-offs; losses and bad debts reduce estimated net profit.

Every rule here is linked to test cases in [10-test-plan.md](10-test-plan.md). **Those tests are documented only, not yet implemented or run.** Database fields are defined in [09-data-model.md](09-data-model.md).

## 1. Money representation (C-01 – C-05)

| ID | Rule |
|---|---|
| C-01 | All **money amounts** (prices, totals, payments, expenses, balances) are stored as **integer pesewas** (GH₵1 = 100 pesewas) |
| C-02 | Stock **value** is also integer pesewas. The **average cost** (value ÷ quantity) is computed exactly and kept only as a 4-dp decimal snapshot in cost history for lookups (`NUMERIC(18,4)`). **Floating-point numbers are never used for money** |
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

## 3. Cost method: value-pool weighted average with sale-time costing (C-20 – C-29)

### 3.1 Why revision 4 changes the method

Revision 3 stored a running **average** and blended each restock into it. The owner's review found a flaw:

| Time | Event | Revision 3 result | Correct (chronological) result |
|---|---|---|---|
| 09:00 | 10 items @ GH₵10 | avg 10.00 | 10 @ 10.00 |
| 10:00 | Offline phone sells 2 (not yet uploaded) | server still thinks 10 | 8 @ 10.00 |
| 11:00 | Another phone restocks 10 @ GH₵15 | blends with **10** units → **12.50** | blends with **8** → 230 / 18 = **12.78** |
| 14:00 | Offline sale uploads | sale costed at 10 ✓, but average stays **12.50** ✗ | sale at 10; average 12.78 |

The future average was wrong because the restock was blended against a stock count that didn't yet include the offline sale.

**Revision 4 fix (simpler, not more complex):** keep each product's **stock value** (a whole-pesewa total) alongside its stock quantity. The average is not stored; it is always **value ÷ quantity**. Every event adds or removes value. Because addition doesn't depend on order, a late sale that removes value at its **sale-time cost** produces the correct pool.

### 3.2 The value pool (C-20 – C-22)

| ID | Rule |
|---|---|
| C-20 | Each product keeps `stock_qty` (integer) and **`stock_value`** (integer pesewas). **Average cost = stock_value ÷ stock_qty** whenever stock_qty > 0. Not stored; computed exactly. Rounded only when a line cost is calculated |
| C-21 | Every event changes the pool by an exact, recorded amount (the `value` on its stock movement):<br>• **Opening stock:** + qty, + qty × entered cost<br>• **Restock:** + qty, + **total amount paid** (exact pesewas, no division needed)<br>• **Sale:** − qty, − line cost (C-23)<br>• **Void:** + qty, + the original line cost<br>• **Stock loss** (damaged, expired, missing, own use, count down): − qty, − round_half_up(qty × average)<br>• **Stock found** (count up): + qty, + round_half_up(qty × average) |
| C-22 | After every event, the server writes one `product_cost_history` row: time (server), stock_qty, stock_value, and the resulting average (4 dp, for lookups and display) |

**Conservation guarantee** (checked by test TC-COST-20 for every product):

> Opening value + restocks + stock found + void returns + manual corrections = cost of items sold + cost adjustments + stock losses + current stock value

No pesewa of cost is ever created or lost, whatever order events arrive in.

### 3.3 Cost of a sale: sale-time ("as-of") costing (C-23 – C-23c)

| ID | Rule |
|---|---|
| C-23 | **Cost time** = the sale's `occurred_at` (best estimate of when the sale happened, §3.6). If time confidence is **low**, the server uses `received_at` instead and records `cost_basis = received_at` |
| C-23a | `unit_cost` = the average from the **latest `product_cost_history` row at or before the cost time**. If none is that early, the earliest row is used and `cost_basis_adjusted` is set. Equal timestamps: the history row counts as earlier |
| C-23b | `line_cost = round_half_up(qty × unit_cost)`. This exact amount is removed from the pool (C-21) |
| C-23c | The phone's provisional cost is stored as `device_unit_cost` for audit only. If it differs, the sale detail explains why |
| C-24 | **Unknown cost** (product never had a cost): `unit_cost = 0`, `cost_missing = true`, nothing removed from value, report warning |
| C-28 | **Pending sales on the phone** use the phone's cached average for display only, labelled "estimated" until uploaded |
| C-29 | **A recorded sale's cost never changes** — not after restocks, cost corrections or later uploads |

### 3.4 Keeping the pool valid (C-25 – C-27)

Edge cases are handled by an explicit, visible **cost adjustment** movement, dated when it is processed, so no history is rewritten:

| ID | Situation | Rule | Reported as |
|---|---|---|---|
| C-25 | **Restock while stock is negative** (items were sold before their purchase was recorded) | First re-value the negative units at the new restock unit cost: `stock_value := stock_qty × (total paid ÷ qty)`. The difference becomes a cost adjustment. Then add the restock | Cost of items sold → "Cost adjustments" |
| C-25a | **Stock reaches exactly 0 but value isn't 0** (rounding leftovers or earlier misallocation) | Post the leftover value as a cost adjustment; value := 0 | Cost adjustments |
| C-25b | **Stock positive but value negative** (a late sale removed more than the pool held) | Post the difference so value := 0 | Cost adjustments |
| C-26 | **Void** returns the original line cost to the pool (C-21) | | — |
| C-27 | **Manual cost correction** (owner says the average is wrong): `stock_value := stock_qty × new cost`. The difference is a **stock value correction**, audit-logged | Info line "Stock value corrections" — **not** in profit, because no money was spent or lost |
| C-27a | **First cost for a product with unknown cost:** same as C-27 (no profit effect). Earlier sales keep cost 0 (`cost_missing`) | Info |

### 3.5 The owner's scenario, worked through (tests TC-COST-11, -12)

**Scenario A — exactly as raised:**

| Time | Event | Pool after (qty / value) | Average | Sale cost |
|---|---|---|---|---|
| 09:00 | Start | 10 / 10000 | 1000.0000 | |
| 10:00 | Offline sale of 2 recorded on phone (not uploaded) | (server unchanged) | | |
| 11:00 | Restock 10, paid GH₵150.00 | 20 / 25000 | 1250.0000 | |
| 14:00 | Late sale uploads; cost time 10:00 → history at 09:00 → 1000 | 18 / 23000 | **1277.7778** | **2 × 10.00 = GH₵20.00** |

- The sale keeps GH₵10/item.
- The future average is **GH₵12.78**, identical to processing in true time order (8 × 10 + 10 × 15 = 230; 230 ÷ 18).

**Scenario B — the same, plus an online sale of 3 at 12:00 (before the late upload):**

| Time | Event | Pool after | Average | Sale cost |
|---|---|---|---|---|
| 11:00 | Restock | 20 / 25000 | 1250.0000 | |
| 12:00 | Online sale of 3 (server doesn't yet know about the 10:00 sale) | 17 / 21250 | 1250.0000 | 3 × 12.50 = 37.50 |
| 14:00 | Late sale of 2 at 10.00 | 15 / 19250 | 1283.3333 | 20.00 |
| *True time order would give* | | *15 / 19167* | *1277.7778* | *12:00 sale: 38.33* |

**Result:**
- The 12:00 sale was costed GH₵0.83 too low, and the remaining stock carries GH₵0.83 too much value.
- Total cost is still exact (conservation holds). The GH₵0.83 simply reaches profit later, when the remaining 15 items are sold.
- No recorded figure is rewritten.

This residual misallocation (limitation L2) only occurs when **another sale of the same product is recorded between a late sale's real time and its upload, and a restock happened in that window**. It is bounded by (average difference × quantity of those in-between sales).

**Not in the MVP:** a full "replay" that would correct in-between sales by posting a correcting adjustment. It is possible, but adds real complexity (re-ordering every event since the late sale). It is recorded as a **candidate improvement only if pilot data shows material amounts**. The pilot logs the size of every such misallocation (C-58) so the decision can be made on evidence.

### 3.6 Sale time and time confidence (C-90 – C-95)

Phone clocks can be wrong, or deliberately changed. Each offline sale carries:
- the phone's wall-clock time
- the phone's **elapsed time since boot** (Android's monotonic clock, which a user cannot change in settings)
- a boot ID

At every sync, the phone sends its current wall-clock and elapsed time.

| ID | Check | Outcome |
|---|---|---|
| C-90 | **Elapsed-time verification:** if the sale and the sync happened in the same boot session, then true sale time = server time at sync − (elapsed at sync − elapsed at sale). This works even if the wall clock was changed | `occurred_at` = verified time; confidence **high** (differences over 2 minutes from the phone's wall clock are noted) |
| C-91 | Different boot session (phone restarted): use the phone's wall clock, checked against the device's **clock offset** (measured at each sync). If the offset at the last sync was ≤ 5 minutes | Confidence **medium** |
| C-92 | **Red flags:** sale time later than upload time (beyond 5 minutes); more than 30 days before upload; earlier than the device's registration or the product's creation; earlier than a previous receipt number from the same device (clock went backwards); large offset at last sync | Confidence **low**; sale flagged in Needs attention: "Check this sale's time" |
| C-93 | **Low confidence:** reports and costing use `received_at` (upload time). The phone's claimed time is kept for the record. The owner sees both | |
| C-94 | Stored: `occurred_at_device` (raw), `occurred_at` (best estimate), `time_confidence`, `time_check` details | |
| C-95 | **Purpose:** catches mistakes and casual manipulation. It is not a defence against a determined technical attacker. Acceptable for owner-only use; to be revisited when staff accounts are added [A] | |

### 3.7 Two devices with overlapping or conflicting times

- **Sales never change the average** (they remove value at the current average), so the order of two devices' sales relative to **each other** doesn't affect any sale's cost. Only their position relative to **cost-changing events** matters.
- **Cost-changing events (restock, stock adjustment, void, cost correction) are online-only in the MVP**, so their times are trusted server times. Every sale is placed against that single, reliable timeline using its best-estimate time (C-23a).
- **Exact ties:** the history row counts as earlier (C-23a).
- **Near ties within the time uncertainty** (e.g. a medium-confidence sale 1 minute after a restock): accepted as recorded. The possible error is one sale's cost difference. It is conserved (C-20) and logged (C-58).
- **Stock-level conflicts** (both phones sold the last item) are handled by discrepancies (06 §8.1) and don't affect costs.

### 3.8 Offline restocks and adjustments

**Decision: restocks, stock adjustments, voids and cost corrections stay online-only** (as already approved), and this is now a deliberate accounting safeguard:
- Every event that changes the average has a trusted server time and is processed immediately.
- Only **sales** can arrive late, and they are handled by sale-time costing plus the value pool.
- If offline restocks were ever allowed, a late restock would make already-recorded sales' costs wrong, which would need re-costing or replay. **Not planned.** If pilot shops strongly need offline restocking, the safe option is to queue it as a "pending restock" that changes nothing until uploaded.

### 3.9 Limitations (documented)

| # | Limitation | Effect | Mitigation |
|---|---|---|---|
| L1 | Sale time is estimated (C-90–C-95) | Wrong cost period possible for low-confidence or near-tie sales | Elapsed-time check; flags; fallback to upload time |
| L2 | In-between sales (§3.5, scenario B) | Small misallocation between those sales' cost and remaining stock value; total conserved | Logged (C-58); replay correction deferred unless pilot shows need |
| L3 | Negative stock | Sales while negative use the last average; corrected via cost adjustment at the next restock (C-25) | Visible as "Cost adjustments" |
| L4 | Unknown cost | Profit too high | Warning (C-54) |
| L5 | Corrections are not retroactive | Earlier sales keep their cost | Intentional |

### 3.10 Fallback (only if the value pool proves unreliable in testing)

Last-restock pricing:
- Cost = the most recent restock unit cost, with sale-time lookup.
- **Effect:** when prices rise, older stock is costed at the newer price and profit is understated; when prices fall, profit is overstated.
- The conservation guarantee does not hold, so this is a less safe option.

## 4. Losses and recoveries (C-30 – C-36)

| ID | Rule |
|---|---|
| C-30 | **Stock losses** = stock-reducing adjustments with reason *damaged*, *expired*, *missing/theft*, *own use*, *count correction (decrease)*, valued at round_half_up(qty × current average) (C-21) |
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
| C-41 | **Cost of items sold** | Σ line_cost + Σ cost adjustments (C-25 – C-25b) dated in the period; adjustments shown as a sub-line |
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
| C-55 | **Stock value** (info) | Σ stock_value over products with stock_qty > 0 |
| C-56 | **Late uploads note** | Count of sales in the period with `received_at` after the period ended |
| C-57 | **Stock value corrections** (info) | Σ manual cost-correction value changes (C-27); not in profit |
| C-58 | **Late-sale cost difference** (diagnostic) | For each late sale: Σ qty × (average at upload time − sale-time cost). Logged per product to measure L2; not a profit figure |

**C-56 (late uploads):** a sale uploaded late is **added** to the day on which it happened. That is a new record, not a change to existing records. If that day was already **closed**, the confirmed figures remain as they were, and the late sale is shown separately (§11).

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

**Start of day (qty / value in pesewas):** Milo 40 / 16000 (avg 4.00); Sugar 20 / 19000 (9.50); Sardine 10 / 11000 (11.00); Rice 5 / 35000 (70.00). Opening cash GH₵200.00. Yaw owes GH₵12.00. All sales are online, so the sale-time cost equals the current average.

| # | Event | Calculation |
|---|---|---|
| 1 | Restock 12 Sardine, paid GH₵139.20 | pool 22 / 24920 → avg **1132.7273** |
| 2 | Sale 2 Milo @5.00 + 1 Sugar @12.00 = **22.00** Cash | cost 17.50 |
| 3 | Sale 3 Sardine @15.00 = 45.00 − 5% (2.25) = **42.75** MoMo | cost round(3 × 1132.7273 = 3398.18) = 33.98; pool 19 / 21522 |
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

## 11. Day close and confirmed reports (C-100 – C-104)

**Goal:** late-arriving transactions are recorded truthfully, without rewriting figures the owner has already confirmed.

| ID | Rule |
|---|---|
| C-100 | **Close the day** (with the cash count, 04 §5) stores an **immutable day snapshot**: every figure in §5 for that day, the closing time, and the list of included record IDs |
| C-101 | Reports are always calculated from the underlying records, but for a **closed day** they show the snapshot as **"Confirmed figures"**, then any records added or changed after closing as **"Changes after closing"**, then the **"Current total"** |
| C-102 | **Changes after closing:** late-uploaded sales that happened that day, voids of that day's sales, and cancellations. Each is listed with its upload or action time. Cost adjustments are dated when processed, so they never appear in an earlier day |
| C-103 | A snapshot is never edited. Closing the same day again (re-count) creates a **new version** and keeps the old one (audit) |
| C-104 | Weekly and monthly reports sum days and show "Includes N changes after days were closed (GH₵ X)". Nothing changes silently |

**Example:**
- 12 Nov closed at 19:00, confirmed sales GH₵1,240.50.
- On 13 Nov at 08:30, a 12 Nov offline sale of GH₵22.00 uploads.

The 12 Nov report shows:
- Confirmed (19:00): GH₵1,240.50
- Changes after closing: + GH₵22.00 (1 late sale, uploaded 13 Nov 08:30)
- Current total: GH₵1,262.50
