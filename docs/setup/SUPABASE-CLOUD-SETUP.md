# Creating the Supabase cloud project (free tier)

**Who does this:** the project owner, in a browser. Claude cannot create it: it needs your Supabase account, and supabase.com isn't reachable from Claude's environment.

**Cost:** GH₵0 on the Free plan. Don't upgrade, add a card or enable paid add-ons without a separate cost discussion (decision 10).

**Data:** until release gate G2 passes (including a tested backup restore), use **fictitious test data only**.

## 1. Create the project
1. Sign in at supabase.com (GitHub login is fine) and create an organisation on the **Free** plan.
2. **New project**:
   - Name: `shopmate-ghana-dev`. This first project is for development and testing; create a separate production project later.
   - Database password: generate a strong one and store it in a **password manager**. Never in GitHub, chat or the app.
   - Region: the closest available to Ghana. Supabase has no African region; a European region (e.g. London or Frankfurt) is usually closest. Check the list at creation time.
3. Wait until the project shows "Healthy".

## 2. Authentication settings (Dashboard → Authentication)
| Setting | Value | Why |
|---|---|---|
| Email provider | Enabled | Email + password login (decision 6) |
| Minimum password length | **8** | SEC-01 (matches `supabase/config.toml`) |
| Confirm email | On, unless the built-in email limit blocks pilot sign-ups; then assisted setup (SEC-04) | |
| Phone, anonymous and social providers | **Off** | Not in the MVP |
| Site URL | leave default | |
| **Redirect URLs** (Authentication → URL Configuration) | add `shopmate://auth-callback` and `shopmate://reset-password` | Email confirmation and password-reset links open the app (Stage 1B) |

## 3. Apply the database (from your own computer)
```bash
npx supabase login                         # opens a browser; uses your account
npx supabase link --project-ref <ref>      # <ref> is in the project URL
npx supabase db push                       # applies supabase/migrations/*
```
`link` asks for the database password: type it, don't save it in a file in this repository.

Then **verify**:
- Dashboard → Table Editor shows the 30 tables.
- Each table shows "RLS enabled".

## 4. Connect the app
Dashboard → Project Settings → API. Copy the **Project URL** and the **anon / publishable** key into `app/.env` (git-ignored):
```
EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon or publishable key>
```
**Never copy the `service_role` / secret key anywhere in this repository or the app.** The app also refuses to start if it detects one (`app/src/config/env.ts`).

## 5. Free-tier limits to remember
- A project **pauses after about 7 days without activity**. Unpausing is free.
- **No downloadable backups** on Free. Our own backup and restore drill (PLAN §10) must pass before real data.
- Built-in auth emails are rate-limited. That's fine for development and a small pilot.

## 6. REQUIRED: cloud verification (do not skip)

The local tests prove the design. This step proves the **actual cloud database** has the same protections. It's required after creating the project, and again after **every** migration is applied (decision 42).

**One-time setup, in GitHub** (Settings → Environments → New environment → `cloud-dev`):
1. Under "Deployment protection rules", tick **Required reviewers** and add yourself, so the workflow can't run without your approval.
2. Add these four **environment secrets**. They live in GitHub's encrypted secret store, never in the repository:

| Secret | Where to find it |
|---|---|
| `SUPABASE_DEV_PROJECT_REF` | The project ref (from the project URL) |
| `SUPABASE_DEV_DB_URL` | Project Settings → Database → Connection string (URI, **session pooler**, which works over IPv4), with your database password filled in |
| `SUPABASE_DEV_ANON_KEY` | Project Settings → API → anon / publishable key |
| `SUPABASE_DEV_SERVICE_ROLE_KEY` | Project Settings → API → service_role / secret key. Used only to create the two fictitious test owners. **Never** put it in the app or repository |

**Each time:** GitHub → Actions → "Cloud verification (development project)" → Run workflow, type `fictitious-data-only`, then approve the run. It checks:

| Test | What it proves |
|---|---|
| TC-CLOUD-01 | Every repository migration is applied in the cloud, and nothing unexpected is there |
| TC-CLOUD-02 | The database tests pass **on the cloud database**: 30 tables, RLS on every table, no anonymous access, write restrictions, append-only protection, isolation between two businesses. Each test file runs in a transaction that is rolled back |
| TC-CLOUD-03 | Business-data isolation **through the cloud API**: two fictitious owners can't read or change each other's data |

The cloud tests create two fictitious owners (`shopmate.cloudtest.a@example.test`, `...b@...`) with one test shop each. They are reused on every run, so data doesn't pile up.

**Known risk:** on Supabase cloud, the database role used by TC-CLOUD-02 may not be allowed to insert test rows into the `auth.users` table (needed by one test file). If TC-CLOUD-02 fails for that reason only, report the error to Claude: the test will be adapted, and the step is **not** treated as passed in the meantime.

## 7. Tell Claude when it's done
Share only the **project ref** and the result of the cloud verification run. Never share keys or passwords in chat.
