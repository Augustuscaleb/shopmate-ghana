# 09 — Data Model (Database Requirements)

**Revision 5.** This is the **single source of truth** for MVP tables, fields, server functions, transactions and locking. [PLAN.md §6](../PLAN.md#6-database-structure) summarises it. Calculation rules (C-xx) are in [05](05-financial-calculations.md).

> **Status:** this is a design, not an implementation. No database exists yet.

## 1. Conventions

| Rule | Detail |
|---|---|
| IDs | UUID. Sale IDs are generated on the phone |
| Common columns | `id`, `business_id`, `created_at`, `updated_at`, `deleted_at` (soft delete) |
| Money | `BIGINT` pesewas, including **stock value**. Only average-cost snapshots (`product_cost_history.avg_cost`, `sale_items.unit_cost`, `device_unit_cost`, `avg_at_upload`) use `NUMERIC(18,4)` pesewas |
| Quantities | `INTEGER` (whole units) |
| Time | `TIMESTAMPTZ` (UTC); reports in Ghana time |
| Security | RLS on every table (SEC-10). Money, stock and ledger tables are written only by server functions (SEC-11) |
| Append-only | `stock_movements`, `product_cost_history`, `customer_ledger`, `debt_recoveries`, `supplier_payments`, `purchase_corrections`, `device_anchors`, `day_closings`, `day_adjustments`, `audit_log`, `request_log` |

## 2. Tables

### Business and access

| Table | Key fields |
|---|---|
| `businesses` | name, type, town, phone, reference_code (unique), receipt_footer, default_low_stock_level |
| `profiles` | user_id, full_name, email |
| `business_members` | business_id, user_id, role (`owner` in MVP) |
| `devices` | business_id, user_id, device_code (unique per business), label, last_seen_at, revoked_at, last_sequence_no |
| `device_anchors` | device_id, server_time, elapsed_ms, boot_id, wall_clock, clock_offset_ms, created_at. Written at every successful server contact (05 C-90) |
| `device_time_events` | device_id, type (`reboot_detected`/`clock_changed`), detected_at (device estimate), elapsed_ms, boot_id, change_ms. Uploaded with the next sync (C-92, C-93) |

### Products, cost and stock

| Table | Key fields |
|---|---|
| `categories` | name |
| `products` | name (unique per business, case-insensitive), category_id, unit, selling_price, stock_qty (may be negative), **stock_value** (BIGINT pesewas), **cost_known** (boolean), low_stock_level, active. **Average = stock_value ÷ stock_qty** (not stored) |
| `product_cost_history` | product_id, **effective_at** (server time), stock_qty_after, stock_value_after, avg_cost (4-dp snapshot; null if qty ≤ 0 or cost unknown), cause (`opening`/`restock`/`sale`/`void`/`adjustment`/`cost_adjustment`/`set_cost`), movement_id. Index (product_id, effective_at). One row per value-changing event (C-22) |
| `stock_movements` | product_id, type (`opening`/`restock`/`purchase_correction`/`supplier_return`/`sale`/`void`/`adjustment`/`cost_adjustment`/`value_correction`), qty_change, **value** (signed BIGINT, exact change to stock_value), unit_cost (info), reason (adjustments: `damaged`/`expired`/`missing`/`own_use`/`count_correction`/`other`; cost adjustments: `negative_stock_revaluation`/`zero_stock_residue`/`negative_value_correction`/`supplier_return_difference`/`purchase_correction_after_sale`), purchase_id, sale_id, note, user_id, occurred_at |
| `purchases` | product_id, movement_id, qty, **purchase_cost** (BIGINT, full acquisition cost), paid_now, paid_now_from (`cash_drawer`/`momo`/`other`), supplier_name (text, optional), purchased_on, note. **Unpaid** = purchase_cost − paid_now − Σ supplier_payments ± Σ cost corrections − Σ return credits applied (≥ 0, C-112) |
| `supplier_payments` | purchase_id, amount (> 0), paid_from, paid_on, note — C-113 |
| `purchase_corrections` | purchase_id, type (`cost`/`quantity`), qty_change, cost_change, reason, **allocation** (JSON: remaining fraction f and the pesewa amounts for remaining stock / already sold / losses / own use / supplier returns), refund_amount, refund_method, movement_id(s) — C-116 – C-116f |
| `supplier_returns` | product_id, movement_id, qty, value_removed, credit_amount, credit_type (`refund_cash`/`refund_momo`/`reduce_unpaid`), purchase_id (if reducing unpaid), reason — C-117 |
| `attention_items` | type (`negative_stock`/`cost_adjustment`/`cost_check`/`cost_missing`/`time_uncertain`/`closed_day_changed`/`stock_discrepancy`), entity, message_data (JSON: what happened, GH₵ effect), status (`open`/`acknowledged`/`resolved`), acknowledged_by/at, resolved_by_ref — 05 C-120 – C-126 |
| `stock_discrepancies` | product_id, sale_id, shortfall_qty, status (`open`/`resolved`), resolution (`adjustment`/`sale_voided`), resolved_by_movement_id, resolved_at |

### Sales

| Table | Key fields |
|---|---|
| `sales` | **id (phone UUID, primary key)**, device_id, receipt_no (unique per business), **status** (`recorded` / `voided` / `cancelled_unsent`), subtotal, discount, total, payment_method, momo_reference, customer_id, paid_now_amount, paid_now_method, created_offline, mode, **occurred_at_device** (phone wall clock), **occurred_at** (best estimate, 05 §3.6), **device_elapsed_ms**, **boot_id**, **sequence_no** (per device), **anchor_id** (latest anchor at sale), **time_lower_bound**, **time_upper_bound**, **time_confidence** (`high`/`medium`/`low`), **time_check** (JSON: checks and results), received_at, **cost_basis** (`occurred_at`/`received_at`), payload_version, voided_at, void_reason, cancelled_at, cancel_reason, cancel_note |
| `sale_items` | sale_id, product_id, qty, unit_price, line_total, **unit_cost** (as-of server cost, C-23a), **device_unit_cost** (phone's provisional cost, audit only, C-23c), **avg_at_upload** (average when processed; diagnostic for C-58), line_cost (removed from stock_value), cost_missing, cost_basis_adjusted |

For a `cancelled_unsent` sale, `sale_items` are stored **for the record only**. No stock movements, ledger entries or report effects are created.

### Customers and credit

| Table | Key fields |
|---|---|
| `customers` | name, phone, credit_limit, note, active |
| `customer_ledger` | customer_id, type (`credit_sale`/`repayment`/`adjustment`/`write_off`/`write_off_undo`/`void_reversal`), amount (signed), method, momo_reference, sale_id, **undoes_entry_id** (for `write_off_undo`), reason, user_id, occurred_at |
| `debt_recoveries` | customer_id, amount (> 0), method, momo_reference, reason/note, user_id, occurred_at — C-77 |

### Expenses, cash, subscription, audit

| Table | Key fields |
|---|---|
| `expense_categories` | name |
| `expenses` | category_id, amount, paid_from (`cash_drawer`/`momo`/`other`), expense_date, note |
| `cash_counts` | count_date (**unique per business**: the original count), opening_cash, expected_cash, counted_cash, difference, note. Recounts are day adjustments |
| `day_closings` | business_id, day (**unique**: one original closing per day), closed_at, closed_by, figures (JSON: all 05 §5 figures and the cash count), included_record_ids. **Immutable**; no updates or deletes (C-100) |
| `day_adjustments` | closing_id, type (`late_sale`/`void`/`cancellation`/`backdated_expense`/`backdated_payment`/`backdated_supplier_payment`/`cash_recount`), source_ref, figure_changes (JSON: figure → amount), occurred_at, recorded_at, user_id. Append-only (C-101, C-102) |
| `subscriptions` | plan (`starter`/`standard`/`plus`/`pilot`), status, paid_until |
| `subscription_payments` | amount, momo_transaction_id (unique), payer_number, confirmed_by, paid_at |
| `audit_log` | user_id, device_id, action, entity, entity_id, before, after, reason, created_at |
| `request_log` | **request_id** (unique), business_id (nullable until known), user_id, function_name, result (JSON), created_at. Idempotency for all online writes (§4.3). *Implementation note (Stage 1): request_id is unique on its own, which is stricter than unique per business, so `create_business` (which runs before any business exists) is covered. A stored result is returned only to the same user and function.* |

## 3. Server functions (the only way to change money, stock and ledgers)

All functions run in **one database transaction**, take a client-generated **idempotency key**, and follow the lock order in §4.2.

| Function | Changes | Key checks |
|---|---|---|
| `record_sale(payload, mode)` | sales, sale_items, stock_movements, products (qty and value), product_cost_history, customer_ledger, stock_discrepancies | Sale ID is the idempotency key; totals recalculated (SEC-13); time-confidence checks (C-90–C-95); sale-time cost (C-23); value removed at that cost; pool validity rules (C-25a/b); online stock validation |
| `sync_heartbeat(wall_clock, elapsed_ms, boot_id, time_events)` | device_anchors, device_time_events | Stores the anchor; returns server time (C-90) |
| `close_day(date, opening_cash, counted_cash, note)` | cash_counts, day_closings | Once per day; figures computed by the server; immutable |
| `record_cash_recount(date, counted_cash, note)` | day_adjustments | Day must be closed; original count unchanged |
| *(internal)* `add_day_adjustment(...)` | day_adjustments, attention_items | Called inside every function whose effect is dated on a closed day (C-102) |
| `cancel_unsent_sale(payload, reason, note)` | sales (status `cancelled_unsent`), sale_items, audit_log | Sale ID must **not** already be recorded; reason required; re-authenticated owner (04 §1.5) |
| `get_sale_status(sale_id)` | — | Returns recorded / cancelled / unknown |
| `void_sale(sale_id, reason)` | sales, stock_movements, products (qty and value: original line cost returned), product_cost_history, customer_ledger, stock_discrepancies | Status `recorded`; balance ≥ 0 |
| `create_product` / `update_product` | products, stock_movements, product_cost_history | Unique name; price > 0 |
| `set_cost(product, cost, reason)` | products (stock_value), stock_movements (`value_correction`), product_cost_history, audit_log | C-27 |
| `restock(product, qty, purchase_cost, paid_now, paid_from, supplier_name)` | stock_movements (incl. any C-25 cost adjustment), products, product_cost_history, purchases, attention_items | qty ≥ 1; purchase_cost ≥ 0; 0 ≤ paid_now ≤ purchase_cost |
| `pay_supplier(purchase, amount, paid_from, date)` | supplier_payments | Partial payments allowed; amount ≤ amount still owed; locks the purchase row; never writes `expenses` |
| `correct_purchase(purchase, type, qty_change or cost_change, reason, refund?)` | purchase_corrections, stock_movements (value correction for the remaining share; cost adjustment, loss and own-use entries for consumed shares), products, product_cost_history, attention_items | Reason required; allocation computed from movements since the purchase with exact decimals (C-116a – C-116c); unpaid ≥ 0, or refund recorded |
| `return_to_supplier(product, qty, credit_amount, credit_type, purchase?, reason)` | supplier_returns, stock_movements, products, product_cost_history, attention_items | qty ≥ 1; credit ≥ 0 |
| `acknowledge_attention(item)` | attention_items | Changes no figures |
| `adjust_stock(product, count or change, reason)` | stock_movements, products (qty and value), product_cost_history, stock_discrepancies | Reason required |
| `record_payment(customer, amount, method, ref, date)` | customer_ledger (`repayment`) and/or debt_recoveries | Server computes the split (C-79); rejects amounts above balance + recoverable |
| `adjust_balance(customer, amount, reason)` | customer_ledger (`adjustment`) | Balance ≥ 0 |
| `write_off(customer, amount, reason)` | customer_ledger (`write_off`) | 0 < amount ≤ balance |
| `undo_write_off(write_off_entry_id, amount, reason)` | customer_ledger (`write_off_undo`) | amount ≤ not-yet-undone part of that entry |
| `save_expense` / `delete_expense` | expenses | amount > 0 |
| *(replaced by `close_day` and `record_cash_recount`)* | | |
| `register_device()` | devices | Next free device_code |
| `export_csv(range, kinds)` | — (read) | Membership |
| `check_stock_integrity()` | — (read) | stock_qty = Σ qty_change; **stock_value = Σ value** (conservation, 05 §3.2); latest history row matches the product |

## 4. Transactions, locking and idempotency

### 4.1 Transactions

- Every function above runs as a single PostgreSQL transaction (a Supabase RPC call executes inside one transaction).
- Any error rolls back **everything**, so there are no half-saved sales, payments or stock changes.

### 4.2 Row locking and lock order (prevents unsafe concurrent updates)

| Step | Lock |
|---|---|
| 1 | **Idempotency claim:** `INSERT … ON CONFLICT DO NOTHING` on `sales.id` (for sales) or `request_log(business_id, request_id)` (others). A concurrent duplicate **waits** on the unique index until the first transaction finishes, then sees the conflict (§4.3) |
| 2 | **Product rows:** `SELECT … FOR UPDATE` on all products in the request, **sorted by product ID** |
| 3 | **Customer row** (if any): `SELECT … FOR UPDATE` |
| 3a | **Purchase row** (supplier payments, purchase corrections, returns that reduce unpaid): `SELECT … FOR UPDATE` |
| 3b | **Day closing row** (if the effect is dated on a closed day): read with `FOR SHARE`. Only `close_day` inserts closings, and it runs alone per business day |
| 4 | Read current values, validate, write rows, update `stock_qty` with `stock_qty = stock_qty + change` |

- **All functions use the same order** (claim → products by ID → customer → purchase → day closing), which prevents deadlocks.
- If PostgreSQL still reports a deadlock or serialisation error, the whole transaction rolls back. The client treats it as a **temporary** error and retries. The retry is safe because of step 1.
- **Isolation level:** PostgreSQL default (READ COMMITTED). Correctness comes from the explicit row locks and the unique constraints, which is the standard, well-documented PostgreSQL pattern. *This is a design claim, to be proven by tests TC-CONC-01–06.*

### 4.3 Idempotency (prevents duplicates)

| Situation | Result |
|---|---|
| Same sale sent twice, one after another | Second call finds the existing sale and returns `already_recorded` with the stored result (same costs, same receipt) |
| Same sale sent twice **at the same moment** (two network retries, or a bug) | The second insert waits on the primary key, then conflicts, then returns `already_recorded`. Exactly one sale and one set of movements and ledger entries |
| Sale previously **cancelled before upload** arrives (e.g. a stale copy) | Returns `cancelled`; nothing is recorded |
| Same payment, write-off or restock request repeated (double-tap or retry) | `request_log` returns the original result; nothing is written twice |
| First attempt rolled back (error) | No claim remains, so the retry proceeds normally |

### 4.4 Database constraints (a last line of defence)

| Constraint | Prevents |
|---|---|
| `sales.id` primary key | Duplicate sales |
| Unique `(business_id, receipt_no)` | Duplicate receipt numbers |
| Unique `(business_id, device_code)` | Two devices sharing a code |
| Unique `request_id` (stricter than per business; see `request_log`) | Duplicate online writes |
| Unique `(business_id, day)` on `day_closings`; unique `(business_id, count_date)` on `cash_counts` | A second "original" closing |
| No UPDATE/DELETE privileges on `day_closings`, `day_adjustments` (enforced by policy) | Rewriting closed days |
| CHECK `0 ≤ paid_now ≤ purchase_cost` | Overpaid purchases |
| Unique `subscription_payments.momo_transaction_id` | Recording a MoMo payment twice |
| CHECK `qty > 0`, `amount > 0` where applicable | Invalid entries |
| Foreign keys with `business_id` matching (composite) | Cross-business references |

## 5. Changes in revision 5 (and 5.1)

| Change | Reason |
|---|---|
| `purchases` (purchase cost vs paid), `supplier_payments`, `purchase_corrections`, `supplier_returns`; movement types `purchase_correction`, `supplier_return` | Full acquisition cost; supplier credit (05 §12) |
| `device_anchors`, `device_time_events`; `sales.sequence_no`, `anchor_id`, time bounds | Anchor-based time design (05 §3.6) |
| `attention_items`; cost-adjustment reasons extended | Visible, explained adjustments (05 §3.4) |
| `day_closings` (one, immutable) + `day_adjustments` replace versioned `day_snapshots`; recounts are adjustments | Original closing preserved (05 §11) |
| Adjustment reason `own_use` reported separately | C-37 |
| 5.1: `purchase_corrections.type`, `allocation`, refund fields; `pay_supplier` partial payments stated explicitly | 05 §12.1, §12.2 |

## 6. Changes in revision 4

| Change | Reason |
|---|---|
| `products.stock_value` (+ `cost_known`) replaces a stored average; average = value ÷ qty | Value-pool method: late sales leave the correct average (05 §3.1–3.5) |
| `stock_movements.value` is the exact signed value change; new types `cost_adjustment`, `value_correction` | Conservation; visible edge-case handling (C-25–C-27) |
| `product_cost_history` records qty, value and average after **every** value-changing event, including sales | Sale-time lookup always sees the true pool state |
| `sales.occurred_at_device`, `device_elapsed_ms`, `boot_id`, `time_confidence`, `time_check`; `devices` clock fields; `sync_heartbeat` | Timestamp checks (05 §3.6) |
| `sale_items.avg_at_upload` | Measures limitation L2 (C-58) |
| `day_snapshots`; versioned `cash_counts`; `close_day` | Confirmed reports never rewritten (05 §11) |

## 7. Changes in revision 3

| Change | Reason |
|---|---|
| New `product_cost_history`; `sales.cost_basis`; `sale_items.device_unit_cost`, `cost_basis_adjusted` | As-of costing (issue 1) |
| `sales.status` incl. `cancelled_unsent`; `cancelled_at`, `cancel_reason`, `cancel_note`; `cancel_unsent_sale`, `get_sale_status` | Safe cancellation (issue 2) |
| `write_off_reversal` renamed **`write_off_undo`** (+ `undoes_entry_id`); new `debt_recoveries`; `record_payment` with server split; separate `write_off` / `undo_write_off` | Undo vs recovery (issue 3) |
| New `request_log`; §4 transactions, locking, idempotency, constraints | Concurrency (issue 4) |
| `stock_discrepancies.resolution` incl. `sale_voided` | Two-device scenario (06 §8) |
