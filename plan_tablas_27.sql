-- ═══════════════════════════════════════════════════════════════════
-- Portal de Compras V2 · complemento 27 (unidades de medida del reporte RP03-08)
-- Proyecto Supabase: SANVER_Forte. Tabla NUEVA con prefijo plan_ (no modifica tablas existentes).
-- Se puede volver a correr sin error.
-- ═══════════════════════════════════════════════════════════════════
-- Las OCs se capturan en la unidad de compra y el portal trabaja en la unidad mínima (la del inventario).
-- Aquí se guarda, solo para las claves donde son distintas, cuántas unidades mínimas trae una unidad de compra:
--   factor = PZASXUNI_COMPRA ÷ PZASXUNIDAD_MINIMA   (ej. clave 44518: 1 METRO2 = 0.568 CAJA)
-- El portal lo usa para MOSTRAR y EXPORTAR las cantidades de las OCs en la unidad de la clave.
-- No cambia el cálculo diario (el BO ya viene en la unidad de la clave).
-- Se carga en Admin → «📐 Unidades de medida (RP03-08)».
create table if not exists plan_unidades (
  clave          integer primary key,
  uni_compra     text,                      -- UNIDAD_COMPRA
  uni_min        text,                      -- UNIDAD_MINIMA
  factor         numeric not null,          -- unidades mínimas por 1 unidad de compra
  actualizado_en timestamptz not null default now()
);
alter table plan_unidades enable row level security;
drop policy if exists plan_unidades_auth on plan_unidades;
create policy plan_unidades_auth on plan_unidades for all to authenticated using (true) with check (true);

select count(*) as claves_con_conversion, max(actualizado_en) as ultima_carga from plan_unidades;
