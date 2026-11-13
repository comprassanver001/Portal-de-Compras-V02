-- ═══════════════════════════════════════════════════════════════════
-- Portal de Compras V2 · complemento 22 (unidades de compra del RP03-08 y unidad del INNER/MASTER)
-- Proyecto Supabase: SANVER_Forte. Tabla NUEVA con prefijo plan_ y 2 columnas nuevas en plan_empaques (tabla del portal V2).
-- Se puede volver a correr sin error.
-- ═══════════════════════════════════════════════════════════════════
-- Catálogo de unidades: solo claves cuya unidad de compra es distinta a la unidad mínima.
-- f_compra = cuántas unidades mínimas trae 1 unidad de compra (PZASXUNI_COMPRA). Se carga en Admin → 3b.
create table if not exists plan_unidades (
  clave          bigint primary key,
  uni_compra     text,
  f_compra       numeric not null,
  uni_min        text,
  uni_emp        text,
  f_emp          numeric,
  uni_master     text,
  f_master       numeric,
  actualizado_en timestamptz not null default now()
);
alter table plan_unidades enable row level security;
drop policy if exists plan_unidades_auth on plan_unidades;
create policy plan_unidades_auth on plan_unidades for all to authenticated using (true) with check (true);

-- Unidad en que viene cada cantidad del archivo de empaques («Unidad de medida» junto a Ctd. En UM / Ctd. En UM2)
alter table plan_empaques add column if not exists inner_um text;
alter table plan_empaques add column if not exists master_um text;

select count(*) as claves_con_unidad_distinta from plan_unidades;
