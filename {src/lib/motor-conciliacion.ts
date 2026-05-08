import { MovimientoNormalizado, ResultadoConciliacion, NivelMatch } from "@/types"
import { differenceInDays } from "date-fns"

// Normaliza texto de comprobante para comparación
function normalizarComprobante(texto: string): string {
  if (!texto) return ""
  return texto
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[-_./]/g, "")
    .replace(/^(FACA|FAC-A|FACTURA-A|FC-A|FCA)/, "FACA")
    .replace(/^(NCА|NC-A|NOTACREDITO-A|NCA)/, "NCA")
    .replace(/^(NDA|ND-A|NOTADEBITO-A)/, "NDA")
    .replace(/^0+/, "") // quita ceros a la izquierda del número
}

// Extrae número de comprobante
function extraerNumero(comprobante: string): string {
  const match = comprobante.replace(/\s/g, "").match(/(\d{4,})$/)
  return match ? match[1].replace(/^0+/, "") : comprobante
}

// Compara dos importes con tolerancia de redondeo
function importesIguales(a: number, b: number, tolerancia = 1): boolean {
  return Math.abs(Math.abs(a) - Math.abs(b)) <= tolerancia
}

// Compara fechas dentro de una ventana de días
function fechaEnVentana(f1: string, f2: string, dias: number): boolean {
  try {
    const diff = Math.abs(differenceInDays(new Date(f1), new Date(f2)))
    return diff <= dias
  } catch {
    return false
  }
}

interface MatchResult {
  indexCompania: number
  indexContraparte: number
  nivel: NivelMatch
  confianza: number
}

export function ejecutarConciliacion(
  movCompania: MovimientoNormalizado[],
  movContraparte: MovimientoNormalizado[],
  saldoInicial: number
): ResultadoConciliacion {
  const usadosCompania = new Set<number>()
  const usadosContraparte = new Set<number>()
  const matches: MatchResult[] = []

  // NIVEL 1: Match exacto — fecha + comprobante + importe + tipo
  for (let i = 0; i < movCompania.length; i++) {
    if (usadosCompania.has(i)) continue
    const mc = movCompania[i]
    for (let j = 0; j < movContraparte.length; j++) {
      if (usadosContraparte.has(j)) continue
      const mp = movContraparte[j]
      if (
        mc.fecha === mp.fecha &&
        normalizarComprobante(mc.comprobante) === normalizarComprobante(mp.comprobante) &&
        importesIguales(mc.importe, mp.importe) &&
        mc.tipo_normalizado === mp.tipo_normalizado
      ) {
        matches.push({ indexCompania: i, indexContraparte: j, nivel: "N1", confianza: 100 })
        usadosCompania.add(i)
        usadosContraparte.add(j)
        break
      }
    }
  }

  // NIVEL 2: Match por número de comprobante + importe (sin importar fecha cercana o descripción)
  for (let i = 0; i < movCompania.length; i++) {
    if (usadosCompania.has(i)) continue
    const mc = movCompania[i]
    for (let j = 0; j < movContraparte.length; j++) {
      if (usadosContraparte.has(j)) continue
      const mp = movContraparte[j]
      const numC = extraerNumero(mc.comprobante)
      const numP = extraerNumero(mp.comprobante)
      if (numC.length >= 4 && numC === numP && importesIguales(mc.importe, mp.importe)) {
        matches.push({ indexCompania: i, indexContraparte: j, nivel: "N2", confianza: 85 })
        usadosCompania.add(i)
        usadosContraparte.add(j)
        break
      }
    }
  }

  // NIVEL 3: Match por importe + ventana de fechas ±5 días + tipo equivalente
  for (let i = 0; i < movCompania.length; i++) {
    if (usadosCompania.has(i)) continue
    const mc = movCompania[i]
    for (let j = 0; j < movContraparte.length; j++) {
      if (usadosContraparte.has(j)) continue
      const mp = movContraparte[j]
      if (
        importesIguales(mc.importe, mp.importe) &&
        fechaEnVentana(mc.fecha, mp.fecha, 5) &&
        mc.tipo_normalizado === mp.tipo_normalizado
      ) {
        matches.push({ indexCompania: i, indexContraparte: j, nivel: "N3", confianza: 65 })
        usadosCompania.add(i)
        usadosContraparte.add(j)
        break
      }
    }
  }

  // NIVEL 4: Match agrupado — suma de varios compania = uno de contraparte
  const restantesC = movCompania
    .map((m, i) => ({ m, i }))
    .filter(({ i }) => !usadosCompania.has(i))

  const restantesP = movContraparte
    .map((m, j) => ({ m, j }))
    .filter(({ j }) => !usadosContraparte.has(j))

  for (const { m: mp, j } of restantesP) {
    if (usadosContraparte.has(j)) continue
    // Buscar combinaciones de 2 o 3 movimientos de compañía que sumen el importe
    const candidatos = restantesC.filter(
      ({ i, m }) => !usadosCompania.has(i) && Math.abs(m.importe) < Math.abs(mp.importe)
    )
    for (let a = 0; a < candidatos.length; a++) {
      for (let b = a + 1; b < candidatos.length; b++) {
        const suma = Math.abs(candidatos[a].m.importe) + Math.abs(candidatos[b].m.importe)
        if (importesIguales(suma, Math.abs(mp.importe), 5)) {
          matches.push({ indexCompania: candidatos[a].i, indexContraparte: j, nivel: "N4", confianza: 55 })
          matches.push({ indexCompania: candidatos[b].i, indexContraparte: -1, nivel: "N4", confianza: 55 })
          usadosCompania.add(candidatos[a].i)
          usadosCompania.add(candidatos[b].i)
          usadosContraparte.add(j)
          break
        }
      }
      if (usadosContraparte.has(j)) break
    }
  }

  // Detectar diferencias de importe (mismo comprobante pero distinto monto)
  const diferencias: ResultadoConciliacion["diferencias"] = []
  for (let i = 0; i < movCompania.length; i++) {
    if (usadosCompania.has(i)) continue
    const mc = movCompania[i]
    for (let j = 0; j < movContraparte.length; j++) {
      if (usadosContraparte.has(j)) continue
      const mp = movContraparte[j]
      const numC = extraerNumero(mc.comprobante)
      const numP = extraerNumero(mp.comprobante)
      if (numC.length >= 4 && numC === numP && !importesIguales(mc.importe, mp.importe, 100)) {
        diferencias.push({ compania: mc, contraparte: mp, diferencia: mc.importe - mp.importe })
        usadosCompania.add(i)
        usadosContraparte.add(j)
        break
      }
    }
  }

  // Armar resultados
  const conciliados = matches
    .filter(m => m.indexContraparte >= 0)
    .map(m => ({
      compania: movCompania[m.indexCompania],
      contraparte: movContraparte[m.indexContraparte],
      nivel: m.nivel,
      confianza: m.confianza
    }))

  const pendientes_compania = movCompania.filter((_, i) => !usadosCompania.has(i))
  const pendientes_contraparte = movContraparte.filter((_, j) => !usadosContraparte.has(j))

  // Calcular saldo conciliado
  const totalCompania = movCompania.reduce((acc, m) => acc + m.importe, 0)
  const ajustePC = pendientes_contraparte.reduce((acc, m) => acc + m.importe, 0)
  const ajusteCP = pendientes_compania.reduce((acc, m) => acc + m.importe, 0)
  const ajusteDif = diferencias.reduce((acc, d) => acc + d.diferencia, 0)
  const saldo_conciliado = saldoInicial + totalCompania + ajustePC - ajusteCP + ajusteDif

  return { conciliados, pendientes_compania, pendientes_contraparte, diferencias, no_clasificados: [], saldo_conciliado }
}
