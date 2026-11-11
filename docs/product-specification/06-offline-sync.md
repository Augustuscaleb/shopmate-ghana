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
| `occurred_at` | Phone wall-clock time at the sale |
| `elapsed_ms`, `boot_id` | Android elapsed time since boot (cannot be changed in settings) and boot session ID, used to verify the sale time (05 §3.6) |
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
| SY-07 | **Cancelled before upload** | ⊘ grey, struck through | Owner cancelled it through the safe process (04 §1.5); recorded on the server as `cancelled_unsent`; no effect on totals |
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
| SY-18 | **Failed-sale recovery:** a Failed sale stays on the phone with its reason, **indefinitely**. Options: **Retry** (e.g. after an app update); **Send details to support** (owner-initiated WhatsApp message with the sale's details); **Cancel this sale** using the safe process in 04 §1.5 (internet required; server status check; reason; review; password or PIN; server-side record). There is **no local-only discard**: a sale can only leave the outbox when the server has confirmed it as recorded or as cancelled. Failed sales stay in the "Needs attention" banner until resolved |
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
| SY-71 | **Concurrency:** each upload is one database transaction that (1) claims the sale ID (duplicate check), (2) locks the affected product rows in product-ID order, (3) locks the customer row for credit sales, then (4) updates stock with `stock_qty = stock_qty − qty`. Sales touching the same products are therefore processed one after another, never interleaved; sales touching different products run in parallel. Full design: 09 §4 |
| SY-72 | **Online sales from two devices for the last unit:** the first succeeds; the second fails stock validation and is not queued (04 §1.2) |
| SY-73 | **Offline sales from two devices for the same remaining stock:** both are accepted; whichever is processed second takes stock negative and creates a discrepancy (see §8.1) |
| SY-74 | Each device refreshes its cache after syncing, and every 15 minutes while online, so the devices converge. The server is authoritative |
| SY-75 | **Stock reconciliation:** an adjustment resolves open discrepancies (04 §2.3). `check_stock_integrity()` confirms stock_qty = Σ movements and runs in tests and weekly in production; any mismatch alerts the admin |

### 8.1 Two devices offline, both selling the same remaining stock

**Situation:** Sardine stock is 1. Phone A and Phone B are both offline, and both show "1 left". A sells 1 at 10:05; B sells 1 at 10:20.

| Step | What happens |
|---|---|
| 1 | Both sales complete normally. Each phone shows "0 left" locally. The customer is never refused |
| 2 | B reconnects first, at 11:00. Its sale is processed: stock 1 → 0. No discrepancy |
| 3 | A reconnects at 12:00. Its sale is processed (the product row is locked, so it cannot overlap with any other Sardine update): stock 0 → **−1**. A **discrepancy** is created, linked to A's sale, shortfall 1 |
| 4 | Each sale is costed **as at its own sale time** (C-23), so upload order does not change either sale's cost |
| 5 | Both phones refresh: Sardine shows **−1** in red, and Today shows "Needs attention: 1 stock issue" |
| 6 | **The owner resolves it**, depending on what really happened:<br>• **There really were 2 tins** (the count was wrong): *Count and correct* → enter the real count → discrepancy resolved (no profit effect, C-32)<br>• **One sale was a mistake** (e.g. recorded on both phones): void that sale (§1.4) → stock back to 0 → discrepancy resolved as `sale_voided`<br>• **A different item was sold**: void and re-record the correct sale |
| 7 | Nothing is deleted. Both sales, the discrepancy and its resolution stay in history and the audit log |

**Which sale gets the discrepancy?** The one the server processed second, which depends on upload order, not sale time. The discrepancy screen therefore lists **all recent sales of that product from every device**, so the owner can judge which one was wrong.

## 9. Sale time and clock problems (SY-50 – SY-53)

| ID | Rule |
|---|---|
| SY-50 | Every sync starts with `sync_heartbeat`: the phone sends its wall-clock time, elapsed time and boot ID; the server records the device's clock offset |
| SY-51 | For each uploaded sale, the server estimates the true sale time and assigns a **time confidence** (high / medium / low) using the checks in 05 §3.6 (C-90 – C-95) |
| SY-52 | **Low confidence** (e.g. sale time after upload time, clock moved backwards between receipts, far in the past): the sale is **accepted** (never lost), costed and reported at upload time, and flagged in Needs attention: "Check this sale's time: your phone's clock may be wrong." Both times are shown |
| SY-53 | Overlapping times from several devices are not a conflict for costing, because sales don't change the average and cost events are server-timed (05 §3.7). Stock conflicts are handled by discrepancies (§8.1) |

## 10. App updates (SY-60)

- The server accepts all `payload_version` values still in use.
- Updates never delete the outbox.
- Database changes on the phone run as versioned local migrations that keep queued sales.

## 11. Test scenarios

All sync, duplicate-prevention, failed-sync recovery, multi-device and reconciliation tests are in **[10-test-plan.md §4](10-test-plan.md)** (TC-SYNC-01 to 20), together with cancellation (TC-CANCEL) and concurrency (TC-CONC). They are **release gate G2**: they must pass, with evidence, before any real business data is used. **Current status: documented only; not implemented or run.**
