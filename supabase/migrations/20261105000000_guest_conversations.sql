-- Messaging M4b, part 1 of 2: conversations with clients and suppliers (no AVX account).
-- RUN BY HAND in the Supabase SQL editor (AVX test first, then the live project): it replaces a
-- rule on public.conversations (DROP CONSTRAINT) and adds clean-up triggers that delete a
-- conversation when the thing it's about is deleted. Safe to run twice. Part 2
-- (20261105000001_messaging_m4b.sql) is applied after this one.

-- A new kind of conversation about one thing: 'supplier' = the conversation with a subrental's
-- supplier (shared with them through a link). 'quote' (allowed since M4) = the conversation with
-- the quote's client, on the quote's public page.
alter table public.conversations drop constraint if exists conversations_kind_fields_check;
alter table public.conversations add constraint conversations_kind_fields_check
  check ((kind in ('gig', 'department')) = (gig_id is not null)
     and (kind = 'department') = (department is not null)
     and (kind = 'org' or kind = 'context') = (org_id is not null)
     and (kind = 'context') = (context_type is not null and context_id is not null)
     and (context_type is null or context_type in ('item', 'repair', 'subrental', 'quote', 'supplier')));

-- Deleting an item, a repair, a subrental or a quote deletes its conversations too (with their
-- messages), instead of leaving them behind
create or replace function private.delete_context_conversations() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.conversations c
   where c.kind = 'context' and c.context_id = old.id
     and c.context_type = any (case tg_table_name
                                 when 'price_items' then array['item']
                                 when 'repairs' then array['repair']
                                 when 'subrentals' then array['subrental', 'supplier']
                                 when 'quotes' then array['quote']
                                 else array[]::text[] end);
  return null;
end $$;
revoke execute on function private.delete_context_conversations() from public, anon, authenticated;

create or replace trigger delete_context_conversations after delete on public.price_items
  for each row execute function private.delete_context_conversations();
create or replace trigger delete_context_conversations after delete on public.repairs
  for each row execute function private.delete_context_conversations();
create or replace trigger delete_context_conversations after delete on public.subrentals
  for each row execute function private.delete_context_conversations();
create or replace trigger delete_context_conversations after delete on public.quotes
  for each row execute function private.delete_context_conversations();

select 'Guest conversations ready (part 1)' as result;
