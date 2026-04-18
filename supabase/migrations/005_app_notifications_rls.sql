-- Fixes Supabase advisor: "RLS Disabled in Public" for public.app_notifications
-- Safe to run even if policies already exist (idempotent).

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
