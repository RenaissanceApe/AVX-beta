# Two-step sign-in

Anyone can turn it on under **Account → Two-step sign-in**: scan the QR code with an authenticator
app (Google Authenticator, Microsoft Authenticator, 1Password, Authy…) and type the 6-digit code.
From then on, signing in (with a password or a magic link) also asks for a code. Recommended for
organisation admins.

## How it is enforced

The app shows a code screen, but the real check is in the database
(`supabase/migrations/20261022000000_two_step_sign_in.sql`):

- Every table and the file storage have an extra *restrictive* rule: if the person has a verified
  authenticator and the current session hasn't given a code (`aal1`), nothing can be read or changed.
- The functions the app calls directly (invites, member list, availability clashes, account deletion)
  check the same thing first. The originals live in the `private` schema as `…_unchecked`; future
  changes to those functions go there, not to the public wrappers.
- People without an authenticator are not affected.

Tested by `supabase/tests/mfa_rls.sql` (test project; ends with `ALL MFA CHECKS PASSED`).

## Lost phone

Supabase → **Authentication → Users** → the person → **Multi-factor authentication** → delete the
factor. They can then sign in with their password and turn two-step sign-in on again.

## Not included

Leaked-password protection (rejecting passwords found in data breaches) needs Supabase Pro.
