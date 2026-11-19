-- ═══════════════════════════════════════════════════════════════════
-- Portal de Compras V2 · LABORATORIO · tablas 04 (aperturas de tiendas y ofertas)
-- Proyecto Supabase: SANVER_Forte. Tablas NUEVAS con prefijo lab_. No modifica nada existente.
-- Se puede volver a correr sin error.
-- ═══════════════════════════════════════════════════════════════════
-- Aperturas de tiendas Mas Ferre planeadas: fecha estimada, tienda parecida y qué tanto venderá contra ella.
create table if not exists lab_aperturas (
  id             bigint generated always as identity primary key,
  nombre         text not null,
  fecha          date not null,              -- fecha estimada de apertura
  tienda_ref     text not null,              -- tienda existente parecida, o PROMEDIO (promedio de las tiendas abiertas)
  peso           numeric not null default 1, -- 1 = venderá igual que la tienda de referencia; 0.7 = 70 %
  base_meses     numeric,                    -- inventario inicial en meses de venta cuando la referencia no tiene número base (vacío = 0)
  nota           text,
  activa         boolean not null default true,
  capturado_por  text,
  actualizado_en timestamptz not null default now()
);
-- Catálogo de productos resurtibles que tendrá la tienda nueva (opcional). Si una apertura tiene catálogo, solo esas claves cuentan.
create table if not exists lab_aperturas_claves (
  apertura_id bigint not null references lab_aperturas(id) on delete cascade,
  clave       integer not null,
  base        numeric,                       -- inventario inicial (número base) esperado; vacío = el de la referencia × peso
  venta_mes   numeric,                       -- venta mensual esperada; vacío = la de la referencia × peso
  primary key (apertura_id, clave)
);
-- Ofertas: distribución adicional que planea el desarrollador por clave y mes (archivo de ofertas de SANVER).
create table if not exists lab_ofertas (
  mes            text not null,              -- AAAA-MM en que se distribuye
  clave          integer not null,
  vol_tiendas    numeric not null default 0, -- suma de la distribución adicional a tiendas (PLAN ó 30 %)
  vol_mayoreo    numeric not null default 0, -- volumen adicional para SANVER mayoreo, si el archivo lo trae
  tiendas        jsonb,                      -- {tienda: cantidad}
  vigencia       text,
  descripcion    text,
  hoja           text,
  archivo        text,
  cargado_por    text,
  cargado_en     timestamptz not null default now(),
  primary key (mes, clave)
);
alter table lab_aperturas        enable row level security;
alter table lab_aperturas_claves enable row level security;
alter table lab_ofertas          enable row level security;
drop policy if exists lab_aperturas_auth        on lab_aperturas;
drop policy if exists lab_aperturas_claves_auth on lab_aperturas_claves;
drop policy if exists lab_ofertas_auth          on lab_ofertas;
create policy lab_aperturas_auth        on lab_aperturas        for all to authenticated using (true) with check (true);
create policy lab_aperturas_claves_auth on lab_aperturas_claves for all to authenticated using (true) with check (true);
create policy lab_ofertas_auth          on lab_ofertas          for all to authenticated using (true) with check (true);

select 'lab_aperturas' as tabla, count(*) as filas from lab_aperturas
union all select 'lab_aperturas_claves', count(*) from lab_aperturas_claves
union all select 'lab_ofertas', count(*) from lab_ofertas;
