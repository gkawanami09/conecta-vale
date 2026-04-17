-- =============================================
-- CONECTA VALE - MIGRACAO OPERACIONAL GESTOR
-- =============================================
-- Execute este SQL no Supabase SQL Editor (banco existente)

-- 1) road_blocks: suporta bloqueio por ponto no mapa
alter table public.road_blocks
  add column if not exists block_type text,
  add column if not exists block_lng double precision,
  add column if not exists block_lat double precision,
  add column if not exists block_radius_meters integer;

update public.road_blocks
set block_type = coalesce(block_type, 'road')
where block_type is null;

create index if not exists idx_road_blocks_block_type
  on public.road_blocks (block_type);

create index if not exists idx_road_blocks_point_coords
  on public.road_blocks (block_lat, block_lng)
  where active = true and block_type = 'point';

-- 2) pontos fixos operacionais customizados (gestor)
create table if not exists public.operational_fixed_points (
  point_id text primary key,
  name text not null,
  aliases text[],
  lng double precision not null,
  lat double precision not null,
  kind text not null default 'operational',
  active boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operational_fixed_points_kind_check
    check (kind in ('terminal', 'operational'))
);

create index if not exists idx_operational_fixed_points_active
  on public.operational_fixed_points (active);

create index if not exists idx_operational_fixed_points_name
  on public.operational_fixed_points (name);

create index if not exists idx_operational_fixed_points_updated_at
  on public.operational_fixed_points (updated_at desc);

-- 3) trigger de updated_at
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_operational_fixed_points_touch_updated_at on public.operational_fixed_points;
create trigger trg_operational_fixed_points_touch_updated_at
before update on public.operational_fixed_points
for each row execute procedure public.touch_updated_at();
