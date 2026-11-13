-- ═══════════════════════════════════════════════════════════════════
-- Portal de Compras V2 · complemento 25 (entradas reales del reporte RP01-07 Compras por ID)
-- Proyecto Supabase: SANVER_Forte. Tabla NUEVA con prefijo plan_ (no modifica tablas existentes).
-- Se puede volver a correr sin error.
-- ═══════════════════════════════════════════════════════════════════
-- Cada entrada al CEDI con su fecha real de recibo y la cantidad recibida, ligada a la OC (FOLIO OC).
-- El OTIF toma de aquí la fecha y la cantidad de la entrada; si una línea de OC no tiene entradas aquí,
-- sigue usando la recepción que el portal detecta al comparar un archivo de OCs con el anterior.
-- Se carga en Admin → «📥 Entradas reales (RP01-07 Compras por ID)».
create table if not exists plan_recepciones_real (
  folio_rec      bigint  not null,          -- FOLIO del recibo
  folio_oc       bigint  not null,          -- FOLIO OC
  clave          integer not null,
  fecha          date    not null,          -- FECHA REC
  cantidad       numeric not null,          -- CANT REC
  pzas           numeric,                   -- PZAS X UNIDAD
  unidad         text,
  cargado_en     timestamptz not null default now(),
  primary key (folio_rec, folio_oc, clave)
);
create index if not exists plan_recepciones_real_oc on plan_recepciones_real (folio_oc, clave);
create index if not exists plan_recepciones_real_fecha on plan_recepciones_real (fecha);
alter table plan_recepciones_real enable row level security;
drop policy if exists plan_recepciones_real_auth on plan_recepciones_real;
create policy plan_recepciones_real_auth on plan_recepciones_real for all to authenticated using (true) with check (true);

select count(*) as entradas, min(fecha) as desde, max(fecha) as hasta from plan_recepciones_real;
