-- Run this in the Supabase SQL Editor (or via CLI) once per project.
-- Keeps a public directory row per auth user for the home feed “community” strip.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text,
  last_name text,
  computing_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_created_at_idx on public.profiles (created_at desc);

alter table public.profiles enable row level security;

-- Anyone can read profiles (campus directory / feed). Tighten if you need friends-only.
create policy "profiles_select_all"
  on public.profiles for select
  using (true);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

create or replace function public.set_profiles_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute procedure public.set_profiles_updated_at();

-- Auto-create a profile when a user signs up (matches server user_metadata keys).
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, first_name, last_name, computing_id)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data->>'first_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'last_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'computing_id', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
