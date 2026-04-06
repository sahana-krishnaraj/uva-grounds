-- Run after 001_profiles.sql and 002_events_social.sql.
-- Extra profile fields + persistent in-app notifications.

alter table public.profiles add column if not exists preferred_name text;
alter table public.profiles add column if not exists pronouns text;
alter table public.profiles add column if not exists year text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists location text;
alter table public.profiles add column if not exists interests text;
alter table public.profiles add column if not exists vibe text;
alter table public.profiles add column if not exists schedule text;
alter table public.profiles add column if not exists avatar_url text;

create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  type text not null check (type in ('rsvp', 'message')),
  title text,
  body text,
  event_id uuid references public.events (id) on delete cascade,
  message_id uuid references public.messages (id) on delete cascade,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists app_notifications_recipient_created_idx
  on public.app_notifications (recipient_id, created_at desc);
create index if not exists app_notifications_recipient_unread_idx
  on public.app_notifications (recipient_id) where read = false;

-- RLS: run policies in supabase/rls_policies.sql (app_notifications section).
-- Realtime: Dashboard → Database → Replication → enable public.app_notifications
