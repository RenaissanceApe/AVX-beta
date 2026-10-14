# Email: deliverability and templates

AVX sends four kinds of email through Supabase Auth, using the SMTP provider configured in
Supabase → Authentication → Emails → SMTP Settings: sign-up confirmation, password reset,
invitations and (later) notifications.

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

The templates are bilingual (Portuguese first, then English), because Supabase sends one template
to everyone. They use Supabase's `{{ .ConfirmationURL }}` and `{{ .Email }}` variables. Keep those as they are.

## Invitation emails

Inviting someone without an account (gig Crew tab → *Invite Crew*, or dashboard → *Members*) calls
the `send-invite` Edge Function (`supabase/functions/send-invite`). It checks permissions in the
database, then asks Supabase Auth to send the *Invite user* email. The link opens `/welcome`,
where the person picks a name and password. Supabase's default limit is a few auth emails per hour
on the built-in sender; with your own SMTP you can raise it under Authentication → Rate Limits.
