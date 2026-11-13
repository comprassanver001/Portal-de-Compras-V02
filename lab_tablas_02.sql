-- ═══════════════════════════════════════════════════════════════════
-- Portal de Compras V2 · LABORATORIO · tablas 02 (cálculo aplicado al portal de pruebas)
-- Proyecto Supabase: SANVER_Forte. Tabla NUEVA con prefijo lab_. No modifica nada existente.
-- Se puede volver a correr sin error.
-- ═══════════════════════════════════════════════════════════════════
-- Un solo renglón (id = 'vigente') con el resultado del laboratorio que usa el portal de pruebas.
-- datos = lista por clave: [clave, venta mensual esperada, punto de alarma, pedir hasta, confiabilidad, inner, master]
create table if not exists lab_publicacion (
  id            text primary key,
  fecha_calculo date,                  -- fecha del cálculo del portal con que se corrió el laboratorio
  parametros    jsonb,                 -- variables distintas a las sugeridas
  resumen       jsonb,
  datos         jsonb not null,
  creado_por    text,
  creado_en     timestamptz not null default now()
);
alter table lab_publicacion enable row level security;
drop policy if exists lab_publicacion_auth on lab_publicacion;
create policy lab_publicacion_auth on lab_publicacion for all to authenticated using (true) with check (true);

select id, fecha_calculo, creado_por, creado_en, jsonb_array_length(datos) as claves from lab_publicacion;
