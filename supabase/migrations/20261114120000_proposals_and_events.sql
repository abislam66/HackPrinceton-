-- Generated proposals, one per client on a project.
create table public.proposals (
  project_slug text not null,
  client_id text not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'sent')),
  pitch jsonb not null,
  shots jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (project_slug, client_id)
);

-- Opens, watch time and clicks on proposal pages.
create table public.proposal_events (
  id bigint generated always as identity primary key,
  project_slug text not null,
  client_id text not null,
  type text not null check (type in ('open', 'watch', 'click')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index proposal_events_client_idx on public.proposal_events (project_slug, client_id, created_at);

-- Hackathon demo: the app has no login, so the publishable key reads and writes directly.
-- Tighten these policies before this holds real client data.
alter table public.proposals enable row level security;
alter table public.proposal_events enable row level security;

create policy "demo read proposals" on public.proposals for select using (true);
create policy "demo insert proposals" on public.proposals for insert with check (true);
create policy "demo update proposals" on public.proposals for update using (true) with check (true);
create policy "demo insert events" on public.proposal_events for insert with check (true);
create policy "demo read events" on public.proposal_events for select using (true);
