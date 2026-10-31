-- Contacts page: how many quotes each client has, counted in the database (docs/PENDING.md D17).
-- Before, the page loaded every quote of the organisation to count them itself, and the API
-- returns at most 1000 rows, so big organisations saw wrong counts.
--
-- One row per client with quotes, plus one row with client_id null: quotes with a client typed
-- in (company or person) but not linked to the directory, the same test clients_from_quotes uses.
-- Runs with the reader's rights, so the quotes rules (private.can_quote) decide what is counted,
-- exactly as when the page read the quotes itself. Uses quotes (org_id, number desc) for the filter.
create or replace function public.client_quote_counts(p_org uuid)
returns table(client_id uuid, quotes integer)
language sql stable security invoker set search_path = '' as $$
  select q.client_id, count(*)::integer
  from public.quotes q
  where q.org_id = p_org
    and (q.client_id is not null
         or nullif(trim(coalesce(nullif(trim(q.client_company), ''), q.client_name)), '') is not null)
  group by q.client_id
$$;
revoke execute on function public.client_quote_counts(uuid) from public, anon;
grant execute on function public.client_quote_counts(uuid) to authenticated;
