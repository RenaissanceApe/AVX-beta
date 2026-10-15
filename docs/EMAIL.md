# Email: deliverability and templates

AVX sends four kinds of email through Supabase Auth, using the SMTP provider configured in
Supabase → Authentication → Emails → SMTP Settings: sign-up confirmation, password reset,
magic sign-in links and invitations. A daily **notification summary** goes out through Brevo's API
(see the last section).

## "It landed in spam"

Mail providers trust email that is **authenticated for the domain in the From address**.
Fix it once, in your SMTP provider and your domain's DNS:

1. **Send from your own domain**, e.g. `AVX <no-reply@lumenandpixel.com>` (Supabase → SMTP
   Settings → *Sender email* / *Sender name*). Don't send from a free mailbox (gmail.com etc.).
2. In your SMTP provider, **verify that domain**. It gives you DNS records to add at your domain host:
   - **SPF** (TXT) and **DKIM** (TXT or CNAME): these prove the provider may send for your domain
   - a **return-path / bounce** CNAME if it offers one
3. Add a **DMARC** record (TXT on `_dmarc.lumenandpixel.com`). Start with monitoring only:
   `v=DMARC1; p=none; rua=mailto:<your address>`
4. Use the branded templates in `supabase/templates/` (below). Plain, consistent emails with one clear
   link look less like phishing than the default ones.
5. Check the result: send a reset email to an address from https://www.mail-tester.com and aim for 9/10+.

New domains warm up over a few days; ask pilot users to mark the first email "Not spam".

## "The link said the site is not secure"

Supabase links point to `https://<project>.supabase.co/auth/v1/verify?...`, which then
redirects to `https://avx-beta.vercel.app`. Both are HTTPS. The warning almost always comes from
**click tracking** in the SMTP provider: it rewrites every link to its own tracking domain,
often over plain `http://`. That also breaks the one-time token if a mail scanner "clicks" it first.

**Turn off click tracking (and open tracking) for this sender** in your SMTP provider:
- Resend: Domains → your domain → *Click tracking* off
- Brevo: Transactional → Settings → *Tracking* (disable link tracking)
- Postmark: Message stream → Settings → *Link tracking* off
- SendGrid: Settings → Tracking → *Click tracking* off

Also check Supabase → Authentication → URL Configuration: Site URL `https://avx-beta.vercel.app`.

## Templates

Paste each file into Supabase → Authentication → **Emails → Templates**:

| Supabase template | File | Suggested subject |
|---|---|---|
| Confirm signup | `supabase/templates/confirm-signup.html` | Confirme o seu email · Confirm your AVX account |
| Reset password | `supabase/templates/reset-password.html` | Recuperar palavra-passe · Reset your AVX password |
| Invite user | `supabase/templates/invite-user.html` | Convite para o AVX · You've been invited to AVX |
| Magic link | `supabase/templates/magic-link.html` | Link de acesso ao AVX · Your AVX sign-in link |

The templates are bilingual (Portuguese first, then English), because Supabase sends one template
to everyone. They use Supabase's `{{ .ConfirmationURL }}` and `{{ .Email }}` variables. Keep those as they are.

## Invitation emails

Inviting someone without an account (gig Crew tab → *Invite Crew*, or dashboard → *Members*) calls
the `send-invite` Edge Function (`supabase/functions/send-invite`). It checks permissions in the
database, then asks Supabase Auth to send the *Invite user* email. The link opens `/welcome`,
where the person picks a name and password. Supabase's default limit is a few auth emails per hour
on the built-in sender; with your own SMTP you can raise it under Authentication → Rate Limits.

## Daily notification summary (Brevo)

People who don't open AVX every day still need to hear about a new call time or an important post.
Once a day, the `send-digest` Edge Function (`supabase/functions/send-digest`) emails each person
**one** summary of the notifications they haven't read in the app:

- only unread notifications from the last 7 days that are at least 30 minutes old
- each notification is emailed at most once (`notifications.emailed_at`)
- nothing is sent to people who are up to date, or who turned it off in **Account → Email summary**
- written in the person's language (Account → Language), with a link straight to the gig

It is already deployed. It does nothing until you give it a Brevo key. **To switch it on:**

1. **Brevo API key.** Brevo → top-right menu → *SMTP & API* → **API Keys** → *Generate a new API key*
   (name it `avx-digest`). Copy it. This is a different thing from the SMTP key Supabase Auth uses.
2. **Verified sender.** Brevo → *Senders, Domains & Dedicated IPs* → make sure the sender you'll use
   (e.g. `no-reply@lumenandpixel.com`) is listed and its domain shows **Authenticated** (DKIM + DMARC).
   If you already did this for the Supabase SMTP sender, it's the same one.
3. **Turn off tracking** for transactional email (see "not secure" above), or the links get rewritten.
4. **Function secrets.** Supabase → Edge Functions → **Secrets** → add:
   | Name | Value |
   |---|---|
   | `BREVO_API_KEY` | the key from step 1 |
   | `DIGEST_FROM` | the verified sender address, e.g. `no-reply@lumenandpixel.com` |
   | `DIGEST_SECRET` | a long random string, e.g. from `openssl rand -hex 32` or a password manager |
5. **GitHub secret.** GitHub → repo → Settings → Secrets and variables → Actions → *New repository
   secret* → `DIGEST_SECRET` with **the same** random string.
6. **Try it.** GitHub → Actions → *Email digest* → *Run workflow* with **dry run** ticked. The log shows
   `{"users":…,"sent":…}` without sending anything. Run it again without dry run to send for real.

After that it runs every morning at about 08:20 Lisbon time (07:23 UTC). Brevo's free plan allows
300 emails a day, which is one summary each for up to 300 people.

**If something looks wrong:** Supabase → Edge Functions → `send-digest` → Logs shows one line per run
with counts only (`sent`, `optedOut`, `failed`); a `brevo` line with `status: 401` means a wrong API key,
`400` usually means the sender isn't verified. Brevo → *Transactional* → **Logs** shows each email's
delivery status.
