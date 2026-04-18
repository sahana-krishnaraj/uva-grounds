-- Native clubs/orgs system replacing static UVA events page.

create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  logo_url text,
  description text,
  category text not null default 'academic'
    check (category in ('academic','cultural','sports','service','arts','professional','other')),
  is_verified boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists clubs_category_idx on public.clubs(category);
create index if not exists clubs_name_idx on public.clubs(name);

alter table public.events
  add column if not exists club_id uuid references public.clubs(id) on delete set null;

alter table public.events
  add column if not exists shared_by_user_id uuid references auth.users(id) on delete set null;

create table if not exists public.club_members (
  club_id uuid not null references public.clubs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'editor' check (role in ('owner','admin','editor')),
  created_at timestamptz not null default now(),
  primary key (club_id, user_id)
);

create table if not exists public.club_follows (
  club_id uuid not null references public.clubs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (club_id, user_id)
);

create index if not exists club_follows_user_idx on public.club_follows(user_id, created_at desc);

alter table public.clubs enable row level security;
alter table public.club_members enable row level security;
alter table public.club_follows enable row level security;

drop policy if exists clubs_select_all on public.clubs;
create policy clubs_select_all on public.clubs
  for select using (true);

drop policy if exists clubs_insert_auth on public.clubs;
create policy clubs_insert_auth on public.clubs
  for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists clubs_update_member on public.clubs;
create policy clubs_update_member on public.clubs
  for update to authenticated
  using (
    exists (
      select 1 from public.club_members m
      where m.club_id = clubs.id and m.user_id = auth.uid() and m.role in ('owner','admin')
    )
  );

drop policy if exists club_members_select_all on public.club_members;
create policy club_members_select_all on public.club_members
  for select using (true);

drop policy if exists club_members_manage_admin on public.club_members;
create policy club_members_manage_admin on public.club_members
  for all to authenticated
  using (
    exists (
      select 1 from public.club_members m
      where m.club_id = club_members.club_id and m.user_id = auth.uid() and m.role in ('owner','admin')
    )
  )
  with check (
    exists (
      select 1 from public.club_members m
      where m.club_id = club_members.club_id and m.user_id = auth.uid() and m.role in ('owner','admin')
    )
  );

drop policy if exists club_follows_select_own_or_public on public.club_follows;
create policy club_follows_select_own_or_public on public.club_follows
  for select using (auth.uid() = user_id or auth.uid() is not null);

drop policy if exists club_follows_insert_own on public.club_follows;
create policy club_follows_insert_own on public.club_follows
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists club_follows_delete_own on public.club_follows;
create policy club_follows_delete_own on public.club_follows
  for delete to authenticated
  using (auth.uid() = user_id);

-- Extend notification types for club posts and follows.
alter table public.app_notifications
  drop constraint if exists app_notifications_type_check;
alter table public.app_notifications
  add constraint app_notifications_type_check
  check (type in ('rsvp', 'message', 'club_post', 'club_follow'));
