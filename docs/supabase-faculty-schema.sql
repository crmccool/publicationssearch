-- Faculty roster table used by MVP upload/save flow.
-- Assumed columns requested for this step:
--   email
--   first_name
--   last_name
--   first_initial
--   primary_department
--   status
--
-- Notes:
-- * email is modeled as UNIQUE so roster uploads can upsert by email.
-- * Future replacement/audit logic should be implemented with an RPC or server API
--   that can replace rows transactionally and store upload metadata.

create table if not exists public.faculty (
  id bigserial primary key,
  email text not null unique,
  first_name text not null,
  last_name text not null,
  first_initial text not null,
  primary_department text not null,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
