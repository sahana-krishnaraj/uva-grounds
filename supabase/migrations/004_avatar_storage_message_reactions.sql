-- Avatars bucket (public read) + per-user folder uploads.
-- Run in Supabase SQL Editor after prior migrations.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Avatars public read" on storage.objects;
create policy "Avatars public read"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');

drop policy if exists "Avatars insert own folder" on storage.objects;
create policy "Avatars insert own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and name like auth.uid()::text || '/%'
  );

drop policy if exists "Avatars update own folder" on storage.objects;
create policy "Avatars update own folder"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and name like auth.uid()::text || '/%'
  );

drop policy if exists "Avatars delete own folder" on storage.objects;
create policy "Avatars delete own folder"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and name like auth.uid()::text || '/%'
  );

-- One emoji reaction per user per message (toggle by delete + insert from app).
create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  emoji text not null check (char_length(emoji) >= 1 and char_length(emoji) <= 16),
  created_at timestamptz not null default now(),
  constraint message_reactions_one_per_user unique (message_id, user_id)
);

create index if not exists message_reactions_message_id_idx on public.message_reactions (message_id);

alter table public.message_reactions enable row level security;

drop policy if exists "message_reactions_select_participants" on public.message_reactions;
create policy "message_reactions_select_participants"
  on public.message_reactions for select
  to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_id
        and (m.sender_id = auth.uid() or m.recipient_id = auth.uid())
    )
  );

drop policy if exists "message_reactions_insert_participant" on public.message_reactions;
create policy "message_reactions_insert_participant"
  on public.message_reactions for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.messages m
      where m.id = message_id
        and (m.sender_id = auth.uid() or m.recipient_id = auth.uid())
    )
  );

drop policy if exists "message_reactions_update_own" on public.message_reactions;
create policy "message_reactions_update_own"
  on public.message_reactions for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "message_reactions_delete_own" on public.message_reactions;
create policy "message_reactions_delete_own"
  on public.message_reactions for delete
  to authenticated
  using (user_id = auth.uid());

-- Realtime (enable in Dashboard → Database → Replication if insert fails here)
do $$
begin
  alter publication supabase_realtime add table public.message_reactions;
exception
  when duplicate_object then null;
end $$;
