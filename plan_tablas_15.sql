-- ═══════════════════════════════════════════════════════════════════
-- Portal de Compras V2 · complemento 15 (número base de inventario de Mas Ferre)
-- Proyecto Supabase: SANVER_Forte. Tabla NUEVA con prefijo plan_ (no modifica tablas existentes).
-- Se puede volver a correr sin error.
-- ═══════════════════════════════════════════════════════════════════
create table if not exists plan_mf_base (
  clave          integer primary key,
  base           numeric not null check (base >= 0),   -- inventario que deben mantener entre todas las tiendas MF
  actualizado_en timestamptz not null default now()
);
alter table plan_mf_base enable row level security;
drop policy if exists plan_mf_base_auth on plan_mf_base;
create policy plan_mf_base_auth on plan_mf_base for all to authenticated using (true) with check (true);

select count(*) as filas from plan_mf_base;
