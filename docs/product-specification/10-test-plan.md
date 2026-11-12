# 10 — Test Plan and Release Gates

**Revision 5.1** · test status updated for Stage 1 (11 November 2026) and for the first successful cloud verification (12 November 2026).

## 0. Test status (read this first)

Every test shows the **highest level of evidence it actually has**. A level is claimed only with the evidence listed.

| Status | Meaning | Evidence required |
|---|---|---|
| 📝 **Documented** | Described in this plan; **no test code exists** | This document |
| 🛠 **Implemented** | Test code exists, but it has not passed (or not run) in the required environment | File path |
| 🟢 **Local passed** | Passed on the local Supabase stack (Docker) only | Dated log in `docs/test-evidence/` |
| ✅ **CI passed** | Passed locally **and** on GitHub Actions (local Supabase inside the runner) | Commit + CI run link |
| ☁️ **Cloud passed** | Passed against the **actual Supabase cloud project** | Cloud-verification run link + date |
| 📱 **Device verified** | Checked on a **physical Android phone** by the owner | Entry in `docs/testing/DEVICE-TEST-LOG.md` |
| ❌ **Failed** | Ran and failed | Date, commit/run, issue noted |

**Rules:**
- CI and local passes say nothing about the cloud project or a real phone. Tests that need those environments (TC-CLOUD, TC-DEV, TC-UX) stay below ☁️ / 📱 until that evidence exists.
- A test whose code or rules change returns to 🛠 until re-run.

**Current status (12 November 2026: Stage 1B approved; cloud verification passed, [cloud run 43260965124](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43260965124); Stage 1C plan awaiting approval):**

| Area | Tests | 📝 | 🛠 | 🟢 Local only | ✅ CI | ☁️ Cloud | 📱 Device |
|---|---|---|---|---|---|---|---|
| Financial (TC-FIN) | 8 | 8 | 0 | 0 | 0 | 0 | 0 |
| Cost (TC-COST) | 21 | 21 | 0 | 0 | 0 | 0 | 0 |
| Sale time (TC-TIME) | 10 | 10 | 0 | 0 | 0 | 0 | 0 |
| Daily closing (TC-CLOSE) | 9 | 8 | 0 | 0 | 0 | 1 | 0 |
| Purchases (TC-PUR) | 16 | 16 | 0 | 0 | 0 | 0 | 0 |
| Needs attention (TC-ATTN) | 7 | 7 | 0 | 0 | 0 | 0 | 0 |
| Losses (TC-LOSS) | 3 | 3 | 0 | 0 | 0 | 0 | 0 |
| Credit (TC-CRED, TC-CASH) | 13 | 13 | 0 | 0 | 0 | 0 | 0 |
| Sync (TC-SYNC) | 20 | 20 | 0 | 0 | 0 | 0 | 0 |
| Cancellation (TC-CANCEL) | 9 | 9 | 0 | 0 | 0 | 0 | 0 |
| Concurrency (TC-CONC) | 7 | 6 | 1 | 0 | 0 | 0 | 0 |
| Security (TC-SEC) | 9 | 3 | 3 | 0 | 1 | 2 | 0 |
| Backup (TC-BAK), **mandatory gate** | 5 | 5 | 0 | 0 | 0 | 0 | 0 |
| Usability (TC-UX) | 4 | 4 | 0 | 0 | 0 | 0 | 0 |
| **Cloud verification (TC-CLOUD-00 – 03), required** | 4 | 0 | 1 (TC-CLOUD-00: preflight revised after the cloud run) | 0 | 0 | **3** | — |
| **Physical device (TC-DEV), required** | 3 | 3 | 0 | 0 | 0 | — | **0** |
| **Total (planned)** | **148** | **136** | **5** | **0** | **1** | **6** | **0** |
| Stage 1A foundation tests (§0a) | 91 | 0 | 0 | 0 | 0 | 91 | — |
| Stage 1B tests (§0b) | 21 | 0 | 0 | 0 | 17 | 4 | — |
| Cloud preflight tests (§0b, TC-CLOUD-00e – o), revised implementation | 11 | 0 | 0 | 11 | 0 | 0 | — |

## 0a. Stage 1 foundation tests (implemented and run)

These test the database foundation built in Stage 1: schema, constraints, RLS, privileges, and the two Stage 1 server functions. They complement the planned tests above.

| Group | IDs | Count | Where | Status |
|---|---|---|---|---|
| Structure and security setup: 30 tables, RLS on every table, no anon access, writes only on 4 tables, policies everywhere, function privileges, append-only triggers | TC-DB-01 – 08 | 8 | `supabase/tests/database/01_structure_and_constraints.test.sql` | ☁️ **Cloud passed** 2026-11-12 ([cloud run 43260965124](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43260965124)); ✅ CI passed 2026-11-11: [local log](../test-evidence/2026-11-11-stage1-local.log), [CI 43077043749](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43077043749); re-passed in [CI 43081513053](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43081513053) |
| Constraints: duplicate sale ID and receipt, totals and discounts, credit needs customer, cross-business references, low-confidence costing, line totals, device codes, ledger signs and reasons, paid-now ≤ cost, approximate corrections must be flagged with reasons, movement reasons, unique names, one closing per day, one original cash count, MoMo transaction IDs, phone format | TC-DB-10 – 34 | 25 | same file | ☁️ **Cloud passed** 2026-11-12 ([cloud run 43260965124](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43260965124)); ✅ CI passed 2026-11-11 ([CI 43077043749](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43077043749)) |
| Append-only and immutability: movements, ledger, closings, adjustments, audit log, purchases, business_id; customer archive rule; request log | TC-DB-40 – 53 | 13 | same file | ☁️ **Cloud passed** 2026-11-12 ([cloud run 43260965124](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43260965124)); ✅ CI passed 2026-11-11 ([CI 43077043749](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43077043749)) |
| Functions: create_business and register_device, including idempotency, request-ID reuse, foreign business, internal helpers | TC-FN-01 – 09 | 9 | `supabase/tests/database/02_rls_isolation_and_functions.test.sql` | ☁️ **Cloud passed** 2026-11-12 ([cloud run 43260965124](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43260965124)); ✅ CI passed 2026-11-11 ([CI 43077043749](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43077043749)) |
| Isolation and privileges as real database roles (fixtures in **every** business table; A↔B in both directions; writes; anonymous) | TC-SEC-00, 01a–l, 03a–f, 04a–c | 22 | same file | ☁️ **Cloud passed** 2026-11-12 ([cloud run 43260965124](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43260965124)); ✅ CI passed 2026-11-11 ([CI 43077043749](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43077043749)) |
| End-to-end through the real API (Auth + PostgREST): password rule, profiles, isolation, server-function-only writes, idempotency incl. 5 parallel duplicates, anonymous access | TC-API-01 – 14 | 14 | `tests/security.api.test.ts` | ☁️ **Cloud passed** 2026-11-12 ([cloud run 43260965124](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43260965124)); ✅ CI passed 2026-11-11 ([CI 43077043749](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43077043749)) |
| **Total** | | **91** | | **91 ☁️ Cloud passed** (77 database tests in TC-CLOUD-02, 14 API tests in TC-CLOUD-03) |

**Checks that the tests can fail (negative controls, 11 November 2026):**
- With the append-only trigger removed, the immutability test reported **not ok**.
- With RLS disabled on one table, the RLS-everywhere test reported **not ok**.
- With a fake key planted, the secret scan **failed**.

**CI:** `.github/workflows/ci.yml` runs the secret scan, typecheck, all database tests and API tests on every push, using a local Supabase stack inside the GitHub runner. First CI run, 11 November 2026, commit `634206b`: **✅ 77/77 database and 14/14 API tests passed** ([run 43077043749](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43077043749)). The 91 Stage 1 tests therefore have both local and CI evidence.

**Cloud:** 12 November 2026, commit `f22ab13`, on the actual Supabase development project (North EU, Stockholm): **☁️ 77/77 database tests (TC-CLOUD-02) and 14/14 API tests (TC-CLOUD-03) passed** ([cloud run 43260965124](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43260965124), [cloud log](../test-evidence/2026-11-12-cloud-verification.log)). Fictitious data only.

## 0b. Stage 1B tests (login, onboarding, secure storage, cloud tooling)

| Group | IDs | Count | Where | Status |
|---|---|---|---|---|
| Password rules: minimum 8, 2,087 common passwords, repeated characters, email, 72-byte maximum | TC-AUTH-01 – 03 | 3 | `app/src/auth/passwordPolicy.test.ts` | ✅ CI passed 2026-11-11: [local log](../test-evidence/2026-11-11-stage1b-local.log), [CI 43081513053](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43081513053) |
| Validation (Ghana phone formats matching the database, shop name/type, email) | TC-AUTH-04 – 05 | 2 | `app/src/auth/validation.test.ts` | ✅ CI passed 2026-11-11 ([CI 43081513053](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43081513053)) |
| Error messages (no account enumeration; network, rate-limit) | TC-AUTH-06 – 07 | 2 | `app/src/auth/messages.test.ts` | ✅ CI passed 2026-11-11 ([CI 43081513053](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43081513053)) |
| Deep links (confirmation and reset; rejects foreign and malformed links) | TC-AUTH-08 | 1 | `app/src/auth/deepLinks.test.ts` | ✅ CI passed 2026-11-11 ([CI 43081513053](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43081513053)) |
| Chunked secure session storage (over 2 KB, cleanup, missing chunk → logged out, safe keys) | TC-AUTH-09 – 12 | 4 | `app/src/lib/chunkedSecureStorage.test.ts` | ✅ CI passed 2026-11-11 ([CI 43081513053](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43081513053)) |
| **Real login against local Supabase: session only in secure storage, restored after restart, cleared on sign-out** | TC-AUTH-13 | 1 | `tests/session.storage.test.ts` | ✅ CI passed 2026-11-11 ([CI 43081513053](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43081513053)) |
| Onboarding: create shop; lost reply → no second shop; device registered once, survives lost reply | TC-AUTH-14 – 16 | 3 | `tests/onboarding.test.ts` | ✅ CI passed 2026-11-11 ([CI 43081513053](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43081513053)) |
| App refuses service-role and secret keys | TC-AUTH-17 | 1 | `app/src/config/env.test.ts` | ✅ CI passed 2026-11-11 ([CI 43081513053](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43081513053)) |
| Cloud test safeguards (wrong project, missing confirmation, non-local URL in local mode) | TC-CLOUD-00a – d | 4 | `tests/target.test.ts` | ☁️ **Cloud passed** 2026-11-12 ([cloud run 43260965124](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43260965124), run in cloud mode within TC-CLOUD-03); ✅ CI passed 2026-11-11 ([CI 43081513053](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43081513053)) |
| **Cloud preflight** (`scripts/check-cloud-target.mjs`): database-URL project ref must equal `SUPABASE_DEV_PROJECT_REF`; exact Supabase pooler/direct host forms only; mismatched usernames, look-alike hosts and malformed encoded credentials refused; a direct connection accepts only the username `postgres` or `postgres.<project-ref>` (TC-CLOUD-00o); output never contains the URL, password, host, username or refs | TC-CLOUD-00e – o | 11 | `tests/cloud-preflight.test.ts` | 🟢 **Local passed** 2026-11-12 for the **revised** implementation (script `c29e9b49…`): 11/11, plus a negative control in which TC-CLOUD-00o fails against the previous script ([revised local log](../test-evidence/2026-11-12-cloud-preflight-revised-local.log)). **CI verification pending** for the revised implementation. *History:* the previous version (script `fb29d758…`, commit `f22ab13`, tests 00e – n) was ✅ CI passed in [CI 43259802553](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43259802553) ([local log](../test-evidence/2026-11-12-cloud-preflight-local.log)). These unit tests use fake values only |
| **Total** (excluding the preflight row, counted separately in §0) | | **21** | | **17 ✅ CI passed, 4 ☁️ Cloud passed** (TC-CLOUD-00a – d); none 📱 device |

**CI:** Stage 1B commit `1aee353`: ✅ all 21 tests above passed on GitHub Actions ([run 43081513053](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43081513053)), together with all Stage 1A tests and the bundle secret scan.

**Not tested yet (needs a phone):** the screens themselves (layout, flow, Android Keystore on a real device, email links opening the app). These are manual device checks in §0c, 📝 documented.

## 0c. Cloud verification and device checks

| ID | Test | How | Status |
|---|---|---|---|
| TC-CLOUD-00 | Preflight: the database URL secret belongs to the declared development project (project ref matches `SUPABASE_DEV_PROJECT_REF`; exact Supabase host form) before any cloud step runs | `cloud-verify.yml` → `scripts/check-cloud-target.mjs` | 🛠 **Revised after the cloud run** (direct-connection username check, script `c29e9b49…`); the revised version has **not** run in the cloud. *Evidence for the previous version:* ☁️ **Cloud passed** 2026-11-12 with the `f22ab13` script (`fb29d758…`) in [cloud run 43260965124](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43260965124) ([cloud log](../test-evidence/2026-11-12-cloud-verification.log)): "preflight passed … (session pooler)"; no URL, password or ref printed. That result applies to that version only. The revised preflight is cloud-checked at the next cloud verification run |
| TC-CLOUD-01 | Cloud migrations match the repository | `cloud-verify.yml` → `scripts/verify-cloud-migrations.mjs` (now with `PGSSLMODE=require`, after the preflight step) | ☁️ **Cloud passed** 2026-11-12 ([cloud run 43260965124](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43260965124), [cloud log](../test-evidence/2026-11-12-cloud-verification.log)): "Repository migrations: 5; applied in cloud: 5" (**5/5**), with `PGSSLMODE=require`. (The earlier 5/5 in failed [run 43252032512](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43252032512) is not counted) |
| TC-CLOUD-02 | All database tests (structure, RLS on every table, privileges, isolation) pass **on the cloud database** | `cloud-verify.yml` → `supabase test db --remote="$SUPABASE_DB_URL" --yes` with `PGSSLMODE=require` | ☁️ **Cloud passed** 2026-11-12 ([cloud run 43260965124](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43260965124), [cloud log](../test-evidence/2026-11-12-cloud-verification.log)): "Files=2, Tests=77 … Result: PASS" (**77/77**), with `PGSSLMODE=require`; each test file rolled back. The `auth.users` risk did not occur. (Earlier [run 43252032512](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43252032512) failed before any test ran; fixed in `21a11e9`) |
| TC-CLOUD-03 | Business-data isolation **through the cloud API** (two fictitious owners) | `cloud-verify.yml` → `tests/security.api.test.ts` + `tests/target.test.ts` in cloud mode | ☁️ **Cloud passed** 2026-11-12 ([cloud run 43260965124](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43260965124), [cloud log](../test-evidence/2026-11-12-cloud-verification.log)): **18/18** (14 API security and isolation tests TC-API-01 – 14, 4 cloud safeguards TC-CLOUD-00a – d) |
| TC-DEV-01 | On the owner's Android phone: registration, **email confirmation**, login, shop setup, logout, login again (and a wrong-password attempt) | Manual, development build; see `docs/testing/DEVICE-TEST-LOG.md` | 📝 Documented; **required before moving beyond the authentication foundation** |
| TC-DEV-02 | Email confirmation and password-reset links open the app (needs a development build; Expo Go can't receive `shopmate://` links) | Manual | 📝 Documented |
| TC-DEV-03 | Readability at 130% font size; ₵ renders (TC-UX-04, partial) | Manual | 📝 Documented |

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
| TC-CLOSE-08 | Direct UPDATE/DELETE on `day_closings` and `day_adjustments` via the API is denied | SEC-27 | ✅ CI passed 2026-11-11 ([CI 43077043749](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43077043749)) (TC-DB-04, TC-DB-43–45); ☁️ **Cloud passed** 2026-11-12 ([cloud run 43260965124](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43260965124), TC-CLOUD-02) |
| TC-CLOSE-09 | Weekly and monthly reports show adjusted totals plus the count and value of closed-day adjustments | C-106 | 📝 |

## 2c. Purchases and supplier credit

| ID | Test | Rules | Status |
|---|---|---|---|
| TC-PUR-01 | Goods worth GH₵500, paid GH₵300 from the cash drawer → stock value +500; owed 200; expected cash −300; profit 0 | C-110 – C-115 | 📝 |
| TC-PUR-02 | Paid now > purchase cost rejected | C-110 | 📝 |
| TC-PUR-03 | **Partial payments:** GH₵500 purchase, 300 paid at purchase, then 100 by MoMo → owed **100**; then 100 cash → owed 0; a further 50 rejected. Stock value and profit unchanged throughout | C-113, §12.1 | 📝 |
| TC-PUR-04 | Same Pay supplier request twice → recorded once; two parallel payments exceeding unpaid → one rejected | SEC-24, 09 §4.2 | 📝 |
| TC-PUR-05 | Price correction with **no** units consumed since the purchase → f = 1; all of ΔC to stock value; unpaid updated; original purchase unchanged | C-116a, C-116b | 📝 |
| TC-PUR-06 | Price correction after stock reached 0 → f = 0; all of ΔC to the already-sold/used parts; attention item lists them | C-116a, C-122 | 📝 |
| TC-PUR-07 | Return to supplier: value removed at average; refund in cash increases expected cash; credit vs value difference → cost adjustment | C-117, C-25c | 📝 |
| TC-PUR-08 | Return credited against a purchase's unpaid amount → unpaid reduced; never below 0 | C-117 | 📝 |
| TC-PUR-09 | Own use → own-use line below estimated net profit, at cost; not in stock losses; stock value reduced | C-37 | 📝 |
| TC-PUR-10 | Supplier payments never appear in operating expenses or stock value, in any report; expense form suggests Pay supplier when the note mentions stock or supplier | §12.1 | 📝 |
| TC-PUR-11 | Partial payments are idempotent; two phones paying the same purchase at once cannot exceed the amount owed | §12.1, 09 §4.2 | 📝 |
| TC-PUR-12 | **Worked example 05 §12.2:** +GH₵20 correction → 7.80 already sold (cost adjustment), 1.00 own use, 11.20 remaining stock; final pool 16 / 160.00 | C-116a – C-116c | 📝 |
| TC-PUR-13 | **Equivalence:** for random in-order histories (no late uploads, voids or negative stock), the proportional split equals a full recalculation with the corrected cost, to the pesewa (allowing ≤ 1 pesewa per part from rounding) | C-116a | 📝 |
| TC-PUR-14 | Parts always add up to ΔC exactly; recorded sale costs, past reports and closed days are unchanged; all parts dated on the correction day | C-116c, C-116d | 📝 |
| TC-PUR-15 | Cost reduction below the amount already paid → requires a refund entry; refund in cash increases expected cash | C-116e | 📝 |
| TC-PUR-16 | Quantity correction changes quantity only; stock value unchanged; attention item raised; stock reaching 0 applies C-25a | C-116f | 📝 |

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
| TC-CONC-05 | Same request ID sent from two connections simultaneously (payment, write-off, restock) | Exactly one write; both callers receive the same result | 🛠 Implemented, partial: register_device, 5 parallel duplicates (TC-API-12); payment, write-off and restock functions not built yet |
| TC-CONC-06 | Credit sale and payment for the same customer at the same time | Balance = Σ ledger; never negative | 📝 |
| TC-CONC-07 | Void and a new sale of the same product at the same time | Both applied consistently; integrity check passes | 📝 |

## 7. Security (Gate G2)

| ID | Test | Status |
|---|---|---|
| TC-SEC-01 | Every table: Business A cannot select, insert, update or delete Business B rows | ✅ CI passed 2026-11-11 ([CI 43077043749](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43077043749)): all 30 current tables; ☁️ **Cloud passed** 2026-11-12 ([cloud run 43260965124](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43260965124), TC-CLOUD-02 and 03) |
| TC-SEC-02 | Every function: another business's IDs rejected | 🛠 Implemented, partial: covers the 2 Stage 1 functions; extend with each new function |
| TC-SEC-03 | Direct API writes to money, stock and ledger tables denied | ☁️ **Cloud passed** 2026-11-12 ([cloud run 43260965124](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43260965124), TC-CLOUD-02 and 03); ✅ CI passed 2026-11-11: [local log](../test-evidence/2026-11-11-stage1-local.log), [CI 43077043749](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43077043749); re-passed in [CI 43081513053](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43081513053) |
| TC-SEC-04 | Invalid inputs rejected server-side | 🛠 Implemented, partial: table constraints done (TC-DB-10–34); function inputs in later stages |
| TC-SEC-05 | No service-role key in the app bundle or repository (automated scan) | ✅ CI passed 2026-11-11 ([CI 43081513053](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43081513053)): repository scan, plus Android bundle scan (exact-match deny list + decoded service-role check; 2 negative controls failed as expected) |
| TC-SEC-06 | Crash reports contain no personal or business data | 📝 |
| TC-SEC-07 | "Log out other devices" revokes sessions; outboxes kept | 📝 |
| TC-SEC-08 | Audit entries for every SEC-21 action | 🛠 Implemented, partial: create_business and register_device audit entries only |
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
| **G2 — Real data allowed** | Any pilot shop enters real data | G1 + all TC-SYNC, TC-CANCEL, TC-CONC, TC-SEC, TC-BAK, **TC-CLOUD (required, decision 42)** | Not reached |
| **G3 — Pilot expansion** | Beyond the first 2–3 shops | G2 + TC-SYNC-20 on pilot devices + no open critical bugs | Not reached |
