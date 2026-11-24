-- ═══════════════════════════════════════════════════════════════════
-- Portal de Compras V2 · LABORATORIO · tablas 05 (venta diaria resumida por mes)
-- Proyecto Supabase: SANVER_Forte. Tabla NUEVA con prefijo lab_. No modifica nada existente.
-- Se puede volver a correr sin error.
-- ═══════════════════════════════════════════════════════════════════
-- El laboratorio lee la plantilla de venta diaria en el navegador, detecta los días pico y guarda solo el resumen por clave y mes.
create table if not exists lab_venta_dia_mes (
  clave          integer not null,
  mes            text not null,          -- AAAA-MM
  venta          numeric not null,       -- venta del mes (sin entregas directas)
  pico           numeric not null default 0,  -- piezas vendidas en días pico (lo que se quita del ritmo base)
  dias_venta     integer,                -- días con venta en el mes
  dias_pico      integer,                -- días marcados como pico
  alerta         text,                   -- mes irregular, mes dominado por pico, pico de familia, cambio de nivel
  cargado_por    text,
  cargado_en     timestamptz not null default now(),
  primary key (clave, mes)
);
alter table lab_venta_dia_mes enable row level security;
drop policy if exists lab_venta_dia_mes_auth on lab_venta_dia_mes;
create policy lab_venta_dia_mes_auth on lab_venta_dia_mes for all to authenticated using (true) with check (true);

select count(*) as filas, count(distinct clave) as claves, min(mes) as desde, max(mes) as hasta from lab_venta_dia_mes;
