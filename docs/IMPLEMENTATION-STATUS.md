# Implementation status

**Baseline:** product specification revision 5.1 and PLAN v7.1 (approved 11 November 2026).
**Current stage:** Stage 1B, login, onboarding and cloud verification tooling. **Awaiting owner review.**
Stage 1A: ✅ approved by the owner (11 November 2026).

Test status is tracked in [product-specification/10-test-plan.md](product-specification/10-test-plan.md) (§0 and §0a). This page summarises it.

## Stage 1B: what was built

| Item | Status | Where |
|---|---|---|
| Screens: Welcome, Sign up, Log in, Forgot password, Check email, Set new password, Shop setup, Home placeholder; approved design tokens; 56 dp buttons; plain taps only | ✅ Built; typechecks and bundles. **Not yet run on a phone** | `app/src/screens/`, `app/src/ui/` |
| Sessions stored **only** in Android Keystore-backed secure storage (chunked); restored after restart; cleared on log out (SEC-05) | ✅ Built and tested against local Supabase (TC-AUTH-13) | `app/src/lib/chunkedSecureStorage.ts`, `expoSecureStore.ts`, `supabase.ts` |
| Password rules: minimum 8 (server and app), 2,087 common passwords rejected (app only, see SEC-01 note) | ✅ | `app/src/auth/passwordPolicy.ts` |
| Email confirmation and password reset via PKCE deep links (`shopmate://auth-callback`, `shopmate://reset-password`) | ✅ Built; links need a development build to test on a phone | `app/src/auth/deepLinks.ts`, `AppRoot.tsx` |
| Shop setup and device registration with crash-safe idempotency (request ID saved before the call) | ✅ Built and tested, including lost-reply cases (TC-AUTH-14–16) | `app/src/services/account.ts` |
| **Bug found and fixed:** the app would have started with no configuration on a real phone (Expo only inlines `process.env.EXPO_PUBLIC_*` when written literally). Caught by the new bundle scan's control check | ✅ Fixed | `app/src/config/env.ts` |
| App bundle secret scan (exact-match deny list + decoded service-role check), in CI | ✅ Passes; 2 negative controls fail as expected | `scripts/check-bundle-secrets.mjs` |
| **Cloud verification** (required, decision 42): migration parity, all database tests on the cloud DB, API isolation on the cloud project; manual workflow behind a protected `cloud-dev` environment; refuses wrong or unconfirmed projects | 🛠 **Built, not run**: needs the cloud project | `.github/workflows/cloud-verify.yml`, `tests/target.ts`, `scripts/verify-cloud-migrations.mjs` |
| Dependency advisories documented (ADV-001); CI fails on high/critical | ✅ | `docs/security/DEPENDENCY-ADVISORIES.md` |

### Stage 1B test results

| Suite | Result | Evidence |
|---|---|---|
| Database tests | ✅ 77/77 (local) | [log](test-evidence/2026-11-11-stage1b-local.log) |
| API security and integration tests (incl. real login, onboarding, cloud safeguards) | ✅ 22/22 (local) | same |
| App unit tests | ✅ 13/13 (local) | same |
| Repository and bundle secret scans; dependency gate; typecheck | ✅ (local) | same |
| CI (GitHub Actions) | See "CI runs" below | |
| **Cloud verification** | ⛔ **Not run**: no cloud project | |
| On-device checks (TC-DEV-01–03) | 📝 Not done: needs your phone | |

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
| Supabase **cloud** project | ⏳ **Not created**. Needs the owner's account; supabase.com is unreachable from Claude's environment | `docs/setup/SUPABASE-CLOUD-SETUP.md` |

## Test results (Stage 1A)

| Suite | Result | Environment | Evidence |
|---|---|---|---|
| Database tests (pgTAP), 77 | ✅ 77/77 passed | Local Supabase stack (Docker), PostgreSQL 17.11, CLI 3.1.0 | [log](test-evidence/2026-11-11-stage1-local.log) |
| API security tests, 14 | ✅ 14/14 passed | Same, through real Auth and PostgREST | same log |
| Secret scan | ✅ Passed | Repository | same log |
| Typecheck (tests and app) | ✅ Passed | | same log |
| CI (GitHub Actions) | ✅ Passed: same 77 + 14 tests | GitHub-hosted runner, local Supabase inside the runner | [run](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43077043749) |

**Planned tests (10-test-plan):** 3 ✅ passed (local), 5 🛠 partly implemented, 133 📝 documented. **No release gate has been reached.** Real shop data remains **not allowed**: that needs gate G2, including the backup restore drill.

### CI runs
| Date | Commit | Result | Link |
|---|---|---|---|
| 2026-11-11 | `634206b` | ✅ Success: secret scan, typecheck, 77/77 database tests, 14/14 API tests | [run 43077043749](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43077043749) |

## Not done in Stage 1A (by design, or blocked)

| Item | Reason / next step |
|---|---|
| Supabase cloud project | Owner creates it (setup guide). Then Claude adds a schema check against it |
| Business features (sales, purchases, credit, expenses, reports, closing, sync) | Later stages, as agreed |
| Login and onboarding screens; secure session storage (SEC-05) | ✅ Done in Stage 1B |
| Common-password rejection (SEC-01 second half) | ✅ Stage 1B, in the app (2,087-entry list); server-side option needs owner approval |
| Backup workflow and restore drill (TC-BAK) | Needs the cloud project; before gate G2 |
| App run on a real Android phone | Stage 1B, using Expo Go or a development build on the owner's phone |

## Notes for the owner

0. **Correction (found in Stage 1B):** the Stage 1A local evidence log (`test-evidence/2026-11-11-stage1-local.log`) was **not committed** with Stage 1A, because `.gitignore` excluded all `*.log` files. The Stage 1A report linked to a file that wasn't in the repository. The file was generated at 18:19 UTC on 11 November 2026 and is committed unedited in the Stage 1B commit; its header line "committed together with this log" was therefore inaccurate. The ignore rule now keeps `docs/test-evidence/*.log`. The Stage 1A **CI** evidence (run 43077043749) was unaffected.

1. **Implementation detail (not a requirement change):** idempotency request IDs are unique on their own, not per business. This is stricter, and needed so that "create business" is protected too. Recorded in 09 §2.
2. **Dependency warnings:** documented as ADV-001 in [security/DEPENDENCY-ADVISORIES.md](security/DEPENDENCY-ADVISORIES.md) (one `minimatch` issue counted three times, build-time only; npm's "fix" is a downgrade to Expo 52). Monitored; CI fails on any high or critical advisory.
3. **Environment limitation:** `npx expo install` couldn't reach Expo's version service from Claude's environment. The only added package (`@supabase/supabase-js`) is pure JavaScript, so this has no effect. Native packages (e.g. `expo-secure-store`) should be added with `npx expo install` on a normal connection.
