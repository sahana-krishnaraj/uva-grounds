-- Run in Supabase SQL Editor ONLY AFTER tables exist.
--
-- Order:
--   1) supabase/migrations/001_profiles.sql (if you have not already)
--   2) supabase/migrations/002_events_social.sql  ← creates events, follows, rsvps, comments, messages
--   3) This file (RLS policies)
--
-- "Publishing" your app / GitHub does NOT create tables — you must run the SQL in Supabase.

-- If policies already exist from a failed partial run, drop them first or use new names.

-- Enable realtime (Dashboard → Database → Replication) for:
--   public.events, public.rsvps, public.comments, public.messages, public.follows

-- Example RLS (tighten as needed):

-- EVENTS: anyone authenticated can read events they can see (simplify: all authenticated read all, filter in app — OR use policies per visibility).
-- Recommended: authenticated SELECT for rows where visibility = 'public' OR user_id = auth.uid() OR EXISTS (follow) for friends.

alter table public.events enable row level security;

create policy "events_select_authenticated"
  on public.events for select
  to authenticated
  using (true);

create policy "events_insert_own"
  on public.events for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "events_update_own"
  on public.events for update
  to authenticated
  using (user_id = auth.uid());

create policy "events_delete_own"
  on public.events for delete
  to authenticated
  using (user_id = auth.uid());

-- RSVPS
alter table public.rsvps enable row level security;

create policy "rsvps_select_authenticated"
  on public.rsvps for select
  to authenticated
  using (true);

create policy "rsvps_insert_self"
  on public.rsvps for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "rsvps_delete_self"
  on public.rsvps for delete
  to authenticated
  using (user_id = auth.uid());

-- COMMENTS
alter table public.comments enable row level security;

create policy "comments_select_authenticated"
  on public.comments for select
  to authenticated
  using (true);

create policy "comments_insert_authenticated"
  on public.comments for insert
  to authenticated
  with check (user_id = auth.uid());

-- FOLLOWS
alter table public.follows enable row level security;

create policy "follows_select_authenticated"
  on public.follows for select
  to authenticated
  using (true);

create policy "follows_insert_self"
  on public.follows for insert
  to authenticated
  with check (follower_id = auth.uid());

create policy "follows_delete_self"
  on public.follows for delete
  to authenticated
  using (follower_id = auth.uid());

-- MESSAGES
alter table public.messages enable row level security;

create policy "messages_select_participants"
  on public.messages for select
  to authenticated
  using (sender_id = auth.uid() OR recipient_id = auth.uid());

create policy "messages_insert_sender"
  on public.messages for insert
  to authenticated
  with check (sender_id = auth.uid());

create policy "messages_update_recipient_read"
  on public.messages for update
  to authenticated
  using (recipient_id = auth.uid() OR sender_id = auth.uid());

-- APP NOTIFICATIONS (run migrations/003_profiles_extras_and_notifications.sql first)
alter table public.app_notifications enable row level security;

drop policy if exists "app_notifications_select_own" on public.app_notifications;
create policy "app_notifications_select_own"
  on public.app_notifications for select
  to authenticated
  using (recipient_id = auth.uid());

drop policy if exists "app_notifications_insert_as_actor" on public.app_notifications;
create policy "app_notifications_insert_as_actor"
  on public.app_notifications for insert
  to authenticated
  with check (
    actor_id = auth.uid()
    and recipient_id <> auth.uid()
  );

drop policy if exists "app_notifications_update_own" on public.app_notifications;
create policy "app_notifications_update_own"
  on public.app_notifications for update
  to authenticated
  using (recipient_id = auth.uid());

drop policy if exists "app_notifications_delete_own" on public.app_notifications;
create policy "app_notifications_delete_own"
  on public.app_notifications for delete
  to authenticated
  using (recipient_id = auth.uid());
