// src/app/api/autoconfig/route.ts
//
// Endpoint que el front llama con la muestra de los dos Excel.
// Corre en el servidor: acá vive la API key, nunca en el cliente.

import { NextRequest, NextResponse } from "next/server"
import { inferirConfig, type EntradaAutoconfig } from "@/lib/autoconfig"

export async function POST(req: NextRequest) {
  try {
    const entrada = (await req.json()) as EntradaAutoconfig

    // Guarda mínima de entrada.
    if (!entrada?.compania?.columnas || !entrada?.contraparte?.columnas) {
      return NextResponse.json(
        { error: "Faltan las columnas de compañía o contraparte" },
        { status: 400 }
      )
    }

    const propuesta = await inferirConfig(entrada)
    return NextResponse.json(propuesta)
  } catch (e) {
    // Error visible y logueado — nada de swallowing silencioso.
    const mensaje = e instanceof Error ? e.message : "Error desconocido"
    console.error("[autoconfig]", mensaje)
    return NextResponse.json({ error: mensaje }, { status: 500 })
  }
}
