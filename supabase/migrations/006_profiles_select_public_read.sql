-- Feed / directory: every client must be able to read all profile rows (incl. avatar_url)
-- for other users' posts. Re-applies a permissive SELECT policy if a stricter one was added.

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all"
  on public.profiles
  for select
  to anon, authenticated
  using (true);
