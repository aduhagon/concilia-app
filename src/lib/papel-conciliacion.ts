import type {
  ResultadoConciliacion,
  MovimientoResultado,
  SaldosBilaterales,
  AjusteManual,
  ClasificacionPendientes,
  ComposicionDiferencia,
  PapelConciliacion,
} from "@/types"

/**
 * Arma el papel de conciliación completo combinando:
 *  - Resultado de la conciliación automática (movimientos + estados)
 *  - Saldos iniciales y finales ingresados por el usuario
 *  - Ajustes manuales del contador
 *  - Clasificación de pendientes (cada uno con su status)
 *
 * El resultado replica el formato del papel de conciliación tradicional:
 *   Saldo s/Compañía
 *   Composición de la diferencia (5 categorías)
 *   Saldo s/Contraparte
 *   Diferencia sin explicar (debería dar ~0)
 */
export function armarPapelConciliacion(
  resultado: ResultadoConciliacion,
  saldos: SaldosBilaterales,
  ajustes: AjusteManual[],
  clasificacion: ClasificacionPendientes
): PapelConciliacion {
  const movs = resultado.movimientos

  // Diferencia esperada = la diferencia "fáctica" entre los saldos finales
  const difEsperadaArs = saldos.final_compania_ars - saldos.final_contraparte_ars
  const difEsperadaUsd = saldos.final_compania_usd - saldos.final_contraparte_usd

  // Pendientes de cada lado (los que no matchearon)
  const pendientes = movs.filter((m) => m.estado === "pendiente")

  // Categorizar pendientes según la clasificación que dio el usuario.
  // Si no clasificó → va a "sin_clasificar".
  // Reglas por defecto si no hay clasificación previa:
  //   - pendiente compañía → no_contraparte (lo más común)
  //   - pendiente contraparte → pendiente_msu
  const cat = {
    posterior_msu: [] as MovimientoResultado[],
    pendiente_msu: [] as MovimientoResultado[],
    posterior_contraparte: [] as MovimientoResultado[],
    no_contraparte: [] as MovimientoResultado[],
    sin_clasificar: [] as MovimientoResultado[],
  }

  for (const m of pendientes) {
    const status = clasificacion[m.id_unico]
    if (status === "posterior_msu") cat.posterior_msu.push(m)
    else if (status === "pendiente_msu") cat.pendiente_msu.push(m)
    else if (status === "posterior_contraparte") cat.posterior_contraparte.push(m)
    else if (status === "no_contraparte") cat.no_contraparte.push(m)
    else if (status === "arrastre") {
      // arrastres se tratan según lado
      if (m.origen === "compania") cat.no_contraparte.push(m)
      else cat.pendiente_msu.push(m)
    } else {
      // sin clasificar: defaults
      if (m.origen === "compania") cat.no_contraparte.push(m)
      else cat.pendiente_msu.push(m)
    }
  }

  // Construir cada categoría con totales
  const composicion: ComposicionDiferencia = {
    posterior_msu: agrupar(cat.posterior_msu),
    pendiente_msu: agrupar(cat.pendiente_msu),
    posterior_contraparte: agrupar(cat.posterior_contraparte),
    no_contraparte: agrupar(cat.no_contraparte),
    ajustes: {
      ajustes,
      total_ars: ajustes.reduce((acc, a) => acc + (a.importe_ars || 0), 0),
      total_usd: ajustes.reduce((acc, a) => acc + (a.importe_usd || 0), 0),
    },
    sin_clasificar: agrupar(cat.sin_clasificar),
    total_ars: 0,
    total_usd: 0,
  }

  composicion.total_ars =
    composicion.posterior_msu.total_ars +
    composicion.pendiente_msu.total_ars +
    composicion.posterior_contraparte.total_ars +
    composicion.no_contraparte.total_ars +
    composicion.ajustes.total_ars

  composicion.total_usd =
    composicion.posterior_msu.total_usd +
    composicion.pendiente_msu.total_usd +
    composicion.posterior_contraparte.total_usd +
    composicion.no_contraparte.total_usd +
    composicion.ajustes.total_usd

  return {
    saldos,
    diferencia_esperada_ars: difEsperadaArs,
    diferencia_esperada_usd: difEsperadaUsd,
    diferencia_explicada_ars: composicion.total_ars,
    diferencia_explicada_usd: composicion.total_usd,
    // El "control": la diferencia esperada menos lo explicado, debe dar ~0
    diferencia_sin_explicar_ars: difEsperadaArs - composicion.total_ars,
    diferencia_sin_explicar_usd: difEsperadaUsd - composicion.total_usd,
    composicion,
  }
}

function agrupar(movs: MovimientoResultado[]) {
  return {
    movimientos: movs,
    total_ars: movs.reduce((acc, m) => acc + (m.importe_ars || 0), 0),
    total_usd: movs.reduce((acc, m) => acc + (m.importe_usd || 0), 0),
  }
}

/**
 * Genera un id único para un nuevo ajuste manual.
 */
export function nuevoAjusteId(): string {
  return `aj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}
