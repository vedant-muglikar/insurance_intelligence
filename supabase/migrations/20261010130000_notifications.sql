-- ─────────────────────────────────────────────────────────────────────────────
-- In-app notifications (the bell in the top bar)
--
-- Two sources share this table:
--   derived = true   reminders recomputed from checklist state on every fetch
--                    (task due soon / today / overdue, admission approaching,
--                    high-severity risk alerts). Rows whose condition no longer
--                    holds are deleted; the rest keep their read/dismissed state.
--   derived = false  one-off events (checklist created / updated).
-- dedupe_key identifies a notification per user, so re-deriving never duplicates.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  dedupe_key   text not null check (char_length(dedupe_key) between 1 and 400),
  kind         text not null check (kind in (
                 'task_overdue', 'task_due_today', 'task_due_soon', 'admission_soon',
                 'risk_alert', 'checklist_created', 'checklist_updated')),
  severity     text not null default 'info' check (severity in ('high', 'medium', 'info')),
  title        text not null check (char_length(title) between 1 and 300),
  body         text not null check (char_length(body) <= 1000),
  checklist_id uuid references public.policy_checklists (id) on delete cascade,
  policy_key   text,
  policy_label text,
  task_key     text,
  derived      boolean not null default false,
  created_at   timestamptz not null default now(),
  read_at      timestamptz,
  dismissed_at timestamptz,
  unique (user_id, dedupe_key)
);

create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "notifications: owner access" on public.notifications;
create policy "notifications: owner access" on public.notifications
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (checklist_id is null
         or exists (select 1 from public.policy_checklists c where c.id = checklist_id and c.user_id = auth.uid()))
  );
