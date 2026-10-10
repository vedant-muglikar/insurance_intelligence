-- ─────────────────────────────────────────────────────────────────────────────
-- Hospitalization preparation checklists
--
-- One checklist per (user, policy). A policy is identified by policy_key:
--   pdf:<sha256 of the uploaded PDF>  — real uploads (same PDF ⇒ same checklist)
--   sample:<slug>                     — built-in demo policies
-- Rows are protected by RLS so users can only read/write their own data.
-- Attachments live in the private `checklist-documents` storage bucket under
-- <user_id>/<checklist_id>/..., also restricted to the owner.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pgcrypto;

create table if not exists public.policy_checklists (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  policy_key        text not null check (char_length(policy_key) between 8 and 200),
  insurer           text,
  plan_name         text,
  file_name         text,
  scenario          jsonb,
  generator_version integer not null default 1,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, policy_key)
);

create table if not exists public.checklist_tasks (
  id           uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.policy_checklists (id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_key     text not null check (char_length(task_key) between 1 and 200),
  definition   jsonb not null,
  status       text not null default 'pending' check (status in ('pending', 'completed')),
  due_date     date,
  completed_at timestamptz,
  stale        boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (checklist_id, task_key)
);

create table if not exists public.checklist_attachments (
  id           uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.policy_checklists (id) on delete cascade,
  task_key     text not null,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  file_name    text not null check (char_length(file_name) between 1 and 255),
  mime_type    text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes   integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  storage_path text not null unique,
  created_at   timestamptz not null default now()
);

create index if not exists checklist_tasks_checklist_idx on public.checklist_tasks (checklist_id);
create index if not exists checklist_attachments_task_idx on public.checklist_attachments (checklist_id, task_key);

-- updated_at maintenance
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists policy_checklists_updated_at on public.policy_checklists;
create trigger policy_checklists_updated_at before update on public.policy_checklists
  for each row execute function public.set_updated_at();

drop trigger if exists checklist_tasks_updated_at on public.checklist_tasks;
create trigger checklist_tasks_updated_at before update on public.checklist_tasks
  for each row execute function public.set_updated_at();

-- ── Row-level security ──────────────────────────────────────────────────────
alter table public.policy_checklists     enable row level security;
alter table public.checklist_tasks       enable row level security;
alter table public.checklist_attachments enable row level security;

drop policy if exists "checklists: owner access" on public.policy_checklists;
create policy "checklists: owner access" on public.policy_checklists
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "checklist tasks: owner access" on public.checklist_tasks;
create policy "checklist tasks: owner access" on public.checklist_tasks
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.policy_checklists c where c.id = checklist_id and c.user_id = auth.uid())
  );

drop policy if exists "checklist attachments: owner access" on public.checklist_attachments;
create policy "checklist attachments: owner access" on public.checklist_attachments
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.policy_checklists c where c.id = checklist_id and c.user_id = auth.uid())
  );

-- ── Private storage bucket for supporting documents ─────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'checklist-documents',
  'checklist-documents',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

drop policy if exists "checklist documents: owner read" on storage.objects;
create policy "checklist documents: owner read" on storage.objects
  for select to authenticated
  using (bucket_id = 'checklist-documents' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "checklist documents: owner upload" on storage.objects;
create policy "checklist documents: owner upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'checklist-documents' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "checklist documents: owner delete" on storage.objects;
create policy "checklist documents: owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'checklist-documents' and (storage.foldername(name))[1] = auth.uid()::text);
