-- The live stages' results, keyed by collection and key (src/lib/store/json-store.ts): scout runs,
-- scouted projects, dossiers, generated models, the project agent's projects, clients and drafts,
-- outreach messages, Gmail sync state, and the building viewer's rate limit and map cache.
-- Each value is validated by its Zod schema in the app, so the column is plain jsonb.
create table public.records (
  collection text not null check (collection ~ '^[a-z0-9][a-z0-9-]*$'),
  key text not null check (key ~ '^[a-z0-9][a-z0-9-]*$'),
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (collection, key)
);

-- Server only. The app reaches this table with the secret key (SUPABASE_SECRET_KEY), which
-- bypasses RLS. RLS is on with no policies, so the publishable key in the browser can't read
-- outreach emails or reset the viewer's rate limit.
alter table public.records enable row level security;
