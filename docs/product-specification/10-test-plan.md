# 10 — Test Plan and Release Gates

Each test references the rule it proves. **All "Gate" tests must pass before any real business data is used.**

Test types:
- **Unit:** formulas, in TypeScript on the phone.
- **DB:** SQL tests against a local Supabase (Docker) or a throwaway test project — never production.
- **E2E:** app running on an emulator or a real low-end Android phone.
- **Manual drill:** a documented step-by-step exercise.

## 1. Financial calculations

| ID | Test | Rules | Type |
|---|---|---|---|
| TC-FIN-01 | Worked example in 05 §9 produces every listed figure exactly | C-10–C-80 | DB + Unit |
| TC-FIN-02 | Cedi input conversion (`12.5`→1250; `12.555` rejected; `0` rejected where > 0 required) | C-04 | Unit |
| TC-FIN-03 | Percentage discount rounding half up (e.g. 5% of 45.10 = 2.255 → 2.26); discount > subtotal rejected | C-12 | Unit + DB |
| TC-FIN-04 | Server rejects a sale whose client total doesn't match the lines | SEC-13 | DB |
| TC-FIN-05 | Same formulas on phone and server give identical results for 1,000 random sales | C-10–C-13 | Unit + DB |
| TC-FIN-06 | Voided sales and deleted expenses are excluded from every report figure | C-40–C-49 | DB |
| TC-FIN-07 | Net profit = gross − operating expenses − stock losses − bad debts, with each line shown separately | C-47 | DB + E2E |
| TC-FIN-08 | Day boundaries: sale at 23:59 and 00:01 Ghana time go to the correct days | §5 | DB |

## 2. Cost (weighted average)

| ID | Test | Rules |
|---|---|---|
| TC-COST-01 | Restock blending (10 @ 11.00 + 12 @ 11.60 → 1132.7273) | C-22 |
| TC-COST-02 | Restock when stock is 0 or negative → avg = new unit cost | C-22 |
| TC-COST-03 | Restock when cost unknown → avg = new unit cost | C-22 |
| TC-COST-04 | Sale uses server avg at processing time; phone's provisional cost replaced | C-23, C-28 |
| TC-COST-05 | Unknown cost → line cost 0, `cost_missing` flagged, report warning count correct | C-24, C-54 |
| TC-COST-06 | Adjustments don't change avg; loss valued at avg | C-25 |
| TC-COST-07 | Void re-blends at the original line unit cost | C-26 |
| TC-COST-08 | Manual cost correction changes avg; past sales unchanged | C-27, C-29 |
| TC-COST-09 | Two simultaneous restocks of the same product (parallel transactions) → avg equals the sequential result | Locking |
| TC-COST-10 | Long sequence (100 random restocks, sales, voids, adjustments) → no drift beyond 4 dp rounding; integrity check passes | All |

## 3. Losses and credit

| ID | Test | Rules |
|---|---|---|
| TC-LOSS-01 | Damaged / expired / missing / own use / count-down are counted as stock losses at avg cost | C-30 |
| TC-LOSS-02 | Count-up corrections are **not** income; shown as "stock found" | C-31 |
| TC-LOSS-03 | Resolving negative stock with a count-up has no profit effect | C-32 |
| TC-CRED-01 | Credit sale with paid-now creates `credit_sale` (+total) and `repayment` (−paid now) | C-70, C-71 |
| TC-CRED-02 | Repayment > balance rejected; = balance accepted | C-76 |
| TC-CRED-03 | Write-off reduces profit in its period; reversal + repayment restores correctly | C-73, C-74 |
| TC-CRED-04 | Reversal greater than the amount written off is rejected | C-74 |
| TC-CRED-05 | Correction `adjustment` doesn't affect profit | C-72 |
| TC-CRED-06 | Void of a credit sale after partial repayments never makes the balance negative | C-75, C-76 |
| TC-CRED-07 | Credit-limit warning shown (warning only), including offline with cached balance | 04 §3.4 |
| TC-CASH-01 | Expected cash formula, including paid-now cash and drawer expenses only | C-80 |

## 4. Offline synchronisation and stock consistency (**Gate**)

| ID | Scenario | Expected result | Rules |
|---|---|---|---|
| TC-SYNC-01 | Sale offline → reconnect | Synced once; stock and totals correct | SY-10 |
| TC-SYNC-02 | **Duplicate:** server saves, reply lost, phone retries | "Already recorded" → exactly 1 sale, 1 set of movements, 1 ledger entry | SY-15 |
| TC-SYNC-03 | **Duplicate:** the same sale is sent twice in parallel (race) | Primary-key conflict handled → exactly 1 sale | SY-15 |
| TC-SYNC-04 | 200 offline sales over a day, then reconnect | All synced in order; totals match local figures | SY-10 |
| TC-SYNC-05 | App killed mid-send; phone restarted | No loss, no duplicates | E-01 |
| TC-SYNC-06 | **Failed-sync recovery:** a corrupted payload is rejected permanently | Status Failed; visible; later sales still sync; Retry works after the fix; Discard requires confirmation and restores local stock | SY-14, SY-16 |
| TC-SYNC-07 | Payload from an unsupported (very old) app version | Failed with "Update the app"; after update, Retry succeeds | SY-60 |
| TC-SYNC-08 | Token expired while offline | Sell continues; sync after login refresh | SY-40 |
| TC-SYNC-09 | Different account tries to log in with pending sales | Blocked | SY-42 |
| TC-SYNC-10 | **Multi-device:** phones A and B each sell the last 2 units offline | Both accepted; stock −2; one discrepancy created for whichever sale (processed second) took stock below 0 | SY multi-device |
| TC-SYNC-11 | **Multi-device online race:** A and B sell the last unit online simultaneously | One succeeds; the other is rejected with the stock message; nothing queued | 04 §1.2 |
| TC-SYNC-12 | Multi-device receipt numbers | A-… and B-… never collide; device codes unique | SY-20 |
| TC-SYNC-13 | **Stock reconciliation:** adjustment resolves open discrepancies when stock ≥ 0 | Discrepancies resolved and linked; history intact | 04 §2.3 |
| TC-SYNC-14 | `check_stock_integrity()` after all sync tests | stock_qty = Σ movements for every product | 09 §3 |
| TC-SYNC-15 | Phone clock 2 days wrong | Sale accepted and flagged | SY-50 |
| TC-SYNC-16 | App upgrade with pending sales | Pending sales sync after upgrade | SY-60 |
| TC-SYNC-17 | Local stock display = server stock − pending quantities | Matches after each step | SY-30 |
| TC-SYNC-18 | Online sale times out (slow network) | Sale queued as Pending (offline mode); never lost; never double-counted | 04 §1.2 |
| TC-SYNC-19 | Logout attempted with pending or failed sales | Blocked with explanation | SY-43 |
| TC-SYNC-20 | Field test: real low-end phone, airplane mode on and off 20 times during 100 sales | Zero lost or duplicate sales | All |

## 5. Security (**Gate**)

| ID | Test |
|---|---|
| TC-SEC-01 | For **every** table: a user of Business A cannot select, insert, update or delete Business B rows |
| TC-SEC-02 | For **every** server function: calls with another business's IDs are rejected |
| TC-SEC-03 | Direct writes to money, stock and ledger tables via the API are denied (functions only) |
| TC-SEC-04 | Invalid inputs rejected server-side (negative qty, amount above limit, overlong text, unknown enum values) |
| TC-SEC-05 | Service-role key absent from the app bundle and the repository (automated secret scan) |
| TC-SEC-06 | Crash reports contain no customer names, phone numbers, amounts or product names |
| TC-SEC-07 | "Log out other devices" revokes their sessions; their outboxes are kept until the owner logs back in |
| TC-SEC-08 | Audit log entries created for every action listed in SEC-21 |

## 6. Backup and restore (**Gate**)

The backup is treated as **not implemented** until all of these pass. A written backup script alone does not count.

| ID | Test |
|---|---|
| TC-BAK-01 | Scheduled backup workflow runs successfully and produces encrypted files in private storage |
| TC-BAK-02 | Backup files cannot be read without the decryption key |
| TC-BAK-03 | **Restore drill:** restore the latest backup into a separate test target (PLAN §10.4); row counts, money totals, stock integrity and RLS tests all pass; a test user can log in |
| TC-BAK-04 | Failure alert: a deliberately broken backup run sends a failure email |
| TC-BAK-05 | The restore drill is recorded in `docs/RESTORE-LOG.md` with date, duration and result |

## 7. Usability (pilot)

| ID | Test | Target [A] |
|---|---|---|
| TC-UX-01 | First sale after install | Under 10 minutes |
| TC-UX-02 | Common sale | Under 15 seconds |
| TC-UX-03 | Every action is possible with plain taps (no long-press or swipe-only actions) | 100% |
| TC-UX-04 | Readable at 130% font size; ₵ renders on 3+ low-end devices | Pass |

## 8. Release gates

| Gate | Required before | Tests |
|---|---|---|
| **G1 — Internal build** | Owner testing with fake data | TC-FIN, TC-COST, TC-LOSS, TC-CRED, TC-CASH |
| **G2 — Real data allowed** | Any pilot shop enters real data | G1 + **all** TC-SYNC + **all** TC-SEC + **all** TC-BAK |
| **G3 — Pilot expansion** | Going beyond the first 2–3 shops | G2 + TC-SYNC-20 on pilot devices + no open critical bugs |
