# 04 — Workflows

All writes that change money, stock or balances run as **one all-or-nothing server transaction** (a database function). "Stock movement" and "ledger entry" refer to the tables in [PLAN.md §6](../PLAN.md#6-database-structure).

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
   - records a **provisional** `unit_cost` from the cached average cost, for on-phone profit only. The server assigns the authoritative cost when it records the sale (C-23, C-28)
   - writes the sale to the **outbox**
   - updates **local** stock
   - shows **Sale complete**
5. The sync engine sends the sale to the server function `record_sale` (see 06).

**Server-side result of `record_sale`:**
- `sales` row + `sale_items` rows, each with a **server-assigned unit cost** from the current weighted average (C-23)
- one `stock_movements` row per line (`type = sale`, negative quantity)
- `products.stock_qty` reduced atomically
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
  - adds reversing stock movements (`type = void`, positive quantity) and re-blends the average cost using the original line cost (C-26)
  - for credit sales, adds a `void_reversal` ledger entry that cancels the **outstanding** credit from that sale (see 05 §7)
  - writes an audit entry
- Voided sales stay visible (struck through) and are excluded from totals.
- A pending (not yet synced) sale **cannot be voided** until it syncs. The app explains why.
- Partial returns are **future**. In the MVP, void the sale and re-record the correct one.

## 2. Inventory

### 2.1 Create or edit a product (F-03, F-04) 🌐

- **Required:** name (unique per shop, case-insensitive), selling price > 0.
- **Optional:** category, unit, cost price (≥ 0; sets the initial average cost; if missing, profit shows a warning "cost price not set"), low-stock level (default from Settings, e.g. 5).
- **Correct cost price** (existing product): sets the average cost directly; audit-logged; past sales are unchanged (C-27).
- **Initial stock:** entered only at creation, and recorded as a movement of `type = opening`.
- **Archive** instead of delete. Archived products are hidden from selling, but their history remains.
- Price changes are audit-logged (old → new).

### 2.2 Restock (F-05) 🌐

- **Input:** quantity received (whole number ≥ 1), or packs × units per pack; then **either** total cost **or** unit cost.
- **Server:**
  - adds a movement (`type = restock`, positive quantity, `unit_cost`)
  - increases `stock_qty`
  - updates the product's **weighted-average cost** (C-22): blends existing stock and new stock; if stock was zero or negative, or the cost was unknown, the new unit cost is used
- If the product has open discrepancies, the app asks: "Was the stock count wrong before this restock?" and links to an adjustment. It does **not** auto-resolve.

### 2.3 Stock adjustment (F-06, F-22) 🌐

- **Input:** either the **counted quantity** (the app computes the change) or a +/− change, a reason, and an optional note.
- **Server:** adds a movement (`type = adjustment`), updates `stock_qty`, and marks the product's open discrepancies **resolved** when the resulting stock is ≥ 0. Each resolved discrepancy is linked to this movement.
- Each adjustment is valued at the current average cost (C-25) and does not change the average.
- **Stock-reducing adjustments** (damaged, expired, missing/theft, own use, count correction down) are **stock losses**. They **reduce estimated net profit** and are shown on their own line in Reports (C-30, C-44).
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

### 3.3 Repayment (F-14) 🌐

- Amount > 0 and ≤ current balance.
- **Overpayment / advance payment is not supported in the MVP.** The app shows: "Kofi owes GH₵ 40.00. You can record up to that amount."
- Method Cash or MoMo; optional MoMo reference; date (today by default; back-dating up to 30 days allowed, audit-logged).
- The server adds a `repayment` ledger entry (negative amount).
- A wrongly entered repayment is corrected with a **balance adjustment** (S-44) with a reason. Entries are never edited or deleted.

### 3.4 Credit limit

- If a credit sale would make the balance exceed the limit, the app shows a **warning**; the owner may continue.
- **Offline:** the check uses the cached balance and is labelled "based on last update".

### 3.5 Reminder (F-15)

- Opens WhatsApp (or the share sheet if WhatsApp isn't installed) with an editable template including the shop name and balance.
- Requires the customer's phone for direct WhatsApp; otherwise the share sheet is used.
- **No automatic sending.**

### 3.6 Bad debt (write-off) and recovery

- **Write off** (S-44, type `write_off`): the owner gives up some or all of a balance, with a reason. It **reduces estimated net profit** in the period it is recorded and appears in Reports as **Bad debts written off**, separate from operating expenses (C-33, C-45).
- **Customer pays after a write-off:** first **Reverse write-off** (type `write_off_reversal`, up to the amount previously written off for that customer), then record a normal repayment. The reversal reduces bad debts in its period (C-74).
- **Corrections** (type `adjustment`) fix typing errors and do **not** affect profit (C-34).

## 4. Expenses (F-16) 🌐

- **Fields:** amount > 0, category, paid from (Cash drawer / MoMo / Other), date (default today; back-dating allowed, audit-logged), note.
- **Edit:** allowed; the change is audit-logged.
- **Delete:** soft delete with a confirmation.
- Expenses "paid from cash drawer" reduce expected cash in Close the day.
- **Stock purchases are not expenses.** They are recorded as **Restock**, and their cost reaches profit through cost of goods sold when items are sold. The app explains this on the expense form: "Buying stock? Use Restock instead." This prevents double-counting (see 05 §4).

## 5. Cash count — close the day (F-19) 🌐

1. **Opening cash:** defaults to the previous day's counted cash (editable, e.g. after money was removed for banking).
2. **Expected cash** (C-80) = opening cash + cash sales + cash "paid now" on credit sales + cash repayments − operating expenses paid from the cash drawer (all for that day, non-voided).
3. The owner enters **counted cash** and an optional note.
4. **Difference** = counted − expected. Labels: Balanced (0), Over (+), Short (−).
5. Saved as a `cash_counts` row: date, opening, expected, counted, difference, note. One record per day; re-counting replaces it, with the earlier version kept in the audit log.
6. **MoMo received** that day (MoMo sales + MoMo paid-now + MoMo repayments) is displayed for manual comparison with the wallet. It is not stored as a count in the MVP.

**Limitations (stated in the app help) [A]:** owners often take money out of the drawer for personal use or pay suppliers from it.
- MVP: record supplier payments as Restock (no drawer effect) and personal withdrawals via the note.
- A "cash out of drawer" entry type is a candidate future feature, depending on pilot feedback.

**Schema:** see [09-data-model.md](09-data-model.md) (`cash_counts`, `expenses.paid_from`, `sales.momo_reference`, `customer_ledger.momo_reference`).

## 6. CSV export (F-20) 🌐

- Files: `products.csv`, `sales.csv`, `sale_items.csv`, `customers.csv`, `customer_ledger.csv`, `expenses.csv`, `stock_movements.csv`, `cash_counts.csv`.
- Amounts are written in **cedis with 2 decimals** (e.g. `12.50`), with a header row noting "Amounts in GH₵". Dates are in Ghana time, ISO format.
- UTF-8 with BOM, so Excel opens it correctly.
- Generated on the server for the chosen date range, then shared via the share sheet.
- **Available on every plan, including when a subscription is overdue.**
