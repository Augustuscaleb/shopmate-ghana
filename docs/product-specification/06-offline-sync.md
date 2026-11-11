# 06 — Offline Synchronisation Behaviour

Builds on the approved design in [PLAN.md §4](../PLAN.md#4-offline-sales-and-synchronisation). **Scope:** only **sales** (including credit sales and paid-now amounts) can be created offline.

## 1. Local data on the phone

| Data | Purpose | Refreshed |
|---|---|---|
| Products (active, with prices, cost, stock, low-stock level) | Selling and display | On login, on app open, every 15 minutes while online, after each successful sync, pull-to-refresh |
| Customers (active, with cached balance and limit) | Credit sale picker | Same |
| Shop settings (name, receipt footer) | Receipts | On login and on change |
| **Outbox** (unsent sales) | Reliable upload | Until confirmed |
| Recent synced sales (last 30 days) | History and Today figures | After sync |

**First use needs internet:** after login, the app downloads the shop data before selling is possible. A progress message shows "Getting your shop ready…".

## 2. Outbox item

| Field | Notes |
|---|---|
| `sale_id` | UUID created on the phone; the server's duplicate check key |
| `receipt_no` | See §5 |
| `payload` | Full sale: lines with qty and unit price, **provisional** unit cost (phone display only; the server assigns the real cost, C-23), discount, method, customer, paid now, MoMo reference |
| `payload_version` | Integer; starts at 1 |
| `occurred_at` | Phone time at the sale |
| `created_offline` | true if first attempt failed (sent with `mode = offline`) |
| `status` | `pending` · `sending` · `synced` · `failed` |
| `attempts`, `last_error`, `next_retry_at` | Retry control |

## 3. Statuses (SY-01 – SY-06)

| ID | Status | Shown as | Meaning |
|---|---|---|---|
| SY-01 | **Pending** | ⏱ grey "Waiting to upload" | Saved on phone; not yet confirmed |
| SY-02 | (sending) | ⏱ spinner | Shown as Pending to the owner |
| SY-03 | **Synced** | ✓ green | Server confirmed (including "already recorded") |
| SY-04 | **Failed** | ⚠ red "Needs attention" | Server rejected it for a reason retrying won't fix |
| SY-05 | Banner | "3 sales waiting to upload" / "1 sale needs attention" | On Today and Sell whenever there are Pending or Failed sales |
| SY-06 | Last sync | "Last updated 10:42" in Settings and on the Products list | Shows how fresh the cached data is |

## 4. Sending rules (SY-10 – SY-17)

| ID | Rule |
|---|---|
| SY-10 | Send oldest first, **one at a time**, so stock effects follow sale order |
| SY-11 | **Triggers:** right after a sale; when connectivity returns; on app open; every 60 seconds while there are Pending items and the app is open; optional Android background task when allowed |
| SY-12 | **Retry backoff** for temporary errors: 5 s, 30 s, 2 min, 10 min, then every 30 min. Never give up on temporary errors |
| SY-13 | **Temporary errors:** no network, timeout, HTTP 5xx, rate-limited, session expired (after refreshing login) |
| SY-14 | **Permanent errors → Failed:** invalid data that the server refuses (e.g. corrupted payload, unknown business). The owner can tap **Retry** (after an app update) or **Contact support** (sends the sale ID, never business amounts, to support) |
| SY-15 | The server reply "already recorded" = success (duplicate prevention) |
| SY-16 | A Failed sale never blocks later sales from sending |
| SY-17 | After each success, the phone refreshes the affected products and customers from the server, and replaces provisional costs with server costs |
| SY-18 | **Failed-sale recovery:** a Failed sale stays on the phone with its reason. Options: **Retry** (e.g. after an app update); **Send details to support** (owner-initiated WhatsApp message with the sale's details, so support can help); **Discard** (only if the sale did not really happen; requires typing "DISCARD"; restores local stock; logged locally and uploaded as an audit event). Failed sales are counted in the "Needs attention" banner until resolved |
| SY-19 | **Classification:** "needs app update" (unsupported payload version), "data problem" (validation failed), "account problem" (business mismatch or revoked device). Each has its own plain-English message |

## 5. Receipt numbers (SY-20)

The server cannot assign numbers offline, so each phone gets a short **device code** at first login (e.g. `A`, `B`). Receipt numbers are then `A-000123`: device code plus a local counter.
- Unique per shop.
- Readable for owners.
- Never reused, even if a sale fails.

## 6. Local stock and figures (SY-30 – SY-32)

| ID | Rule |
|---|---|
| SY-30 | **Displayed stock** = last downloaded server stock − quantities in this phone's Pending and Failed sales |
| SY-31 | **Today figures** = server figures (synced) + locally computed figures for Pending sales (see 05 §6) |
| SY-32 | **Cached customer balance** for credit decisions = last downloaded balance + this phone's Pending credit (total − paid now) |

## 7. Session and account safety (SY-40 – SY-44)

| ID | Rule |
|---|---|
| SY-40 | Selling works offline even if the login token has expired. The token is refreshed when back online before sending |
| SY-41 | If refresh fails (password changed, device logged out remotely): the outbox is **kept**; the owner must log in again (same account) before items are sent |
| SY-42 | **A different account cannot log in** on a phone with unsent sales from another shop. The app says: "This phone has sales for Ama's Provisions that haven't uploaded. Log in to that account first." |
| SY-43 | Logout is blocked while Pending or Failed sales exist (S-74 in screens) |
| SY-44 | Uninstalling the app deletes local data. Help and onboarding explain this, and the Pending banner encourages syncing daily. **This residual risk is accepted for the MVP** |

## 8. Multiple phones for one shop

Owner-only does not prevent the owner using 2–3 phones (e.g. a phone and a tablet), within plan limits. Pilot shops may use up to 3.

| ID | Rule |
|---|---|
| SY-70 | Each device is registered (`register_device`) and gets a unique device code. It has its own outbox and receipt counter, so receipt numbers never collide |
| SY-71 | The server processes sales from all devices **one product row at a time**: each `record_sale` locks the products it touches, in product-ID order, inside one transaction. Simultaneous sales are therefore serialised: stock and average cost are never corrupted, and deadlocks are avoided |
| SY-72 | **Online sales from two devices for the last unit:** the first succeeds; the second fails stock validation and is not queued (04 §1.2) |
| SY-73 | **Offline sales from two devices for the last unit:** both are accepted; the sale processed second creates a discrepancy (04 §1.3) |
| SY-74 | Each device refreshes its cache after syncing, and every 15 minutes while online, so the devices converge. The server is authoritative |
| SY-75 | **Stock reconciliation:** an adjustment resolves open discrepancies (04 §2.3). `check_stock_integrity()` confirms stock_qty = Σ movements and runs in tests and weekly in production; any mismatch alerts the admin |

## 9. Clock problems (SY-50)

The server records `received_at`.
- If `occurred_at` is more than 24 hours in the future, or more than 30 days in the past compared with `received_at`, the sale is **accepted** but flagged in Needs attention: "Check this sale's date: your phone's clock may be wrong."
- Reports use `occurred_at`.

## 10. App updates (SY-60)

- The server accepts all `payload_version` values still in use.
- Updates never delete the outbox.
- Database changes on the phone run as versioned local migrations that keep queued sales.

## 11. Test scenarios

All sync, duplicate-prevention, failed-sync recovery, multi-device and reconciliation tests are in **[10-test-plan.md §4](10-test-plan.md)** (TC-SYNC-01 to TC-SYNC-20). They are **release gate G2**: they must pass before any real business data is used.
