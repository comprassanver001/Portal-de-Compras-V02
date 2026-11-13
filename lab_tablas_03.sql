-- ═══════════════════════════════════════════════════════════════════
-- Portal de Compras V2 · LABORATORIO · tablas 03 (red: mayoreo y tiendas Mas Ferre)
-- Proyecto Supabase: SANVER_Forte. Tablas NUEVAS con prefijo lab_. No modifica nada existente.
-- Se puede volver a correr sin error.
-- ═══════════════════════════════════════════════════════════════════
-- Por clave: mayoreo y venta MF por mes, y por tienda su venta mensual promedio y su número base.
create table if not exists lab_red (
  clave          integer primary key,
  datos          jsonb not null,
  actualizado_en timestamptz not null default now()
);
-- Por clave: existencia y pendiente de entrada de cada tienda (archivo de existencias MF).
create table if not exists lab_red_inv (
  clave          integer primary key,
  datos          jsonb not null,
  actualizado_en timestamptz not null default now()
);
-- Datos generales de cada carga: 'ventas' (meses, tiendas, crecimiento, cerradas) e 'inv' (fecha de las existencias).
create table if not exists lab_red_meta (
  id          text primary key,
  datos       jsonb not null,
  cargado_por text,
  cargado_en  timestamptz not null default now()
);
alter table lab_red      enable row level security;
alter table lab_red_inv  enable row level security;
alter table lab_red_meta enable row level security;
drop policy if exists lab_red_auth      on lab_red;
drop policy if exists lab_red_inv_auth  on lab_red_inv;
drop policy if exists lab_red_meta_auth on lab_red_meta;
create policy lab_red_auth      on lab_red      for all to authenticated using (true) with check (true);
create policy lab_red_inv_auth  on lab_red_inv  for all to authenticated using (true) with check (true);
create policy lab_red_meta_auth on lab_red_meta for all to authenticated using (true) with check (true);

select 'lab_red' as tabla, count(*) as filas from lab_red
union all select 'lab_red_inv', count(*) from lab_red_inv
union all select 'lab_red_meta', count(*) from lab_red_meta;
