# 05 — Financial Calculations

**Revision 5.1.**
- Partial supplier payments confirmed (§12.1).
- Proportional allocation of purchase-cost corrections (§12.2).
- Purchases at full acquisition cost, with supplier credit (§12).
- Anchor-based sale-time design (§3.6).
- Visible cost adjustments with Needs attention items (§3.4).
- Original daily closing plus separate adjustments (§11).
- A precise conservation statement (§3.2).
- Own use shown separately below net profit, at cost (§4, approved).

Revision 4 introduced the value-pool weighted average with sale-time costing.
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
| C-20 | Each product keeps `stock_qty` (integer) and **`stock_value`** (integer pesewas). **Average cost = stock_value ÷ stock_qty** whenever stock_qty > 0. Not stored; computed exactly. Rounded only when a movement's value is calculated |
| C-21 | Every change to the pool is a recorded stock movement with an exact value. These are the **only** ways stock value can change:<br>• **Opening stock:** + qty, + qty × entered cost<br>• **Purchase (restock):** + qty, + **full acquisition cost** (purchase cost, *not* the amount paid; see §12)<br>• **Purchase correction:** ± qty and/or ± value, correcting a recorded purchase (§12, C-116)<br>• **Sale:** − qty, − sale-time line cost (C-23)<br>• **Void (customer return):** + qty, + the original line cost<br>• **Return to supplier:** − qty, − round_half_up(qty × average) (§12, C-117)<br>• **Stock loss** (damaged, expired, missing/theft, count down): − qty, − round_half_up(qty × average)<br>• **Own use** (goods taken for personal use): − qty, − round_half_up(qty × average)<br>• **Stock found** (count up): + qty, + round_half_up(qty × average)<br>• **Owner cost correction:** ± value only (C-27)<br>• **Cost adjustment:** ± value only, in the visible cases of §3.4 |
| C-22 | After every movement, the server writes one `product_cost_history` row: time (server), stock_qty, stock_value, and average (4 dp) |

**Stock-cost conservation statement** (verified by test TC-COST-20 for every product and every period):

```
Closing stock value
  = Opening stock value (start of period; for a new product, its opening-stock entry)
  + Purchases at full acquisition cost (paid and unpaid)
  ± Purchase price corrections: remaining-stock share only (the already-sold, loss and own-use shares appear in those lines, §12.2)
  + Customer returns (voids, at original sale cost)
  + Stock found (count increases, at average)
  ± Owner cost corrections
  − Returns to supplier (at average)
  − Cost of items sold (sale-time costs)
  − Stock losses (damaged, expired, missing/theft, count decreases, at average)
  − Goods taken for own use (at average)
  ± Cost adjustments (§3.4: negative-stock revaluation, zero-stock leftover, negative-value correction, supplier-return difference)
```

**What this guarantee means, and what it doesn't:**
- It is a **bookkeeping identity enforced by construction**: stock value can only change through the movement types above, each is recorded, and the test proves no change happens outside them, whatever order offline sales arrive in.
- It does **not** prove the figures are economically right. That still depends on the owner entering correct purchase costs, doing stock counts, and on sale-time estimates (§3.6).

### 3.3 Cost of a sale: sale-time ("as-of") costing (C-23 – C-23c)

| ID | Rule |
|---|---|
| C-23 | **Cost time** = the sale's `occurred_at` (best estimate, §3.6). If time confidence is **low**, the upload time is used (C-96) and `cost_basis = received_at` is recorded |
| C-23a | `unit_cost` = the average from the **latest `product_cost_history` row at or before the cost time**. If none is that early, the earliest row is used and `cost_basis_adjusted` is set. Equal timestamps: the history row counts as earlier |
| C-23b | `line_cost = round_half_up(qty × unit_cost)`. This exact amount is removed from the pool (C-21) |
| C-23c | The phone's provisional cost is stored as `device_unit_cost` for audit only. If it differs, the sale detail explains why |
| C-24 | **Unknown cost** (product never had a cost): `unit_cost = 0`, `cost_missing = true`, nothing removed from value, report warning |
| C-28 | **Pending sales on the phone** use the phone's cached average for display only, labelled "estimated" until uploaded |
| C-29 | **A recorded sale's cost never changes** — not after restocks, cost corrections or later uploads |

### 3.4 Edge cases: visible cost adjustments, never silent (C-25 – C-27, C-120 – C-126)

**Principles:**
- The app **never changes a stock quantity by itself**. Quantities change only through sales, purchases, returns and owner-entered adjustments.
- The app **never changes stock value without a recorded movement**. Every automatic **cost adjustment** is dated when processed (history is not rewritten), shown in reports, and raises a **Needs attention** item that explains three things:
  - **what happened**
  - **the financial effect** in GH₵
  - **what the owner should do**

| ID | Situation | Rule | Reported as |
|---|---|---|---|
| C-25 | **Purchase recorded while stock is negative** (items were sold before their purchase was recorded) | The negative units are re-valued at this purchase's unit cost; the difference is a cost adjustment; then the purchase is added | Cost of items sold → "Cost adjustments" |
| C-25a | **Stock reaches exactly 0 but value isn't 0** | The leftover value is posted as a cost adjustment | Cost adjustments (amounts under GH₵0.10 shown as "Rounding") |
| C-25b | **Stock positive but value negative** (e.g. a late sale removed more value than remained) | A cost adjustment brings value to 0, and **a "Cost check needed" alert is raised**, because this signals a wrong purchase cost or a missed restock | Cost adjustments |
| C-25c | **Return to supplier refund differs from the value removed** | The difference is a cost adjustment (§12, C-117) | Cost adjustments |
| C-26 | Void returns the original line cost (C-21) | | — |
| C-27 | **Owner cost correction** (owner says the average is wrong): `stock_value := stock_qty × new cost`; the difference is a value correction, audit-logged | | Info line "Stock value corrections" (not profit) |
| C-27a | **First cost for a product with unknown cost:** as C-27. Earlier sales keep cost 0 (`cost_missing`) | | Info |

**Needs attention items** (shown on Today and in the Stock issues screen; each with plain-language text):

| ID | Item | Example message | Financial effect shown | Action offered | Clears when |
|---|---|---|---|---|---|
| C-120 | **Negative stock** | "Sardine shows **−2**. You sold 2 more than the app knew you had." | "These 2 were costed at GH₵11.00 each (GH₵22.00), an estimate until you record the purchase or correct the count." | **Count and correct** · **Record a missed restock** · **Cancel a wrong sale** | Stock ≥ 0 through an owner action |
| C-121 | **Negative stock value** (with negative qty) | Shown inside C-120: "Value −GH₵22.00 = the estimated cost of items sold without a recorded purchase." | As above | As above | As above |
| C-122 | **Cost adjustment posted** (C-25, C-25a ≥ GH₵0.10, C-25c) | "Sardine purchase on 12 Nov re-valued 2 items already sold: **+GH₵1.20** cost, because they were bought at GH₵11.60, not the GH₵11.00 estimated." | Amount and direction (profit lower / higher) | **View details** · **I understand** (acknowledgement is recorded) | Acknowledged |
| C-123 | **Cost check needed** (C-25b) | "Milo's stock value went below zero (−GH₵3.40) after a late sale. This usually means a purchase cost was entered too low or a restock was missed." | "Cost of items sold increased by GH₵3.40." | **Check recent purchases** · **Correct cost price** · **I understand** | Owner acts or acknowledges |
| C-124 | **Cost missing** | "3 products have no cost price, so profit looks higher than it really is." | "N sales lines costed at GH₵0.00." | **Add cost prices** | Cost set |
| C-125 | **Sale time uncertain** | §3.6 | "Counted on [upload day] instead of [claimed day]." | **View sale** · **I understand** | Acknowledged |
| C-126 | **Changes to a closed day** | §11 | "+GH₵22.00 sales added to 12 Nov after closing." | **View changes** | Acknowledged |

- Acknowledging an item **never changes any figure**. It only records that the owner has seen it.
- Unresolved items remain listed.

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

### 3.6 Sale time: anchors, reboot detection and confidence (C-90 – C-97)

**Why elapsed time alone isn't enough:** Android's elapsed time (time since the phone was switched on) can't be changed in settings, but it **restarts from zero after every reboot**. It is only meaningful relative to an anchor taken in the **same boot session**. The design therefore combines four sources, each with known weaknesses:

| Source | Strength | Weakness |
|---|---|---|
| **Server time** (at every successful contact) | Trusted | Only available online |
| **Elapsed time since boot** | Can't be changed by the user; steady | Resets on reboot |
| **Boot session ID** (Android boot counter where available; otherwise a reboot is detected when elapsed time goes **down**) | Detects reboots | Boot counter availability via Expo to be confirmed [A]; the fallback check always works |
| **Phone wall clock** | Always available | Can be wrong or changed |

**Rules:**

| ID | Rule |
|---|---|
| C-90 | **Anchors.** Whenever the app reaches the server (login, sync heartbeat, any online action), it stores an **anchor**: server time, elapsed time, boot ID and wall-clock time. The server keeps the same anchors per device |
| C-91 | **Every sale records** the wall-clock time, elapsed time, boot ID, the ID of the latest anchor, and a per-device sequence number |
| C-92 | **Reboot detection:** boot ID changed, or elapsed time lower than the last recorded value → new boot session. The app records a "reboot detected" event. A sale in a new boot session has **no elapsed-time link** to anything before the reboot |
| C-93 | **Wall-clock change detection:** within one boot session, `wall clock − elapsed` should stay constant. A jump of more than 2 minutes is recorded as a "clock changed" event (with the size of the change) |
| C-94 | **Time bounds:** every sale must lie between a **lower bound** (the later of the device's previous sale time estimate and the latest anchor before it) and an **upper bound** (the server time when it was uploaded) |
| C-95 | **Confidence:**<br>• **High:** an anchor exists **in the same boot session** before the sale. Estimated time = anchor server time + (sale elapsed − anchor elapsed). The wall clock is not used<br>• **Medium:** no same-session anchor (the phone rebooted while offline), but the wall clock lies within the bounds (C-94), no clock change was detected since the last anchor, and the clock offset at the last anchor was ≤ 5 minutes. Estimated time = wall clock<br>• **Low:** anything else (wall clock outside the bounds, clock changed while offline, large offset, sequence out of order) |
| C-96 | **Fallback for low confidence:** the sale is **accepted, never rejected**. It is costed and reported at its **upload time**, and the known window ("between Mon 09:12 and Tue 14:00") is shown. A **Sale time uncertain** item is raised (C-125). The wall-clock time claimed is kept for the record. In the MVP the owner cannot edit sale times |
| C-97 | **Limits:** the design catches wrong clocks, reboots and casual clock changes. It cannot stop a determined technical attacker who modifies the app. Acceptable for owner-only use; to be re-assessed before staff accounts [A] |

**Examples:**

| Case | Result |
|---|---|
| Anchor at 08:00 (sync); offline; sale at elapsed +2 h; no reboot | **High**: 10:00, even if the wall clock says 07:00 |
| Phone dies at 11:00, restarts, sale at 12:30 by wall clock; previous sale 10:50; uploaded 15:00; clock offset at last anchor 1 min; no clock change | **Medium**: 12:30 |
| Same, but the wall clock says yesterday 21:00 (before the previous sale) | **Low**: reported at 15:00 (upload), window shown, flagged |

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
| L1 | Sale time is estimated (C-90 – C-97) | Wrong cost period possible for medium-confidence or near-tie sales | Anchors, reboot and clock-change detection, bounds; low confidence → upload time and flag |
| L2 | In-between sales (§3.5, scenario B) | Small misallocation between those sales' cost and remaining stock value; total conserved | Logged (C-58); replay correction deferred unless pilot shows need |
| L3 | Negative stock | Sales while negative use the last average; corrected via cost adjustment at the next purchase (C-25) | Needs attention items C-120 – C-122 |
| L6 – L9 | Purchases and suppliers | See §12 | |
| L4 | Unknown cost | Profit too high | Warning (C-54) |
| L5 | Corrections are not retroactive | Earlier sales keep their cost | Intentional |

### 3.10 Fallback (only if the value pool proves unreliable in testing)

Last-restock pricing:
- Cost = the most recent restock unit cost, with sale-time lookup.
- **Effect:** when prices rise, older stock is costed at the newer price and profit is understated; when prices fall, profit is overstated.
- The conservation guarantee does not hold, so this is a less safe option.

## 4. Losses, own use and recoveries (C-30 – C-37)

| ID | Rule |
|---|---|
| C-30 | **Stock losses** = stock-reducing adjustments with reason *damaged*, *expired*, *missing/theft*, *count correction (decrease)*, valued at round_half_up(qty × current average) (C-21) |
| C-31 | **Stock found** (increasing count corrections) is **not** income; information only (approved) |
| C-32 | Resolving a negative-stock discrepancy by an increasing correction has no profit effect |
| C-33 | **Bad debts written off** (period) = Σ `write_off` amounts dated in the period − Σ `write_off_undo` amounts dated in the period |
| C-34 | Balance **corrections** (`adjustment`) do not affect profit |
| C-35 | **Recovered bad debts** (period) = Σ `debt_recoveries` amounts dated in the period. Money received for a debt that was **correctly** written off. Shown as its own positive line |
| C-36 | Undo and recovery are **different events** (§7.2); one payment is never counted as both |
| C-37 | **Goods taken for own use** = own-use adjustments at average. **Not a business cost:** like the owner paying themselves. Shown below estimated net profit as "Goods taken for own use", with stock reduced at cost (average), without reducing business profit (**approved**, decision 39) |

## 5. Report figures for a period (C-40 – C-59)

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
| C-59 | **Purchases and suppliers** (info) | Stock purchased, Paid to suppliers, Owed to suppliers (C-114) |

**C-56 (late uploads):** a sale uploaded late is **added** to the day on which it happened. That is a new record, not a change to existing records. If that day was already **closed**, the original closing figures remain as they were, and the late sale appears as a separate day adjustment (§11).

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

Goods taken for own use        GH₵   0.00   (not a business cost)
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
| C-80 | Expected cash = opening + cash sales + cash paid-now + cash repayments + cash recoveries + cash refunds from suppliers − operating expenses paid from the cash drawer − purchase and supplier payments from the cash drawer (same day) |
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

## 11. Daily closing: original figures preserved, adjustments separate (C-100 – C-106)

**Goal:** what the owner confirmed at closing is kept exactly as it was. Anything that arrives or changes later appears as a **separate, itemised adjustment**, with a **current adjusted total** available alongside.

| ID | Rule |
|---|---|
| C-100 | **Close the day** (with the cash count, 04 §5) stores the **original closing record**: every figure in §5 for that day, the cash count, the closing time, and the IDs of all records included. It can be created **once per day** and is **never edited or replaced** |
| C-101 | **Day adjustments:** any later event that affects a closed day's figures creates a **day adjustment** record linked to that day: what it was, which figures it changes and by how much, when it happened, and who did it. Day adjustments are append-only |
| C-102 | **Events that create day adjustments:** late-uploaded sales that happened that day; voids or cancellations of that day's sales; back-dated expenses, repayments, recoveries or supplier payments dated that day; a cash recount after closing (recorded as a "cash recount" adjustment; the original count stays) |
| C-103 | **Not day adjustments:** cost adjustments, purchase corrections and owner cost corrections are dated **when processed**, so they appear on the processing day, never on an earlier closed day |
| C-104 | **Display for a closed day:** **Original closing figures** (time, who) → **Adjustments after closing** (each item with its date and time, and its effect) → **Current adjusted total** = original + Σ adjustments |
| C-105 | **Consistency check:** the current adjusted total must equal a fresh calculation from the underlying records. Any mismatch is a defect (test TC-CLOSE-07), never silently "fixed" |
| C-106 | **Weekly and monthly reports** sum current adjusted totals, and also show "Includes N adjustments to closed days (GH₵ X)". The original closing figures stay available per day |

**Example:**
- 12 Nov closed at 19:00 with sales GH₵1,240.50 and counted cash GH₵227.00.
- 13 Nov 08:30: a 12 Nov offline sale of GH₵22.00 (cash) uploads.
- 13 Nov 09:00: the owner recounts and finds the 12 Nov cash was actually GH₵249.00.

| 12 Nov | Sales | Expected cash | Counted cash |
|---|---|---|---|
| **Original closing (19:00, Ama)** | 1,240.50 | 227.00 | 227.00 |
| Adjustment: late sale A-000131, uploaded 13 Nov 08:30 | + 22.00 | + 22.00 | |
| Adjustment: cash recount, 13 Nov 09:00 | | | → 249.00 |
| **Current adjusted** | **1,262.50** | **249.00** | **249.00** (balanced) |

## 12. Stock purchases and supplier credit (C-110 – C-118)

**Principle:** stock value increases by the **full acquisition cost** of the goods, whatever was paid at the time. Payment is a separate matter of cash and amounts owed, not cost.

| ID | Rule |
|---|---|
| C-110 | **Recording a purchase (restock)** captures: quantity; **purchase cost** (the full agreed price of the goods, required); **amount paid now** (0 to purchase cost); paid from (cash drawer / MoMo / other); supplier name (optional free text); date |
| C-111 | **Stock value** increases by the **purchase cost** (C-21), e.g. goods worth GH₵500 with GH₵300 paid → stock value **+GH₵500** |
| C-112 | **Unpaid amount** of a purchase = purchase cost − amount paid now − later payments ± purchase cost corrections. It must stay ≥ 0 |
| C-113 | **Paying for an earlier purchase** ("Pay supplier") is linked to that purchase. **Any number of partial payments** are allowed, each ≤ the amount still owed (§12.1); paid from. It changes **no stock value and no profit**, only cash/MoMo out and the amount owed |
| C-114 | **Reports (information, not profit):** Stock purchased (Σ purchase cost); Paid to suppliers (by method, including paid-now); **Owed to suppliers** (Σ unpaid, with a list of unpaid purchases) |
| C-115 | **Cash count:** purchase payments and supplier payments **from the cash drawer** reduce expected cash; supplier refunds received in cash increase it (C-80) |
| C-116 | **Purchase correction:** price corrections are split between goods already sold or used and remaining stock (§12.2); quantity corrections change quantity only (C-116f). Never by editing the original purchase |
| C-117 | **Return to supplier:** stock − qty, value − (qty × average). The supplier's credit is recorded as a refund (cash/MoMo in) **or** a reduction of a chosen purchase's unpaid amount. Any difference between the credit and the value removed is a visible cost adjustment (C-25c) |
| C-118 | **Delivery and transport costs** are **not** added to stock cost in the MVP; they are recorded as an operating expense ("Stock transport") |

**Example:** goods worth GH₵500, GH₵300 paid from the cash drawer, GH₵200 owed.

| Effect | Amount |
|---|---|
| Stock value | **+500.00** |
| Expected cash today | −300.00 |
| Owed to suppliers | +200.00 |
| Profit today | 0 (the cost reaches profit only as the goods are sold) |

Later payments, including partial ones, reduce the amount owed only (§12.1).

### 12.1 Partial supplier payments (C-113 confirmed)

A purchase can be paid in **any number of partial payments**. Each payment must be ≤ the amount still owed. The amount owed never goes below zero.

| Step | Event | Paid so far | Owed | Stock value | Expected cash / MoMo | Profit |
|---|---|---|---|---|---|---|
| 1 | Purchase: goods GH₵500, paid GH₵300 from cash drawer | 300 | **200** | **+500** | cash −300 | 0 |
| 2 | Pay supplier GH₵100 by MoMo | 400 | **100** | unchanged | MoMo −100 | 0 |
| 3 | Pay supplier GH₵100 cash | 500 | **0** | unchanged | cash −100 | 0 |
| 4 | Try to pay GH₵50 more | — | — | — | — | **Rejected:** "Nothing is owed on this purchase." |

**Rules that keep payments from being counted twice:**
- Supplier payments are **never operating expenses**. They are stored in `supplier_payments`, not `expenses`, and appear only in "Paid to suppliers" and in cash/MoMo out.
- The cost of the goods reaches profit **once**: through cost of items sold, losses or own use, as the goods leave stock.
- The expense form has **no "stock purchase" category**. If the owner types words like "stock", "goods" or "supplier" in the note, the app suggests: "Buying stock or paying a supplier? Use Restock or Pay supplier instead, so it isn't counted twice."
- Each payment request is idempotent, and payments on the same purchase are processed one at a time under a lock, so double-taps or two phones can't overpay.

### 12.2 Purchase-cost corrections when some goods are already sold (C-116, C-116a – C-116e)

**Problem:** a purchase of 10 units was entered as GH₵100 but really cost GH₵120. By the time the error is found, some of those units have been sold, some taken for own use, and some are still on the shelf. Putting the whole GH₵20 into remaining stock would understate the cost of goods already sold, and overstate the cost of goods sold later.

**Solution: proportional allocation using the value pool's own history.** Under weighted-average costing, whenever units leave stock, they take the same fraction of **every** purchase's value still in the pool. So the share of a purchase still on the shelf can be calculated exactly from the product's movement history since that purchase.

| ID | Rule |
|---|---|
| C-116 | **Price correction** of ΔC (± pesewas) to a purchase is recorded against the original purchase (never edited), with a reason. It is processed and dated **now** |
| C-116a | **Remaining fraction:** start with f = 1 at the purchase. Walk through every stock movement since that purchase, in recorded order:<br>• for each **outflow** (sale, stock loss, own use, return to supplier) of q units when stock before was Q > 0: that outflow's share = f × q ÷ Q, and f becomes f × (Q − q) ÷ Q<br>• **inflows** (later purchases, stock found, voids) don't change f<br>• if an outflow takes stock to 0 or below, its share is all of the remaining f, and f becomes 0<br>Fractions are exact decimals (no floating point) |
| C-116b | **Allocation of ΔC:**<br>• **Remaining stock:** f × ΔC is added to stock value<br>• **Already sold:** Σ sale shares × ΔC is posted as a cost adjustment ("Correction to purchase of 12 Nov: goods already sold")<br>• **Stock losses:** Σ loss shares × ΔC is added to stock losses<br>• **Own use:** Σ own-use shares × ΔC is added to "Goods taken for own use"<br>• **Returns to supplier:** Σ return shares × ΔC is posted as a supplier-return difference |
| C-116c | **Rounding:** each part is rounded half up to the pesewa. Any leftover pesewa goes to the remaining-stock part (or, if f = 0, to the already-sold part), so the parts add up to ΔC exactly |
| C-116d | **No history is rewritten:** recorded sale costs, past reports and closed days stay as they are. All parts are dated when the correction is made, and shown in a Needs attention item listing each part (C-122) |
| C-116e | **Unpaid amount** changes by ΔC. If a reduction would make it negative (the owner already paid more than the corrected cost), the owner must record how the supplier settled it: **refund received** (cash/MoMo, included in the cash count) in the same step. "Supplier owes you" balances aren't kept in the MVP |
| C-116f | **Quantity correction** (received a different quantity than entered, with the total cost unchanged): stock qty changes by the difference with **no value change**, so the purchase's total cost stays in the pool and the average adjusts. If stock reaches 0 or below, the normal visible rules apply (C-25a, C-120). A Needs attention item explains the effect |

**Worked example (test TC-PUR-12):**

Start: 10 units in stock worth GH₵80. Purchase P: 10 units entered at **GH₵100** (true cost GH₵120).

| Event after P | Stock before → after | Share of P taken | f after |
|---|---|---|---|
| P recorded | 10 → 20 | — | 1.00 |
| Sale of 5 | 20 → 15 | 1.00 × 5/20 = **0.25** (sold) | 0.75 |
| Own use 1 | 15 → 14 | 0.75 × 1/15 = **0.05** (own use) | 0.70 |
| Purchase of 6 more | 14 → 20 | — (inflow) | 0.70 |
| Sale of 4 | 20 → 16 | 0.70 × 4/20 = **0.14** (sold) | **0.56** |

*Only quantities are needed to work out the shares.*

Correction ΔC = **+GH₵20.00**:

| Part | Share | Amount | Reported as |
|---|---|---|---|
| Already sold | 0.25 + 0.14 = 0.39 | **GH₵7.80** | Cost of items sold → cost adjustment (today) |
| Own use | 0.05 | **GH₵1.00** | Goods taken for own use (today) |
| Remaining stock | 0.56 | **GH₵11.20** | Added to stock value |
| **Total** | 1.00 | **GH₵20.00** | |

**Check:** recalculating the whole history as if P had been entered at GH₵120 from the start gives exactly the same split. The two sales would have cost GH₵5.00 + GH₵2.80 = GH₵7.80 more, own use GH₵1.00 more, and the remaining 16 units would be worth GH₵160.00 instead of GH₵148.80 (+11.20).

Full figures, as entered (P at 100):
- pool 20 / 180
- sale of 5 costs 45.00 → 15 / 135
- own use 9.00 → 14 / 126
- +6 for 60.00 → 20 / 186
- sale of 4 costs 37.20 → 16 / 148.80

After the correction: 16 / **160.00**, which is what it would have been had P been entered at 120 from the start.

**The allocation is exact** whenever the movements since the purchase were recorded in time order, with no negative stock and no voids in between. Because weighted averaging is proportional, the share method equals a full recalculation, without rewriting anything.

**Where it is an approximation (limitation L8):**
- Offline sales that happened before the purchase but were uploaded after it are counted as if they came after it.
- Voids are treated as new inflows rather than as returning a share of the original purchase.
- A period of negative stock ends the purchase's share.

In these cases the split between "already sold" and "remaining stock" can be slightly off. The **total is always exact** (ΔC), and only timing between periods is affected.

**Timing effect on profit (all cases):** the "already sold" part reduces profit **in the period of the correction**, not in the earlier periods when the goods were sold. Those periods, and any closed days, are not restated. Reports label the line "Correction to earlier purchase", so the owner can see why profit moved.

**Limitations (documented):**
- **L6:** no full supplier accounts. There are no supplier records, statements or balances across purchases. Each unpaid amount belongs to one purchase, with supplier name as free text. A supplier ledger is a future feature.
- **L7:** transport costs are expensed immediately rather than included in item cost. Gross profit per item is slightly higher, and net profit is the same over time, with a timing difference.
- **L8:** purchase price corrections are split proportionally (§12.2): exact for in-order history; an approximation when late uploads, voids or negative stock occur after the purchase; the already-sold share is reported in the period of the correction (no restatement). The total is conserved.
- **L9:** no settlement discounts or supplier credit notes beyond returns. A supplier forgiving part of a debt is recorded as a purchase cost correction (lower cost), which is economically correct.
