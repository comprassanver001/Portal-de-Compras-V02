-- ═══════════════════════════════════════════════════════════════════
-- Portal de Compras V2 · LABORATORIO de pronóstico y compra · tablas 01
-- Proyecto Supabase: SANVER_Forte (el mismo del portal). Tablas NUEVAS con prefijo lab_.
-- No modifica ninguna tabla existente. Se puede volver a correr sin error.
-- ═══════════════════════════════════════════════════════════════════

-- Familias por clave (grupo → subgrupo → sub-subgrupo), para la temporada.
-- Se carga desde el laboratorio con la hoja BASE DE NEGOCIO de la plantilla de ventas.
create table if not exists lab_familias (
  clave          integer primary key,
  grupo          text,
  subgrupo       text,
  subsubgrupo    text,
  actualizado_en timestamptz not null default now()
);

-- Escenarios: un juego de variables del cálculo con el resumen de su resultado.
create table if not exists lab_escenarios (
  id          bigint generated always as identity primary key,
  nombre      text not null,
  nota        text,
  parametros  jsonb not null,            -- solo las variables que cambian respecto a las sugeridas
  resumen     jsonb,                     -- error, cobertura, claves por pedir… al momento de guardarlo
  creado_por  text,
  creado_en   timestamptz not null default now(),
  vigente     boolean not null default false   -- el escenario que usa el laboratorio al abrir
);

-- Ajustes del comprador a una clave (evento, promoción, mes que no debe contar), con justificación.
create table if not exists lab_ajustes_clave (
  id            bigint generated always as identity primary key,
  clave         integer not null,
  tipo          text not null,           -- EXCLUIR_MES · EVENTO · FACTOR
  mes           text,                    -- AAAA-MM (mes de la historia o del pronóstico al que aplica)
  factor        numeric,                 -- p. ej. 1.30 = +30% por promoción
  justificacion text not null,
  usuario       text not null,
  creado_en     timestamptz not null default now(),
  activo        boolean not null default true
);
create index if not exists lab_ajustes_clave_clave on lab_ajustes_clave (clave) where activo;

-- Bitácora: quién cambió qué en el laboratorio.
create table if not exists lab_bitacora (
  id        bigint generated always as identity primary key,
  usuario   text,
  accion    text not null,
  detalle   jsonb,
  creado_en timestamptz not null default now()
);

alter table lab_familias      enable row level security;
alter table lab_escenarios    enable row level security;
alter table lab_ajustes_clave enable row level security;
alter table lab_bitacora      enable row level security;
drop policy if exists lab_familias_auth      on lab_familias;
drop policy if exists lab_escenarios_auth    on lab_escenarios;
drop policy if exists lab_ajustes_clave_auth on lab_ajustes_clave;
drop policy if exists lab_bitacora_auth      on lab_bitacora;
create policy lab_familias_auth      on lab_familias      for all to authenticated using (true) with check (true);
create policy lab_escenarios_auth    on lab_escenarios    for all to authenticated using (true) with check (true);
create policy lab_ajustes_clave_auth on lab_ajustes_clave for all to authenticated using (true) with check (true);
create policy lab_bitacora_auth      on lab_bitacora      for all to authenticated using (true) with check (true);

select 'lab_familias' as tabla, count(*) as filas from lab_familias
union all select 'lab_escenarios', count(*) from lab_escenarios
union all select 'lab_ajustes_clave', count(*) from lab_ajustes_clave
union all select 'lab_bitacora', count(*) from lab_bitacora;
