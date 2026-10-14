# Changelog

## 0.3.0 — Phase 1: ready for pilot companies

### Added
- Organisation members: invite by email, roles, remove, leave, delete organisation (last admin is protected)
- Invitation emails for gigs and organisations, and a `/welcome` page to set name + password
- Account: export my data, delete my account
- Privacy notice and beta terms, linked from sign-up
- Dashboard filters (upcoming / past / archived / all) and search
- Optional Sentry error monitoring; daily encrypted database backups workflow
- Branded auth email templates and email deliverability guide

### Changed
- DM Sans font is now self-hosted (no requests to Google)
- Clearer message when choosing your current password as the new one

## 0.2.0 — Pilot foundation

### Added
- Password reset ("Forgot password?"), resend confirmation email, change password and name from the Account panel
- Crew by email: existing users are added at once; pending invites are claimed automatically on sign-up
- "Shared with you" gigs on the dashboard for crew outside the organisation
- Delete assets, delete feed posts, remove crew / leave a gig
- Upload hint showing when a file will become a new version
- Error boundary, toast notifications, central logger, friendly error messages
- Security headers (CSP, X-Frame-Options, Referrer-Policy, Permissions-Policy), favicon, robots noindex
- ESLint, Vitest unit tests, GitHub Actions CI, Supabase keep-alive workflow
- `supabase/migrations/` and an access-rule smoke test

### Fixed
- Access rules: recursion errors, users able to join any organisation, crew seeing other gigs' files
- Creating an organisation failed; storage bucket was public
- A new upload replaced any asset of the same type (now only same type + same name)
- Empty dates broke gig create/edit; errors were silent
- Debug output shown when opening files; pinch-zoom disabled on mobile

### Changed
- Minimum password length 8; file uploads limited to 50 MB with a clear message
