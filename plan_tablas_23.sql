-- ═══════════════════════════════════════════════════════════════════
-- Portal de Compras V2 · complemento 23 (parámetros por clave para armar el Detalle desde el RP03-08)
-- Proyecto Supabase: SANVER_Forte. Tabla NUEVA con prefijo plan_ (no modifica tablas existentes).
-- Se puede volver a correr sin error.
-- ═══════════════════════════════════════════════════════════════════
-- Comprador, rotación, tiempo de entrega (meses), objetivo de meses e ABC por clave.
-- Se cargan en Admin → Cálculo diario → 6a (archivo, «Tomar del último Cálculo diario» o a mano).
create table if not exists plan_parametros (
  clave          bigint primary key,
  comprador      text,
  rotacion       text,
  t_entrega      numeric,
  obj_meses      numeric,
  abc            text,
  fuente         text,            -- ARCHIVO · MANUAL · CALCULO aaaa-mm-dd
  actualizado_en timestamptz not null default now()
);
alter table plan_parametros enable row level security;
drop policy if exists plan_parametros_auth on plan_parametros;
create policy plan_parametros_auth on plan_parametros for all to authenticated using (true) with check (true);

select fuente, count(*) as claves from plan_parametros group by 1 order by 1;
