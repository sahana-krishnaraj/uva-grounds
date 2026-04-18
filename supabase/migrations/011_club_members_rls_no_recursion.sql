-- Fix "infinite recursion detected in policy for relation club_members".
-- Policies must not subquery club_members under RLS; use SECURITY DEFINER to read safely.

create or replace function public.club_user_is_owner_or_admin(p_user_id uuid, p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.club_members m
    where m.club_id = p_club_id
      and m.user_id = p_user_id
      and m.role in ('owner', 'admin')
  );
$$;

revoke all on function public.club_user_is_owner_or_admin(uuid, uuid) from public;
grant execute on function public.club_user_is_owner_or_admin(uuid, uuid) to authenticated;
grant execute on function public.club_user_is_owner_or_admin(uuid, uuid) to service_role;

-- club_members: replace self-referential policy
drop policy if exists club_members_manage_admin on public.club_members;
create policy club_members_manage_admin on public.club_members
  for all to authenticated
  using (public.club_user_is_owner_or_admin(auth.uid(), club_members.club_id))
  with check (public.club_user_is_owner_or_admin(auth.uid(), club_members.club_id));

-- clubs: update policy also subqueried club_members (could recurse when touching clubs)
drop policy if exists clubs_update_member on public.clubs;
create policy clubs_update_member on public.clubs
  for update to authenticated
  using (public.club_user_is_owner_or_admin(auth.uid(), clubs.id));
