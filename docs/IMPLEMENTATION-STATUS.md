# Implementation status

**Baseline:** product specification revision 5.1 and PLAN v7.1 (approved 11 November 2026).
**Current stage:** Stage 1C. **Checkpoint 1C-1 (database: T1–T10, test gaps, M2) is CLOSED by the owner (24 Nov 2026) for its local/CI scope**; fresh local evidence at `44d9d55`: [2026-11-24-stage1c1-closure-local.log](test-evidence/2026-11-24-stage1c1-closure-local.log). Cloud verification of the Stage 1C migrations stays **outstanding** (D11), and nothing from Stage 1C has been applied to the cloud project or tested on a phone. **Checkpoint 1C-2 (screens) is authorised and in progress: increment 1 (navigation shell, service foundation, error messages, visual foundation) is implemented locally and awaiting review, not yet committed** ([stages/STAGE-1C-2-EXECUTION-BRIEF.md](stages/STAGE-1C-2-EXECUTION-BRIEF.md); decisions in [stages/STAGE-1C-DECISIONS.md](stages/STAGE-1C-DECISIONS.md) §3a). The device-journey criterion **E-3 is CLOSED by owner-approved exception (23 Nov 2026)**: issue #2 (intermittent session restoration in Expo Go only, **not fixed**, cause unexplained) is accepted as an Expo Go-only limitation and monitored as KI-1 ([KNOWN-ISSUES.md](KNOWN-ISSUES.md)).
**Today dashboard** (`4b8bb6d`, CI ✅ [run 45173572606](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/45173572606)): tested by the owner on the Android phone, working, figures verified as accurate (23 Nov 2026; owner-reported; build type and the individual checks run were not recorded).
Stage 1A: ✅ approved (11 Nov 2026). Cloud verification (R-1): ✅ **completed** 12 Nov 2026, based on TC-CLOUD-01, 02 and 03 in [cloud run 43260965124](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43260965124). Stage 1B: ✅ approved (11 Nov 2026), subject to the outstanding release requirements in [RELEASE-READINESS.md](RELEASE-READINESS.md): physical-device journey, backup/restore gate, password investigation decision, Dependabot PRs.

**Real shop data is still not allowed.** Release gate **G2 ("real data allowed")**, which must be passed before any real shop data is used, has **not** been reached. It needs, among other things, R-1 (✅ completed), R-2 physical Android journey (✅ closed by owner-approved exception, 23 Nov 2026) and **R-3 backup and restore (⛔ open)**. See [RELEASE-READINESS.md](RELEASE-READINESS.md) and test plan §10 (release gates).

Test status is tracked in [product-specification/10-test-plan.md](product-specification/10-test-plan.md) (§0, §0a and, for Stage 1C-1, §0d). This page summarises it.

## Cloud verification status (12 Nov 2026)
- Development project: `shopmate-ghana`, North EU (Stockholm); project ref confirmed by the owner.
- First run ([run 43252032512](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43252032512)): **failed** at TC-CLOUD-02 (CLI consent); TC-CLOUD-01 ran, but isn't counted. Nothing in the cloud was changed.
- Workflow hardening: `--remote` + `--yes` (`21a11e9`); preflight project-ref check; `PGSSLMODE=require` on both database steps (`f22ab13`). Preflight unit tests for that version ✅ CI passed ([CI 43259802553](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43259802553)).
- **Second run ([cloud run 43260965124](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43260965124), commit `f22ab13`): ✅ passed. ☁️ Cloud passed:**
  - TC-CLOUD-00 preflight: passed (session pooler; database URL belongs to the declared project), with the `f22ab13` version of the preflight script
  - TC-CLOUD-01 migration parity: **5/5**
  - TC-CLOUD-02 database tests on the cloud database: **77/77**
  - TC-CLOUD-03 API security and isolation through the cloud API: **18/18**
- **Preflight correction after the run (owner-approved, 12 Nov 2026):** a direct-connection URL now accepts only the username `postgres` or `postgres.<project-ref>`; before, any other username (e.g. `admin`) was ignored if the host's project ref matched. New test TC-CLOUD-00o. **11/11 preflight tests 🟢 local passed** ([log](test-evidence/2026-11-12-cloud-preflight-revised-local.log)); ✅ **CI passed** in [CI #48](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/45424865849) and [CI #49](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/45431840081) (24 Nov 2026). The revised preflight was **not** part of [cloud run 43260965124](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43260965124); that run's preflight result applies to the `f22ab13` version only. TC-CLOUD-00 is therefore 🛠 until the next cloud run.
- **Requirement R-1: ✅ completed**, on the basis of the cloud database and API verification (TC-CLOUD-01 – 03) in [cloud run 43260965124](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43260965124); the preflight correction doesn't affect those results. Evidence: [test-evidence/2026-11-12-cloud-verification.log](test-evidence/2026-11-12-cloud-verification.log).

## Stage 1C-1: what was built (inventory database functions)

Implemented and tested on the **local Supabase stack and in CI only**. **Not applied to the cloud project** (D11: needs the owner's separate approval; R-1 re-verification outstanding). No screens yet (1C-2). Real shop data is still not allowed.

| Task | Commit | Server functions | Status |
|---|---|---|---|
| T1 shared inventory helpers | `253d489` | internal: `apply_movement`, `write_movement`, `lock_products`, `raise_attention`, limits, rounding | ✅ CI |
| T2 server-side dashboard counts (D7) | `2aeb500` | `inventory_summary` | ✅ CI |
| T3 products and categories | `40cf83d` | `create_product`, `update_product`, `set_product_archived` | ✅ CI |
| Security fix: idempotency replays scoped to the business | `91f084a` | internal `claim_request` | ✅ CI |
| T4 owner cost correction | `a62baa9` | `set_cost` | ✅ CI |
| T5 restock | `4212e94` | `restock` | ✅ CI |
| T6 stock adjustment | `bd59bee` | `adjust_stock` | ✅ CI |
| T7 supplier payments | `1d695f8` | `pay_supplier`, `unpaid_purchases` | ✅ CI |
| T8 return to supplier | `5d807cd` | `return_to_supplier` | ✅ CI |
| T9 purchase correction | `2b3bb4a` | `correct_purchase` | ✅ CI ([CI #47](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/45411475080): T1–T9) |
| T10 Needs attention, stock integrity, low stock | `ba565e7` | `acknowledge_attention`, `check_stock_integrity`, `low_stock_products` | ✅ CI ([CI #48](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/45424865849): T1–T10) |
| 1C-1 test gaps (tests only) | `230c029` | none: TC-COST-07, 13, 17 | ✅ CI ([CI #49](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/45431840081)) |
| M2 `unpaid_purchases` display fields (Option B) | `7d29d4d` | `unpaid_purchases` redefined additively (migration `20261125000200`) | ✅ CI ([CI #51](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/45487659376)) |

Per-test status: [test plan §0d](product-specification/10-test-plan.md). Decisions: [stages/STAGE-1C-DECISIONS.md](stages/STAGE-1C-DECISIONS.md).

**Limits of this evidence:**
- **TC-COST-07** is a deterministic shared-helper simulation with a fixture void; the real void function comes in Stage 1D (D9).
- **TC-COST-13** covers restock, `set_cost` and purchase corrections; later uploads come in Stage 1D. **TC-COST-17**: the GH₵ effect is covered; the late-sale trigger comes in Stage 1D.
- Sales and voids in all 1C tests are fixtures. Reports, cash count and screens don't exist yet, so tests that need them are partial or not started (§0d).

**Open before or alongside the next steps:**
- **M2** `unpaid_purchases` display fields: **Option B approved and implemented** (24 Nov 2026): `corrected_cost`, `cost_corrections`, `refunds_received`, `return_credits`; migration `20261125000200_unpaid_purchases_display.sql`, commit `7d29d4d`, [CI #51](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/45487659376) passed (database 1017/1017, API 133/133, app 25/25); T7 migration untouched. The S-38 display rule is approved for Stage 1C-2 but not yet in any screen. Not applied to the cloud project (D11).
- **M3** specification clarification batch (09 §3; 05 §3.2; C-41; TC-PUR-13 wording; 09 §2 attention types): owner approval **before the Reports stage**.
- **Cloud:** migrations `20261123000100` – `20261125000200` not applied; cloud verification (R-1) to be re-run after approval (D11).
- **Monitoring:** findings L1 (long-history correction holds locks about 4.4–5.7 s at 2,000 movements), L2 (stale comments in the frozen T7 migration), L3 (timing-dependent concurrency tests), I6 (fault scripts not in the repository). See [STAGE-1C-DECISIONS.md](stages/STAGE-1C-DECISIONS.md) §5.

## Stage 1B: what was built

| Item | Status | Where |
|---|---|---|
| Screens: Welcome, Sign up, Log in, Forgot password, Check email, Set new password, Shop setup, Home (the Today dashboard since `4b8bb6d`); approved design tokens; 56 dp buttons; plain taps only | ✅ Built; typechecks and bundles. 📱 **Device verified** (owner-reported; Samsung Galaxy A06, Android 16; installed Android builds, 15 and 23 Nov 2026): all 12 TC-DEV-01 steps (step 5's date not recorded), TC-DEV-02 (confirmation and password-reset links open the app) and TC-DEV-03 (130 % font size on Welcome, Login, Home, Your shop, Sign-up and Forgot password; GH₵ display on the dashboard). **Not checked at 130 %:** Check email, Set new password. **Issue #2** (intermittent session restoration, seen only in Expo Go on 13–14 Nov 2026) is **not fixed** and its cause is unexplained; the owner accepted it as an Expo Go-only limitation, closing E-3 / R-2 by exception (decision 52; KI-1 in [KNOWN-ISSUES.md](KNOWN-ISSUES.md)), with a cold-start re-check on every new installed build. *History:* first run in Expo Go on 13–14 Nov 2026. Details: [device log](testing/DEVICE-TEST-LOG.md) | `app/src/screens/`, `app/src/ui/` |
| Sessions stored **only** in Android Keystore-backed secure storage (chunked); restored after restart; cleared on log out (SEC-05) | ✅ Built and tested against local Supabase (TC-AUTH-13) | `app/src/lib/chunkedSecureStorage.ts`, `expoSecureStore.ts`, `supabase.ts` |
| Password rules: minimum 8 (server and app), 2,087 common passwords rejected (app only, see SEC-01 note). **Revised 14 Nov 2026 (owner-approved)** after device test TC-DEV-01 step 2 accepted `password123`: a listed password followed only by numbers or symbols is now also rejected | ✅ Built. Revision: 🟢 local tests pass ([log](test-evidence/2026-11-14-password-policy-local.log)); ✅ CI passed ([CI #48](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/45424865849) and [CI #49](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/45431840081)); phone re-check: see the [device log](testing/DEVICE-TEST-LOG.md) | `app/src/auth/passwordPolicy.ts` |
| Email confirmation and password reset via PKCE deep links (`shopmate://auth-callback`, `shopmate://reset-password`) | ✅ Built; links need a development build to test on a phone | `app/src/auth/deepLinks.ts`, `AppRoot.tsx` |
| Shop setup and device registration with crash-safe idempotency (request ID saved before the call) | ✅ Built and tested, including lost-reply cases (TC-AUTH-14–16) | `app/src/services/account.ts` |
| **Bug found and fixed:** the app would have started with no configuration on a real phone (Expo only inlines `process.env.EXPO_PUBLIC_*` when written literally). Caught by the new bundle scan's control check | ✅ Fixed | `app/src/config/env.ts` |
| App bundle secret scan (exact-match deny list + decoded service-role check), in CI | ✅ Passes; 2 negative controls fail as expected | `scripts/check-bundle-secrets.mjs` |
| **Cloud verification** (required, decision 42): migration parity, all database tests on the cloud DB, API isolation on the cloud project; manual workflow behind a protected `cloud-dev` environment; refuses wrong or unconfirmed projects | ☁️ **Cloud passed** 12 Nov 2026 ([cloud run 43260965124](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43260965124)) | `.github/workflows/cloud-verify.yml`, `tests/target.ts`, `scripts/verify-cloud-migrations.mjs` |
| Dependency advisories documented (ADV-001); CI fails on high/critical | ✅ | `docs/security/DEPENDENCY-ADVISORIES.md` |

### Stage 1B test results

*Snapshot at Stage 1B approval (11 Nov 2026), verified on 23 Nov 2026 against the [local log](test-evidence/2026-11-11-stage1b-local.log) (database `Files=2, Tests=77`; API `4 files, 22 tests`; app `6 files, 13 tests`) and [CI run 43081513053](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43081513053) on commit `1aee353` (same counts). These are not the current totals.*

**Current totals (verified 24 Nov 2026):** commit `7d29d4d`, [CI #51](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/45487659376): database tests **1017/1017** (15 files), API security and integration tests **133/133** (17 files), app unit tests **25/25** (8 files); typecheck, secret scan, dependency gate, Android bundle export and bundle secret scan all passed. The latest committed **local** evidence log is [2026-11-24-stage1c1-closure-local.log](test-evidence/2026-11-24-stage1c1-closure-local.log) at `44d9d55` (same totals, including M2). *Previous snapshots:* [CI #49](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/45431840081) on `230c029` (973 / 131 / 25); [CI #40](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/45240599452) on `91f084a` (316 / 76 / 25).

| Suite | Result | Evidence |
|---|---|---|
| Database tests | ✅ 77/77 (local) | [log](test-evidence/2026-11-11-stage1b-local.log) |
| API security and integration tests (incl. real login, onboarding, cloud safeguards) | ✅ 22/22 (local) | same |
| App unit tests | ✅ 13/13 (local) | same |
| Repository and bundle secret scans; dependency gate; typecheck | ✅ (local) | same |
| CI (GitHub Actions) | ✅ Passed: 77 DB, 22 integration, 13 app unit tests; secret, dependency and bundle scans | [run 43081513053](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43081513053) |
| **Cloud verification** (actual Supabase development project) | ☁️ Passed: migrations 5/5; database tests 77/77; API security and isolation 18/18; preflight passed with the `f22ab13` version (revised since: ✅ CI passed, not yet run in the cloud, so TC-CLOUD-00 stays 🛠) | [cloud run 43260965124](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43260965124) |
| On-device checks (TC-DEV-01–03) | 📱 Device verified (owner-reported; Samsung Galaxy A06; installed Android builds, 15 and 23 Nov 2026). R-2 / E-3 closed by owner-approved exception (23 Nov 2026); issue #2 (Expo Go only) accepted as a limitation, not fixed (KI-1). Check email and Set new password not checked at 130% | [device log](testing/DEVICE-TEST-LOG.md), [known issues](KNOWN-ISSUES.md) |

## Stage 1A: what was built

| Item | Status | Where |
|---|---|---|
| Repository layout, root tooling, `.gitignore` covering `.env` files | ✅ Done | `README.md`, `package.json`, `.gitignore` |
| Expo app skeleton (SDK 58, React Native 0.88, TypeScript), app name, Android package `com.shopmateghana.app`, approved colours, config check that **rejects service-role keys** | ✅ Done (typechecks; not yet run on a device) | `app/` |
| Supabase client factory (in-memory session until Stage 2 adds secure storage, SEC-05) | ✅ Done | `app/src/lib/supabase.ts` |
| Local Supabase configuration (PostgreSQL 17, password minimum 8) | ✅ Done | `supabase/config.toml` |
| **Database schema: all 30 tables of the approved data model**, with value pool, cost history, purchases and supplier credit, sale-time fields, attention items, daily closings and adjustments, idempotency log | ✅ Done | `supabase/migrations/` |
| Constraints: duplicate prevention, totals, ledger signs, cross-business foreign keys, one closing per day, approximate corrections must be flagged with reasons | ✅ Done | same |
| Append-only protection (ledgers, history, purchases, closings, audit) and business_id immutability | ✅ Done | same |
| **Row Level Security on every table**; no anonymous access; direct writes only to categories, expense categories, customers and own profile; everything else via server functions | ✅ Done | `..._triggers_rls_privileges.sql` |
| Server functions: `create_business`, `register_device` (idempotent) | ✅ Done | `..._foundation_functions.sql` |
| Automated tests: 77 database tests and 14 API tests | ✅ 91/91 passed (local) | `supabase/tests/database/`, `tests/` |
| Secret scan | ✅ Passes; negative control fails as expected | `scripts/check-secrets.mjs` |
| CI on GitHub Actions (free runners, no secrets needed) | ✅ First run passed | `.github/workflows/ci.yml` |
| Dependabot dependency alerts (SEC-42) | ✅ Configured | `.github/dependabot.yml` |
| Supabase **cloud** project | ⏳ **Not created** at Stage 1A. Needs the owner's account; supabase.com is unreachable from Claude's environment. *Update 12 Nov 2026: created by the owner (North EU, Stockholm) and cloud-verified, R-1 completed ([cloud run 43260965124](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43260965124))* | `docs/setup/SUPABASE-CLOUD-SETUP.md` |

## Test results (Stage 1A)

| Suite | Result | Environment | Evidence |
|---|---|---|---|
| Database tests (pgTAP), 77 | ✅ 77/77 passed | Local Supabase stack (Docker), PostgreSQL 17.11, CLI 3.1.0 | [log](test-evidence/2026-11-11-stage1-local.log) |
| API security tests, 14 | ✅ 14/14 passed | Same, through real Auth and PostgREST | same log |
| Secret scan | ✅ Passed | Repository | same log |
| Typecheck (tests and app) | ✅ Passed | | same log |
| CI (GitHub Actions) | ✅ Passed: same 77 + 14 tests | GitHub-hosted runner, local Supabase inside the runner | [run](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43077043749) |

**Planned tests (10-test-plan), as at Stage 1A:** 3 ✅ passed (local), 5 🛠 partly implemented, 133 📝 documented. *Current figures: test plan §0.* **No release gate has been reached.** Real shop data remains **not allowed**: that needs gate G2, including the backup restore drill.

### CI runs
| Date | Commit | Result | Link |
|---|---|---|---|
| 2026-11-11 | `634206b` | ✅ Success: secret scan, typecheck, 77/77 database tests, 14/14 API tests | [run 43077043749](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43077043749) |
| 2026-11-11 | `1aee353` (Stage 1B) | ✅ Success: secret scan, dependency gate, typecheck, 77/77 database, 22/22 integration, 13/13 app unit tests, Android bundle built and scanned | [run 43081513053](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43081513053) |

## Not done in Stage 1A (by design, or blocked)

| Item | Reason / next step |
|---|---|
| Supabase cloud project | Owner creates it (setup guide). Then Claude adds a schema check against it. *Update 12 Nov 2026: done; cloud verification passed ([cloud run 43260965124](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43260965124))* |
| Business features (sales, purchases, credit, expenses, reports, closing, sync) | Later stages, as agreed |
| Login and onboarding screens; secure session storage (SEC-05) | ✅ Done in Stage 1B |
| Common-password rejection (SEC-01 second half) | ✅ Stage 1B, in the app (2,087-entry list); server-side option needs owner approval |
| Backup workflow and restore drill (TC-BAK) | Needs the cloud project (now exists); separate stage, starts only with owner approval; before gate G2. **R-3 remains open** |
| App run on a real Android phone | Stage 1B, using Expo Go or a development build on the owner's phone |

## Notes for the owner

0. **Correction (found in Stage 1B):** the Stage 1A local evidence log (`test-evidence/2026-11-11-stage1-local.log`) was **not committed** with Stage 1A, because `.gitignore` excluded all `*.log` files. The Stage 1A report linked to a file that wasn't in the repository. The file was generated at 18:19 UTC on 11 November 2026 and is committed unedited in the Stage 1B commit; its header line "committed together with this log" was therefore inaccurate. The ignore rule now keeps `docs/test-evidence/*.log`. The Stage 1A **CI** evidence (run 43077043749) was unaffected.

1. **Implementation detail (not a requirement change):** idempotency request IDs are unique on their own, not per business. This is stricter, and needed so that "create business" is protected too. Recorded in 09 §2.
2. **Dependency warnings:** documented as ADV-001 in [security/DEPENDENCY-ADVISORIES.md](security/DEPENDENCY-ADVISORIES.md) (one `minimatch` issue counted three times, build-time only; npm's "fix" is a downgrade to Expo 52). Monitored; CI fails on any high or critical advisory.
3. **Environment limitation:** `npx expo install` couldn't reach Expo's version service from Claude's environment. The only added package (`@supabase/supabase-js`) is pure JavaScript, so this has no effect. Native packages (e.g. `expo-secure-store`) should be added with `npx expo install` on a normal connection.
