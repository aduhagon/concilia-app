// src/lib/autoconfig.ts
//
// Capa de inferencia de configuracion de plantilla.
// El LLM SOLO propone mapeo + reglas (etapas 1 y 2 del pipeline).
// La construccion de clave, la validacion con el motor y la aprobacion
// humana ocurren despues, sin tocar este archivo.
//
// IMPORTANTE: este modulo corre en el SERVIDOR (API route / route handler),
// nunca en un componente cliente. La API key se lee de process.env y no
// debe exponerse al navegador.

import type { MapeoCompania, MapeoContraparte, ReglaTipo } from "@/types"

// ----------------------------------------------------------------
// Tipos del contrato de autoconfig
// ----------------------------------------------------------------

// Lo que la app le pasa al LLM por cada lado:
// - columnas + filas (muestra chica) -> para inferir el mapeo
// - tipos: lista COMPLETA de tipos distintos -> para armar las reglas
//   (esto evita que el modelo se pierda tipos que no aparecen en la muestra)
export type MuestraLado = {
  columnas: string[]
  filas: Record<string, unknown>[]   // ~8 filas, solo para el mapeo
  tipos: string[]                     // todos los tipos unicos del archivo
}

export type EntradaAutoconfig = {
  compania: MuestraLado
  contraparte: MuestraLado
  // Si viene un mapeo de compania heredado de otra plantilla del grupo,
  // el modelo NO lo recalcula: solo trabaja el lado contraparte y las reglas.
  mapeo_compania_heredado?: MapeoCompania | null
}

// Lo que el LLM devuelve.
export type PropuestaAutoconfig = {
  mapeo_compania: MapeoCompania
  mapeo_contraparte: MapeoContraparte
  reglas_tipos: ReglaTipo[]
  tipos_sin_contraparte_compania: string[]
  tipos_sin_contraparte_externa: string[]
}

// ----------------------------------------------------------------
// Adaptador de proveedor
// ----------------------------------------------------------------

type AdaptadorLLM = (system: string, user: string) => Promise<string>

const adaptadorGemini: AdaptadorLLM = async (system, user) => {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error("Falta GEMINI_API_KEY en el entorno")

  const modelo = process.env.AUTOCONFIG_MODEL ?? "gemini-2.5-flash-lite"
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0,
      },
    }),
  })

  if (!res.ok) {
    const detalle = await res.text()
    throw new Error(`Gemini respondio ${res.status}: ${detalle}`)
  }

  const data = await res.json()
  const candidato = data?.candidates?.[0]
  if (candidato?.finishReason === "MAX_TOKENS") {
    throw new Error("La respuesta se corto por limite de tokens (JSON incompleto)")
  }
  const texto = candidato?.content?.parts?.[0]?.text
  if (typeof texto !== "string") {
    throw new Error("Respuesta del modelo sin contenido de texto")
  }
  return texto
}

const adaptadorOpenAI: AdaptadorLLM = async (system, user) => {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error("Falta OPENAI_API_KEY en el entorno")

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.AUTOCONFIG_MODEL ?? "gpt-4.1-nano",
      response_format: { type: "json_object" },
      temperature: 0,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  })

  if (!res.ok) {
    const detalle = await res.text()
    throw new Error(`OpenAI respondio ${res.status}: ${detalle}`)
  }

  const data = await res.json()
  const choice = data?.choices?.[0]
  if (choice?.finish_reason === "length") {
    throw new Error("La respuesta se corto por limite de tokens (JSON incompleto)")
  }
  const contenido = choice?.message?.content
  if (typeof contenido !== "string") {
    throw new Error("Respuesta del modelo sin contenido de texto")
  }
  return contenido
}

function obtenerAdaptador(): AdaptadorLLM {
  switch (process.env.AUTOCONFIG_PROVIDER) {
    case "openai":
      return adaptadorOpenAI
    case "gemini":
    default:
      return adaptadorGemini
  }
}

// ----------------------------------------------------------------
// Prompts
// ----------------------------------------------------------------

function construirSystemPrompt(companiaHeredada: boolean): string {
  const seccionMapeoCompania = companiaHeredada
    ? `- El mapeo de compania YA esta definido (lo heredas de otra plantilla del grupo).
  Devolvelo EXACTAMENTE igual al que se te pasa en "mapeo_compania_heredado".
  No lo recalcules.`
    : `- Para el mapeo de compania, elegi los nombres de columna SOLO de la lista de columnas
  de compania provista. No inventes nombres.`

  return `Sos un asistente que configura plantillas de conciliacion contable.
Recibis, de dos archivos Excel (compania y contraparte):
- columnas: los encabezados de cada lado.
- muestra: unas pocas filas de ejemplo, para inferir que columna es que cosa.
- tipos: la lista COMPLETA de tipos de movimiento distintos de cada lado.

Tu tarea es proponer:
1. El mapeo de columnas de cada lado (fecha, tipo, comprobante, importe).
2. Reglas que agrupan tipos de movimiento equivalentes entre ambos lados.
3. Los tipos que existen en un solo lado y no se concilian.

Reglas de decision:
${seccionMapeoCompania}
- Para el mapeo de contraparte, elegi los nombres de columna SOLO de la lista de columnas
  de contraparte provista. No inventes nombres.
- MUY IMPORTANTE: para armar las reglas y los tipos sin contraparte, usa la lista COMPLETA
  de "tipos" de cada lado, NO las filas de muestra. Tenes que cubrir TODOS los tipos:
  cada tipo de compania y cada tipo de contraparte debe terminar en una regla o en un
  tipo sin contraparte. No dejes tipos afuera.

- REGLA DE ORO sobre las reglas de tipos: una regla SIEMPRE representa un par de
  equivalencia entre los dos lados. Por lo tanto, toda regla debe tener AL MENOS UN tipo
  en "tipo_compania" Y AL MENOS UN tipo en "tipo_contraparte".
  PROHIBIDO devolver reglas con un lado vacio (ni tipo_compania:[] ni tipo_contraparte:[]).
- Si un tipo de compania NO tiene un equivalente claro del lado contraparte, NO crees una
  regla para el: mandalo a "tipos_sin_contraparte_compania".
- Si un tipo de contraparte NO tiene un equivalente claro del lado compania, NO crees una
  regla para el: mandalo a "tipos_sin_contraparte_externa".
- Solo agrupa en una misma regla tipos que de verdad se concilian entre si (mismo concepto
  contable: facturas con facturas, retenciones con retenciones, pagos con cobros). Ante la
  duda de si dos tipos son equivalentes, NO los emparejes: mandalos a sin contraparte para
  que un humano lo decida. Es preferible una regla de menos que una regla incorrecta.

- Si un tipo tiene numero de comprobante identificatorio (facturas, notas de credito,
  liquidaciones, retenciones), usa metodo_match "clave".
- Si es un pago o transferencia sin comprobante comun, usa "importe_fecha" con ventana_dias 5.
- Diferencias de cambio, ajustes de cotizacion, notas internas, saldo inicial y similares
  casi nunca tienen reflejo del otro lado: van a tipos_sin_contraparte.

Responde UNICAMENTE con un objeto JSON con esta forma exacta:
{
  "mapeo_compania": { "fecha": "...", "tipo": "...", "comprobante": "...", "importe_ars": "..." },
  "mapeo_contraparte": { "fecha": "...", "tipo": "...", "comprobante": "...", "importe": "..." },
  "reglas_tipos": [
    { "id": "...", "label": "...", "tipo_compania": ["..."], "tipo_contraparte": ["..."],
      "metodo_match": "clave" }
  ],
  "tipos_sin_contraparte_compania": ["..."],
  "tipos_sin_contraparte_externa": ["..."]
}`
}

function construirUserPrompt(entrada: EntradaAutoconfig): string {
  const lado = (m: MuestraLado) => ({
    columnas: m.columnas,
    muestra: m.filas.slice(0, 8),
    tipos: m.tipos,
  })

  const payload: Record<string, unknown> = {
    compania: lado(entrada.compania),
    contraparte: lado(entrada.contraparte),
  }

  if (entrada.mapeo_compania_heredado) {
    payload.mapeo_compania_heredado = entrada.mapeo_compania_heredado
  }

  return JSON.stringify(payload, null, 2)
}

// ----------------------------------------------------------------
// Funcion publica
// ----------------------------------------------------------------

export async function inferirConfig(
  entrada: EntradaAutoconfig
): Promise<PropuestaAutoconfig> {
  const adaptador = obtenerAdaptador()
  const companiaHeredada = !!entrada.mapeo_compania_heredado
  const system = construirSystemPrompt(companiaHeredada)
  const user = construirUserPrompt(entrada)

  const textoJson = await adaptador(system, user)

  let propuesta: PropuestaAutoconfig
  try {
    propuesta = JSON.parse(textoJson)
  } catch {
    throw new Error("El modelo no devolvio JSON parseable")
  }

  // Si la compania se hereda, forzamos el mapeo heredado por las dudas
  // (no confiamos en que el modelo lo haya devuelto identico).
  if (entrada.mapeo_compania_heredado) {
    propuesta.mapeo_compania = entrada.mapeo_compania_heredado
  }

  if (!propuesta.mapeo_compania || !propuesta.mapeo_contraparte) {
    throw new Error("La propuesta no incluye los mapeos esperados")
  }
  if (!Array.isArray(propuesta.reglas_tipos)) {
    propuesta.reglas_tipos = []
  }
  if (!Array.isArray(propuesta.tipos_sin_contraparte_compania)) {
    propuesta.tipos_sin_contraparte_compania = []
  }
  if (!Array.isArray(propuesta.tipos_sin_contraparte_externa)) {
    propuesta.tipos_sin_contraparte_externa = []
  }

  // Red de seguridad: aunque el prompt lo prohibe, si el modelo igual devuelve
  // una regla con un lado vacio, la descartamos y mandamos sus tipos al cajon
  // de "sin contraparte" correspondiente. Asi nunca queda una regla que no
  // puede matchear, y ningun tipo se pierde.
  const reglasValidas: ReglaTipo[] = []
  for (const r of propuesta.reglas_tipos) {
    const comp = Array.isArray(r.tipo_compania) ? r.tipo_compania : []
    const cont = Array.isArray(r.tipo_contraparte) ? r.tipo_contraparte : []
    if (comp.length > 0 && cont.length > 0) {
      reglasValidas.push(r)
    } else {
      for (const t of comp) {
        if (!propuesta.tipos_sin_contraparte_compania.includes(t)) {
          propuesta.tipos_sin_contraparte_compania.push(t)
        }
      }
      for (const t of cont) {
        if (!propuesta.tipos_sin_contraparte_externa.includes(t)) {
          propuesta.tipos_sin_contraparte_externa.push(t)
        }
      }
    }
  }
  propuesta.reglas_tipos = reglasValidas

  propuesta.reglas_tipos = propuesta.reglas_tipos.map((r, i) => ({
    ...r,
    id: r.id || `regla_auto_${i}_${Date.now()}`,
  }))

  return propuesta
}
