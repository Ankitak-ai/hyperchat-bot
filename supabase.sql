create extension if not exists pgcrypto;

create table if not exists public.creator_applications (
  id uuid primary key default gen_random_uuid(),
  discord_id text not null,
  username text not null,
  details text not null,
  status text not null check (status in ('pending', 'approved_pending', 'approved', 'rejected')) default 'pending',
  created_at timestamptz not null default now()
);

create index if not exists idx_creator_applications_discord_id
  on public.creator_applications(discord_id);

create index if not exists idx_creator_applications_status
  on public.creator_applications(status);
