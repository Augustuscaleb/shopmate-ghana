# Release readiness: outstanding requirements

**Purpose:** requirements set by the owner that must be completed **before ShopMate is released to real users**. None may be marked done without the evidence stated.
**Recorded:** 11 November 2026 (Stage 1B approval).

| ID | Requirement (owner's words, summarised) | Evidence required to close | Status | Owner of next step |
|---|---|---|---|---|
| **R-1** | Cloud verification against the actual Supabase project: migration check, database tests and two-owner isolation tests must all pass | A "Cloud verification" workflow run with TC-CLOUD-01, 02 and 03 all green, linked in the test plan as ☁️ Cloud passed | ⛔ **Open**: cloud project not yet created; workflow never run | Owner: create the project and `cloud-dev` environment ([guide](setup/SUPABASE-CLOUD-SETUP.md)) |
| **R-2** | Physical Android phone test of the initial journey: registration, email confirmation, login, shop setup, logout, login again. Issues recorded and **fixed before moving beyond the authentication foundation** | Completed entry in [testing/DEVICE-TEST-LOG.md](testing/DEVICE-TEST-LOG.md); every issue fixed and re-checked on the phone (📱 Device verified) | ⛔ **Open**: needs R-1's cloud project (a phone can't reach the local test database) | Owner: run the journey; Claude: fix issues |
| **R-3** | Backup and restore is a **mandatory release gate**; a backup option existing is not enough | TC-BAK-01–05 all passed, including a restore drill recorded in [RESTORE-LOG.md](RESTORE-LOG.md) | ⛔ **Open**: designed and documented ([operations/BACKUP-AND-RESTORE.md](operations/BACKUP-AND-RESTORE.md)); **not implemented** | Claude: implement after R-1 (separate stage, approval required) |
| **R-4** | Investigate a free server-side common-password check compatible with Supabase Auth; don't weaken the current requirement; document limitations | Investigation documented, and the owner's decision recorded | 🟡 **Investigated** ([security/PASSWORD-POLICY-SERVER-SIDE.md](security/PASSWORD-POLICY-SERVER-SIDE.md)); **awaiting owner decision** | Owner: choose an option |
| **R-5** | Dependabot PRs #1–#4: no merge, close or dismiss without owner approval | PR states match the owner's decisions | ⚠️ **Partly breached before the instruction**: #3 and #4 were auto-closed by Dependabot at 18:54 UTC on 11 Nov because of an ignore rule Claude added without approval. Rule reverted; #1 and #2 remain open. See [security/DEPENDENCY-ADVISORIES.md](security/DEPENDENCY-ADVISORIES.md) | Owner: decide how to handle #3/#4 |
| **R-6** | Test tracker distinguishes documented, implemented, local, CI, cloud and device evidence | [10-test-plan.md §0](product-specification/10-test-plan.md) uses these seven statuses | ✅ In place; maintained at every stage | Claude |

Release gate G2 ("real data allowed") also requires all of R-1, R-2 and R-3.
