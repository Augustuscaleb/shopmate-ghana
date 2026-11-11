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
| `payload` | Full sale: lines with unit price and unit cost, discount, method, customer, paid now, MoMo reference |
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
| SY-17 | After each success, the phone refreshes the affected products and customers from the server |

## 5. Receipt numbers (SY-20)

The server cannot assign numbers offline, so each phone gets a short **device code** at first login (e.g. `A`, `B`). Receipt numbers are then `A-000123`: device code plus a local counter.
- Unique per shop.
- Readable for owners.
- Never reused, even if a sale fails.

## 6. Local stock and figures (SY-30 – SY-32)

| ID | Rule |
|---|---|
| SY-30 | **Displayed stock** = last downloaded server stock − quantities in this phone's Pending and Failed sales |
| SY-31 | **Today figures** = server figures (synced) + locally computed figures for Pending sales (see 05 §5) |
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

Owner-only does not prevent the owner using 2 phones (e.g. phone and tablet), within plan limits.
- Each device has its own outbox and device code.
- Stock may briefly differ between devices until both sync. The server totals are authoritative.
- If both phones sell the last item offline, negative stock is flagged as normal.

## 9. Clock problems (SY-50)

The server records `received_at`.
- If `occurred_at` is more than 24 hours in the future, or more than 30 days in the past compared with `received_at`, the sale is **accepted** but flagged in Needs attention: "Check this sale's date: your phone's clock may be wrong."
- Reports use `occurred_at`.

## 10. App updates (SY-60)

- The server accepts all `payload_version` values still in use.
- Updates never delete the outbox.
- Database changes on the phone run as versioned local migrations that keep queued sales.

## 11. Test scenarios (must pass before the pilot)

1. Sale offline → reconnect → synced once; stock correct.
2. Network drops **after** the server saves but before the reply → retry → "already recorded" → only one sale exists.
3. 50 offline sales over a day → all sync in order; totals match.
4. App killed during sending → restart → no loss, no duplicates.
5. Offline sale makes stock −2 → discrepancy created → adjustment resolves it.
6. Online sale with insufficient stock → rejected; nothing queued; correction flow works.
7. Token expired offline → sell → reconnect → refresh → synced.
8. Different account login attempt with Pending sales → blocked.
9. Corrupted payload → Failed status, visible, later sales unaffected.
10. Two devices sell the same item offline → both accepted; discrepancy flagged.
11. Phone clock set 2 days wrong → sale flagged.
12. App upgraded with Pending sales → still sync.
