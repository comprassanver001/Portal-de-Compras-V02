-- ═══════════════════════════════════════════════════════════════════
-- Portal de Compras V2 · complemento 14 (primera fecha con existencia por clave)
-- Proyecto Supabase: SANVER_Forte. Tabla NUEVA con prefijo plan_ (no modifica tablas existentes).
-- Sirve para separar claves que nunca se han vendido: NUEVA (llegaron hace poco) vs SIN MOVIMIENTO (ya tienen rato en inventario).
-- Se llena sola: con la hoja "Historico de faltantes" del Excel (carga en Admin) y con cada Cálculo diario.
-- Se puede volver a correr sin error.
-- ═══════════════════════════════════════════════════════════════════
create table if not exists plan_primera_existencia (
  clave      integer primary key,
  fecha      date    not null,            -- primer día visto con existencia > 0
  origen     text,                         -- HISTORICO (hoja del Excel) o CALCULO (Cálculo diario)
  actualizado_en timestamptz not null default now()
);
alter table plan_primera_existencia enable row level security;
drop policy if exists plan_primera_existencia_auth on plan_primera_existencia;
create policy plan_primera_existencia_auth on plan_primera_existencia for all to authenticated using (true) with check (true);

select count(*) as filas from plan_primera_existencia;
