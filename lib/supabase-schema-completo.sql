-- =============================================
-- CONECTA VALE - SCHEMA COMPLETO (SUPABASE)
-- =============================================
-- Cole este SQL inteiro no Supabase SQL Editor e execute.

create extension if not exists pgcrypto;

-- =============================================
-- 1) BLOQUEIOS DE VIAS
-- =============================================
create table if not exists public.road_blocks (
  road_id text primary key,
  road_name text not null,
  active boolean not null default false,
  blocked_at timestamptz,
  updated_at timestamptz not null default now(),
  source_phone text,
  source_type text,
  source_keyword text,
  source_message text
);

create index if not exists idx_road_blocks_active
  on public.road_blocks (active);

create index if not exists idx_road_blocks_updated_at
  on public.road_blocks (updated_at desc);

-- =============================================
-- 2) LOG DE MENSAGENS (WHATSAPP)
-- =============================================
create table if not exists public.messages (
  id bigint generated always as identity primary key,
  phone text,
  raw_text text,
  payload jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_messages_created_at
  on public.messages (created_at desc);

create index if not exists idx_messages_phone
  on public.messages (phone);

-- =============================================
-- 3) EVENTOS INTERPRETADOS
-- =============================================
create table if not exists public.events (
  id bigint generated always as identity primary key,
  phone text,
  raw_text text,
  event_type text,
  parsed_data jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_events_created_at
  on public.events (created_at desc);

create index if not exists idx_events_phone
  on public.events (phone);

create index if not exists idx_events_event_type
  on public.events (event_type);

-- =============================================
-- 4) LOCALIZACOES COMPARTILHADAS (DASHBOARD)
-- =============================================
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

-- =============================================
-- 5) GESTOR (LOGIN)
-- =============================================
create table if not exists public.manager_accounts (
  email text primary key,
  password_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_manager_accounts_active
  on public.manager_accounts (active);

-- Atualiza updated_at automaticamente
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_road_blocks_touch_updated_at on public.road_blocks;
create trigger trg_road_blocks_touch_updated_at
before update on public.road_blocks
for each row execute procedure public.touch_updated_at();

drop trigger if exists trg_shared_locations_touch_updated_at on public.shared_locations;
create trigger trg_shared_locations_touch_updated_at
before update on public.shared_locations
for each row execute procedure public.touch_updated_at();

drop trigger if exists trg_manager_accounts_touch_updated_at on public.manager_accounts;
create trigger trg_manager_accounts_touch_updated_at
before update on public.manager_accounts
for each row execute procedure public.touch_updated_at();

-- Funcao RPC para validar login do gestor via hash bcrypt (pgcrypto)
create or replace function public.verify_manager_credentials(
  p_email text,
  p_password text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean;
begin
  select (ma.password_hash = crypt(p_password, ma.password_hash))
  into v_ok
  from public.manager_accounts ma
  where lower(ma.email) = lower(trim(p_email))
    and ma.active = true
  limit 1;

  return coalesce(v_ok, false);
end;
$$;

revoke all on function public.verify_manager_credentials(text, text) from public;
grant execute on function public.verify_manager_credentials(text, text) to service_role;

-- Seed inicial de gestor (troque depois)
insert into public.manager_accounts (email, password_hash, active)
values (
  'gestor@conecta-vale.local',
  crypt('Gestor@123', gen_salt('bf')),
  true
)
on conflict (email) do update
set
  password_hash = excluded.password_hash,
  active = excluded.active,
  updated_at = now();
