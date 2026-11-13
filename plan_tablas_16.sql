-- ═══════════════════════════════════════════════════════════════════
-- Portal de Compras V2 · complemento 16 (calendario de pedidos por proveedor)
-- Proyecto Supabase: SANVER_Forte. Tablas NUEVAS con prefijo plan_ (no modifica tablas existentes).
-- Se puede volver a correr sin error.
-- ═══════════════════════════════════════════════════════════════════

-- 1) Catálogo clave → proveedor principal (lo que confirma Compras; manda sobre Comparativos, última OC y marca)
create table if not exists plan_prov_clave (
  clave          integer primary key,
  proveedor      text not null,
  actualizado_en timestamptz not null default now()
);

-- 2) Reglas de pedido por proveedor. TODO es opcional: lo que quede vacío lo calcula el portal.
--    ciclo_dias vacío = automático por valor de compra (semanal / quincenal / mensual)
--    dias_pedido: días fijos para levantar el pedido, p. ej. 'LUN,JUE' (vacío = cualquier día menos domingo)
--    lead_time_dias vacío = se usa el tiempo de entrega de cada clave (hoja Detalle)
create table if not exists plan_proveedores (
  proveedor       text primary key,
  ciclo_dias      integer check (ciclo_dias is null or ciclo_dias > 0),
  dias_pedido     text,
  minimo_monto    numeric check (minimo_monto is null or minimo_monto >= 0),
  minimo_piezas   numeric check (minimo_piezas is null or minimo_piezas >= 0),
  flete_completo  boolean,
  monto_flete     numeric check (monto_flete is null or monto_flete >= 0),
  lead_time_dias  numeric check (lead_time_dias is null or lead_time_dias > 0),
  contacto        text,
  notas           text,
  actualizado_en  timestamptz not null default now()
);

alter table plan_prov_clave  enable row level security;
alter table plan_proveedores enable row level security;
drop policy if exists plan_prov_clave_auth  on plan_prov_clave;
drop policy if exists plan_proveedores_auth on plan_proveedores;
create policy plan_prov_clave_auth  on plan_prov_clave  for all to authenticated using (true) with check (true);
create policy plan_proveedores_auth on plan_proveedores for all to authenticated using (true) with check (true);

select (select count(*) from plan_prov_clave) as claves_con_proveedor, (select count(*) from plan_proveedores) as proveedores_con_reglas;
