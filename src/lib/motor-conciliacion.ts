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
// MOTOR DE CONCILIACIÓN v3 — con nivel 4 agrupado
// ============================================================

export type DecisionMotor = {
  mov_compania_id_unico: string
  mov_contraparte_id_unico: string
  nivel_match: number
  criterio: string
  score_confianza: number
  clave_compania?: string
  clave_contraparte?: string
  candidatos_evaluados: number
  candidatos_descartados?: { id: string; motivo: string }[]
}

export type SugerenciaAgrupada = {
  id_unico: string
  tipo: "N_a_1" | "1_a_N"
  movs_lado_n: string[]
  mov_lado_1: string
  origen_n: "compania" | "contraparte"
  origen_1: "compania" | "contraparte"
  total_lado_n_ars: number
  total_lado_n_usd: number
  importe_lado_1_ars: number
  importe_lado_1_usd: number
  diferencia_ars: number
  diferencia_usd: number
  score_confianza: number
  regla_id?: string
}

export type ResultadoConciliacionConLog = ResultadoConciliacion & {
  decisiones: DecisionMotor[]
  sugerencias_agrupadas: SugerenciaAgrupada[]
}

export function conciliar(
  movimientos: MovimientoNorm[],
  plantilla: PlantillaProveedor
): ResultadoConciliacionConLog {
  const decisiones: DecisionMotor[] = []
  const sugerencias: SugerenciaAgrupada[] = []

  const clasificados = movimientos.map((m) => clasificar(m, plantilla))

  for (const m of clasificados) {
    const regla = encontrarReglaPorId(plantilla, m.regla_id)
    if (!regla || regla.metodo_match !== "clave") continue
    const constructor =
      m.origen === "compania" ? regla.clave_compania : regla.clave_contraparte
    m.clave_calculada = construirClave(m.raw, constructor)
  }

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
      matchPorClave(compania, contraparte, plantilla.config.tolerancia_importe, plantilla.config.moneda_separada, decisiones)
    } else if (regla.metodo_match === "importe_fecha") {
      const ventana = regla.ventana_dias ?? plantilla.config.ventana_dias_default
      matchPorImporteFecha(compania, contraparte, ventana, plantilla.config.tolerancia_importe, decisiones)
    }
  }

  // NIVEL 4 — Match agrupado (sugerencias, no automático)
  for (const regla of plantilla.reglas_tipos) {
    if (regla.metodo_match !== "importe_fecha") continue

    const pendCompania = resultados.filter(
      r => r.regla_id === regla.id && r.origen === "compania" && r.estado === "pendiente"
    )
    const pendContraparte = resultados.filter(
      r => r.regla_id === regla.id && r.origen === "contraparte" && r.estado === "pendiente"
    )

    const ventana = regla.ventana_dias ?? plantilla.config.ventana_dias_default
    const tolerancia = plantilla.config.tolerancia_importe

    buscarAgrupados(pendCompania, pendContraparte, ventana, tolerancia, "compania", regla.id, sugerencias)
    buscarAgrupados(pendContraparte, pendCompania, ventana, tolerancia, "contraparte", regla.id, sugerencias)
  }

  const resumen = construirResumen(resultados)
  return { movimientos: resultados, resumen, decisiones, sugerencias_agrupadas: sugerencias }
}

function clasificar(m: MovimientoNorm, plantilla: PlantillaProveedor): MovimientoNorm {
  const tipoUp = m.tipo_original.toUpperCase().trim()

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

function matchPorClave(
  compania: MovimientoResultado[],
  contraparte: MovimientoResultado[],
  tolerancia: number,
  monedaSeparada: boolean,
  decisiones: DecisionMotor[]
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
    const candidatos = indiceCont.get(cmp.clave_calculada) ?? []
    const descartados: { id: string; motivo: string }[] = []

    const cont = candidatos.find((x) => {
      if (x.match_id !== null) {
        descartados.push({ id: x.id_unico, motivo: "ya_matcheado" })
        return false
      }
      return true
    })

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

    const nivel = estado === "conciliado" ? 1 : 2
    const score = estado === "conciliado" ? 100 :
      estado === "conciliado_dif_ars" ? 85 : 60

    decisiones.push({
      mov_compania_id_unico: cmp.id_unico,
      mov_contraparte_id_unico: cont.id_unico,
      nivel_match: nivel,
      criterio: "clave",
      score_confianza: score,
      clave_compania: cmp.clave_calculada ?? undefined,
      clave_contraparte: cont.clave_calculada ?? undefined,
      candidatos_evaluados: candidatos.length,
      candidatos_descartados: descartados.length > 0 ? descartados : undefined,
    })
  }
}

function matchPorImporteFecha(
  compania: MovimientoResultado[],
  contraparte: MovimientoResultado[],
  ventanaDias: number,
  tolerancia: number,
  decisiones: DecisionMotor[]
) {
  const usados = new Set<string>()

  for (const cmp of compania) {
    let mejor: { c: MovimientoResultado; distancia: number } | null = null
    const descartados: { id: string; motivo: string }[] = []
    let evaluados = 0

    for (const cont of contraparte) {
      if (cont.match_id !== null) {
        descartados.push({ id: cont.id_unico, motivo: "ya_matcheado" })
        continue
      }
      if (usados.has(cont.id_unico)) {
        descartados.push({ id: cont.id_unico, motivo: "reservado" })
        continue
      }

      evaluados++

      const importeCmp = Math.abs(cmp.importe_ars) || Math.abs(cmp.importe_usd)
      const importeCont = Math.abs(cont.importe_ars) || Math.abs(cont.importe_usd)
      if (Math.abs(importeCmp - importeCont) > tolerancia) {
        descartados.push({ id: cont.id_unico, motivo: `dif_importe:${Math.abs(importeCmp - importeCont).toFixed(2)}` })
        continue
      }

      if (!cmp.fecha || !cont.fecha) {
        descartados.push({ id: cont.id_unico, motivo: "sin_fecha" })
        continue
      }
      const distancia = Math.abs(
        (cmp.fecha.getTime() - cont.fecha.getTime()) / (1000 * 60 * 60 * 24)
      )
      if (distancia > ventanaDias) {
        descartados.push({ id: cont.id_unico, motivo: `fuera_ventana:${distancia.toFixed(0)}d` })
        continue
      }

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

      decisiones.push({
        mov_compania_id_unico: cmp.id_unico,
        mov_contraparte_id_unico: mejor.c.id_unico,
        nivel_match: 3,
        criterio: "importe_fecha",
        score_confianza: Math.max(50, 90 - mejor.distancia * 5),
        candidatos_evaluados: evaluados,
        candidatos_descartados: descartados.length > 0 ? descartados.slice(0, 10) : undefined,
      })
    }
  }
}

// ----------------------------------------------------------------
// Nivel 4 — Match agrupado (N-a-1 o 1-a-N)
// ----------------------------------------------------------------

const MAX_TAMANO_GRUPO = 5
const MAX_GRUPOS_POR_REGLA = 30

function buscarAgrupados(
  ladoN: MovimientoResultado[],
  ladoUno: MovimientoResultado[],
  ventanaDias: number,
  tolerancia: number,
  origenN: "compania" | "contraparte",
  reglaId: string,
  sugerencias: SugerenciaAgrupada[]
) {
  if (ladoN.length < 2 || ladoUno.length === 0) return
  if (ladoN.length > 25) return

  const sugerenciasReglaPrevias = sugerencias.filter(s => s.regla_id === reglaId).length
  const movsUsados = new Set<string>()
  let sugerenciasGeneradas = 0

  for (const movUno of ladoUno) {
    if (sugerenciasGeneradas + sugerenciasReglaPrevias >= MAX_GRUPOS_POR_REGLA) break

    const importeObjetivo = Math.abs(movUno.importe_ars) || Math.abs(movUno.importe_usd)
    if (importeObjetivo < 0.01) continue

    const candidatos = ladoN.filter(m => {
      if (movsUsados.has(m.id_unico)) return false
      const imp = Math.abs(m.importe_ars) || Math.abs(m.importe_usd)
      if (imp >= importeObjetivo + tolerancia) return false
      if (imp < 0.01) return false
      if (movUno.fecha && m.fecha) {
        const dias = Math.abs((movUno.fecha.getTime() - m.fecha.getTime()) / 86400000)
        if (dias > ventanaDias * 3) return false
      }
      return true
    })

    if (candidatos.length < 2) continue

    const combo = buscarCombinacionSuma(candidatos, importeObjetivo, tolerancia, MAX_TAMANO_GRUPO)
    if (!combo || combo.length < 2) continue

    const totalArs = combo.reduce((a, m) => a + Math.abs(m.importe_ars), 0)
    const totalUsd = combo.reduce((a, m) => a + Math.abs(m.importe_usd), 0)
    const importeUnoArs = Math.abs(movUno.importe_ars)
    const importeUnoUsd = Math.abs(movUno.importe_usd)

    sugerencias.push({
      id_unico: `sugAgr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      tipo: origenN === "compania" ? "N_a_1" : "1_a_N",
      movs_lado_n: combo.map(m => m.id_unico),
      mov_lado_1: movUno.id_unico,
      origen_n: origenN,
      origen_1: origenN === "compania" ? "contraparte" : "compania",
      total_lado_n_ars: totalArs,
      total_lado_n_usd: totalUsd,
      importe_lado_1_ars: importeUnoArs,
      importe_lado_1_usd: importeUnoUsd,
      diferencia_ars: totalArs - importeUnoArs,
      diferencia_usd: totalUsd - importeUnoUsd,
      score_confianza: calcularScoreAgrupado(combo.length, totalArs, importeUnoArs, tolerancia),
      regla_id: reglaId,
    })

    for (const m of combo) movsUsados.add(m.id_unico)
    movsUsados.add(movUno.id_unico)
    sugerenciasGeneradas++
  }
}

function buscarCombinacionSuma(
  items: MovimientoResultado[],
  objetivo: number,
  tolerancia: number,
  maxItems: number
): MovimientoResultado[] | null {
  const ordenados = [...items].sort((a, b) => {
    const ia = Math.abs(a.importe_ars) || Math.abs(a.importe_usd)
    const ib = Math.abs(b.importe_ars) || Math.abs(b.importe_usd)
    return ib - ia
  })

  let mejor: MovimientoResultado[] | null = null
  let mejorDif = Infinity

  function backtrack(idx: number, sumaActual: number, seleccionados: MovimientoResultado[]) {
    const dif = Math.abs(sumaActual - objetivo)
    if (dif <= tolerancia && seleccionados.length >= 2) {
      if (dif < mejorDif) {
        mejor = [...seleccionados]
        mejorDif = dif
      }
    }

    if (seleccionados.length >= maxItems) return
    if (sumaActual > objetivo + tolerancia) return
    if (idx >= ordenados.length) return
    if (mejorDif === 0) return

    const m = ordenados[idx]
    const imp = Math.abs(m.importe_ars) || Math.abs(m.importe_usd)
    seleccionados.push(m)
    backtrack(idx + 1, sumaActual + imp, seleccionados)
    seleccionados.pop()

    backtrack(idx + 1, sumaActual, seleccionados)
  }

  backtrack(0, 0, [])
  return mejor
}

function calcularScoreAgrupado(
  cantItems: number,
  total: number,
  objetivo: number,
  tolerancia: number
): number {
  const difRelativa = Math.abs(total - objetivo) / Math.max(objetivo, 1)
  const baseScore = 75
  const penalizacionTamano = Math.min((cantItems - 2) * 3, 15)
  const penalizacionDif = Math.min(difRelativa * 100, 20)
  return Math.max(50, baseScore - penalizacionTamano - penalizacionDif)
}

function compararImportes(
  cmp: MovimientoResultado,
  cont: MovimientoResultado,
  tolerancia: number,
  monedaSeparada: boolean
): { estado: EstadoConciliacion; dif_ars: number; dif_usd: number } {
  const arsCmp = Math.abs(cmp.importe_ars)
  const arsCont = Math.abs(cont.importe_ars)
  const usdCmp = Math.abs(cmp.importe_usd)
  const usdCont = Math.abs(cont.importe_usd)

  const dif_ars = arsCmp - arsCont
  const dif_usd = usdCmp - usdCont

  const arsOk = Math.abs(dif_ars) <= tolerancia
  const usdOk = usdCmp > 0 && usdCont > 0 && Math.abs(dif_usd) <= 0.01

  if (cmp.moneda === "USD" || cont.moneda === "USD") {
    if (usdOk && arsOk) return { estado: "conciliado", dif_ars, dif_usd }
    if (usdOk) return { estado: "conciliado_dif_ars", dif_ars, dif_usd }
    return { estado: "conciliado_dif_real", dif_ars, dif_usd }
  }

  if (arsOk) return { estado: "conciliado", dif_ars, dif_usd }
  return { estado: "conciliado_dif_real", dif_ars, dif_usd }
}

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

export function asignarIds<T extends { id_unico?: string }>(items: T[]): (T & { id_unico: string })[] {
  return items.map((item, idx) => ({
    ...item,
    id_unico: item.id_unico ?? `m_${idx}_${Math.random().toString(36).slice(2, 8)}`,
  }))
}