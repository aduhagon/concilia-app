// src/lib/autoconfig.ts
//
// Capa de inferencia de configuración de plantilla.
// El LLM SOLO propone mapeo + reglas (etapas 1 y 2 del pipeline).
// La construcción de clave, la validación con el motor y la aprobación
// humana ocurren después, sin tocar este archivo.
//
// IMPORTANTE: este módulo corre en el SERVIDOR (API route / route handler),
// nunca en un componente cliente. La API key se lee de process.env y no
// debe exponerse al navegador.

import type { MapeoCompania, MapeoContraparte, ReglaTipo } from "@/types"

// ----------------------------------------------------------------
// Tipos del contrato de autoconfig
// ----------------------------------------------------------------

// Lo que la app le pasa al LLM: headers + una muestra chica de filas.
// NUNCA el archivo completo (control de tokens y de privacidad).
export type MuestraLado = {
  columnas: string[]
  filas: Record<string, unknown>[]   // recortar a ~8 filas antes de llamar
}

export type EntradaAutoconfig = {
  compania: MuestraLado
  contraparte: MuestraLado
}

// Lo que el LLM devuelve: solo la parte "blanda" de la plantilla.
// Las claves (clave_compania / clave_contraparte) se completan después
// por búsqueda determinística, no acá.
export type PropuestaAutoconfig = {
  mapeo_compania: MapeoCompania
  mapeo_contraparte: MapeoContraparte
  reglas_tipos: ReglaTipo[]
  tipos_sin_contraparte_compania: string[]
  tipos_sin_contraparte_externa: string[]
}

// ----------------------------------------------------------------
// Adaptador de proveedor — el único punto que cambia entre
// OpenAI / Anthropic / Gemini / modelo local (Ollama).
// ----------------------------------------------------------------

// Contrato mínimo: recibe system + user, devuelve texto (que será JSON).
type AdaptadorLLM = (system: string, user: string) => Promise<string>

// --- Adaptador OpenAI ---
// Usa Chat Completions con response_format json_object, que obliga
// al modelo a devolver JSON válido y parseable.
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
      temperature: 0,   // determinístico: queremos la misma propuesta para la misma muestra
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  })

  if (!res.ok) {
    const detalle = await res.text()
    throw new Error(`OpenAI respondió ${res.status}: ${detalle}`)
  }

  const data = await res.json()

  // Guardas: el finish_reason debe ser "stop". Si es "length",
  // el modelo se cortó y el JSON puede estar incompleto.
  const choice = data?.choices?.[0]
  if (choice?.finish_reason === "length") {
    throw new Error("La respuesta se cortó por límite de tokens (JSON incompleto)")
  }

  const contenido = choice?.message?.content
  if (typeof contenido !== "string") {
    throw new Error("Respuesta del modelo sin contenido de texto")
  }
  return contenido
}

// --- Adaptador local (Ollama), para el día que lo necesites ---
// Mismo contrato, distinta URL. No requiere API key.
// Descomentar y usar cuando haya un requisito de on-premise.
//
// const adaptadorLocal: AdaptadorLLM = async (system, user) => {
//   const res = await fetch("http://localhost:11434/v1/chat/completions", {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify({
//       model: "qwen2.5",
//       response_format: { type: "json_object" },
//       temperature: 0,
//       messages: [
//         { role: "system", content: system },
//         { role: "user", content: user },
//       ],
//     }),
//   })
//   if (!res.ok) throw new Error(`Modelo local respondió ${res.status}`)
//   const data = await res.json()
//   return data?.choices?.[0]?.message?.content ?? ""
// }

// Selección del adaptador activo. Cambiar acá (o por env) para
// alternar proveedor sin tocar el resto de la app.
function obtenerAdaptador(): AdaptadorLLM {
  switch (process.env.AUTOCONFIG_PROVIDER) {
    // case "local": return adaptadorLocal
    case "openai":
    default:
      return adaptadorOpenAI
  }
}

// ----------------------------------------------------------------
// Prompts — instrucciones para el modelo
// ----------------------------------------------------------------

const SYSTEM_PROMPT = `Sos un asistente que configura plantillas de conciliación contable.
Recibís los encabezados y una muestra de filas de dos archivos Excel: uno de la compañía
y uno de la contraparte (proveedor o cliente).

Tu tarea es proponer:
1. El mapeo de columnas de cada lado (qué columna corresponde a fecha, tipo, comprobante, importe).
2. Reglas que agrupan tipos de movimiento equivalentes entre ambos lados.
3. Los tipos que existen en un solo lado y no se concilian.

Reglas de decisión:
- Para nombres de columna, elegí SOLO de la lista de columnas provista. No inventes nombres.
- Si un tipo tiene número de comprobante identificatorio (facturas, notas de crédito),
  usá metodo_match "clave".
- Si es un pago o transferencia sin comprobante común, usá "importe_fecha" con ventana_dias 5.
- Si un tipo aparece en un solo lado (diferencias de cambio, ajustes internos),
  ponelo en tipos_sin_contraparte_compania o tipos_sin_contraparte_externa.
- NO construyas las claves (clave_compania / clave_contraparte). Eso se resuelve después.

Respondé ÚNICAMENTE con un objeto JSON con esta forma exacta:
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

function construirUserPrompt(entrada: EntradaAutoconfig): string {
  // Recorte defensivo: aunque la app ya mande pocas filas, limitamos acá también.
  const recorte = (m: MuestraLado) => ({
    columnas: m.columnas,
    muestra: m.filas.slice(0, 8),
  })

  return JSON.stringify(
    {
      compania: recorte(entrada.compania),
      contraparte: recorte(entrada.contraparte),
    },
    null,
    2
  )
}

// ----------------------------------------------------------------
// Función pública — lo único que llama tu API route
// ----------------------------------------------------------------

export async function inferirConfig(
  entrada: EntradaAutoconfig
): Promise<PropuestaAutoconfig> {
  const adaptador = obtenerAdaptador()
  const system = SYSTEM_PROMPT
  const user = construirUserPrompt(entrada)

  const textoJson = await adaptador(system, user)

  let propuesta: PropuestaAutoconfig
  try {
    propuesta = JSON.parse(textoJson)
  } catch {
    throw new Error("El modelo no devolvió JSON parseable")
  }

  // Validación mínima de forma. La validación PROFUNDA (que las columnas
  // existan, que las reglas tengan sentido) la hace el motor en la etapa 4.
  if (!propuesta.mapeo_compania || !propuesta.mapeo_contraparte) {
    throw new Error("La propuesta no incluye los mapeos esperados")
  }
  if (!Array.isArray(propuesta.reglas_tipos)) {
    propuesta.reglas_tipos = []
  }

  // Asegurar id único en cada regla (el modelo a veces los omite o repite).
  propuesta.reglas_tipos = propuesta.reglas_tipos.map((r, i) => ({
    ...r,
    id: r.id || `regla_auto_${i}_${Date.now()}`,
  }))

  return propuesta
}
