# 09 — Data Model (Database Requirements)

This is the **single source of truth** for MVP tables and fields; [PLAN.md §6](../PLAN.md#6-database-structure) summarises it. The calculation rules (C-xx) are in [05](05-financial-calculations.md).

## 1. Conventions

| Rule | Detail |
|---|---|
| IDs | UUID. Sale IDs are generated on the phone |
| Common columns | `id`, `business_id`, `created_at`, `updated_at`, `deleted_at` (soft delete) on every business table |
| Money | `BIGINT` pesewas. Only `avg_cost`/`unit_cost` use `NUMERIC(18,4)` pesewas |
| Quantities | `INTEGER` (whole units in the MVP) |
| Time | `TIMESTAMPTZ` in UTC; reports in Ghana time |
| Security | Row Level Security on every table (SEC-10); money, stock and ledger tables are written only by server functions (SEC-11) |
| Ledgers | `stock_movements`, `customer_ledger`, `audit_log` are append-only |

## 2. Tables

### Business and access

| Table | Key fields |
|---|---|
| `businesses` | name, type (`provision`/`minimart`/`boutique`/`other`), town, phone, reference_code (unique, e.g. `SM-0042`), receipt_footer, default_low_stock_level |
| `profiles` | user_id (auth), full_name, email |
| `business_members` | business_id, user_id, role (`owner` only in MVP) |
| `devices` | business_id, user_id, **device_code** (unique per business, e.g. `A`), label, last_seen_at, revoked_at |

### Products and stock

| Table | Key fields |
|---|---|
| `categories` | name |
| `products` | name (unique per business, case-insensitive), category_id, unit, selling_price (BIGINT), **avg_cost** (NUMERIC(18,4), nullable), stock_qty (INTEGER, may be negative), low_stock_level, active |
| `stock_movements` | product_id, type (`opening`/`restock`/`sale`/`void`/`adjustment`), qty_change (±), unit_cost (NUMERIC(18,4)), value (BIGINT, = round(qty × unit_cost)), reason (`damaged`/`expired`/`missing`/`own_use`/`count_correction`/`other`; adjustments only), avg_cost_after (NUMERIC), sale_id, note, user_id, occurred_at |
| `stock_discrepancies` | product_id, sale_id, shortfall_qty, status (`open`/`resolved`), resolved_by_movement_id, resolved_at |

### Sales

| Table | Key fields |
|---|---|
| `sales` | **id (phone UUID, primary key → duplicate prevention)**, device_id, receipt_no (unique per business), subtotal, discount, total, payment_method (`cash`/`momo`/`credit`), momo_reference, customer_id, paid_now_amount, paid_now_method, created_offline, mode (`online`/`offline`), occurred_at, received_at, payload_version, clock_flag, voided_at, void_reason |
| `sale_items` | sale_id, product_id, qty, unit_price, line_total, **unit_cost (server-assigned, C-23)**, line_cost, cost_missing |

### Customers and credit

| Table | Key fields |
|---|---|
| `customers` | name, phone, credit_limit, note, active |
| `customer_ledger` | customer_id, type (`credit_sale`/`repayment`/`adjustment`/`write_off`/`write_off_reversal`/`void_reversal`), amount (signed BIGINT), method (`cash`/`momo`, repayments only), momo_reference, sale_id, reason, user_id, occurred_at |

Balance = Σ amount (C-76). A database check in the server functions prevents the balance going below 0.

### Expenses and cash

| Table | Key fields |
|---|---|
| `expense_categories` | name (seeded defaults) |
| `expenses` | category_id, amount, **paid_from** (`cash_drawer`/`momo`/`other`), expense_date, note |
| `cash_counts` | count_date (unique per business), opening_cash, expected_cash, counted_cash, difference, note |

### Subscription and audit

| Table | Key fields |
|---|---|
| `subscriptions` | plan (`starter`/`standard`/`plus`/`pilot`), status (`pilot`/`trial`/`active`/`overdue`), paid_until |
| `subscription_payments` | amount, momo_transaction_id (unique), payer_number, confirmed_by, paid_at |
| `audit_log` | user_id, action, entity, entity_id, before (JSON), after (JSON), created_at |

## 3. Server functions (the only way to change money, stock and ledgers)

| Function | Changes | Key checks |
|---|---|---|
| `record_sale(payload, mode)` | sales, sale_items, stock_movements, products.stock_qty, customer_ledger, stock_discrepancies | Idempotent by sale ID; recalculates totals (SEC-13); assigns unit_cost (C-23); `mode = online` → stock validation; locks product rows in ID order |
| `void_sale(id, reason)` | sales, stock_movements, products (qty, avg C-26), customer_ledger | Not already voided; balance ≥ 0 |
| `create_product(...)` / `update_product(...)` | products, stock_movements (opening) | Unique name; price > 0 |
| `set_cost(product, cost)` | products.avg_cost | Audit-logged (C-27) |
| `restock(product, qty, total_or_unit_cost)` | stock_movements, products (qty, avg C-22) | qty ≥ 1 |
| `adjust_stock(product, new_count or change, reason)` | stock_movements, products.stock_qty, stock_discrepancies | Reason required; value per C-25 |
| `record_repayment(customer, amount, method, ref, date)` | customer_ledger | 0 < amount ≤ balance |
| `adjust_balance(customer, amount, type, reason)` | customer_ledger | type ∈ adjustment / write_off / write_off_reversal; balance ≥ 0; reversal ≤ previously written off |
| `save_expense(...)` / `delete_expense(id)` | expenses | amount > 0 |
| `save_cash_count(date, opening, counted, note)` | cash_counts | Server computes expected (C-80) |
| `register_device()` | devices | Assigns the next free device_code |
| `export_csv(range, kinds)` | — (read only) | Membership |
| `check_stock_integrity()` | — (read only) | stock_qty = Σ qty_change for every product; used in tests and a weekly check |

## 4. Changes from the original PLAN.md schema

| Change | Reason |
|---|---|
| `products.avg_cost` (replaces cost_price) | Weighted-average costing |
| `stock_movements.value`, `reason`, `avg_cost_after` | Loss valuation and traceability |
| `sale_items.unit_cost` NUMERIC, server-assigned; `cost_missing` | C-23, C-24 |
| `sales.momo_reference`, `paid_now_*`, `mode`, `device_id`, `clock_flag` | MoMo reference; part payment; sync |
| `customer_ledger` types `write_off`, `write_off_reversal`; `momo_reference` | Bad debts in profit |
| `expenses.paid_from` | Cash count |
| New tables `cash_counts`, `devices` | Cash reconciliation; multi-device receipt numbers |
| `subscriptions.plan/status` value `pilot` | Free pilot period |
