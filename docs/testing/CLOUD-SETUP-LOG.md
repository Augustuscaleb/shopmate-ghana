# Cloud setup log (development project): requirement R-1

Each step is **Reported** (the owner says it's done) or **Verified** (evidence seen: command output, the SQL check table, or a workflow run). Only verified steps count.

**Project:** `shopmate-ghana` (London). Treated as the **development** project: fictitious data only. A separate production project will be created before real users (to be planned).

| # | Step | Status | Evidence / date |
|---|---|---|---|
| C-1 | Project created, status Healthy, region London | 🟡 Reported by owner (11 Nov 2026) | Owner's message; Claude can't reach supabase.com from its environment |
| C-2 | Email authentication on; minimum password length 8; email confirmation on | 🟡 Reported by owner | Owner's message |
| C-3 | Redirect URLs `shopmate://auth-callback`, `shopmate://reset-password` | 🟡 Reported by owner | Owner's message |
| C-4 | `supabase link` done; `git status` shows no new files | ⬜ Not done | |
| C-5 | `migration list` before push: Local 5, Remote empty; `db push --dry-run` lists the 5 migrations | ⬜ Not done | |
| C-6 | `db push` applied without errors | ⬜ Not done | |
| C-7 | `migration list` after push: Local and Remote both show all 5 | ⬜ Not done | |
| C-8 | `scripts/sql/verify-cloud-schema.sql` in the SQL Editor: **12/12 PASS** | ⬜ Not done | |
| C-9 | GitHub environment `cloud-dev` with required reviewer and branch restriction | ⬜ Not done | |
| C-10 | Exactly 4 environment secrets with the documented names | ⬜ Not done | |
| C-11 | Cloud verification run: TC-CLOUD-01, 02, 03 all green → ☁️ Cloud passed | ⬜ Not done | |

C-2 and C-3 will additionally be **verified** by the phone journey (R-2): confirmation email received; the link returns to the app.
