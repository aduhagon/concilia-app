import type {
  PlantillaProveedor,
  MovimientoNorm,
  MovimientoResultado,
  ResultadoConciliacion,
  ReglaTipo,
  EstadoConciliacion,
} from "@/types"
import { construirClave } from "./constructor-clave"

// ============================================================
// MOTOR DE CONCILIACIÓN v2
// ------------------------------------------------------------
// La lógica ya NO está hardcodeada en niveles fijos.
// Se aplica la plantilla del proveedor:
//   1. Para cada movimiento, identificamos a qué REGLA pertenece según su tipo.
//   2. Si la regla es "clave": construimos la clave en cada lado y matcheamos.
//   3. Si la regla es "importe_fecha": matcheamos por importe + ventana de fechas.
//   4. Tipos en `tipos_sin_contraparte_*` quedan como "ajuste_propio".
//   5. Tipos que no caen en ninguna regla → "tipo_no_clasificado".
// ============================================================

type Lado = "compania" | "contraparte"

export function conciliar(
  movimientos: MovimientoNorm[],
  plantilla: PlantillaProveedor
): ResultadoConciliacion {
  // 1. CLASIFICAR cada movimiento según las reglas de la plantilla
  const clasificados = movimientos.map((m) => clasificar(m, plantilla))

  // 2. CONSTRUIR clave para los movimientos que matchean por clave
  for (const m of clasificados) {
    const regla = encontrarReglaPorId(plantilla, m.regla_id)
    if (!regla || regla.metodo_match !== "clave") continue
    const constructor =
      m.origen === "compania" ? regla.clave_compania : regla.clave_contraparte
    m.clave_calculada = construirClave(m.raw, constructor)
  }

  // 3. MATCHEAR por regla
  const resultados: MovimientoResultado[] = clasificados.map((m) => ({
    ...m,
    estado: m.tipo_normalizado === "AJUSTE_PROPIO"
      ? ("ajuste_propio" as EstadoConciliacion)
      : m.tipo_normalizado === null
        ? ("tipo_no_clasificado" as EstadoConciliacion)
        : ("pendiente" as EstadoConciliacion),
    match_id: null,
  }))

  for (const regla of plantilla.reglas_tipos) {
    const compania = resultados.filter(
      (r) => r.regla_id === regla.id && r.origen === "compania" && r.estado === "pendiente"
    )
    const contraparte = resultados.filter(
      (r) => r.regla_id === regla.id && r.origen === "contraparte" && r.estado === "pendiente"
    )

    if (regla.metodo_match === "clave") {
      matchPorClave(compania, contraparte, plantilla.config.tolerancia_importe, plantilla.config.moneda_separada)
    } else if (regla.metodo_match === "importe_fecha") {
      const ventana = regla.ventana_dias ?? plantilla.config.ventana_dias_default
      matchPorImporteFecha(compania, contraparte, ventana, plantilla.config.tolerancia_importe)
    }
    // "manual" no auto-matchea
  }

  // 4. RESUMEN
  const resumen = construirResumen(resultados)

  return { movimientos: resultados, resumen }
}

// ----------------------------------------------------------------
// Clasificación por tipo
// ----------------------------------------------------------------

function clasificar(
  m: MovimientoNorm,
  plantilla: PlantillaProveedor
): MovimientoNorm {
  const tipoUp = m.tipo_original.toUpperCase().trim()

  // ¿Es un ajuste propio? (solo para movimientos del lado compañía)
  if (m.origen === "compania") {
    const sinContraparte = plantilla.tipos_sin_contraparte_compania.map((s) => s.toUpperCase())
    if (sinContraparte.some((t) => tipoUp.startsWith(t))) {
      return { ...m, tipo_normalizado: "AJUSTE_PROPIO", regla_id: null }
    }
  } else {
    const sinContraparte = plantilla.tipos_sin_contraparte_externa.map((s) => s.toUpperCase())
    if (sinContraparte.some((t) => tipoUp.startsWith(t))) {
      return { ...m, tipo_normalizado: "AJUSTE_PROPIO", regla_id: null }
    }
  }

  // ¿Cae en alguna regla?
  for (const regla of plantilla.reglas_tipos) {
    const tiposPosibles = m.origen === "compania" ? regla.tipo_compania : regla.tipo_contraparte
    if (tiposPosibles.some((t) => tipoUp.startsWith(t.toUpperCase()))) {
      return { ...m, tipo_normalizado: regla.id, regla_id: regla.id }
    }
  }

  return { ...m, tipo_normalizado: null, regla_id: null }
}

function encontrarReglaPorId(p: PlantillaProveedor, id: string | null): ReglaTipo | null {
  if (!id) return null
  return p.reglas_tipos.find((r) => r.id === id) ?? null
}

// ----------------------------------------------------------------
// Match por clave construida
// ----------------------------------------------------------------

function matchPorClave(
  compania: MovimientoResultado[],
  contraparte: MovimientoResultado[],
  tolerancia: number,
  monedaSeparada: boolean
) {
  const indiceCont = new Map<string, MovimientoResultado[]>()
  for (const c of contraparte) {
    if (!c.clave_calculada) continue
    const key = c.clave_calculada
    if (!indiceCont.has(key)) indiceCont.set(key, [])
    indiceCont.get(key)!.push(c)
  }

  for (const cmp of compania) {
    if (!cmp.clave_calculada) continue
    const candidatos = indiceCont.get(cmp.clave_calculada)
    if (!candidatos || candidatos.length === 0) continue

    // Tomamos el primer candidato disponible (no matcheado todavía)
    const cont = candidatos.find((x) => x.match_id === null)
    if (!cont) continue

    cmp.match_id = cont.id_unico
    cont.match_id = cmp.id_unico

    const { estado, dif_ars, dif_usd } = compararImportes(cmp, cont, tolerancia, monedaSeparada)
    cmp.estado = estado
    cont.estado = estado
    cmp.diferencia_ars = dif_ars
    cmp.diferencia_usd = dif_usd
    cont.diferencia_ars = dif_ars
    cont.diferencia_usd = dif_usd
  }
}

// ----------------------------------------------------------------
// Match por importe + ventana de fechas (para Recibos / OP)
// ----------------------------------------------------------------

function matchPorImporteFecha(
  compania: MovimientoResultado[],
  contraparte: MovimientoResultado[],
  ventanaDias: number,
  tolerancia: number
) {
  const usados = new Set<string>()

  for (const cmp of compania) {
    let mejor: { c: MovimientoResultado; distancia: number } | null = null

    for (const cont of contraparte) {
      if (cont.match_id !== null) continue
      if (usados.has(cont.id_unico)) continue

      // ¿Importe coincide? Comparamos en moneda original.
      const importeCmp = Math.abs(cmp.importe_ars) || Math.abs(cmp.importe_usd)
      const importeCont = Math.abs(cont.importe_ars) || Math.abs(cont.importe_usd)
      if (Math.abs(importeCmp - importeCont) > tolerancia) continue

      // ¿Fecha dentro de ventana?
      if (!cmp.fecha || !cont.fecha) continue
      const distancia = Math.abs(
        (cmp.fecha.getTime() - cont.fecha.getTime()) / (1000 * 60 * 60 * 24)
      )
      if (distancia > ventanaDias) continue

      if (!mejor || distancia < mejor.distancia) {
        mejor = { c: cont, distancia }
      }
    }

    if (mejor) {
      usados.add(mejor.c.id_unico)
      cmp.match_id = mejor.c.id_unico
      mejor.c.match_id = cmp.id_unico
      cmp.estado = "conciliado"
      mejor.c.estado = "conciliado"
    }
  }
}

// ----------------------------------------------------------------
// Comparación de importes (clave del estado del match)
// ----------------------------------------------------------------

function compararImportes(
  cmp: MovimientoResultado,
  cont: MovimientoResultado,
  tolerancia: number,
  monedaSeparada: boolean
): { estado: EstadoConciliacion; dif_ars: number; dif_usd: number } {
  // Importes con signo: en compañía vienen como aparecen en el sistema.
  // En contraparte el "importe" suele venir signado según lado.
  // Para evaluar coincidencia trabajamos con valor absoluto del importe principal.
  const arsCmp = Math.abs(cmp.importe_ars)
  const arsCont = Math.abs(cont.importe_ars)
  const usdCmp = Math.abs(cmp.importe_usd)
  const usdCont = Math.abs(cont.importe_usd)

  const dif_ars = arsCmp - arsCont
  const dif_usd = usdCmp - usdCont

  const arsOk = Math.abs(dif_ars) <= tolerancia
  const usdOk = usdCmp > 0 && usdCont > 0 && Math.abs(dif_usd) <= 0.01

  // Si la moneda original es USD y los USD coinciden:
  //   - si los ARS coinciden tambien: conciliado perfecto
  //   - si los ARS no coinciden: diferencia de cambio (esperable)
  if (cmp.moneda === "USD" || cont.moneda === "USD") {
    if (usdOk && arsOk) return { estado: "conciliado", dif_ars, dif_usd }
    if (usdOk) return { estado: "conciliado_dif_ars", dif_ars, dif_usd }
    return { estado: "conciliado_dif_real", dif_ars, dif_usd }
  }

  // Moneda ARS: directamente comparamos pesos
  if (arsOk) return { estado: "conciliado", dif_ars, dif_usd }
  return { estado: "conciliado_dif_real", dif_ars, dif_usd }
}

// ----------------------------------------------------------------
// Resumen
// ----------------------------------------------------------------

function construirResumen(movs: MovimientoResultado[]): ResultadoConciliacion["resumen"] {
  const compania = movs.filter((m) => m.origen === "compania")
  const contraparte = movs.filter((m) => m.origen === "contraparte")

  const tiposNoClasifCmp = Array.from(
    new Set(compania.filter((m) => m.estado === "tipo_no_clasificado").map((m) => m.tipo_original))
  )
  const tiposNoClasifCont = Array.from(
    new Set(contraparte.filter((m) => m.estado === "tipo_no_clasificado").map((m) => m.tipo_original))
  )

  const saldoCompania = compania.reduce((acc, m) => acc + (m.importe_ars || 0), 0)
  const saldoContraparte = contraparte.reduce((acc, m) => acc + (m.importe_ars || 0), 0)

  return {
    total_compania: compania.length,
    total_contraparte: contraparte.length,
    conciliados: movs.filter((m) => m.estado === "conciliado").length / 2,
    conciliados_dif_ars: movs.filter((m) => m.estado === "conciliado_dif_ars").length / 2,
    conciliados_dif_real: movs.filter((m) => m.estado === "conciliado_dif_real").length / 2,
    pendientes_compania: compania.filter((m) => m.estado === "pendiente").length,
    pendientes_contraparte: contraparte.filter((m) => m.estado === "pendiente").length,
    ajustes_propios: movs.filter((m) => m.estado === "ajuste_propio").length,
    tipos_no_clasificados_compania: tiposNoClasifCmp,
    tipos_no_clasificados_contraparte: tiposNoClasifCont,
    saldo_compania_ars: saldoCompania,
    saldo_contraparte_ars: saldoContraparte,
    diferencia_final_ars: saldoCompania - saldoContraparte,
  }
}

// ----------------------------------------------------------------
// Helpers para asignar IDs únicos a los movimientos antes de matchear
// ----------------------------------------------------------------

export function asignarIds<T extends { id_unico?: string }>(items: T[]): (T & { id_unico: string })[] {
  return items.map((item, idx) => ({
    ...item,
    id_unico: item.id_unico ?? `m_${idx}_${Math.random().toString(36).slice(2, 8)}`,
  }))
}
