import { createClient } from '@supabase/supabase-js'

// These are injected at build time via environment variables.
// For the beta, the user replaces these with their own Supabase project credentials.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '__SUPABASE_URL__'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '__SUPABASE_ANON_KEY__'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ── SQL to run once in Supabase SQL editor ──────────────────────────────────
// Paste this into your Supabase project > SQL Editor > New query
/*
-- Users extended profile (Supabase auth.users already exists)
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  full_name text,
  avatar_url text,
  specialisms text[] default '{}',
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;
create policy "Users can view all profiles" on public.profiles for select using (true);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Users can insert own profile" on public.profiles for insert with check (auth.uid() = id);

-- Organisations
create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);
alter table public.organisations enable row level security;
create policy "Org members can view" on public.organisations for select using (
  exists (select 1 from public.org_members where org_id = id and user_id = auth.uid())
);
create policy "Auth users can create org" on public.organisations for insert with check (auth.uid() = created_by);

-- Org members
create table public.org_members (
  org_id uuid references public.organisations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('admin','member','viewer')),
  joined_at timestamptz default now(),
  primary key (org_id, user_id)
);
alter table public.org_members enable row level security;
create policy "Members can view org members" on public.org_members for select using (
  exists (select 1 from public.org_members om where om.org_id = org_id and om.user_id = auth.uid())
);
create policy "Admins can insert members" on public.org_members for insert with check (auth.uid() = user_id);

-- Gigs
create table public.gigs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organisations(id) on delete cascade,
  name text not null,
  venue text,
  start_date date,
  end_date date,
  description text,
  status text not null default 'draft' check (status in ('draft','confirmed','active','completed','archived')),
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);
alter table public.gigs enable row level security;
create policy "Gig members can view" on public.gigs for select using (
  exists (select 1 from public.gig_members where gig_id = id and user_id = auth.uid())
  or exists (select 1 from public.org_members where org_id = gigs.org_id and user_id = auth.uid())
);
create policy "Org members can create gigs" on public.gigs for insert with check (
  exists (select 1 from public.org_members where org_id = org_id and user_id = auth.uid())
);
create policy "Org admins can update gigs" on public.gigs for update using (
  exists (select 1 from public.org_members where org_id = gigs.org_id and user_id = auth.uid() and role = 'admin')
  or created_by = auth.uid()
);

-- Gig members
create table public.gig_members (
  gig_id uuid references public.gigs(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text not null default 'crew' check (role in ('pm','crew','viewer')),
  function_title text,
  call_time time,
  primary key (gig_id, user_id)
);
alter table public.gig_members enable row level security;
create policy "Gig members can view" on public.gig_members for select using (
  exists (select 1 from public.gig_members gm where gm.gig_id = gig_id and gm.user_id = auth.uid())
  or exists (select 1 from public.gigs g join public.org_members om on om.org_id = g.org_id where g.id = gig_id and om.user_id = auth.uid())
);
create policy "PMs can insert gig members" on public.gig_members for insert with check (
  auth.uid() = user_id
  or exists (select 1 from public.gig_members where gig_id = gig_id and user_id = auth.uid() and role = 'pm')
  or exists (select 1 from public.gigs g join public.org_members om on om.org_id = g.org_id where g.id = gig_id and om.user_id = auth.uid() and om.role = 'admin')
);

-- Assets
create table public.assets (
  id uuid primary key default gen_random_uuid(),
  gig_id uuid references public.gigs(id) on delete cascade,
  type text not null default 'document' check (type in ('patch_list','plot','schedule','rider','document','image')),
  name text not null,
  file_url text,
  file_size bigint,
  version int not null default 1,
  superseded_by uuid references public.assets(id),
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);
alter table public.assets enable row level security;
create policy "Gig members can view assets" on public.assets for select using (
  exists (select 1 from public.gigs g join public.org_members om on om.org_id = g.org_id where g.id = gig_id and om.user_id = auth.uid())
  or exists (select 1 from public.gig_members where gig_id = gig_id and user_id = auth.uid())
);
create policy "PMs can insert assets" on public.assets for insert with check (
  exists (select 1 from public.gigs g join public.org_members om on om.org_id = g.org_id where g.id = gig_id and om.user_id = auth.uid())
);
create policy "PMs can update assets" on public.assets for update using (
  exists (select 1 from public.gigs g join public.org_members om on om.org_id = g.org_id where g.id = gig_id and om.user_id = auth.uid())
);

-- Feed posts
create table public.feed_posts (
  id uuid primary key default gen_random_uuid(),
  gig_id uuid references public.gigs(id) on delete cascade,
  user_id uuid references auth.users(id),
  content text not null,
  is_important boolean default false,
  created_at timestamptz default now()
);
alter table public.feed_posts enable row level security;
create policy "Gig members can view feed" on public.feed_posts for select using (
  exists (select 1 from public.gigs g join public.org_members om on om.org_id = g.org_id where g.id = gig_id and om.user_id = auth.uid())
  or exists (select 1 from public.gig_members where gig_id = gig_id and user_id = auth.uid())
);
create policy "Gig members can post" on public.feed_posts for insert with check (
  auth.uid() = user_id and (
    exists (select 1 from public.gigs g join public.org_members om on om.org_id = g.org_id where g.id = gig_id and om.user_id = auth.uid())
    or exists (select 1 from public.gig_members where gig_id = gig_id and user_id = auth.uid())
  )
);

-- Storage bucket for assets (run in Supabase dashboard Storage section)
-- Create a bucket named "gig-assets" with public = false

-- Trigger: auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$;
create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
*/
