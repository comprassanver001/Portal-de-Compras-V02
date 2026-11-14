-- ═══════════════════════════════════════════════════════════════════
-- Portal de Compras V2 · complemento 26 (estatus de las claves sustituidas)
-- Proyecto Supabase: SANVER_Forte. Agrega una columna a plan_sustituciones (tabla del portal V2). Se puede volver a correr sin error.
-- ═══════════════════════════════════════════════════════════════════
-- SUSTITUTO   = la clave vigente suma la venta de la original (antecedente, pronóstico y propuesta)
-- EQUIVALENTE = solo se muestra en la ficha; su venta NO se suma
-- REVISAR     = igual que EQUIVALENTE mientras se revisa
-- BAJA        = no se guarda (no se considera)
-- Vacío (cargas anteriores) = SUSTITUTO.
alter table plan_sustituciones add column if not exists estatus text;
select coalesce(estatus,'(sin estatus)') as estatus, count(*) as pares from plan_sustituciones group by 1 order by 1;
