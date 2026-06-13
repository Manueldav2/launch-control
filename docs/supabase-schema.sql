-- Launch Control — Supabase schema.
-- This is the CONTRACT shared by the generator (creation) and the image critic
-- (review). The creation app works WITHOUT a DB (localStorage + render URLs);
-- the reviewer (npm run review) consumes the queue below. Prose: docs/review-contract.md.
-- Setup: create a project at https://supabase.com, run this in the SQL editor,
-- create a public Storage bucket named "media", then put SUPABASE_URL +
-- SUPABASE_SERVICE_KEY into .env.local.

-- Every generated still / film + its review state. This doubles as the review
-- QUEUE: the generator inserts with status='pending_review'; the critic claims,
-- looks at the image, and writes back a terminal verdict + the `review` jsonb.
create table if not exists assets (
  id            uuid primary key default gen_random_uuid(),
  org           text not null default 'demo',   -- a workspace / user handle
  url           text,
  content_type  text not null,                  -- image | ugc_video | motion_video
  platform      text,
  day           text,
  brand         text,
  caption       text,
  -- creation metadata the critic uses to judge the image
  plan_id       uuid,
  slot          text,
  prompt        text,                            -- the generation prompt (the intent)
  intent        text,                            -- what the slot is trying to show (optional)
  brand_colors  jsonb default '[]'::jsonb,       -- string[] of hex colors, for the on-brand check
  location      text,
  -- where the bytes live (public "media" bucket)
  source_url    text,                            -- original render URL (e.g. fal)
  storage_path  text,                            -- object key within the bucket
  public_url    text,                            -- public URL the critic fetches
  poster_url    text,                            -- video keyframe fallback
  -- review queue state
  status        text not null default 'pending_review',
                -- pending_review | reviewing | approved | rejected | regenerated
  version       int  not null default 1,         -- render version (regen bumps this)
  parent_id     uuid references assets(id),      -- prior version on a regen
  review        jsonb,                           -- the critic's verdict (see docs/review-contract.md)
  claimed_by    text,                            -- reviewer id that owns the row
  claimed_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Hot paths: list-by-org, and the queue scan (oldest pending first).
create index if not exists idx_assets_org_time on assets (org, created_at desc);
create index if not exists idx_assets_queue on assets (status, created_at)
  where status = 'pending_review';

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

-- ── Atomic claim ─────────────────────────────────────────────────────────────
-- The reviewer's claim mechanism. FOR UPDATE SKIP LOCKED means any number of
-- reviewer instances can run concurrently and never claim the same row. Marks
-- the row 'reviewing', stamps the owner, and returns it (or no rows if empty).
create or replace function claim_next_asset(p_reviewer text, p_org text default null)
returns setof assets
language plpgsql
as $$
declare
  v_id uuid;
begin
  select id into v_id
    from assets
   where status = 'pending_review'
     and (p_org is null or org = p_org)
   order by created_at asc
   for update skip locked
   limit 1;
  if v_id is null then
    return;
  end if;
  return query
    update assets
       set status = 'reviewing', claimed_by = p_reviewer, claimed_at = now(), updated_at = now()
     where id = v_id
    returning *;
end;
$$;

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Both the app and the reviewer talk to Supabase with the SERVICE key from the
-- server only, so RLS can stay enabled with no policies (service role bypasses
-- it). The browser anon/publishable key has no table access.
alter table assets enable row level security;
alter table plans  enable row level security;

-- Storage bucket "media" (public): render bytes are copied in for permanence
-- (fal URLs are long-lived but not forever) so public_url is the shippable copy,
-- and the image critic fetches that URL to look at the render. The app creates
-- this bucket automatically on first write; you can also create it manually in
-- the Storage tab and mark it public. Override the name with SUPABASE_MEDIA_BUCKET.
