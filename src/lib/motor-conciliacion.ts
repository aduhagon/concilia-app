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
// MOTOR DE CONCILIACIÓN v2 — con log de decisiones
// ============================================================

type Lado = "compania" | "contraparte"

// Log de cada decisión tomada por el motor
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

export type ResultadoConciliacionConLog = ResultadoConciliacion & {
  decisiones: DecisionMotor[]
}

export function conciliar(
  movimientos: MovimientoNorm[],
  plantilla: PlantillaProveedor
): ResultadoConciliacionConLog {
  const decisiones: DecisionMotor[] = []

  // 1. CLASIFICAR
  const clasificados = movimientos.map((m) => clasificar(m, plantilla))

  // 2. CONSTRUIR CLAVES
  for (const m of clasificados) {
    const regla = encontrarReglaPorId(plantilla, m.regla_id)
    if (!regla || regla.metodo_match !== "clave") continue
    const constructor =
      m.origen === "compania" ? regla.clave_compania : regla.clave_contraparte
    m.clave_calculada = construirClave(m.raw, constructor)
  }

  // 3. INICIALIZAR RESULTADOS
  const resultados: MovimientoResultado[] = clasificados.map((m) => ({
    ...m,
    estado: m.tipo_normalizado === "AJUSTE_PROPIO"
      ? ("ajuste_propio" as EstadoConciliacion)
      : m.tipo_normalizado === null
        ? ("tipo_no_clasificado" as EstadoConciliacion)
        : ("pendiente" as EstadoConciliacion),
    match_id: null,
  }))

  // 4. MATCHEAR por regla
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

  const resumen = construirResumen(resultados)
  return { movimientos: resultados, resumen, decisiones }
}

// ----------------------------------------------------------------
// Clasificación
// ----------------------------------------------------------------

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

// ----------------------------------------------------------------
// Match por clave — Nivel 1 (exacto) y Nivel 2 (clave + tolerancia)
// ----------------------------------------------------------------

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

    // Nivel 1 = exacto (dif_ars y dif_usd = 0), Nivel 2 = clave con diferencia
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

// ----------------------------------------------------------------
// Match por importe + fecha — Nivel 3
// ----------------------------------------------------------------

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
// Comparación de importes
// ----------------------------------------------------------------

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
// Helpers
// ----------------------------------------------------------------

export function asignarIds<T extends { id_unico?: string }>(items: T[]): (T & { id_unico: string })[] {
  return items.map((item, idx) => ({
    ...item,
    id_unico: item.id_unico ?? `m_${idx}_${Math.random().toString(36).slice(2, 8)}`,
  }))
}