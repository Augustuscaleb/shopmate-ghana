# 04 — Workflows

**Revision 5.** All writes that change money, stock or balances run as **one all-or-nothing server transaction** (a database function) with an idempotency key and fixed lock order. See [09-data-model.md §4](09-data-model.md). Table names refer to 09.

---

## 1. Sales

### 1.1 Record a sale (F-08, F-09, F-10) 📴

1. Build the cart. Each line has a product, quantity (whole number ≥ 1) and unit price (defaults to the selling price; the owner may change it for this sale, e.g. after bargaining).
2. Optional sale discount: an amount, or a percentage converted to an amount (see 05). The discount cannot exceed the subtotal.
3. Choose a payment method:

| Method | Required | Optional |
|---|---|---|
| Cash | — | Amount received (only for showing change; not stored as revenue) |
| MoMo | — | MoMo reference (≤ 30 characters) |
| Credit | Customer (existing, from cached list) | Paid now amount (0 < paid now < total) + method (Cash/MoMo) + MoMo reference |

4. On **Charge**, the app:
   - creates the sale ID (UUID) and receipt number (see 06 §5)
   - records `occurred_at` (the phone time of the sale) and a **provisional** cost from the cached average, for on-phone display only (C-28)
   - writes the sale to the **outbox**
   - updates **local** stock
   - shows **Sale complete**
5. The sync engine sends the sale to the server function `record_sale` (see 06).

**Server-side result of `record_sale`:**
- `sales` row (status `recorded`, with best-estimate sale time and time confidence, 05 §3.6) + `sale_items` rows. Each line is costed **as at the time the sale happened** (`occurred_at`, from the product cost history), not at upload time (C-23 – C-23c). The phone's provisional cost is stored for audit only. The cost is fixed from then on (C-29)
- one `stock_movements` row per line (`type = sale`, − quantity, − line cost)
- `products.stock_qty` and `stock_value` reduced atomically (value by the sale-time line cost, so a late sale leaves the correct average, 05 §3.5); any C-25a/C-25b cost adjustment posted; a cost history row written
- for a credit sale: a `customer_ledger` entry of `credit_sale` (+ total) and, if paid now > 0, a `repayment` entry (− paid now) with the same sale link
- stock discrepancy rows for any product that went below zero (offline sales only)
- an audit log entry

### 1.2 Online stock validation (approved rule)

- If the sale is sent **while online at the moment of sale** and any line's quantity exceeds server stock, the server **rejects** the sale. The app shows: "Only 2 Sardine in stock. Correct the stock, or reduce the quantity."
- The app offers **Correct stock**, which opens an adjustment (count correction), then returns to the cart.
- **How "online" is decided:** the app attempts `record_sale` immediately with `mode = online` and a short timeout (about 8 seconds).
  - If the network fails or times out, the sale is kept as **Pending** and later sent with `mode = offline`. The customer is never kept waiting.
  - If the online check is rejected for stock, the sale is **not** queued; the owner chooses what to do.

### 1.3 Offline sale causing negative stock (approved rule)

- Accepted. A `stock_discrepancies` row is created (product, sale, shortfall).
- Shown in **Needs attention** and on the product. Resolved by an adjustment (§2.3).
- The original records are never changed or deleted.

### 1.4 Void a sale (F-12) 🌐

- Requires a reason (pick list: "Customer returned items", "Wrong item/quantity", "Duplicate entry", "Other" + text).
- The server, in one transaction:
  - sets `voided_at` and `void_reason`
  - adds reversing stock movements (`type = void`, positive quantity) that return the **original line cost** to the product's stock value (C-21, C-26)
  - for credit sales, adds a `void_reversal` ledger entry that cancels the **outstanding** credit from that sale (see 05 §7)
  - writes an audit entry
  - if the void brings a product's stock back to ≥ 0, open discrepancies caused by **this sale** are resolved with resolution `sale_voided`
- Voided sales stay visible (struck through) and are excluded from totals.
- A pending (not yet synced) sale **cannot be voided** until it syncs. Unsent sales use §1.5 instead.
- Partial returns are **future**. In the MVP, void the sale and re-record the correct one.

### 1.5 Cancel a sale that was never uploaded 🌐

Replaces the earlier "DISCARD" idea. Goal: allow a genuine mistake to be removed **without** risking accidental loss or quiet manipulation of records.

**When it is offered:** only for sales on this phone with status **Pending** or **Failed** (never confirmed by the server). Synced sales must be **voided** (§1.4), never cancelled.

**Steps:**

1. **Internet is required.** The app first asks the server for the sale's status (`get_sale_status`).
   - **Server already has it** (the upload worked but the reply was lost): the sale is marked Synced, and the owner is told "This sale was already recorded. Use Cancel sale (void) instead." **No cancellation is possible.**
   - **Server has it as cancelled:** marked cancelled (an earlier attempt finished).
   - **Server doesn't have it:** continue.
2. **Reason (required):** Entered by mistake · Duplicate of another sale · Test or practice sale · Customer didn't take the goods · Other (text required).
3. **Review screen:** receipt number, date and time, items, total, payment method and customer (for credit). Shown with the warning in plain words: "This sale will not count in your sales, stock or customer balances. A record of the cancellation is kept."
4. **Explicit confirmation:** the owner taps **Cancel this sale** and then **re-enters their account password** (or the phone's PIN/fingerprint if app lock is on). This stops a casual tap, or another person using the phone, from removing records.
5. **Server records it** (`cancel_unsent_sale`, one transaction):
   - the sale (full items and amounts) is stored with status `cancelled_unsent`, reason, note, who, which device, when
   - **no** stock movements, ledger entries or report totals
   - an audit log entry
   - the sale ID is now permanently reserved: if any stale copy is uploaded later, the server answers "cancelled" (09 §4.3)
6. **Only after the server confirms**, the phone removes the sale from the outbox, restores the locally displayed stock, and shows it in history as "Cancelled before upload".

**Visibility (anti-manipulation):**
- Cancelled-before-upload sales remain visible in Sales history (filter "Cancelled") with their reason.
- Reports show "Cancelled before upload: N sales, GH₵ X".
- The receipt number is never reused, so gaps are explained.

**What happens to a sale that never reaches the server?**

| Case | Outcome |
|---|---|
| Phone is still working | The sale stays **Pending or Failed** on the phone until it is uploaded, or cancelled through the steps above. It is never deleted automatically and never expires |
| Owner cannot get internet | The sale can't be cancelled; it stays on the phone. Logout and account switching are blocked (SY-43, SY-42) |
| Phone lost, broken or app uninstalled before upload | The sale is **lost**. This is the accepted residual risk (SY-44). It is reduced by daily-sync prompts and the "waiting to upload" banner |
| Failed because the app is outdated | Cancellation is **not** suggested; the app asks the owner to update, then Retry |

## 2. Inventory

### 2.1 Create or edit a product (F-03, F-04) 🌐

- **Required:** name (unique per shop, case-insensitive), selling price > 0.
- **Optional:** category, unit, cost price (≥ 0; sets the initial average cost; if missing, profit shows a warning "cost price not set"), low-stock level (default from Settings, e.g. 5).
- **Correct cost price** (existing product): re-values the remaining stock at the new cost (`stock_value = stock_qty × cost`). The difference is recorded as a **stock value correction** (not profit); audit-logged; past sales unchanged (C-27).
- **Initial stock:** entered only at creation, and recorded as a movement of `type = opening`.
- **Archive** instead of delete. Archived products are hidden from selling, but their history remains.
- Price changes are audit-logged (old → new).

### 2.2 Restock (purchase) and supplier credit (F-05, F-27) 🌐

**Input:**
- Quantity received (whole number ≥ 1, or packs × units per pack).
- **Purchase cost:** the full price of the goods, entered as a total or per unit. Required.
- **Amount paid now:** defaults to the full purchase cost; can be anything from 0 up to the purchase cost.
- **Paid from:** cash drawer, MoMo or other.
- Supplier name (optional, free text) and a note.

**The form states clearly:**
> "Stock value increases by the full cost of the goods (GH₵ 500.00). You paid GH₵ 300.00 now; **GH₵ 200.00 will be recorded as owed to the supplier.**"

**Server** (one transaction):
- If stock is **negative**, the negative units are first re-valued at this purchase's unit cost. The difference is recorded as a **cost adjustment**, and a Needs attention item explains it (C-25, C-122).
- A movement is added: `type = restock`, + quantity, + **full purchase cost** (C-21, C-111).
- `stock_qty` and `stock_value` increase; the new average is value ÷ quantity.
- A `product_cost_history` row is written.
- A `purchases` record is created with purchase cost, paid now, paid from and supplier name. The **unpaid amount** is calculated (C-112).

If the product has open discrepancies, the app asks: "Was the stock count wrong before this restock?" and links to an adjustment. It does **not** auto-resolve.

**Pay supplier** (from the **Unpaid purchases** list, S-38) 🌐:
- Amount (≤ amount still owed), paid from, date. **Partial payments are supported, any number of times.** For example, GH₵500 purchase, GH₵300 paid at purchase, GH₵100 paid later → GH₵100 still owed (05 §12.1).
- Changes cash/MoMo out and the amount owed only. **No effect on stock value or profit, and never recorded as an expense** (C-113).

**Correct a purchase** (from the purchase in product history) 🌐:
- Choose **Correct the cost** or **Correct the quantity received**; enter the corrected value and a reason (required).
- Recorded as a `purchase_correction` linked to the original, which is never edited.
- **Cost correction:** before saving, the app shows the split (05 §12.2). For example: "+GH₵20.00 → GH₵7.80 for goods already sold (added to cost today), GH₵1.00 own use, GH₵11.20 added to the stock you still have." The amount owed changes by the same total; if it would go below zero, the owner records the supplier's refund in the same step (C-116e).
- **Quantity correction:** quantity changes, value doesn't (C-116f).
- A Needs attention item records the effect.

**Return to supplier** 🌐:
- Quantity, reason, and the supplier's credit: refund received (cash/MoMo) **or** reduce the unpaid amount of a chosen purchase.
- Stock value is reduced at the current average. Any difference from the credit is a visible cost adjustment (C-117, C-25c).

**Not in the MVP:** supplier accounts and statements (L6); adding transport costs to stock cost (L7; record transport as an expense).

### 2.3 Stock adjustment (F-06, F-22) 🌐

- **Input:** either the **counted quantity** (the app computes the change) or a +/− change, a reason, and an optional note.
- **Server:** adds a movement (`type = adjustment`), updates `stock_qty`, and marks the product's open discrepancies **resolved** when the resulting stock is ≥ 0. Each resolved discrepancy is linked to this movement.
- Each adjustment is valued at round_half_up(qty × current average) and moves that value out of (losses) or into (stock found) the stock value, so the average is unchanged (C-21). If stock reaches 0 with a value left over, the leftover becomes a cost adjustment (C-25a).
- **Stock-reducing adjustments** (damaged, expired, missing/theft, count correction down) are **stock losses**. They **reduce estimated net profit** and are shown on their own line in Reports (C-30, C-44).
- **Own use** (goods taken for personal or household use) is recorded with its own reason. It is shown as "Goods taken for own use", below net profit, and does not reduce business profit (C-37, proposed).
- **The app never adjusts quantities by itself.** Every quantity change comes from a sale, purchase, return or owner-entered adjustment. Negative stock stays visible until the owner acts (C-120).
- **Stock-increasing count corrections** are shown as "stock found" for information and are **not** counted as income (C-31). Resolving negative stock this way has no profit effect (C-32).

### 2.4 Low stock (F-07)

A product is low when `stock_qty ≤ low_stock_level` (and the product is active). The list is shareable as text.

## 3. Customer credit and repayments

### 3.1 Customers (F-13) 🌐

- **Required:** name.
- **Optional:** phone (Ghana format), credit limit (≥ 0), note.
- Warn (not block) if a customer with the same name or phone already exists.
- **Archive** only when the balance is 0. Otherwise the app explains: "Kofi still owes GH₵ 40.00."

### 3.2 Balance

- Balance = sum of the customer's ledger entries (see 05 §7). It is never stored as an editable number.
- The app may cache the balance for display; the server value is authoritative.

### 3.3 Record a payment from a customer (F-14) 🌐

- Fields: amount > 0, method Cash or MoMo, optional MoMo reference, date (default today; back-dating up to 30 days, audit-logged).
- The **server** decides how the payment is applied, under a lock on the customer (C-79):
  1. **Repayment** up to the current balance (`customer_ledger`, type `repayment`).
  2. If the customer also has **written-off debt**, any remainder becomes a **recovery** (`debt_recoveries`) up to the recoverable amount (C-78).
  3. Anything beyond that is **rejected**: "Kofi owes GH₵ 20.00 and has GH₵ 40.00 written off. The most you can record is GH₵ 60.00."
- Before saving, the app shows the split in words: "GH₵ 20.00 clears Kofi's balance. GH₵ 15.00 is recovered from debt you wrote off earlier."
- **Advance payments** (paying before buying) are not supported in the MVP.
- Each payment request has an idempotency key, so a double-tap or retry never records it twice.
- A wrongly entered repayment is corrected with **Correct a mistake** (`adjustment`) with a reason. Entries are never edited or deleted.

### 3.4 Credit limit

- If a credit sale would make the balance exceed the limit, the app shows a **warning**; the owner may continue.
- **Offline:** the check uses the cached balance and is labelled "based on last update".

### 3.5 Reminder (F-15)

- Opens WhatsApp (or the share sheet if WhatsApp isn't installed) with an editable template including the shop name and balance.
- Requires the customer's phone for direct WhatsApp; otherwise the share sheet is used.
- **No automatic sending.**

### 3.6 Bad debts: write-off, undo, and recovery

Three different actions. The app never mixes them (full rules in 05 §7.2):

| Action | Use it when… | Money received? | Balance | Profit |
|---|---|---|---|---|
| **Write off bad debt** (`write_off`) | You have given up on collecting (some of) the debt | No | Goes down | **Bad debts written off** line (−) |
| **Undo a write-off** (`write_off_undo`) | The write-off was **a mistake** (wrong customer or amount) | No | Restored | Reduces bad debts in the period of the undo |
| **Record a payment** that becomes a **recovery** (`debt_recoveries`) | The write-off was correct, and the customer **later pays** | **Yes** | Unchanged | **Recovered bad debts** line (+) |

- **Undo** is chosen from the specific write-off in the customer's history ("Undo this write-off"). It is limited to that entry's amount not yet undone, and requires a reason.
- **Recovery** happens automatically through **Record a payment** (§3.3) once the balance is zero. There is no separate "reverse then repay" step. This prevents double counting.
- **Corrections** (`adjustment`) fix typing errors and do **not** affect profit (C-34).
- **Example:** 05 §10.

## 4. Expenses (F-16) 🌐

- **Fields:** amount > 0, category, paid from (Cash drawer / MoMo / Other), date (default today; back-dating allowed, audit-logged), note.
- **Edit:** allowed; the change is audit-logged.
- **Delete:** soft delete with a confirmation.
- Expenses "paid from cash drawer" reduce expected cash in Close the day.
- **Stock purchases and supplier payments are not expenses.** There is no expense category for them; the form suggests Restock or Pay supplier when the note mentions stock, goods or a supplier (05 §12.1). Purchases are recorded as **Restock**, and their cost reaches profit through cost of goods sold when items are sold. The app explains this on the expense form: "Buying stock? Use Restock instead." This prevents double-counting (see 05 §4).

## 5. Cash count — close the day (F-19) 🌐

1. **Opening cash:** defaults to the previous day's counted cash (editable, e.g. after money was removed for banking).
2. **Expected cash** (C-80) = opening cash + cash sales + cash "paid now" on credit sales + cash repayments + cash recoveries of written-off debt + cash refunds from suppliers − operating expenses paid from the cash drawer − purchase and supplier payments from the cash drawer (all for that day; voided and cancelled-before-upload sales excluded).
3. The owner enters **counted cash** and an optional note.
4. **Difference** = counted − expected. Labels: Balanced (0), Over (+), Short (−).
5. **Close the day** saves the cash count and the **original closing record** of all that day's figures (05 §11, C-100). This can be done **once per day**, and the record is never edited or replaced.
5a. **After closing:** late uploads, voids, cancellations, back-dated entries and cash recounts for that day are each recorded as a separate **day adjustment** (C-101, C-102). A recount does not replace the original count; it is added as an adjustment. The day's report shows **Original closing figures → Adjustments after closing → Current adjusted total** (C-104), and the owner is notified (C-126).
5b. Closing is optional. Days that are never closed show current figures with the late-upload note (C-56).
6. **MoMo received** that day (MoMo sales + MoMo paid-now + MoMo repayments + MoMo recoveries) is displayed for manual comparison with the wallet. It is not stored as a count in the MVP.

**Limitations (stated in the app help) [A]:** owners often take money out of the drawer for personal use or pay suppliers from it.
- Supplier payments from the drawer are recorded (purchase paid-now and Pay supplier) and reduce expected cash.
- Personal cash withdrawals: use the note in the MVP.
- A "cash out of drawer" entry type is a candidate future feature, depending on pilot feedback.

**Schema:** see [09-data-model.md](09-data-model.md) (`cash_counts`, `expenses.paid_from`, `sales.momo_reference`, `customer_ledger.momo_reference`).

## 6. CSV export (F-20) 🌐

- Files: `products.csv`, `sales.csv`, `sale_items.csv`, `customers.csv`, `customer_ledger.csv`, `expenses.csv`, `stock_movements.csv`, `cash_counts.csv`.
- Amounts are written in **cedis with 2 decimals** (e.g. `12.50`), with a header row noting "Amounts in GH₵". Dates are in Ghana time, ISO format.
- UTF-8 with BOM, so Excel opens it correctly.
- Generated on the server for the chosen date range, then shared via the share sheet.
- **Available on every plan, including when a subscription is overdue.**
