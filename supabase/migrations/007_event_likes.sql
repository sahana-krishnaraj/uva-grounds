-- Server-side likes for events (feed-visible across users). Run after 002_events_social.sql.

create table if not exists public.event_likes (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index if not exists event_likes_event_id_idx on public.event_likes (event_id);

alter table public.event_likes enable row level security;

drop policy if exists "event_likes_select_authenticated" on public.event_likes;
create policy "event_likes_select_authenticated"
  on public.event_likes for select
  to authenticated
  using (true);

drop policy if exists "event_likes_insert_own" on public.event_likes;
create policy "event_likes_insert_own"
  on public.event_likes for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "event_likes_delete_own" on public.event_likes;
create policy "event_likes_delete_own"
  on public.event_likes for delete
  to authenticated
  using (user_id = auth.uid());

do $$
begin
  alter publication supabase_realtime add table public.event_likes;
exception
  when duplicate_object then null;
end $$;
