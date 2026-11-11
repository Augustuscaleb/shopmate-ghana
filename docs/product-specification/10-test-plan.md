# 10 — Test Plan and Release Gates

**Revision 5.**

## 0. Test status (read this first)

| Status | Meaning | Evidence required |
|---|---|---|
| 📝 **Documented** | The test is described in this plan. **No test code exists** | This document |
| 🛠 **Implemented** | Test code exists in the repository, but has **not yet passed** in the current build | File path of the test |
| ✅ **Passed** | The test ran and passed | Date, commit ID and CI run link or log, recorded in the Status column |
| ❌ **Failed** | The test ran and failed | Date, commit, link; issue opened |

**Current status (11 November 2026): every test below is 📝 Documented. No tests have been implemented or run, because no application code or database exists yet.**

| Area | Tests | 📝 Documented | 🛠 Implemented | ✅ Passed |
|---|---|---|---|---|
| Financial (TC-FIN) | 8 | 8 | 0 | 0 |
| Cost (TC-COST) | 21 | 21 | 0 | 0 |
| Sale time (TC-TIME) | 10 | 10 | 0 | 0 |
| Daily closing (TC-CLOSE) | 9 | 9 | 0 | 0 |
| Purchases (TC-PUR) | 9 | 9 | 0 | 0 |
| Needs attention (TC-ATTN) | 7 | 7 | 0 | 0 |
| Losses (TC-LOSS) | 3 | 3 | 0 | 0 |
| Credit (TC-CRED, TC-CASH) | 13 | 13 | 0 | 0 |
| Sync (TC-SYNC) | 20 | 20 | 0 | 0 |
| Cancellation (TC-CANCEL) | 9 | 9 | 0 | 0 |
| Concurrency (TC-CONC) | 7 | 7 | 0 | 0 |
| Security (TC-SEC) | 9 | 9 | 0 | 0 |
| Backup (TC-BAK) | 5 | 5 | 0 | 0 |
| Usability (TC-UX) | 4 | 4 | 0 | 0 |
| **Total** | **134** | **134** | **0** | **0** |

**Rules:**
- A status moves to ✅ only with the evidence above.
- A test that passed earlier but whose code or rules changed returns to 🛠 until it is re-run.
- Status summaries in other documents must quote this table, never "planned = done".

**Test types:**
- **Unit:** TypeScript tests of formulas.
- **DB:** SQL tests against a local Supabase (Docker) or a throwaway test project — never production.
- **CONC:** several parallel database connections.
- **E2E:** the app on an emulator or a low-end Android phone.
- **Drill:** a documented manual exercise.

## 1. Financial calculations

| ID | Test | Rules | Type | Status |
|---|---|---|---|---|
| TC-FIN-01 | Worked example 05 §9 gives every listed figure exactly | C-10–C-80 | DB + Unit | 📝 |
| TC-FIN-02 | Cedi input conversion; >2 decimals rejected | C-04 | Unit | 📝 |
| TC-FIN-03 | Discount rounding half up (5% of 45.10 = 2.26); discount > subtotal rejected | C-12 | Unit + DB | 📝 |
| TC-FIN-04 | Server rejects a client total that doesn't match the lines | SEC-13 | DB | 📝 |
| TC-FIN-05 | Phone and server formulas agree for 1,000 random sales | C-10–C-13 | Unit + DB | 📝 |
| TC-FIN-06 | Voided, cancelled-before-upload sales and deleted expenses excluded from all figures | C-40–C-49 | DB | 📝 |
| TC-FIN-07 | Net profit = gross − expenses − stock losses − bad debts + recoveries; each line shown separately | C-47 | DB + E2E | 📝 |
| TC-FIN-08 | Day boundaries (23:59 / 00:01 Ghana time) | §5 | DB | 📝 |

## 2. Cost (value-pool weighted average, sale-time costing)

| ID | Test | Rules | Status |
|---|---|---|---|
| TC-COST-01 | Restock adds the **purchase cost**: 10 / 11000 + 12 costing 13920 → 22 / 24920 (avg 1132.7273) | C-21 | 📝 |
| TC-COST-02 | Restock while stock is −2 (value −2000) with 10 costing 15000 → cost adjustment +1000 with a Needs attention item; pool 8 / 12000 (avg 1500) | C-25, C-122 | 📝 |
| TC-COST-03 | Stock reaches 0 with value left over → leftover posted as cost adjustment; value 0 | C-25a | 📝 |
| TC-COST-04 | Every value-changing event writes exactly one history row with qty, value and average | C-22 | 📝 |
| TC-COST-05 | Unknown cost → line cost 0, `cost_missing`, warning count; first cost set → value correction, no profit effect | C-24, C-27a | 📝 |
| TC-COST-06 | Losses and stock found valued at round(qty × average); average unchanged | C-21, C-30 | 📝 |
| TC-COST-07 | Void returns the original line cost to the pool | C-21, C-26 | 📝 |
| TC-COST-08 | Manual cost correction → `value_correction` (info line, not profit); past sales unchanged | C-27, C-29 | 📝 |
| TC-COST-09 | Two parallel restocks of one product = sequential result | 09 §4.2 | 📝 |
| TC-COST-10 | 100 random restocks, sales, voids and adjustments: `check_stock_integrity()` passes | 09 §3 | 📝 |
| TC-COST-11 | **Owner's scenario A** (05 §3.5): late sale costed 2 × 10.00 = 20.00; pool afterwards 18 / 23000, average **1277.7778**, equal to true-time-order processing | C-21, C-23 | 📝 |
| TC-COST-12 | **Scenario B** (in-between sale): every figure in 05 §3.5 matches; total cost conserved; C-58 logs the late-sale difference | C-20, C-58 | 📝 |
| TC-COST-13 | A recorded sale's cost never changes after later restocks, corrections or uploads | C-29 | 📝 |
| TC-COST-14 | Re-sending a recorded sale returns the same stored cost | C-29 | 📝 |
| TC-COST-15 | Low-confidence sale is costed at upload time; `cost_basis` recorded | C-23, C-93 | 📝 |
| TC-COST-16 | Sale time earlier than the first history row → earliest row; `cost_basis_adjusted` | C-23a | 📝 |
| TC-COST-17 | Late sale leaves value negative while qty > 0 → cost adjustment to 0 **and** a "Cost check needed" item showing the GH₵ effect | C-25b, C-123 | 📝 |
| TC-COST-18 | **Order independence:** the same restocks plus several offline sales (no in-between online sales), uploaded in every possible order, give an identical final pool, equal to true-time-order processing | C-21 | 📝 |
| TC-COST-19 | Restock, adjustment, void and cost correction are impossible offline (buttons disabled; no queue) | 05 §3.8 | 📝 |
| TC-COST-20 | **Conservation statement** (05 §3.2), with every term (opening value, purchases at full cost, purchase corrections, customer returns, stock found, owner corrections, supplier returns, cost of items sold, stock losses, own use, cost adjustments), holds exactly to the pesewa for every product and every period, after every test in sections 2, 2a, 2c and 2d | C-20, C-21 | 📝 |
| TC-COST-21 | Cost-adjustment and value-correction lines appear in the right report lines (Cost of items sold sub-line vs info) | C-41, C-57 | 📝 |

## 2a. Sale time: anchors, reboots and clock changes

| ID | Test | Rules | Status |
|---|---|---|---|
| TC-TIME-01 | Anchor at 08:00; offline; wall clock moved −3 h; sale 2 h later in the same boot → estimated 10:00, **high** | C-90, C-95 | 📝 |
| TC-TIME-02 | **Reboot while offline** (elapsed resets): reboot detected (boot ID or elapsed decrease); no same-session anchor; wall clock within bounds, no clock change, offset ≤ 5 min → **medium**, wall-clock time used | C-92, C-95 | 📝 |
| TC-TIME-03 | Reboot detected via elapsed decrease when the boot counter is unavailable | C-92 | 📝 |
| TC-TIME-04 | Clock changed by > 2 min within a session → "clock changed" event; later sales in that session without a newer anchor are not medium | C-93, C-95 | 📝 |
| TC-TIME-05 | Wall clock earlier than the previous sale (lower bound) → **low**; reported and costed at upload time; window shown | C-94 – C-96 | 📝 |
| TC-TIME-06 | Wall clock later than upload time → **low** | C-94 | 📝 |
| TC-TIME-07 | Sequence numbers out of order with estimated times → **low** | C-95 | 📝 |
| TC-TIME-08 | Low-confidence sale raises "Sale time uncertain" with both times; never rejected | C-96, C-125 | 📝 |
| TC-TIME-09 | Two devices with overlapping times around a server-timed restock: each costed by its own estimate | 05 §3.7 | 📝 |
| TC-TIME-10 | Sale time exactly equal to a restock → history row counts as earlier | C-23a | 📝 |

## 2b. Daily closing and adjustments

| ID | Test | Rules | Status |
|---|---|---|---|
| TC-CLOSE-01 | Close the day stores the original closing record (all figures and the cash count) | C-100 | 📝 |
| TC-CLOSE-02 | A second close for the same day is refused; the original is unchanged | C-100 | 📝 |
| TC-CLOSE-03 | Late upload of a sale from a closed day → day adjustment; original figures byte-for-byte unchanged; adjusted total correct | C-101, C-104 | 📝 |
| TC-CLOSE-04 | Void, cancellation and back-dated expense, payment and supplier payment affecting a closed day → one adjustment each | C-102 | 📝 |
| TC-CLOSE-05 | Cash recount after closing → adjustment; original count kept; adjusted expected/counted/difference correct | C-102 | 📝 |
| TC-CLOSE-06 | Cost adjustments and purchase corrections are dated on the processing day, never on a closed day | C-103 | 📝 |
| TC-CLOSE-07 | For every closed day: original + Σ adjustments = fresh recalculation from records | C-105 | 📝 |
| TC-CLOSE-08 | Direct UPDATE/DELETE on `day_closings` and `day_adjustments` via the API is denied | SEC-27 | 📝 |
| TC-CLOSE-09 | Weekly and monthly reports show adjusted totals plus the count and value of closed-day adjustments | C-106 | 📝 |

## 2c. Purchases and supplier credit

| ID | Test | Rules | Status |
|---|---|---|---|
| TC-PUR-01 | Goods worth GH₵500, paid GH₵300 from the cash drawer → stock value +500; owed 200; expected cash −300; profit 0 | C-110 – C-115 | 📝 |
| TC-PUR-02 | Paid now > purchase cost rejected | C-110 | 📝 |
| TC-PUR-03 | Pay supplier 200 by MoMo → owed 0; MoMo out 200; stock value and profit unchanged; paying more than owed rejected | C-113 | 📝 |
| TC-PUR-04 | Same Pay supplier request twice → recorded once; two parallel payments exceeding unpaid → one rejected | SEC-24, 09 §4.2 | 📝 |
| TC-PUR-05 | Price correction with stock remaining → value goes into the pool; unpaid updated; original purchase unchanged | C-116 | 📝 |
| TC-PUR-06 | Correction after all goods were sold → visible cost adjustment with an attention item | C-116, C-122 | 📝 |
| TC-PUR-07 | Return to supplier: value removed at average; refund in cash increases expected cash; credit vs value difference → cost adjustment | C-117, C-25c | 📝 |
| TC-PUR-08 | Return credited against a purchase's unpaid amount → unpaid reduced; never below 0 | C-117 | 📝 |
| TC-PUR-09 | Own use → own-use line below net profit; not in stock losses; stock value reduced | C-37 | 📝 |

## 2d. Needs attention (visibility)

| ID | Test | Rules | Status |
|---|---|---|---|
| TC-ATTN-01 | Negative stock raises an item with the shortfall, its estimated cost in GH₵, and the three actions | C-120, C-121 | 📝 |
| TC-ATTN-02 | Every automatic cost adjustment ≥ GH₵0.10 raises an item with amount and direction; smaller ones appear as "Rounding" in reports | C-122, C-25a | 📝 |
| TC-ATTN-03 | Negative value with positive qty raises "Cost check needed" | C-123 | 📝 |
| TC-ATTN-04 | **No silent changes:** across all tests, every change to stock_qty has an owner-initiated or sale source, and every automatic value change has a matching attention item or rounding line | §3.4 principles | 📝 |
| TC-ATTN-05 | Acknowledging an item changes no figures | §3.4 | 📝 |
| TC-ATTN-06 | Items clear only through the stated action (e.g. negative stock clears only when stock ≥ 0 through an owner action) | C-120 | 📝 |
| TC-ATTN-07 | Messages are understandable to a non-technical owner (pilot usability check) | D-05 | 📝 |

## 3. Losses, credit and cash

| ID | Test | Rules | Status |
|---|---|---|---|
| TC-LOSS-01 | Damaged / expired / missing / count-down = stock losses at average (own use excluded, see TC-PUR-09) | C-30 | 📝 |
| TC-LOSS-02 | Count-up corrections are not income ("stock found") | C-31 | 📝 |
| TC-LOSS-03 | Resolving negative stock by count-up has no profit effect | C-32 | 📝 |
| TC-CRED-01 | Credit sale with paid-now creates `credit_sale` + `repayment` | C-70, C-71 | 📝 |
| TC-CRED-02 | Payment = balance → repayment only; balance 0 | C-79 | 📝 |
| TC-CRED-03 | Write-off reduces profit in its period | C-33, C-73 | 📝 |
| TC-CRED-04 | **Undo** is limited to the not-yet-undone part of the referenced write-off; restores the balance; reduces bad debts in the undo's period; records no money | C-74 | 📝 |
| TC-CRED-05 | Correction `adjustment` doesn't affect profit | C-34 | 📝 |
| TC-CRED-06 | Void of a credit sale after repayments never makes the balance negative | C-75, C-76 | 📝 |
| TC-CRED-07 | Credit-limit warning (warning only), including offline with cached balance | 04 §3.4 | 📝 |
| TC-CRED-08 | **Undo vs recovery example** 05 §10: every balance, recoverable amount, profit line and money total matches; the final payment is rejected | C-73–C-79 | 📝 |
| TC-CRED-09 | Payment above balance with written-off debt → server split (repayment + recovery) in **one transaction**; above balance + recoverable → rejected, nothing written | C-79 | 📝 |
| TC-CRED-10 | Recovery leaves the balance unchanged; appears in Recovered bad debts, cash/MoMo received and expected cash | C-35, C-48, C-80 | 📝 |
| TC-CRED-11 | The same payment request sent twice (double-tap or retry) → recorded once | SEC-24 | 📝 |
| TC-CRED-12 | Two parallel payments for the same customer whose sum exceeds balance + recoverable → one succeeds; the other is rejected or reduced per the split rule, never both in full | 09 §4.2 | 📝 |
| TC-CASH-01 | Expected cash includes paid-now cash, cash repayments, cash recoveries and cash supplier refunds, minus drawer expenses and drawer purchase/supplier payments | C-80 | 📝 |

## 4. Offline synchronisation and stock consistency (Gate G2)

| ID | Scenario | Expected result | Status |
|---|---|---|---|
| TC-SYNC-01 | Sale offline → reconnect | Synced once; stock and totals correct | 📝 |
| TC-SYNC-02 | Server saves, reply lost, phone retries | `already_recorded`; exactly 1 sale, 1 set of movements and ledger entries | 📝 |
| TC-SYNC-03 | Same sale sent twice in parallel | Exactly 1 sale (primary-key wait and conflict) | 📝 |
| TC-SYNC-04 | 200 offline sales, then reconnect | All synced in order; totals match | 📝 |
| TC-SYNC-05 | App killed mid-send | No loss, no duplicates | 📝 |
| TC-SYNC-06 | Permanently rejected payload | Status Failed; kept indefinitely; later sales still sync; Retry works after the fix; **no local-only discard exists** | 📝 |
| TC-SYNC-07 | Unsupported payload version | Failed with "Update the app"; cancellation not suggested; Retry after update succeeds | 📝 |
| TC-SYNC-08 | Token expired offline | Sell continues; sync after refresh | 📝 |
| TC-SYNC-09 | Different account login with pending sales | Blocked | 📝 |
| TC-SYNC-10 | **Two devices offline sell the same last unit** (06 §8.1) | Both accepted; stock −1; one discrepancy on the sale processed second; each sale costed as at its own sale time; discrepancy screen lists sales of that product from both devices | 📝 |
| TC-SYNC-11 | Two devices sell the last unit **online** at the same moment | One succeeds; the other is rejected with the stock message; nothing queued | 📝 |
| TC-SYNC-12 | Receipt numbers across devices | Never collide; device codes unique | 📝 |
| TC-SYNC-13 | Adjustment resolves discrepancies when stock ≥ 0 | Resolved and linked; history intact | 📝 |
| TC-SYNC-14 | Voiding the sale that caused a discrepancy | Stock back to ≥ 0; resolution `sale_voided` | 📝 |
| TC-SYNC-15 | Phone clock 2 days wrong | Accepted, flagged, costed at `received_at` | 📝 |
| TC-SYNC-16 | App upgrade with pending sales | Still sync | 📝 |
| TC-SYNC-17 | Local stock = server stock − pending quantities | Matches after each step | 📝 |
| TC-SYNC-18 | Online sale times out | Queued as Pending; never lost or doubled | 📝 |
| TC-SYNC-19 | Logout with pending or failed sales | Blocked | 📝 |
| TC-SYNC-20 | Field test: low-end phone, airplane mode toggled 20 times during 100 sales | Zero lost or duplicate sales; `check_stock_integrity()` passes | 📝 |

## 5. Cancelling an unsent sale (Gate G2)

| ID | Scenario | Expected result | Status |
|---|---|---|---|
| TC-CANCEL-01 | Cancel a Failed sale the server never received | Status check "unknown" → reason → review → password → server stores `cancelled_unsent`; phone removes it from the outbox **only after** confirmation; local stock restored | 📝 |
| TC-CANCEL-02 | Cancel a Pending sale that the server **already recorded** (reply was lost) | Cancellation refused; sale marked Synced; Void offered | 📝 |
| TC-CANCEL-03 | Attempt cancellation offline | Refused with explanation; sale unchanged | 📝 |
| TC-CANCEL-04 | No reason, or "Other" without text | Cannot continue | 📝 |
| TC-CANCEL-05 | Wrong password / PIN | Cancellation not performed | 📝 |
| TC-CANCEL-06 | A stale copy of a cancelled sale is uploaded later | Server answers `cancelled`; nothing recorded | 📝 |
| TC-CANCEL-07 | Cancelled sale is visible in history (with reason) and counted in Reports' "Cancelled before upload"; excluded from all totals, stock and balances | Pass | 📝 |
| TC-CANCEL-08 | Network drops after the server stored the cancellation but before the reply | Retry returns `cancelled`; outcome identical (idempotent) | 📝 |
| TC-CANCEL-09 | Audit log contains the cancellation with user, device, reason and full sale snapshot | Pass | 📝 |

## 6. Concurrency and idempotency (Gate G2)

Run with several parallel database connections, repeated at least 100 times to expose timing problems.

| ID | Scenario | Expected result | Status |
|---|---|---|---|
| TC-CONC-01 | 3 devices upload 50 sales each, all touching the same 5 products, in parallel | stock = opening − Σ sold; `check_stock_integrity()` passes; no deadlock left unretried | 📝 |
| TC-CONC-02 | Sales touching overlapping product sets in opposite orders | No deadlock (fixed lock order); all succeed | 📝 |
| TC-CONC-03 | Sale and restock of the same product at the same time | Both applied; avg and history consistent with one sequential order | 📝 |
| TC-CONC-04 | Forced deadlock/serialisation error (test hook) | Full rollback; client retry succeeds once; no partial rows | 📝 |
| TC-CONC-05 | Same request ID sent from two connections simultaneously (payment, write-off, restock) | Exactly one write; both callers receive the same result | 📝 |
| TC-CONC-06 | Credit sale and payment for the same customer at the same time | Balance = Σ ledger; never negative | 📝 |
| TC-CONC-07 | Void and a new sale of the same product at the same time | Both applied consistently; integrity check passes | 📝 |

## 7. Security (Gate G2)

| ID | Test | Status |
|---|---|---|
| TC-SEC-01 | Every table: Business A cannot select, insert, update or delete Business B rows | 📝 |
| TC-SEC-02 | Every function: another business's IDs rejected | 📝 |
| TC-SEC-03 | Direct API writes to money, stock and ledger tables denied | 📝 |
| TC-SEC-04 | Invalid inputs rejected server-side | 📝 |
| TC-SEC-05 | No service-role key in the app bundle or repository (automated scan) | 📝 |
| TC-SEC-06 | Crash reports contain no personal or business data | 📝 |
| TC-SEC-07 | "Log out other devices" revokes sessions; outboxes kept | 📝 |
| TC-SEC-08 | Audit entries for every SEC-21 action | 📝 |
| TC-SEC-09 | Cancellation requires re-authentication | 📝 |

## 8. Backup and restore (Gate G2)

Backup is **not implemented** until TC-BAK-01–05 are ✅.

| ID | Test | Status |
|---|---|---|
| TC-BAK-01 | Scheduled backup runs and produces encrypted files in private storage | 📝 |
| TC-BAK-02 | Files unreadable without the key | 📝 |
| TC-BAK-03 | **Restore drill** (PLAN §10.4): counts, totals, stock integrity, RLS tests and login all pass on the restored copy | 📝 |
| TC-BAK-04 | Failure alert email on a broken run | 📝 |
| TC-BAK-05 | Drill recorded in `docs/RESTORE-LOG.md` | 📝 |

## 9. Usability (pilot)

| ID | Test | Target [A] | Status |
|---|---|---|---|
| TC-UX-01 | First sale after install | < 10 minutes | 📝 |
| TC-UX-02 | Common sale | < 15 seconds | 📝 |
| TC-UX-03 | Every action possible with plain taps | 100% | 📝 |
| TC-UX-04 | 130% font size readable; ₵ renders on 3+ low-end devices | Pass | 📝 |

## 10. Release gates

A gate is passed only when **every** listed test is ✅ Passed with evidence.

| Gate | Required before | Tests | Status |
|---|---|---|---|
| **G1 — Internal build** | Owner testing with fake data | TC-FIN, TC-COST, TC-TIME, TC-CLOSE, TC-PUR, TC-ATTN, TC-LOSS, TC-CRED, TC-CASH | Not reached |
| **G2 — Real data allowed** | Any pilot shop enters real data | G1 + all TC-SYNC, TC-CANCEL, TC-CONC, TC-SEC, TC-BAK | Not reached |
| **G3 — Pilot expansion** | Beyond the first 2–3 shops | G2 + TC-SYNC-20 on pilot devices + no open critical bugs | Not reached |
