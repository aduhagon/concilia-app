-- ============================================================
-- CONCILIA APP v2 — Schema con plantillas de proveedor
-- ============================================================
-- Cambio principal vs v1:
--   - Reemplaza tabla `equivalencias` por `plantillas_proveedor`
--   - La plantilla guarda en JSONB las reglas de match por tipo
--   - Cada proveedor (Cargill, Bunge, etc.) tiene su propia plantilla
-- ============================================================

-- 1. EMPRESAS (la organización del usuario)
create table if not exists empresas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  cuit text,
  created_at timestamptz default now()
);

-- 2. CONTRAPARTES (proveedores/clientes a conciliar)
create table if not exists contrapartes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id) on delete cascade,
  nombre text not null,
  cuit text,
  tipo text check (tipo in ('proveedor','cliente','ambos')) default 'proveedor',
  created_at timestamptz default now()
);

-- 3. PLANTILLAS DE PROVEEDOR
-- Toda la lógica de cómo conciliar contra un proveedor vive aquí.
-- Es JSONB para que sea flexible y se pueda editar sin migraciones.
create table if not exists plantillas_proveedor (
  id uuid primary key default gen_random_uuid(),
  contraparte_id uuid references contrapartes(id) on delete cascade unique,

  -- Mapeo de columnas del archivo de COMPAÑÍA
  -- Ej: { "fecha":"fecha_contable", "tipo":"denominacion",
  --       "comprobante":"numero_comprobante", "sucursal":"sucursal_comprobante",
  --       "importe_ars":"importe_pesos", "importe_usd":"importe_dolar",
  --       "letra":"letra", "moneda":null }
  mapeo_compania jsonb not null default '{}'::jsonb,

  -- Mapeo de columnas del archivo de CONTRAPARTE
  -- Ej: { "fecha":"Fecha Doc.", "tipo":"Tipo Documento",
  --       "comprobante":"Nro Legal del Documento",
  --       "importe":"importe", "moneda":"Moneda Original Doc." }
  mapeo_contraparte jsonb not null default '{}'::jsonb,

  -- Reglas de tipos: array de objetos.
  -- Cada objeto define un par compania <-> contraparte y cómo matchear.
  -- Estructura ejemplo:
  -- [
  --   {
  --     "id": "liquidaciones",
  --     "label": "Liquidaciones de granos",
  --     "tipo_compania": ["LIQUIDACION","LIQUIDACION NC"],
  --     "tipo_contraparte": ["LPG-LIQUIDACION-COMPRAS","LPG-FINAL-COMPRAS","AJUSTE AJUS REBAJAS"],
  --     "metodo_match": "clave",
  --     "clave_compania": {
  --       "tipo": "visual",
  --       "operaciones": [
  --         {"op":"campo","valor":"sucursal","padding":4},
  --         {"op":"campo","valor":"comprobante","padding":8}
  --       ]
  --     },
  --     "clave_contraparte": {
  --       "tipo": "visual",
  --       "operaciones": [{"op":"campo","valor":"comprobante"}]
  --     }
  --   },
  --   {
  --     "id": "pagos",
  --     "label": "Recibos / Órdenes de pago",
  --     "tipo_compania": ["RECIBO"],
  --     "tipo_contraparte": ["PAGO/COBRO"],
  --     "metodo_match": "importe_fecha",
  --     "ventana_dias": 5
  --   }
  -- ]
  reglas_tipos jsonb not null default '[]'::jsonb,

  -- Tipos del lado COMPAÑÍA que NO se concilian (ajustes propios).
  -- Ej: ["DIF.CAMBIO DEBITO","DIF.CAMBIO CREDITO","AJUSTE COTIZACION DE","AJUSTE COTIZACION CR","NOTA INTERNA DEBITO","NOTA INTERNA CREDITO","Red. Ctvs. Cre. Clie","Red. Ctvs. Déb. Clie"]
  tipos_sin_contraparte_compania jsonb not null default '[]'::jsonb,

  -- Tipos del lado CONTRAPARTE que NO tienen reflejo en compañía
  tipos_sin_contraparte_externa jsonb not null default '[]'::jsonb,

  -- Configuración general
  config jsonb not null default '{
    "tolerancia_importe": 1,
    "moneda_separada": true,
    "ventana_dias_default": 5
  }'::jsonb,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 4. CONCILIACIONES (ejecuciones puntuales)
create table if not exists conciliaciones (
  id uuid primary key default gen_random_uuid(),
  contraparte_id uuid references contrapartes(id) on delete cascade,
  periodo_desde date,
  periodo_hasta date,
  saldo_inicial_ars numeric(20,2) default 0,
  saldo_inicial_usd numeric(20,2) default 0,
  saldo_final_compania_ars numeric(20,2),
  saldo_final_contraparte_ars numeric(20,2),
  diferencia_final_ars numeric(20,2),
  estado text check (estado in ('borrador','en_proceso','finalizada')) default 'borrador',
  resumen jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 5. MOVIMIENTOS (resultado de la conciliación, para auditoría/historial)
create table if not exists movimientos (
  id uuid primary key default gen_random_uuid(),
  conciliacion_id uuid references conciliaciones(id) on delete cascade,
  origen text check (origen in ('compania','contraparte')) not null,
  fecha date,
  tipo_original text,
  tipo_normalizado text,
  comprobante_raw text,
  clave_calculada text,         -- la clave que armó el motor (para debug)
  importe_ars numeric(20,2),
  importe_usd numeric(20,2),
  moneda text,
  descripcion text,
  estado_conciliacion text check (estado_conciliacion in (
    'conciliado',
    'conciliado_dif_ars',
    'conciliado_dif_real',
    'pendiente',
    'ajuste_propio',
    'tipo_no_clasificado'
  )),
  match_id uuid,                -- vincula con el otro lado del par
  created_at timestamptz default now()
);

create index if not exists idx_mov_conc on movimientos(conciliacion_id);
create index if not exists idx_mov_clave on movimientos(clave_calculada);
create index if not exists idx_mov_estado on movimientos(estado_conciliacion);

-- 6. EMPRESA POR DEFECTO (semilla para arrancar)
insert into empresas (nombre) values ('Mi Empresa')
on conflict do nothing;
