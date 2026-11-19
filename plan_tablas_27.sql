-- ═══════════════════════════════════════════════════════════════════
-- Portal de Compras V2 · complemento 27 (ajustes del autorizante en Propuestas de compra)
-- Proyecto Supabase: SANVER_Forte. Columnas nuevas en plan_propuesta_lineas (tabla del portal V2) y tabla nueva de bitácora.
-- Se puede volver a correr sin error.
-- ═══════════════════════════════════════════════════════════════════
-- pedido_aut (ya existía) = cantidad del autorizante. Motivo: Sobre inventario · Quedaría corto / faltará · Temporada ·
-- Mínimo o empaque del proveedor · Consolidar con otro pedido · Otro (con comentario obligatorio).
alter table plan_propuesta_lineas add column if not exists aut_motivo     text;
alter table plan_propuesta_lineas add column if not exists aut_comentario text;
alter table plan_propuesta_lineas add column if not exists aut_por        text;
alter table plan_propuesta_lineas add column if not exists aut_en         timestamptz;
alter table plan_propuesta_lineas add column if not exists agregada_aut   boolean not null default false;

-- Bitácora: cada ajuste del autorizante (y cada vez que el comprador acepta los ajustes)
create table if not exists plan_propuesta_ajustes (
  id          bigserial primary key,
  folio       text not null,
  clave       bigint not null,
  accion      text not null,          -- AJUSTE · AGREGADA · ACEPTADO
  antes       numeric,
  despues     numeric,
  motivo      text,
  comentario  text,
  usuario     text,
  creado_en   timestamptz not null default now()
);
create index if not exists plan_propuesta_ajustes_folio on plan_propuesta_ajustes (folio, clave);
alter table plan_propuesta_ajustes enable row level security;
drop policy if exists plan_propuesta_ajustes_auth on plan_propuesta_ajustes;
create policy plan_propuesta_ajustes_auth on plan_propuesta_ajustes for all to authenticated using (true) with check (true);
