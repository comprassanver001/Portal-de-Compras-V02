-- ═══════════════════════════════════════════════════════════════════
-- Portal de Compras V2 · complemento 13 (claves sustituidas)
-- Proyecto Supabase: SANVER_Forte. Tabla NUEVA con prefijo plan_ (no modifica tablas existentes).
-- Se puede volver a correr sin error.
-- ═══════════════════════════════════════════════════════════════════
create table if not exists plan_sustituciones (
  clave_vigente   integer  not null,          -- clave nueva (la que se compra hoy)
  clave_original  integer  not null,          -- clave que sustituyó; su venta se suma a la vigente
  factor          numeric  not null default 1 check (factor > 0 and factor <= 1),  -- 1/n si la original tiene n sustitutas
  conv            numeric,                    -- conversión de unidad: 1 unidad de la original = conv unidades de la vigente (vacío = 1)
  desc_vigente    text,
  desc_original   text,
  caso            text,
  cargado_en      timestamptz not null default now(),
  primary key (clave_vigente, clave_original)
);
-- si la tabla ya existía de la versión anterior
alter table plan_sustituciones add column if not exists conv numeric;
create index if not exists plan_sustituciones_original on plan_sustituciones (clave_original);

alter table plan_sustituciones enable row level security;
drop policy if exists plan_sustituciones_auth on plan_sustituciones;
create policy plan_sustituciones_auth on plan_sustituciones for all to authenticated using (true) with check (true);

-- Verificación: sin error y 0 filas la primera vez
select count(*) as filas from plan_sustituciones;
