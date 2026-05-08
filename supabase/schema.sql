-- ============================================================
-- CONCILIA APP — Script de creación de tablas en Supabase
-- Ejecutar en: Supabase > SQL Editor > New Query
-- ============================================================

-- 1. EMPRESAS
create table if not exists empresas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  cuit text,
  created_at timestamptz default now()
);

-- 2. CONTRAPARTES (clientes/proveedores a conciliar)
create table if not exists contrapartes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id) on delete cascade,
  nombre text not null,
  cuit text,
  notas text,
  created_at timestamptz default now()
);

-- 3. MAPEOS DE COLUMNAS (parametrización guardada por contraparte)
create table if not exists mapeos_columnas (
  id uuid primary key default gen_random_uuid(),
  contraparte_id uuid references contrapartes(id) on delete cascade,
  origen text check (origen in ('compania', 'contraparte')) not null,
  col_fecha text not null,
  col_comprobante text not null,
  col_descripcion text not null,
  col_importe text,
  col_debe text,
  col_haber text,
  updated_at timestamptz default now(),
  unique(contraparte_id, origen)
);

-- 4. EQUIVALENCIAS (maestro de conceptos normalizado)
create table if not exists equivalencias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id) on delete cascade,
  origen text check (origen in ('compania', 'contraparte', 'ambos')) default 'ambos',
  texto_original text not null,
  tipo_normalizado text not null,
  signo integer default 1 check (signo in (1, -1)),
  activo boolean default true,
  created_at timestamptz default now(),
  unique(empresa_id, origen, texto_original)
);

-- 5. CONCILIACIONES
create table if not exists conciliaciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id) on delete cascade,
  contraparte_id uuid references contrapartes(id),
  periodo_desde date not null,
  periodo_hasta date not null,
  saldo_inicial numeric(18,2) default 0,
  saldo_compania numeric(18,2),
  saldo_contraparte numeric(18,2),
  diferencia_final numeric(18,2),
  estado text default 'borrador' check (estado in ('borrador', 'en_proceso', 'finalizada')),
  created_at timestamptz default now()
);

-- 6. MOVIMIENTOS
create table if not exists movimientos (
  id uuid primary key default gen_random_uuid(),
  conciliacion_id uuid references conciliaciones(id) on delete cascade,
  origen text check (origen in ('compania', 'contraparte')) not null,
  fecha date,
  comprobante text,
  descripcion text,
  tipo_original text,
  tipo_normalizado text,
  importe numeric(18,2) not null,
  estado_conciliacion text default 'pendiente_compania' check (
    estado_conciliacion in (
      'conciliado_automatico',
      'conciliado_sugerido',
      'pendiente_compania',
      'pendiente_contraparte',
      'diferencia_importe',
      'tipo_no_clasificado',
      'duplicado_posible'
    )
  ),
  match_id uuid,
  nivel_match text check (nivel_match in ('N1','N2','N3','N4')),
  created_at timestamptz default now()
);

-- 7. MATCHES (pares conciliados)
create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  conciliacion_id uuid references conciliaciones(id) on delete cascade,
  mov_compania_id uuid references movimientos(id),
  mov_contraparte_id uuid references movimientos(id),
  nivel text check (nivel in ('N1','N2','N3','N4')),
  confianza integer,
  observacion text,
  created_at timestamptz default now()
);

-- Índices útiles
create index if not exists idx_movimientos_conciliacion on movimientos(conciliacion_id);
create index if not exists idx_movimientos_estado on movimientos(estado_conciliacion);
create index if not exists idx_equivalencias_empresa on equivalencias(empresa_id);
create index if not exists idx_conciliaciones_empresa on conciliaciones(empresa_id);

-- Datos iniciales de ejemplo (equivalencias comunes para Tango/SAP)
-- Reemplazá TU-EMPRESA-ID con el UUID de tu empresa luego de crearla
-- INSERT INTO equivalencias (empresa_id, origen, texto_original, tipo_normalizado, signo)
-- VALUES
--   ('TU-EMPRESA-ID', 'ambos', 'FACTURA A', 'FACTURA', 1),
--   ('TU-EMPRESA-ID', 'ambos', 'FAC A', 'FACTURA', 1),
--   ('TU-EMPRESA-ID', 'ambos', 'FC A', 'FACTURA', 1),
--   ('TU-EMPRESA-ID', 'ambos', 'NOTA CREDITO', 'NOTA_CREDITO', -1),
--   ('TU-EMPRESA-ID', 'ambos', 'NC A', 'NOTA_CREDITO', -1),
--   ('TU-EMPRESA-ID', 'ambos', 'PAGO', 'PAGO', -1),
--   ('TU-EMPRESA-ID', 'ambos', 'RECIBO', 'PAGO', -1),
--   ('TU-EMPRESA-ID', 'ambos', 'TRANSFERENCIA', 'PAGO', -1);
