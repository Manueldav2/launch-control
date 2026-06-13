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

-- OPTIONAL: a public Storage bucket named "media" holds the render bytes. The
-- generator copies each render in and stores its public URL in public_url; the
-- critic fetches that URL to look at the image.
