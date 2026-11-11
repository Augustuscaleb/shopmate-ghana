# 09 — Data Model (Database Requirements)

**Revision 3.** This is the **single source of truth** for MVP tables, fields, server functions, transactions and locking. [PLAN.md §6](../PLAN.md#6-database-structure) summarises it. Calculation rules (C-xx) are in [05](05-financial-calculations.md).

> **Status:** this is a design, not an implementation. No database exists yet.

## 1. Conventions

| Rule | Detail |
|---|---|
| IDs | UUID. Sale IDs are generated on the phone |
| Common columns | `id`, `business_id`, `created_at`, `updated_at`, `deleted_at` (soft delete) |
| Money | `BIGINT` pesewas. Only `avg_cost` / `unit_cost` / `device_unit_cost` use `NUMERIC(18,4)` pesewas |
| Quantities | `INTEGER` (whole units) |
| Time | `TIMESTAMPTZ` (UTC); reports in Ghana time |
| Security | RLS on every table (SEC-10). Money, stock and ledger tables are written only by server functions (SEC-11) |
| Append-only | `stock_movements`, `product_cost_history`, `customer_ledger`, `debt_recoveries`, `audit_log`, `request_log` |

## 2. Tables

### Business and access

| Table | Key fields |
|---|---|
| `businesses` | name, type, town, phone, reference_code (unique), receipt_footer, default_low_stock_level |
| `profiles` | user_id, full_name, email |
| `business_members` | business_id, user_id, role (`owner` in MVP) |
| `devices` | business_id, user_id, device_code (unique per business), label, last_seen_at, revoked_at |

### Products, cost and stock

| Table | Key fields |
|---|---|
| `categories` | name |
| `products` | name (unique per business, case-insensitive), category_id, unit, selling_price, **avg_cost** (nullable), stock_qty (may be negative), low_stock_level, active |
| `product_cost_history` | product_id, **effective_at** (server time), avg_cost, cause (`opening`/`restock`/`void`/`set_cost`), movement_id or audit_id. Index (product_id, effective_at) — C-20 |
| `stock_movements` | product_id, type (`opening`/`restock`/`sale`/`void`/`adjustment`), qty_change, unit_cost, value, reason (adjustments), sale_id, note, user_id, occurred_at |
| `stock_discrepancies` | product_id, sale_id, shortfall_qty, status (`open`/`resolved`), resolution (`adjustment`/`sale_voided`), resolved_by_movement_id, resolved_at |

### Sales

| Table | Key fields |
|---|---|
| `sales` | **id (phone UUID, primary key)**, device_id, receipt_no (unique per business), **status** (`recorded` / `voided` / `cancelled_unsent`), subtotal, discount, total, payment_method, momo_reference, customer_id, paid_now_amount, paid_now_method, created_offline, mode, occurred_at, received_at, **cost_basis** (`occurred_at`/`received_at`), payload_version, clock_flag, voided_at, void_reason, cancelled_at, cancel_reason, cancel_note |
| `sale_items` | sale_id, product_id, qty, unit_price, line_total, **unit_cost** (as-of server cost, C-23a), **device_unit_cost** (phone's provisional cost, audit only, C-23c), line_cost, cost_missing, cost_basis_adjusted |

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
| `cash_counts` | count_date (unique per business), opening_cash, expected_cash, counted_cash, difference, note |
| `subscriptions` | plan (`starter`/`standard`/`plus`/`pilot`), status, paid_until |
| `subscription_payments` | amount, momo_transaction_id (unique), payer_number, confirmed_by, paid_at |
| `audit_log` | user_id, device_id, action, entity, entity_id, before, after, reason, created_at |
| `request_log` | business_id, **request_id** (unique per business), function_name, result (JSON), created_at — idempotency for all online writes (§4.3) |

## 3. Server functions (the only way to change money, stock and ledgers)

All functions run in **one database transaction**, take a client-generated **idempotency key**, and follow the lock order in §4.2.

| Function | Changes | Key checks |
|---|---|---|
| `record_sale(payload, mode)` | sales, sale_items, stock_movements, products, customer_ledger, stock_discrepancies | Sale ID is the idempotency key; totals recalculated (SEC-13); as-of cost (C-23); online stock validation |
| `cancel_unsent_sale(payload, reason, note)` | sales (status `cancelled_unsent`), sale_items, audit_log | Sale ID must **not** already be recorded; reason required; re-authenticated owner (04 §1.5) |
| `get_sale_status(sale_id)` | — | Returns recorded / cancelled / unknown |
| `void_sale(sale_id, reason)` | sales, stock_movements, products, product_cost_history, customer_ledger, stock_discrepancies | Status `recorded`; balance ≥ 0 |
| `create_product` / `update_product` | products, stock_movements, product_cost_history | Unique name; price > 0 |
| `set_cost(product, cost, reason)` | products, product_cost_history, audit_log | C-27 |
| `restock(product, qty, cost)` | stock_movements, products, product_cost_history | qty ≥ 1 |
| `adjust_stock(product, count or change, reason)` | stock_movements, products, stock_discrepancies | Reason required |
| `record_payment(customer, amount, method, ref, date)` | customer_ledger (`repayment`) and/or debt_recoveries | Server computes the split (C-79); rejects amounts above balance + recoverable |
| `adjust_balance(customer, amount, reason)` | customer_ledger (`adjustment`) | Balance ≥ 0 |
| `write_off(customer, amount, reason)` | customer_ledger (`write_off`) | 0 < amount ≤ balance |
| `undo_write_off(write_off_entry_id, amount, reason)` | customer_ledger (`write_off_undo`) | amount ≤ not-yet-undone part of that entry |
| `save_expense` / `delete_expense` | expenses | amount > 0 |
| `save_cash_count(date, opening, counted, note)` | cash_counts | Server computes expected (C-80) |
| `register_device()` | devices | Next free device_code |
| `export_csv(range, kinds)` | — (read) | Membership |
| `check_stock_integrity()` | — (read) | stock_qty = Σ qty_change; avg_cost = latest history row |

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
| 4 | Read current values, validate, write rows, update `stock_qty` with `stock_qty = stock_qty + change` |

- **All functions use the same order** (claim → products by ID → customer), which prevents deadlocks.
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
| Unique `(business_id, request_id)` | Duplicate online writes |
| Unique `subscription_payments.momo_transaction_id` | Recording a MoMo payment twice |
| CHECK `qty > 0`, `amount > 0` where applicable | Invalid entries |
| Foreign keys with `business_id` matching (composite) | Cross-business references |

## 5. Changes from revision 2

| Change | Reason |
|---|---|
| New `product_cost_history`; `sales.cost_basis`; `sale_items.device_unit_cost`, `cost_basis_adjusted` | As-of costing (issue 1) |
| `sales.status` incl. `cancelled_unsent`; `cancelled_at`, `cancel_reason`, `cancel_note`; `cancel_unsent_sale`, `get_sale_status` | Safe cancellation (issue 2) |
| `write_off_reversal` renamed **`write_off_undo`** (+ `undoes_entry_id`); new `debt_recoveries`; `record_payment` with server split; separate `write_off` / `undo_write_off` | Undo vs recovery (issue 3) |
| New `request_log`; §4 transactions, locking, idempotency, constraints | Concurrency (issue 4) |
| `stock_discrepancies.resolution` incl. `sale_voided` | Two-device scenario (06 §8) |
