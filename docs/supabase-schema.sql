-- Launch Control — optional persistence (Supabase).
-- Create a FREE project at https://supabase.com (2 min), open the SQL editor,
-- run this, then drop SUPABASE_URL + SUPABASE_SERVICE_KEY into .env.local.
-- Without these, the app still works (localStorage + render URLs); with them,
-- generated media + week plans persist server-side and across devices.

-- Every generated still / film, saved.
create table if not exists assets (
  id           uuid primary key default gen_random_uuid(),
  org          text not null default 'demo',   -- a workspace / user handle
  url          text not null,
  content_type text not null,                  -- image | ugc_video | motion_video
  platform     text,
  day          text,
  brand        text,
  caption      text,
  created_at   timestamptz not null default now(),
  unique (org, url)
);
create index if not exists idx_assets_org_time on assets (org, created_at desc);

-- ── Media review lifecycle (the create → review → regenerate handoff) ────────
-- Each render is a self-describing artifact: everything a reviewer needs to
-- judge AND regenerate lives on the row. See docs/media-pipeline.md. All ALTERs
-- are idempotent so this file stays safe to re-run on an existing project.
alter table assets add column if not exists plan_id      uuid;
alter table assets add column if not exists slot         text;        -- "<day>:<platform>"
alter table assets add column if not exists prompt       text;        -- the rendered media prompt (regen starts here)
alter table assets add column if not exists intent       text;        -- what the slot should show (critic judges this)
alter table assets add column if not exists brand_colors jsonb;       -- string[] palette baked into the render
alter table assets add column if not exists location     text;        -- locale grounding (event mode)
alter table assets add column if not exists source_url   text;        -- raw fal CDN url (not permanent)
alter table assets add column if not exists storage_path text;        -- path in the "media" bucket
alter table assets add column if not exists public_url   text;        -- permanent Supabase url (what plays/ships)
alter table assets add column if not exists poster_url   text;        -- keyframe still the vision model looks at
alter table assets add column if not exists status       text not null default 'pending_review';
alter table assets add column if not exists version      int  not null default 1;
alter table assets add column if not exists parent_id    uuid references assets(id) on delete set null;
alter table assets add column if not exists review       jsonb;       -- the partner's VisualVerdict, written back
alter table assets add column if not exists claimed_by   text;
alter table assets add column if not exists claimed_at   timestamptz;
alter table assets add column if not exists updated_at   timestamptz not null default now();

create index if not exists idx_assets_status on assets (status, created_at);
create index if not exists idx_assets_plan   on assets (plan_id);

-- Atomic claim: the oldest pending asset, locked so N parallel reviewers each
-- get a distinct one (FOR UPDATE SKIP LOCKED). Powers GET /api/review/next.
create or replace function claim_next_asset(p_reviewer text, p_org text default null)
returns setof assets language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from assets
   where status = 'pending_review' and (p_org is null or org = p_org)
   order by created_at asc
   for update skip locked
   limit 1;
  if v_id is null then return; end if;
  return query
    update assets
       set status = 'in_review', claimed_by = p_reviewer, claimed_at = now(), updated_at = now()
     where id = v_id
     returning *;
end $$;

-- Whole generated weeks, so a launch survives a refresh / is shareable.
create table if not exists plans (
  id         uuid primary key default gen_random_uuid(),
  org        text not null default 'demo',
  inputs     jsonb not null,
  plan       jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_plans_org_time on plans (org, created_at desc);

-- The app talks to Supabase with the SERVICE key from server routes only, so
-- RLS can stay enabled with no policies (service role bypasses it).
alter table assets enable row level security;
alter table plans  enable row level security;

-- Storage bucket "media" (public): render bytes are copied in for permanence
-- (fal URLs are long-lived but not forever) so public_url is the shippable copy.
-- The app creates this bucket automatically on first write; you can also create
-- it manually in the Storage tab and mark it public. Override the name with
-- SUPABASE_MEDIA_BUCKET.
