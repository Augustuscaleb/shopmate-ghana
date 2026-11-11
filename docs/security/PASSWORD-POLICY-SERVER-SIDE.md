# Server-side common-password check: investigation (requirement R-4)

**Date:** 11 November 2026. **Status:** investigated; **awaiting owner decision**. Nothing has been changed: the current requirement (minimum 8 characters on the server; minimum 8 plus the 2,087-entry common-password list in the app) stays exactly as approved.

## Question
Can the common-password restriction be enforced by Supabase Auth itself (so it can't be bypassed by calling the API directly), using something **free**?

## Options examined

| # | Mechanism | Free? | Can it check the password? | Covers every way a password is set? | Finding |
|---|---|---|---|---|---|
| 1 | **Leaked password protection** (Supabase checks new passwords against the HaveIBeenPwned "Pwned Passwords" database) | **No**: Pro plan and above [R: Supabase docs] | Yes, a far larger list than ours | Yes (sign-up and password change) | Best protection, but paid |
| 2 | **Password Verification Attempt hook** | **No**: Teams/Enterprise [R: Supabase docs] | Runs at **login**, not when a password is chosen | No | Not suitable |
| 3 | **Before User Created hook** | Yes: Free and Pro [R: Supabase docs] | **No**. Tested by Claude on the local Supabase Auth server (GoTrue v2.197): the hook payload contains email, ID, metadata and IP, but **no password**, plain or hashed [V: direct test, 11 Nov 2026] | — | Can't enforce a password list |
| 4 | **Password requirements** setting (`letters_digits`, `lower_upper_letters_digits`, `lower_upper_letters_digits_symbols`) | Yes | Character types only, not a list | Yes (server-side, all paths) | Stops many common passwords (e.g. `password`, `12345678`, `iloveyou`) but not all (`password1` has letters and digits). It would **tighten** the requirement, so it needs owner approval |
| 5 | **Sign-up through our own Edge Function** (checks the list, then creates the user with the admin API; public sign-up switched off) | Yes (free tier invocation allowance) | Yes, at sign-up | **No**: a signed-in user can still change their password directly through the Auth API, which can't be routed through our function | Partial cover, substantial complexity (we'd also have to send confirmation emails ourselves). Not recommended |

## Conclusion
**No free mechanism enforces a common-password list on the server for every way a password can be set.**
- The only complete server-side option is Leaked Password Protection, on Supabase **Pro**.
- Supabase Pro (about US$25/month) is **already in the approved cost plan** for the paid launch (Stage 4), so this protection can be switched on then **at no additional cost**.

## Remaining limitation (until Pro)
- The common-password list is enforced **in the app only**.
- A technically skilled person who bypasses the app and calls the Auth API directly could give **their own account** a common password (still at least 8 characters, enforced by the server).
- This weakens only their own account. It doesn't give access to anyone else's data, which RLS protects.

## Options for the owner (Claude recommends A + C)

| Option | Effect | Cost |
|---|---|---|
| **A.** Keep as is: app-side list + server minimum 8 | No change | GH₵0 |
| **B.** Also enable `letters_digits` on the server now | Server rejects passwords without both letters and digits. **A requirement change**: the app's messages and tests would be updated to match | GH₵0 |
| **C.** Enable Leaked Password Protection when moving to Supabase Pro (Stage 4) | Full server-side protection | Included in already-planned Pro cost |
| **D.** Upgrade to Pro now, just for this | Full protection immediately | About US$25/month before any revenue; contradicts decision 10 (free tiers until validation) |

## Sources
- [Supabase: Password security](https://supabase.com/docs/guides/auth/password-security) (leaked password protection: Pro plan and above)
- [Supabase: Auth Hooks](https://supabase.com/docs/guides/auth/auth-hooks) (hook availability by plan)
- [Supabase: Before User Created Hook](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook)
- [Supabase: Password Verification Hook](https://supabase.com/docs/guides/auth/auth-hooks/password-verification-hook)
- Local test: Supabase CLI 3.1.0 stack, GoTrue v2.197; probe function and config removed afterwards
