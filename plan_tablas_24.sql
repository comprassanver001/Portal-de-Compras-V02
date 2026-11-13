-- ═══════════════════════════════════════════════════════════════════
-- Portal de Compras V2 · complemento 24 (compra nacional e importación)
-- Proyecto Supabase: SANVER_Forte. Tablas NUEVAS con prefijo plan_ y dos columnas nuevas en plan_propuestas
-- (tabla del portal V2, no es de las originales). Se puede volver a correr sin error.
-- ═══════════════════════════════════════════════════════════════════

-- 1) Claves que se compran de dos formas: nacional (p. ej. BYP, del stock que tiene el proveedor) e importación (p. ej. China).
--    Cada una con su proveedor, tiempo de entrega y meses objetivo (en meses, como la hoja Detalle).
--    Vacío = se usa lo de la hoja Detalle. min_cont = piezas (unidad del portal) por contenedor o mínimo de compra de importación.
--    Se carga en Admin → «🌏 Compra nacional e importación».
create table if not exists plan_abasto_dual (
  clave          integer primary key,
  prov_nac       text,
  lt_nac         numeric check (lt_nac  is null or lt_nac  >= 0),
  obj_nac        numeric check (obj_nac is null or obj_nac >= 0),
  prov_imp       text,
  lt_imp         numeric check (lt_imp  is null or lt_imp  >= 0),
  obj_imp        numeric check (obj_imp is null or obj_imp >= 0),
  min_cont       numeric check (min_cont is null or min_cont > 0),
  notas          text,
  actualizado_en timestamptz not null default now()
);

-- 2) Stock disponible en el proveedor nacional. Es del PROVEEDOR (no es nuestro): no se suma a la existencia
--    ni cambia el estatus; solo es el tope de la compra nacional y cubre meses en la propuesta de importación.
--    Cuenta 30 días desde su fecha de corte.
create table if not exists plan_stock_proveedor (
  clave          integer not null,
  proveedor      text not null,
  cantidad       numeric not null check (cantidad >= 0),
  fecha_corte    date not null,
  nota           text,
  cargado_en     timestamptz not null default now(),
  primary key (clave, proveedor)
);

-- 3) Tipo de folio en Propuestas de compra: vacío = compra normal; NACIONAL o IMPORTACION.
--    min_cont = redondear la propuesta de importación al mínimo por contenedor.
alter table plan_propuestas add column if not exists tipo_compra text;
alter table plan_propuestas add column if not exists min_cont boolean not null default false;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'plan_propuestas_tipo_compra_chk') then
    alter table plan_propuestas add constraint plan_propuestas_tipo_compra_chk check (tipo_compra is null or tipo_compra in ('NACIONAL','IMPORTACION'));
  end if;
end $$;

alter table plan_abasto_dual     enable row level security;
alter table plan_stock_proveedor enable row level security;
drop policy if exists plan_abasto_dual_auth     on plan_abasto_dual;
drop policy if exists plan_stock_proveedor_auth on plan_stock_proveedor;
create policy plan_abasto_dual_auth     on plan_abasto_dual     for all to authenticated using (true) with check (true);
create policy plan_stock_proveedor_auth on plan_stock_proveedor for all to authenticated using (true) with check (true);

select (select count(*) from plan_abasto_dual) as claves_duales,
       (select count(*) from plan_stock_proveedor) as registros_stock,
       (select count(*) from plan_propuestas where tipo_compra is not null) as folios_nac_imp;
