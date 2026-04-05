-- Run in Supabase SQL Editor AFTER public.profiles exists (see 001_profiles.sql).
-- Creates tables HoosOut expects: events, follows, rsvps, comments, messages.
-- Then run rls_policies.sql (or merge policies below).

-- —— Events ——
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  activity_type text not null,
  duration text,
  start_iso timestamptz not null,
  lat double precision,
  lng double precision,
  place_label text,
  visibility text not null default 'public'
    check (visibility in ('public', 'friends', 'invite')),
  tags text,
  vibe text,
  notes text,
  cap integer,
  created_at timestamptz not null default now()
);

create index if not exists events_user_id_idx on public.events (user_id);
create index if not exists events_created_at_idx on public.events (created_at desc);
create index if not exists events_visibility_idx on public.events (visibility);

-- —— Follows ——
create table if not exists public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references auth.users (id) on delete cascade,
  following_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint follows_no_self check (follower_id <> following_id),
  constraint follows_unique unique (follower_id, following_id)
);

create index if not exists follows_follower_idx on public.follows (follower_id);
create index if not exists follows_following_idx on public.follows (following_id);

-- —— RSVPs ——
create table if not exists public.rsvps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint rsvps_unique unique (user_id, event_id)
);

create index if not exists rsvps_event_id_idx on public.rsvps (event_id);

-- —— Comments (column "text" is the message body) ——
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  "text" text not null,
  created_at timestamptz not null default now()
);

create index if not exists comments_event_id_idx on public.comments (event_id);

-- —— Messages ——
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users (id) on delete cascade,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  "text" text not null,
  "read" boolean not null default false,
  created_at timestamptz not null default now(),
  constraint messages_no_self check (sender_id <> recipient_id)
);

create index if not exists messages_sender_idx on public.messages (sender_id);
create index if not exists messages_recipient_idx on public.messages (recipient_id);
create index if not exists messages_created_at_idx on public.messages (created_at desc);
