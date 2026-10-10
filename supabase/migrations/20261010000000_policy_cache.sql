-- BimaSetu: saved policy analyses keyed by UIN, plus check constraints on confidence values.
-- Run once in the Supabase SQL editor (or `supabase db push`). Safe to re-run.
--
-- Reuse rule (enforced in lib/policy/store.ts): a saved analysis is reused only when the document hash matches,
-- or the UIN matches exactly (the UIN includes the product version) AND the stored text is the same document.
-- Policy name is never used to match.

-- ── plan_templates: what the app needs to rebuild a result without calling the LLM ────────────────────────
alter table plan_templates
  add column if not exists overview           jsonb,    -- insurer, plan name, sum insured text, policy type, uin
  add column if not exists rules              jsonb,    -- the display rules shown in the Policy tab
  add column if not exists sum_insured_amount numeric,  -- base sum insured in rupees, read from the PDF
  add column if not exists page_count         int,      -- a template is only reused once all pages are saved
  add column if not exists extraction_version int not null default 1;  -- bump in code to invalidate old saves

-- ── compiled_rules: keep the app-level rule id; the table's uuid id is separate ────────────────────────────
alter table compiled_rules
  add column if not exists rule_key text;

-- ── indexes (lookups by hash and by UIN) ────────────────────────────────────────────────────────────────────
create index if not exists plan_templates_hash_idx on plan_templates (source_document_hash);
create index if not exists plan_templates_uin_idx  on plan_templates (uin_version);

-- One saved analysis per (UIN, document). Two different documents may share a UIN, so UIN alone is not unique.
create unique index if not exists plan_templates_uin_doc_uq
  on plan_templates (coalesce(uin_version, ''), source_document_hash)
  where source_document_hash is not null;

create index if not exists compiled_rules_template_idx on compiled_rules (plan_template_id);
create unique index if not exists extracted_pages_template_page_uq on extracted_pages (plan_template_id, page_number);
create index if not exists chat_messages_thread_idx on chat_messages (thread_id, created_at);

-- ── foreign keys (added only if missing; cascade so deleting a template removes its rules and pages) ───────
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'compiled_rules_plan_template_fk') then
    alter table compiled_rules add constraint compiled_rules_plan_template_fk
      foreign key (plan_template_id) references plan_templates(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'extracted_pages_plan_template_fk') then
    alter table extracted_pages add constraint extracted_pages_plan_template_fk
      foreign key (plan_template_id) references plan_templates(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chat_messages_thread_fk') then
    alter table chat_messages add constraint chat_messages_thread_fk
      foreign key (thread_id) references chat_threads(id) on delete cascade;
  end if;
end $$;

-- ── check constraints: confidence is one of high / medium / low (NULL still allowed where the column is nullable)
alter table plan_templates drop constraint if exists plan_templates_confidence_check;
alter table plan_templates add  constraint plan_templates_confidence_check
  check (template_confidence is null or template_confidence in ('high', 'medium', 'low'));

alter table compiled_rules drop constraint if exists compiled_rules_confidence_check;
alter table compiled_rules add  constraint compiled_rules_confidence_check
  check (confidence is null or confidence in ('high', 'medium', 'low'));

alter table chat_messages drop constraint if exists chat_messages_confidence_check;
alter table chat_messages add  constraint chat_messages_confidence_check
  check (confidence is null or confidence in ('high', 'medium', 'low'));

-- ── row-level security for extracted_pages ──────────────────────────────────────────────────────────────────
-- Policy wording is shared per UIN, so signed-in users may read it. Writes happen only from the server with the
-- service-role key (which bypasses RLS); there is deliberately no insert/update/delete policy for browser users.
alter table extracted_pages enable row level security;
drop policy if exists "Signed-in users can read extracted pages" on extracted_pages;
create policy "Signed-in users can read extracted pages" on extracted_pages
  for select to authenticated using (true);
