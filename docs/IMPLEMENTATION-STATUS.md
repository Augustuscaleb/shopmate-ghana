# Implementation status

**Baseline:** product specification revision 5.1 and PLAN v7.1 (approved 11 November 2026).
**Current stage:** Stage 1A, project foundation, database and security. **Awaiting owner review.**

Test status is tracked in [product-specification/10-test-plan.md](product-specification/10-test-plan.md) (§0 and §0a). This page summarises it.

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
| CI on GitHub Actions (free runners, no secrets needed) | ⏳ Configured; first run result recorded below | `.github/workflows/ci.yml` |
| Dependabot dependency alerts (SEC-42) | ✅ Configured | `.github/dependabot.yml` |
| Supabase **cloud** project | ⏳ **Not created**. Needs the owner's account; supabase.com is unreachable from Claude's environment | `docs/setup/SUPABASE-CLOUD-SETUP.md` |

## Test results (Stage 1A)

| Suite | Result | Environment | Evidence |
|---|---|---|---|
| Database tests (pgTAP), 77 | ✅ 77/77 passed | Local Supabase stack (Docker), PostgreSQL 17.11, CLI 3.1.0 | [log](test-evidence/2026-11-11-stage1-local.log) |
| API security tests, 14 | ✅ 14/14 passed | Same, through real Auth and PostgREST | same log |
| Secret scan | ✅ Passed | Repository | same log |
| Typecheck (tests and app) | ✅ Passed | | same log |
| CI (GitHub Actions) | See "CI runs" below | GitHub-hosted runner | |

**Planned tests (10-test-plan):** 3 ✅ passed (local), 5 🛠 partly implemented, 133 📝 documented. **No release gate has been reached.** Real shop data remains **not allowed**: that needs gate G2, including the backup restore drill.

### CI runs
| Date | Commit | Result | Link |
|---|---|---|---|
| (pending first run) | | | |

## Not done in Stage 1A (by design, or blocked)

| Item | Reason / next step |
|---|---|
| Supabase cloud project | Owner creates it (setup guide). Then Claude adds a schema check against it |
| Business features (sales, purchases, credit, expenses, reports, closing, sync) | Later stages, as agreed |
| Login and onboarding screens; secure session storage (SEC-05) | Stage 1B |
| Common-password rejection (SEC-01 second half) | Supabase's leaked-password check needs a paid plan; a free alternative (bundled list check at sign-up) is proposed for Stage 1B |
| Backup workflow and restore drill (TC-BAK) | Needs the cloud project; before gate G2 |
| App run on a real Android phone | Stage 1B, using Expo Go or a development build on the owner's phone |

## Notes for the owner

1. **Implementation detail (not a requirement change):** idempotency request IDs are unique on their own, not per business. This is stricter, and needed so that "create business" is protected too. Recorded in 09 §2.
2. **Dependency warnings:** `npm audit` reports 3 moderate issues in `minimatch`, used by Expo's build tooling on the developer's computer, not in the app on phones. The suggested `--force` fix would break Expo. Dependabot will raise the proper upgrade.
3. **Environment limitation:** `npx expo install` couldn't reach Expo's version service from Claude's environment. The only added package (`@supabase/supabase-js`) is pure JavaScript, so this has no effect. Native packages (e.g. `expo-secure-store`) should be added with `npx expo install` on a normal connection.
