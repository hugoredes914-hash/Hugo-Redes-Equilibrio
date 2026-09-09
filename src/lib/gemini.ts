// Client-side helper that communicates with server-side Gemini API endpoints

export interface ParsedLeadData {
  name: string;
  phone: string;
  property: string;
  propertyValue: string;
  interest: "Alto" | "Medio" | "Bajo";
  notes: string;
}

// Fallback client-side heuristic parser
export function clientFallbackParseLead(text: string): ParsedLeadData {
  let name = "";
  let phone = "";
  let property = "";
  let propertyValue = "";
  let interest: "Alto" | "Medio" | "Bajo" = "Medio";
  let notes = text.slice(0, 250).trim();

  // Phone regex
  const phoneMatch = text.match(/(?:\+?\d{1,3}[\s-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}/);
  if (phoneMatch) {
    phone = phoneMatch[0].trim();
  }

  // Name regex patterns
  const namePatterns = [
    /(?:nombre|name|contacto)\s*[:=]\s*([a-záéíóúñA-ZÁÉÍÓÚÑ\s]+?)(?:[\n,\.]|$)/i,
    /(?:hola,?\s+)?(?:soy|me llamo|habla)\s+([a-záéíóúñA-ZÁÉÍÓÚÑ]+(?:\s+[a-záéíóúñA-ZÁÉÍÓÚÑ]+)?)/i,
    /(?:saludos|atentamente|atte\.?)\s*[:,-]?\s*([a-záéíóúñA-ZÁÉÍÓÚÑ]+(?:\s+[a-záéíóúñA-ZÁÉÍÓÚÑ]+)?)/i,
  ];
  for (const pattern of namePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const candidate = match[1].trim();
      if (candidate.length > 2 && candidate.length < 35 && !/departamento|casa|terreno|propiedad/i.test(candidate)) {
        name = candidate;
        break;
      }
    }
  }

  // Value regex (exclude phone digits by searching in text without phone)
  let textWithoutPhone = text;
  if (phone) {
    textWithoutPhone = text.replace(phone, " ");
  }

  const valueMatch = textWithoutPhone.match(/(?:USD|u\$s|\$|usd|dólares|dolares)\s*(\d{1,3}(?:[.,]\d{3})+|\d{3,9})/i) ||
                     textWithoutPhone.match(/(\d{1,3}(?:[.,]\d{3})+|\d{4,9})\s*(?:USD|u\$s|\$|usd|dólares|dolares)/i) ||
                     textWithoutPhone.match(/(?:presupuesto|valor|precio|inversi[óo]n|monto)\s*[:=]?\s*(?:USD|u\$s|\$|usd|dólares|dolares)?\s*(\d{1,3}(?:[.,]\d{3})+|\d{3,9})/i);
  if (valueMatch && valueMatch[1]) {
    const rawVal = valueMatch[1].replace(/[.,]/g, "");
    if (Number(rawVal) >= 1000) {
      propertyValue = rawVal;
    }
  }

  // Property regex
  const propertyPatterns = [
    /(?:propiedad|inmueble|unidad)\s*[:=]\s*([^\n,.]+)/i,
    /(?:por el|por la|sobre el|sobre la|interesado en|interesada en)\s+((?:departamento|depto|casa|terreno|lote|ph|oficina|local)[^,.\n]+)/i,
    /((?:departamento|depto|casa|terreno|lote|ph|oficina|local)\s+(?:en|de|con)[^,.\n]+)/i,
  ];
  for (const pattern of propertyPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      let propCandidate = match[1].trim().replace(/^(el|la|los|las|un|una)\s+/i, "");
      // Remove trailing price mentions like "de USD 140000" or "por $..."
      propCandidate = propCandidate.replace(/\s+(?:de|por|valor|precio)?\s*(?:USD|u\$s|\$|usd|dólares|dolares|\d{4,}).*$/i, "").trim();
      property = propCandidate;
      break;
    }
  }

  // Urgency / Interest
  if (/urgente|me urge|cuanto antes|ya vend[íi]|inmediato|decidido|alto/i.test(text)) {
    interest = "Alto";
  } else if (/curiosidad|solo miro|a futuro|quiz[áa]s|el a[ñn]o que viene|bajo/i.test(text)) {
    interest = "Bajo";
  }

  return { name, phone, property, propertyValue, interest, notes };
}

export async function parseLeadWithAI(text: string): Promise<ParsedLeadData> {
  try {
    const res = await fetch("/api/gemini/parse-lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.lead) {
        return {
          name: data.lead.name || "",
          phone: data.lead.phone || "",
          property: data.lead.property || "",
          propertyValue: String(data.lead.propertyValue || ""),
          interest: ["Alto", "Medio", "Bajo"].includes(data.lead.interest) ? data.lead.interest : "Medio",
          notes: data.lead.notes || "",
        };
      }
    }
  } catch (_err) {
    // Graceful offline fallback
  }

  return clientFallbackParseLead(text);
}

export async function draftMessageWithAI(lead: any): Promise<string> {
  try {
    const res = await fetch("/api/gemini/draft-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: lead.name,
        property: lead.property,
        stage: lead.stage,
        notes: lead.notes,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.message) {
        return data.message;
      }
    }
  } catch (_err) {
    // Graceful offline fallback
  }

  const name = lead.name || "Cliente";
  return `¡Hola ${name}! Te escribo con relación a la propiedad ${lead.property || "que estuvimos conversando"}. ¿Cómo vienes con tus tiempos hoy para coordinar los detalles del siguiente paso?`;
}

export async function generateReportWithAI(leads: any[], metricsHistory: any[]): Promise<string> {
  try {
    const res = await fetch("/api/gemini/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leads, metricsHistory }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.report) {
        return data.report;
      }
    }
  } catch (_err) {
    // Graceful offline fallback
  }

  return `📊 REPORTE PREDICTIVO COMERCIAL Y EMOCIONAL\n\n📈 Resumen Pipeline\nTienes ${leads.length} leads activos registrados. Revisa aquellos en etapas avanzadas para acelerar el cierre con seguimiento directo.\n\n🧠 Balance Emocional\nPrioriza llamadas clave en tus momentos de mayor enfoque y programa pausas para sostener un alto rendimiento sin sobrecarga.`;
}

export async function generateAnchorAndAdvice(status: any, mits: any[]) {
  try {
    const res = await fetch("/api/gemini/anchor-advice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, mits }),
    });
    if (res.ok) {
      const json = await res.json();
      if (json && json.data) {
        return json.data;
      }
    }
  } catch (_err) {
    // Graceful offline fallback
  }

  const anxiety = status?.anxiety ?? 5;
  const energy = status?.energy ?? 5;
  let targetMit = "";
  if (Array.isArray(mits) && mits.length > 0) {
    const active = mits.find((m: any) => !m.completed) || mits[0];
    if (active) targetMit = typeof active === "string" ? active : active.text || "";
  }

  let anchor = "Cada problema es información. Un obstáculo me enseña cómo preparar mejor la próxima oferta.";
  let theme = "Mentalidad de Aprendiz";
  let recommendation = targetMit
    ? `Enfócate en "${targetMit}" en un bloque de 25 minutos con máxima atención.`
    : "Avanza a tu ritmo, una tarea a la vez con claridad y foco.";

  if (anxiety >= 7) {
    anchor = "Tengo el control de mi ritmo y de mi atención en el presente.";
    theme = "Calma y Control";
    recommendation = targetMit
      ? `Baja el ritmo y aborda "${targetMit}" en micro-pasos de 15 minutos.`
      : "Haz tu tarea principal en un bloque corto sin distracciones.";
  } else if (energy <= 4) {
    anchor = "La consistencia sin prisa supera la intensidad momentánea.";
    theme = "Energía Estratégica";
    recommendation = "Elige la tarea más simple para ganar impulso y delega o pospone lo secundario.";
  }

  return {
    anchor,
    theme,
    recommendation,
  };
}

export async function generateSosHelp(block: string): Promise<any[]> {
  try {
    const res = await fetch("/api/gemini/sos-advice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ block }),
    });
    if (res.ok) {
      const json = await res.json();
      if (json && json.perspectives && Array.isArray(json.perspectives)) {
        return json.perspectives;
      }
    }
  } catch (_err) {
    // Graceful offline fallback
  }

  return [
    { role: "PSIQUIATRA", advice: "La resistencia inicial es una señal de protección de la amígdala. Respira en 4 tiempos y divide la acción en un micro-paso de 2 minutos." },
    { role: "PNL", advice: "Cambia el significado que le das a este momento. No es una barrera, es una oportunidad para ejercer tu disciplina." },
    { role: "VENTAS", advice: "El resultado no depende de cómo te sientas ahora, sino del volumen de acciones ejecutadas de forma sistemática." },
    { role: "CEO", advice: "Elige la tarea de mayor impacto y ejecútala de inmediato sin sobrepensar." },
    { role: "COACH", advice: "Cuenta hasta 3, inhala profundo y da el primer paso ahora mismo. ¡Tú puedes!" },
  ];
}
