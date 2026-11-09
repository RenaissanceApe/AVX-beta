-- Quote bin (#124), part 1 (apply BY HAND in the SQL editor, before 20270102000001_quote_bin.sql):
-- a fifth quote status, "cancelled". Only a draft can be deleted (it goes to Recently deleted); a
-- sent or accepted quote is cancelled instead (public.cancel_quote, in the next file). A cancelled
-- quote counts nowhere: not waiting, not in the win rate, not in revenue.
-- Changing a check means replacing it, which the connector may not run; hence this small file.
alter table public.quotes drop constraint if exists quotes_status_check;
alter table public.quotes add constraint quotes_status_check
  check (status in ('draft', 'sent', 'accepted', 'declined', 'cancelled'));
