-- Club pages are exclusive: users submit a request; a developer approves in Supabase;
-- approval grants a one-time slot to create a club (row in club_creation_grants).

-- Pending club page applications
create table if not exists public.club_page_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  proposed_name text not null,
  proposed_slug text,
  category text not null default 'other'
    check (category in ('academic','cultural','sports','service','arts','professional','other')),
  description text,
  contact_email text,
  message text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now()
);

create index if not exists club_page_requests_user_idx on public.club_page_requests(user_id, created_at desc);
create index if not exists club_page_requests_status_idx on public.club_page_requests(status, created_at desc);

-- At most one pending request per user
create unique index if not exists club_page_requests_one_pending_per_user
  on public.club_page_requests (user_id)
  where (status = 'pending');

-- One active "create slot" per user (developer inserts via SQL, or trigger on approve)
create table if not exists public.club_creation_grants (
  user_id uuid primary key references auth.users(id) on delete cascade,
  request_id uuid references public.club_page_requests(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.club_page_requests enable row level security;
alter table public.club_creation_grants enable row level security;

drop policy if exists club_page_requests_select_own on public.club_page_requests;
create policy club_page_requests_select_own on public.club_page_requests
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists club_page_requests_insert_own on public.club_page_requests;
create policy club_page_requests_insert_own on public.club_page_requests
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');

drop policy if exists club_creation_grants_select_own on public.club_creation_grants;
create policy club_creation_grants_select_own on public.club_creation_grants
  for select to authenticated
  using (user_id = auth.uid());

-- After a club is created, the app removes the grant so the user cannot create another without a new approval.
drop policy if exists club_creation_grants_delete_own on public.club_creation_grants;
create policy club_creation_grants_delete_own on public.club_creation_grants
  for delete to authenticated
  using (user_id = auth.uid());

-- Replace open club creation: only users with an unused grant may insert a club.
drop policy if exists clubs_insert_auth on public.clubs;
create policy clubs_insert_auth on public.clubs
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.club_creation_grants g
      where g.user_id = auth.uid()
    )
  );

-- First owner row when the user just created the club (no existing members yet).
drop policy if exists club_members_insert_self_as_club_creator on public.club_members;
create policy club_members_insert_self_as_club_creator on public.club_members
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and role = 'owner'
    and exists (
      select 1 from public.clubs c
      where c.id = club_members.club_id
        and c.created_by = auth.uid()
    )
  );

-- When a request is marked approved (in SQL Editor / as postgres), grant create permission.
create or replace function public.grant_club_creation_on_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved' and (
    tg_op = 'INSERT'
    or (tg_op = 'UPDATE' and old.status is distinct from 'approved')
  ) then
    insert into public.club_creation_grants (user_id, request_id)
    values (new.user_id, new.id)
    on conflict (user_id) do update
      set request_id = excluded.request_id,
          created_at = now();
    new.reviewed_at = coalesce(new.reviewed_at, now());
  elsif new.status = 'rejected' and (
    tg_op = 'INSERT'
    or (tg_op = 'UPDATE' and old.status is distinct from 'rejected')
  ) then
    new.reviewed_at = coalesce(new.reviewed_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists club_page_requests_grant_on_approval on public.club_page_requests;
create trigger club_page_requests_grant_on_approval
  before insert or update on public.club_page_requests
  for each row
  execute procedure public.grant_club_creation_on_approval();

-- Developer workflow (run in Supabase SQL Editor as postgres):
--   update public.club_page_requests
--   set status = 'approved'
--   where id = '<request uuid>';
-- The trigger inserts/updates club_creation_grants for that user.
-- To reject:
--   update public.club_page_requests
--   set status = 'rejected', rejection_reason = '...'
--   where id = '<request uuid>';
