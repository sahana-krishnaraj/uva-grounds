-- Safety, preferences, moderation, and username constraints.

update public.profiles
set preferred_name = left(trim(preferred_name), 7)
where preferred_name is not null
  and char_length(trim(preferred_name)) > 7;

alter table public.profiles
  drop constraint if exists profiles_preferred_name_len;

alter table public.profiles
  add constraint profiles_preferred_name_len
  check (preferred_name is null or char_length(trim(preferred_name)) <= 7);

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  dark_mode boolean not null default false,
  notify_rsvp boolean not null default true,
  notify_likes boolean not null default true,
  notify_comments boolean not null default true,
  notify_messages boolean not null default true,
  notify_followers boolean not null default true,
  profile_visibility text not null default 'public'
    check (profile_visibility in ('public', 'following_only')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

drop policy if exists user_preferences_select_own on public.user_preferences;
create policy user_preferences_select_own
  on public.user_preferences for select
  using (auth.uid() = user_id);

drop policy if exists user_preferences_insert_own on public.user_preferences;
create policy user_preferences_insert_own
  on public.user_preferences for insert
  with check (auth.uid() = user_id);

drop policy if exists user_preferences_update_own on public.user_preferences;
create policy user_preferences_update_own
  on public.user_preferences for update
  using (auth.uid() = user_id);

drop policy if exists user_preferences_delete_own on public.user_preferences;
create policy user_preferences_delete_own
  on public.user_preferences for delete
  using (auth.uid() = user_id);

create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocked_idx on public.user_blocks (blocked_id, created_at desc);

alter table public.user_blocks enable row level security;

drop policy if exists user_blocks_select_participant on public.user_blocks;
create policy user_blocks_select_participant
  on public.user_blocks for select
  using (auth.uid() = blocker_id or auth.uid() = blocked_id);

drop policy if exists user_blocks_insert_own on public.user_blocks;
create policy user_blocks_insert_own
  on public.user_blocks for insert
  with check (auth.uid() = blocker_id);

drop policy if exists user_blocks_delete_own on public.user_blocks;
create policy user_blocks_delete_own
  on public.user_blocks for delete
  using (auth.uid() = blocker_id);

create table if not exists public.moderation_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid references auth.users(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  report_type text not null check (report_type in ('user', 'event')),
  reason text not null,
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved')),
  created_at timestamptz not null default now(),
  check (
    (report_type = 'user' and reported_user_id is not null and event_id is null)
    or
    (report_type = 'event' and event_id is not null)
  )
);

create index if not exists moderation_reports_created_idx on public.moderation_reports (created_at desc);
create index if not exists moderation_reports_open_idx on public.moderation_reports (status, created_at desc);

alter table public.moderation_reports enable row level security;

drop policy if exists moderation_reports_insert_own on public.moderation_reports;
create policy moderation_reports_insert_own
  on public.moderation_reports for insert
  with check (auth.uid() = reporter_id);

drop policy if exists moderation_reports_select_own on public.moderation_reports;
create policy moderation_reports_select_own
  on public.moderation_reports for select
  using (auth.uid() = reporter_id);

create or replace function public.set_user_preferences_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists user_preferences_set_updated_at on public.user_preferences;
create trigger user_preferences_set_updated_at
before update on public.user_preferences
for each row execute procedure public.set_user_preferences_updated_at();
