# ConciliaApp v2

App web para conciliación de cuentas corrientes con **plantillas configurables por proveedor**.

## ¿Qué cambia respecto a la v1?

La v1 asumía reglas fijas (match por fecha, comprobante, importe, etc.). En la práctica, **cada proveedor codifica los comprobantes diferente** y eso obliga a vos —el contador— a armar claves manualmente en Excel para hacer BUSCARV.

La v2 traslada ese workflow a la app: definís **una vez por proveedor** cómo se construye la clave en cada lado, y la app reproduce eso automáticamente en cada conciliación nueva.

## Stack

- **Frontend + Backend**: Next.js 14 (App Router)
- **Base de datos**: Supabase (PostgreSQL)
- **Deploy**: Vercel
- **Repositorio**: GitHub
- **Procesamiento Excel**: SheetJS (xlsx)

---

## Setup paso a paso

### 1. Crear proyecto en Supabase

- Ir a [supabase.com](https://supabase.com) → New Project
- Anotar URL del proyecto y `anon key` (Project Settings → API)
- En **SQL Editor → New Query**, pegar y ejecutar el contenido de `supabase/schema.sql`

### 2. Subir a GitHub

```bash
cd concilia-app
git init
git add .
git commit -m "concilia v2"
# crear repo en github.com y luego:
git remote add origin https://github.com/TU-USUARIO/concilia-app.git
git push -u origin main
```

### 3. Deploy en Vercel

- vercel.com → New Project → Import del repo de GitHub
- En **Environment Variables** agregar:
  - `NEXT_PUBLIC_SUPABASE_URL` = tu URL Supabase
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = tu anon key
- Deploy

### 4. Local (opcional)

```bash
cp .env.example .env.local
# editar .env.local con tus credenciales
npm install
npm run dev
```

---

## Cómo se usa

### A. Configurar plantilla de un proveedor (una vez)

1. **Plantillas → Agregar proveedor** (ej: "Cargill")
2. Subir muestras de los dos archivos (compañía + proveedor)
3. **Mapeo de columnas**: indicar qué columna es qué en cada lado
4. **Reglas de tipos**: para cada par de tipos equivalentes, definir cómo armar la clave
   - Ejemplo regla **"Liquidaciones"**:
     - Tipos compañía: `LIQUIDACION`, `LIQUIDACION NC`
     - Tipos contraparte: `LPG-LIQUIDACION-COMPRAS`, `LPG-FINAL-COMPRAS`
     - Método: clave
     - Clave compañía: `[Campo: sucursal_comprobante (pad 4)] + [Campo: numero_comprobante (pad 8)]`
     - Clave contraparte: `[Campo: Nro Legal del Documento]`
   - Ejemplo regla **"Recibos / OP"**:
     - Tipos compañía: `RECIBO`
     - Tipos contraparte: `PAGO/COBRO`
     - Método: importe + fecha (ventana 5 días)
5. **Tipos sin contraparte**: marcar `DIF.CAMBIO DEBITO`, `AJUSTE COTIZACION`, etc. (no son pendientes, son ajustes propios)
6. Guardar

### B. Conciliar (recurrente)

1. **Nueva conciliación** → elegir proveedor
2. Subir los dos Excels del período
3. Conciliar
4. Ver resultado segmentado:
   - Conciliados (clave + importe coinciden)
   - Conciliados con diferencia de cambio (USD coincide, ARS no)
   - Conciliados con diferencia real (revisar)
   - Pendientes compañía / contraparte
   - Ajustes propios
   - Tipos sin clasificar (agregar a la plantilla)
5. Descargar Excel del resultado

---

## Estructura del proyecto

```
src/
  app/
    page.tsx                   # Inicio
    plantillas/page.tsx        # Lista de proveedores
    plantillas/[id]/page.tsx   # Editor de plantilla (mapeo + reglas + claves)
    nueva/page.tsx             # Ejecutar conciliación
    conciliaciones/page.tsx    # Historial
  components/
    EditorClave.tsx            # Constructor visual de claves
  lib/
    motor-conciliacion.ts      # Motor que aplica plantilla
    constructor-clave.ts       # Aplica operaciones para construir clave
    excel-parser.ts            # Lee Excels y exporta resultado
    supabase-client.ts         # Cliente DB
  types/
    index.ts                   # Tipos del dominio
supabase/
  schema.sql                   # Tablas
```

## Estados de movimientos

| Estado | Significado |
|---|---|
| `conciliado` | Clave matchea + importe coincide |
| `conciliado_dif_ars` | Clave matchea, USD coincide, ARS no (diferencia de cambio típica) |
| `conciliado_dif_real` | Clave matchea pero los importes no coinciden — revisar |
| `pendiente` | No tiene contraparte |
| `ajuste_propio` | Tipo declarado como "sin contraparte" |
| `tipo_no_clasificado` | El tipo no está en ninguna regla — agregar a la plantilla |

## Operaciones disponibles para construir clave

- **Campo** — toma valor de una columna, con padding opcional (ej: `5478` con pad 4 → `5478`)
- **Texto fijo** — agrega un literal
- **Últimos N** — recorta los últimos N caracteres del acumulado
- **Primeros N** — recorta los primeros N caracteres
- **Limpiar** — quita caracteres (guiones, espacios, puntos, slashes)
- **Regex** — extrae con expresión regular y grupo de captura

Las operaciones se aplican en orden: las primeras dos producen texto que se concatena; las siguientes transforman el texto acumulado.
