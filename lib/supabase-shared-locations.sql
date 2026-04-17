-- Tabela para dashboard operacional do gestor
create table if not exists public.shared_locations (
  share_id text primary key,
  name text,
  phone text,
  status text,
  sharing_enabled boolean not null default false,
  lng double precision,
  lat double precision,
  accuracy double precision,
  heading double precision,
  last_seen_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists idx_shared_locations_updated_at
  on public.shared_locations (updated_at desc);

create index if not exists idx_shared_locations_sharing_enabled
  on public.shared_locations (sharing_enabled);
