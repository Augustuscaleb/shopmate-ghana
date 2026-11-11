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
| Site URL | leave default for now | Set when the app has deep links |

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

## 6. Tell Claude when it's done
Share only the **project ref** (not keys or passwords). Claude can then add a CI step that checks the cloud schema matches the migrations. That step needs a GitHub Actions secret, which **you** add in GitHub Settings → Secrets, never in the repository.
