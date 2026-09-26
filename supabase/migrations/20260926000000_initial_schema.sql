-- AVX beta base schema (tables only). Access rules, triggers, invites and storage
-- live in 20260926000001_pilot_hardening.sql — run both, in order, on a new project.

create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  full_name text,
  avatar_url text,
  specialisms text[] default '{}',
  created_at timestamptz default now()
);

create table if not exists public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create table if not exists public.org_members (
  org_id uuid references public.organisations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('admin','member','viewer')),
  joined_at timestamptz default now(),
  primary key (org_id, user_id)
);

create table if not exists public.gigs (
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

create table if not exists public.gig_members (
  gig_id uuid references public.gigs(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text not null default 'crew' check (role in ('pm','crew','viewer')),
  function_title text,
  call_time time,
  primary key (gig_id, user_id)
);

create table if not exists public.assets (
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

create table if not exists public.feed_posts (
  id uuid primary key default gen_random_uuid(),
  gig_id uuid references public.gigs(id) on delete cascade,
  user_id uuid references auth.users(id),
  content text not null,
  is_important boolean default false,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;
alter table public.organisations enable row level security;
alter table public.org_members enable row level security;
alter table public.gigs enable row level security;
alter table public.gig_members enable row level security;
alter table public.assets enable row level security;
alter table public.feed_posts enable row level security;
