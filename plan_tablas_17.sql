-- ═══════════════════════════════════════════════════════════════════
-- Portal de Compras V2 · complemento 17 (origen de recolección por clave)
-- Proyecto Supabase: SANVER_Forte. Tabla NUEVA con prefijo plan_ (no modifica tablas existentes).
-- Se puede volver a correr sin error.
-- ═══════════════════════════════════════════════════════════════════
-- Claves que se recogen con el proveedor (recolección) y desde qué origen: MONTERREY, GUADALAJARA, CDMX…
-- Se carga desde Admin → Cálculo diario → «🚛 Origen de recolección por clave» (Excel con Clave y Origen).
create table if not exists plan_origen_clave (
  clave          integer primary key,
  origen         text not null,
  notas          text,
  actualizado_en timestamptz not null default now()
);
alter table plan_origen_clave enable row level security;
drop policy if exists plan_origen_clave_auth on plan_origen_clave;
create policy plan_origen_clave_auth on plan_origen_clave for all to authenticated using (true) with check (true);

select origen, count(*) as claves from plan_origen_clave group by origen order by origen;
