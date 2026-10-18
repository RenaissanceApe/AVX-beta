# Usage counts

To see which parts of AVX the pilot companies actually use, the app counts screens and a few
actions per day, summed over everyone. **Nothing identifies a person**: no user id, email, IP
address, device id or cookie is stored, and no gig, quote or organisation id either. Browsers that
send *Do Not Track* or *Global Privacy Control* send nothing. Only signed-in people are counted, and
never the public quote page a client opens.

## What is counted

| Event | When |
|---|---|
| `view:me`, `view:org`, `view:orgs`, `view:gig`, `view:gig/schedule`, `view:gig/crew`, … | A screen (and gig tab) is opened |
| `view:org-quotes`, `view:quote`, `view:quote-print`, `view:gig-callsheet` | Quotes, the quote editor, print preview, call sheet |
| `quote:sent-email`, `quote:sent-email-pdf`, `quote:sent-link` | A quote is sent (email, email with PDF, link only) |
| `quote:version-saved`, `quote:version-restored`, `quote:pdf-downloaded`, `quote:gig-filled` | Quote versions, PDF download, "Fill gig from quote" |
| `invite:gig-added`, `invite:gig-invited`, `invite:org-…` | Someone is added or invited |
| `account:mfa-on` | Someone turns on two-step sign-in |

## Reading them

Supabase → SQL editor (production project):

```sql
-- Last 7 and 30 days, most used first
select * from private.usage_summary;

-- Day by day for one event
select day, n from private.usage_daily where event = 'view:gig' order by day desc;

-- How many people signed in recently (from Supabase Auth, not from the counts)
select count(*) filter (where last_sign_in_at > now() - interval '7 days') as last_7_days,
       count(*) filter (where last_sign_in_at > now() - interval '30 days') as last_30_days
from auth.users;
```

The counts live in the `private` schema, which the app's API can't read; only the SQL editor (or
the service role) can. Adding a new event is one `track('area:thing')` call in the app
(`src/lib/usage.js`); names may only use `a-z 0-9 _ . : / -`.
