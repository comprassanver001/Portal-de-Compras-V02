-- ═══════════════════════════════════════════════════════════════════
-- Portal de Compras V2 · complemento 18 (avisos dentro del portal)
-- Proyecto Supabase: SANVER_Forte. Tabla NUEVA con prefijo plan_ (no modifica tablas existentes).
-- Se puede volver a correr sin error.
-- ═══════════════════════════════════════════════════════════════════
-- Avisos de Propuestas de compra: folio enviado a autorización (al autorizante que le toca por monto),
-- autorizado, regresado o cancelado (al comprador). Se ven en la campana 🔔 del portal.
create table if not exists plan_avisos (
  id          bigserial primary key,
  para        text not null,          -- nombre del destinatario (como en el portal / Excel)
  tipo        text not null,          -- POR_AUTORIZAR | AUTORIZADO | REGRESADO | CANCELADO
  folio       text,
  texto       text not null,
  creado_por  text,
  creado_en   timestamptz not null default now(),
  leido_en    timestamptz
);
create index if not exists plan_avisos_pend on plan_avisos (leido_en, creado_en desc);
alter table plan_avisos enable row level security;
drop policy if exists plan_avisos_auth on plan_avisos;
create policy plan_avisos_auth on plan_avisos for all to authenticated using (true) with check (true);

select count(*) as avisos_sin_leer from plan_avisos where leido_en is null;
