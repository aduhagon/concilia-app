# ConciliaApp

App web para conciliación automática de cuentas corrientes entre compañía y contraparte (proveedor/cliente).

## Stack

- **Frontend + Backend**: Next.js 14
- **Base de datos**: Supabase (PostgreSQL)
- **Deploy**: Vercel
- **Repositorio**: GitHub

---

## Setup paso a paso

### 1. Clonar y configurar

```bash
git clone https://github.com/TU-USUARIO/concilia-app.git
cd concilia-app
npm install
```

### 2. Crear las tablas en Supabase

1. Abrí tu proyecto en [supabase.com](https://supabase.com)
2. Ir a **SQL Editor** → **New Query**
3. Copiá y pegá el contenido de `supabase/schema.sql`
4. Clic en **Run**

### 3. Configurar variables de entorno

```bash
cp .env.example .env.local
```

Editá `.env.local` con tus credenciales de Supabase:
- **NEXT_PUBLIC_SUPABASE_URL**: Project Settings > API > Project URL
- **NEXT_PUBLIC_SUPABASE_ANON_KEY**: Project Settings > API > anon key

### 4. Correr localmente

```bash
npm run dev
# Abrí http://localhost:3000
```

### 5. Deploy en Vercel

1. Pusheá el código a GitHub
2. En Vercel: New Project → importar el repo de GitHub
3. En **Environment Variables** de Vercel, agregá las mismas variables de `.env.example`
4. Deploy automático en cada push a `main`

---

## Estructura del proyecto

```
src/
  app/
    page.tsx              # Dashboard principal
    nueva/page.tsx        # Nueva conciliación (upload + mapeo + resultado)
    maestro/page.tsx      # Maestro de equivalencias
    conciliaciones/page.tsx  # Historial
  lib/
    supabase-client.ts    # Cliente Supabase
    motor-conciliacion.ts # Motor de conciliación (4 niveles)
    excel-parser.ts       # Parser y normalizador de Excel
  types/
    index.ts              # Tipos TypeScript
supabase/
  schema.sql              # Script de creación de tablas
```

## Motor de conciliación

| Nivel | Criterio | Confianza |
|-------|----------|-----------|
| N1 | Fecha + Comprobante + Importe + Tipo | 100% |
| N2 | Número de comprobante + Importe | 85% |
| N3 | Importe + Fecha ±5 días + Tipo | 65% |
| N4 | Match agrupado (suma de varios) | 55% |

---

## Próximas mejoras

- [ ] Login con Supabase Auth
- [ ] Guardar mapeo de columnas por contraparte
- [ ] Exportar resultado a Excel
- [ ] Exportar resumen a PDF
- [ ] Multi-empresa
