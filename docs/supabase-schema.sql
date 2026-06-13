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

-- OPTIONAL: a public Storage bucket named "media" if you want to copy render
-- bytes in for permanence (fal URLs are long-lived but not forever). Create it
-- in the Storage tab and mark it public; the records above already hold the URL.
