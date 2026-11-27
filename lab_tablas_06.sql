-- ═══════════════════════════════════════════════════════════════════
-- Portal de Compras V2 · LABORATORIO · tablas 06 (escenarios por grupo de claves)
-- Proyecto Supabase: «Portal de operaciones compras». Tabla NUEVA con prefijo lab_. No modifica nada existente.
-- Se puede volver a correr sin error.
-- ═══════════════════════════════════════════════════════════════════
-- Cada regla dice a qué claves aplica (calificación A/B/C y/o grupo, subgrupo, sub-sub-grupo; vacío = cualquiera)
-- y qué escenario guardado usan. Si una clave entra en varias, gana la más específica; si empatan, la más reciente.
create table if not exists lab_reglas_escenario (
  id            bigint generated always as identity primary key,
  calif         text,                 -- A, B, C o null (todas)
  grupo         text,
  subgrupo      text,
  subsubgrupo   text,
  escenario_id  bigint not null,      -- lab_escenarios.id
  escenario     text,                 -- nombre del escenario al crear la regla (por si después se borra)
  motivo        text,                 -- opcional: oferta, temporada, cambio de proveedor…
  desde         date,                 -- vigencia opcional
  hasta         date,
  activa        boolean not null default true,
  creado_por    text not null,        -- Jefe de Compras, Gerente o administrador (con PIN)
  creado_en     timestamptz not null default now(),
  actualizado_por text,
  actualizado_en  timestamptz
);
alter table lab_reglas_escenario enable row level security;
drop policy if exists lab_reglas_escenario_auth on lab_reglas_escenario;
create policy lab_reglas_escenario_auth on lab_reglas_escenario for all to authenticated using (true) with check (true);

select count(*) as reglas from lab_reglas_escenario;
