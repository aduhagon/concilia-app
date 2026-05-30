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
// Las claves (clave_compania / clave_contraparte) se completan despues
// por busqueda deterministica, no aca.
export type PropuestaAutoconfig = {
  mapeo_compania: MapeoCompania
  mapeo_contraparte: MapeoContraparte
  reglas_tipos: ReglaTipo[]
  tipos_sin_contraparte_compania: string[]
  tipos_sin_contraparte_externa: string[]
}

// ----------------------------------------------------------------
// Adaptador de proveedor — el unico punto que cambia entre
// Gemini / OpenAI / modelo local (Ollama).
// ----------------------------------------------------------------

// Contrato minimo: recibe system + user, devuelve texto (que sera JSON).
type AdaptadorLLM = (system: string, user: string) => Promise<string>

// --- Adaptador Google Gemini (ACTIVO) ---
// API REST generateContent. La key va en el header x-goog-api-key.
// responseMimeType "application/json" fuerza salida JSON parseable.
// Gemini no tiene rol "system" separado: la instruccion de sistema
// va en el campo systemInstruction.
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
      systemInstruction: {
        parts: [{ text: system }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: user }],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0,   // deterministico
      },
    }),
  })

  if (!res.ok) {
    const detalle = await res.text()
    throw new Error(`Gemini respondio ${res.status}: ${detalle}`)
  }

  const data = await res.json()

  // Estructura de respuesta de Gemini:
  // data.candidates[0].content.parts[0].text
  const candidato = data?.candidates?.[0]

  // Guarda: si se corto por limite de tokens, el JSON puede estar incompleto.
  if (candidato?.finishReason === "MAX_TOKENS") {
    throw new Error("La respuesta se corto por limite de tokens (JSON incompleto)")
  }

  const texto = candidato?.content?.parts?.[0]?.text
  if (typeof texto !== "string") {
    throw new Error("Respuesta del modelo sin contenido de texto")
  }
  return texto
}

// --- Adaptador OpenAI (alternativa) ---
// Mismo contrato, distinta API. Activar con AUTOCONFIG_PROVIDER=openai.
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

// --- Adaptador local (Ollama), para el dia que haga falta on-premise ---
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
//   if (!res.ok) throw new Error(`Modelo local respondio ${res.status}`)
//   const data = await res.json()
//   return data?.choices?.[0]?.message?.content ?? ""
// }

// Seleccion del adaptador activo. Cambiar con la env AUTOCONFIG_PROVIDER.
function obtenerAdaptador(): AdaptadorLLM {
  switch (process.env.AUTOCONFIG_PROVIDER) {
    case "openai":
      return adaptadorOpenAI
    // case "local": return adaptadorLocal
    case "gemini":
    default:
      return adaptadorGemini
  }
}

// ----------------------------------------------------------------
// Prompts — instrucciones para el modelo
// ----------------------------------------------------------------

const SYSTEM_PROMPT = `Sos un asistente que configura plantillas de conciliacion contable.
Recibis los encabezados y una muestra de filas de dos archivos Excel: uno de la compania
y uno de la contraparte (proveedor o cliente).

Tu tarea es proponer:
1. El mapeo de columnas de cada lado (que columna corresponde a fecha, tipo, comprobante, importe).
2. Reglas que agrupan tipos de movimiento equivalentes entre ambos lados.
3. Los tipos que existen en un solo lado y no se concilian.

Reglas de decision:
- Para nombres de columna, elegi SOLO de la lista de columnas provista. No inventes nombres.
- Si un tipo tiene numero de comprobante identificatorio (facturas, notas de credito),
  usa metodo_match "clave".
- Si es un pago o transferencia sin comprobante comun, usa "importe_fecha" con ventana_dias 5.
- Si un tipo aparece en un solo lado (diferencias de cambio, ajustes internos),
  ponelo en tipos_sin_contraparte_compania o tipos_sin_contraparte_externa.
- NO construyas las claves (clave_compania / clave_contraparte). Eso se resuelve despues.

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

function construirUserPrompt(entrada: EntradaAutoconfig): string {
  // Recorte defensivo: aunque la app ya mande pocas filas, limitamos aca tambien.
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
// Funcion publica — lo unico que llama tu API route
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
    throw new Error("El modelo no devolvio JSON parseable")
  }

  // Validacion minima de forma. La validacion PROFUNDA (que las columnas
  // existan, que las reglas tengan sentido) la hace el motor en la etapa 4.
  if (!propuesta.mapeo_compania || !propuesta.mapeo_contraparte) {
    throw new Error("La propuesta no incluye los mapeos esperados")
  }
  if (!Array.isArray(propuesta.reglas_tipos)) {
    propuesta.reglas_tipos = []
  }

  // Asegurar id unico en cada regla (el modelo a veces los omite o repite).
  propuesta.reglas_tipos = propuesta.reglas_tipos.map((r, i) => ({
    ...r,
    id: r.id || `regla_auto_${i}_${Date.now()}`,
  }))

  return propuesta
}
