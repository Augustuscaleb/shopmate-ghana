# Cloud setup log (development project): requirement R-1

Each step is **Reported** (the owner says it's done) or **Verified** (evidence seen: command output, the SQL check table, or a workflow run). Only verified steps count.

**Project:** `shopmate-ghana`, region **North EU (Stockholm)**, AWS `eu-north-1`. Treated as the **development** project: fictitious data only. A separate production project will be created before real users (to be planned).

| # | Step | Status | Evidence / date |
|---|---|---|---|
| C-1 | Project created, status Healthy | 🟡 Reported by owner (11 Nov 2026) | Owner's message; Claude can't reach supabase.com from its environment |
| C-1a | **Region: North EU (Stockholm)**. The initial report said "London"; corrected | ✅ **Confirmed by owner (12 Nov 2026)** and consistent with the database host `aws-0-eu-north-1.pooler.supabase.com` printed in [run 43252032512](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43252032512) | Owner's message + run log |
| C-1b | **Project ref** confirmed: Dashboard project ref = ref in the session-pooler username (`postgres.<ref>`) = `SUPABASE_DEV_PROJECT_REF` secret. The value is deliberately not written here (public repository); it lives in the GitHub secret | ✅ **Confirmed by owner (12 Nov 2026)** | Owner's message. From the next run, also checked automatically by the workflow preflight step |
| C-2 | Email authentication on; minimum password length 8; email confirmation on | 🟡 Reported by owner | Owner's message |
| C-3 | Redirect URLs `shopmate://auth-callback`, `shopmate://reset-password` | 🟡 Reported by owner | Owner's message |
| C-4 | `supabase link` done; `git status` shows no new files | ⬜ Not done | |
| C-5 | `migration list` before push: Local 5, Remote empty; `db push --dry-run` lists the 5 migrations | ⬜ Not done | |
| C-6 | `db push` applied without errors | ⬜ Not done | |
| C-7 | `migration list` after push: Local and Remote both show all 5 | ⬜ Not done | |
| C-8 | `scripts/sql/verify-cloud-schema.sql` in the SQL Editor: **12/12 PASS** | ⬜ Not done | |
| C-9 | GitHub environment `cloud-dev` with required reviewer and branch restriction | ⬜ Not done | |
| C-10 | Exactly 4 environment secrets with the documented names | ⬜ Not done | |
| C-11 | Cloud verification run: TC-CLOUD-01, 02, 03 all green → ☁️ Cloud passed | ⬜ **Not done** | First run, [run 43252032512](https://github.com/Augustuscaleb/shopmate-ghana/actions/runs/43252032512) (12 Nov 2026), **failed** at TC-CLOUD-02: the Supabase CLI needed consent (`--yes`) to run tests on a hosted database and couldn't ask in CI; nothing was changed. TC-CLOUD-01 completed in that run ("Repository migrations: 5; applied in cloud: 5"), but it is **not** counted as cloud-passed until a complete run (with the new preflight) succeeds. Fixes: `21a11e9` (`--remote` + `--yes`) and the preflight + `PGSSLMODE=require` commit |

C-2 and C-3 will additionally be **verified** by the phone journey (R-2): confirmation email received; the link returns to the app.

## Notes
- C-4 – C-10 remain unverified by Claude. The first run shows the `cloud-dev` environment and the database secret were usable (the workflow reached the cloud database), but the owner hasn't yet shared the `migration list` outputs, the 12-row SQL check, or the secret-name list.
