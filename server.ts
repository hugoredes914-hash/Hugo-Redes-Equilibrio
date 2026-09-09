import { config } from "dotenv";
config({path:[".env.local", ".env"]});
import express from "express";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import helmet from "helmet";
import { requireUser, aiRateLimit, aiDailyLimit, limitConcurrency, validateAIRequest, parsedLeadSchema, adviceSchema, sosSchema } from "./server/security";

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.disable('x-powered-by');
app.use(helmet({contentSecurityPolicy:false,crossOriginEmbedderPolicy:false,frameguard:false}));
app.use('/api', (_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
app.get('/api/health', (_req,res)=>res.json({status:'ok'}));
app.use('/api/gemini', requireUser, aiRateLimit, aiDailyLimit, express.json({limit:'32kb'}), validateAIRequest, limitConcurrency);

// Lazy-initialize Gemini SDK with telemetry header and quota management
let aiClient: GoogleGenAI | null = null;
let quotaExhaustedUntil = 0;

function canUseGemini(): boolean {
  if (Date.now() < quotaExhaustedUntil) {
    return false;
  }
  return !!process.env.GEMINI_API_KEY;
}

function handleGeminiError(action: string, err: any) {
  const errMsg = typeof err === "string" ? err : err?.message || JSON.stringify(err);
  if (
    errMsg.includes("429") ||
    errMsg.includes("RESOURCE_EXHAUSTED") ||
    errMsg.includes("prepayment credits") ||
    errMsg.includes("quota")
  ) {
    quotaExhaustedUntil = Date.now() + 15 * 60 * 1000;
    console.log(`[AI Engine] API quota limit reached. Using intelligent local engine for ${action}.`);
  } else {
    console.log(`[AI Engine] Adaptive local engine active for ${action}.`);
  }
}

function getAI(): GoogleGenAI | null {
  if (!canUseGemini()) {
    return null;
  }
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (key) {
      aiClient = new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          timeout: 25000,
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    }
  }
  return aiClient;
}

// Fallback heuristic parser for leads
function fallbackParseLead(text: string) {
  let name = "";
  let phone = "";
  let property = "";
  let propertyValue = "";
  let interest = "Medio";
  let notes = text.slice(0, 200).trim();

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

// 1. Health check


// 2. Parse Lead with AI
app.post("/api/gemini/parse-lead", async (req, res) => {
  const { text } = req.body;
  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "Missing text to parse" });
  }

  const ai = getAI();
  if (ai) {
    try {
      const prompt = `Analiza el siguiente mensaje de un prospecto/cliente inmobiliario y extrae la información en formato JSON estricto.
Respeta exactamente este esquema:
{
  "name": "Nombre de la persona, o string vacío si no se menciona",
  "phone": "Teléfono con código de país si lo hay, o string vacío",
  "property": "Nombre o detalle de la propiedad que menciona, o string vacío",
  "propertyValue": "Monto de inversión o presupuesto mencionado (solo números en string), o string vacío",
  "interest": "Extrae su nivel de urgencia o decisión. ESTRICTAMENTE debe ser 'Alto', 'Medio' o 'Bajo'. Si no dice, pon 'Medio'.",
  "notes": "Una síntesis breve de lo que necesita o pide y el posible siguiente paso."
}

Texto a analizar: "${text}"
Responde EXCLUSIVAMENTE con el objeto JSON válido, sin bloques de código ni comentarios.`;

      const response = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL || "gemini-flash-latest",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        },
      });

      if (response.text) {
        let cleanText = response.text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        const parsed = parsedLeadSchema.parse(JSON.parse(cleanText));
        return res.json({ success: true, lead: parsed });
      }
    } catch (err: any) {
      handleGeminiError("parse-lead", err);
    }
  }

  // Graceful fallback parser
  const fallback = fallbackParseLead(text);
  return res.json({ success: true, lead: fallback, fallback: true });
});

// 3. Draft Message with AI
app.post("/api/gemini/draft-message", async (req, res) => {
  const { name, property, stage, notes } = req.body;
  const leadName = name || "Cliente";

  const ai = getAI();
  if (ai) {
    try {
      const prompt = `Actúa como un asesor altamente persuasivo especializado en metodologías de ventas inmobiliarias.
El cliente se llama ${leadName}.
La propiedad de interés es: ${property || "No especificada"}.
Está en la etapa de venta de: ${stage || "Contacto Inicial"}.
Notas o siguiente paso: ${notes || "Ninguna especificada"}.

Redacta un mensaje de WhatsApp corto, empático y directo para contactar a este prospecto. Debe ser profesional, orientando al cliente hacia el siguiente paso lógico según su etapa de venta.
Solo responde con el mensaje redactado, sin introducciones ni comillas.`;

      const response = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL || "gemini-flash-latest",
        contents: prompt,
      });

      if (response.text) {
        return res.json({ success: true, message: response.text.trim() });
      }
    } catch (err: any) {
      handleGeminiError("draft-message", err);
    }
  }

  // High-converting fallback templates
  let fallbackMessage = `¡Hola ${leadName}! Te escribo con relación a la propiedad ${property || "que estuvimos conversando"}. Quería ver cómo vienes con tus tiempos esta semana para coordinar el siguiente paso y responder cualquier consulta. ¿Te queda bien que te llame hoy unos minutos?`;
  if (stage === "Prospección") {
    fallbackMessage = `¡Hola ${leadName}! Gracias por tu interés en ${property || "nuestras propiedades"}. Para brindarte la mejor información adaptada a lo que buscas, ¿te gustaría que tengamos una breve llamada de 5 minutos hoy?`;
  } else if (stage === "Visita" || stage === "Visita Realizada") {
    fallbackMessage = `¡Hola ${leadName}! Espero que estés muy bien. Quería consultar tus impresiones sobre ${property || "la visita"}. ¿Qué te parecieron los espacios y la ubicación? Quedo a disposición para avanzar con las consultas que tengas.`;
  } else if (stage === "Negociación" || stage === "Propuesta") {
    fallbackMessage = `¡Hola ${leadName}! Estoy revisando los términos para ${property || "la propuesta"}. Tenemos una ventana de oportunidad interesante para cerrar en condiciones favorables. ¿Coordinamos hoy para definir los detalles?`;
  }

  return res.json({ success: true, message: fallbackMessage, fallback: true });
});

// 4. Generate Predictive Report
app.post("/api/gemini/report", async (req, res) => {
  const { leads, metricsHistory } = req.body;

  const ai = getAI();
  if (ai && Array.isArray(leads) && leads.length > 0) {
    try {
      const reportData = leads
        .map((l: any) => `- Etapa: ${l.stage}. Valor: $${l.propertyValue || 0}. Interés: ${l.interest}.`)
        .join("\n");

      let metricsSummary = "No hay registro emocional reciente.";
      if (Array.isArray(metricsHistory) && metricsHistory.length > 0) {
        metricsSummary = metricsHistory
          .map((m: any) => `Fecha: ${m.date}, Estrés: ${m.checkinAnxiety}/10, Energía: ${m.checkinEnergy}/10, Ánimo: ${m.checkinMood}/10`)
          .join("\n");
      }

      const prompt = `Actúa como un Director Comercial experto en psicología de ventas y PNL.
Aquí tienes la lista actual de prospectos/leads del vendedor:
${reportData}

Aquí tienes el registro emocional y productivo de sus últimos días:
${metricsSummary}

Por favor, genera un "Reporte Predictivo Emocional vs Comercial" directo en TEXTO PLANO (SIN MARKDOWN).
Estructura sugerida:
1. Resumen Pipeline: Breve situación de los leads activos.
2. Análisis Psicológico vs Comercial: Analiza si existe una relación en su desempeño comercial y bienestar.
3. 3 Recomendaciones clave: Acciones tácticas para acelerar cierres cuidando la energía.

REGLA ESTRICTA: NO USES FORMATO MARKDOWN (ni asteriscos, ni numerales). Usa emojis para títulos.`;

      const response = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL || "gemini-flash-latest",
        contents: prompt,
      });

      if (response.text) {
        return res.json({ success: true, report: response.text.trim() });
      }
    } catch (err: any) {
      handleGeminiError("report", err);
    }
  }

  // Comprehensive fallback report
  const leadCount = Array.isArray(leads) ? leads.length : 0;
  const highInterest = Array.isArray(leads) ? leads.filter((l: any) => l.interest === "Alto").length : 0;
  const totalValue = Array.isArray(leads) ? leads.reduce((acc: number, l: any) => acc + (Number(l.propertyValue) || 0), 0) : 0;

  const fallbackReport = `📊 REPORTE PREDICTIVO COMERCIAL Y EMOCIONAL

📈 Resumen Pipeline
Tienes ${leadCount} leads registrados con un volumen potencial de USD $${totalValue.toLocaleString()}. De ellos, ${highInterest} presentan alto interés prioritario para conversión inmediata.

🧠 Análisis Psicológico vs Comercial
Tu capacidad de cierre se potencia significativamente cuando mantienes niveles de estrés controlados (< 5/10). En fases de prospección intensa, enfócate en llamadas tempranas cuando tu energía está en su punto máximo, evitando la fatiga cognitiva vespertina.

🎯 Recomendaciones Clave:
1. Prioridad 80/20: Contacta hoy primero a los ${highInterest || 1} contactos con mayor interés y programa seguimiento con horario exacto.
2. Desescalada de Ansiedad: Divide las propuestas complejas en hitos de 20 minutos con descansos de respiración consciente.
3. Ritmo Sostenido: Define como máximo 3 tareas de alto impacto (MIT) por jornada para sostener consistencia comercial a largo plazo.`;

  return res.json({ success: true, report: fallbackReport, fallback: true });
});

// 5. Daily Anchor and Advice (PNL)
app.post("/api/gemini/anchor-advice", async (req, res) => {
  const { status, mits } = req.body;

  const ai = getAI();
  if (ai && status) {
    try {
      const mitTexts = Array.isArray(mits) ? mits.map((m: any) => m.text).join(", ") : "Ninguna registrada hoy";
      const prompt = `Actúa como un coach de alto rendimiento y PNL.
El usuario tiene hoy este estado:
- Ánimo: ${status.mood ?? 5}/10
- Energía: ${status.energy ?? 5}/10
- Ansiedad: ${status.anxiety ?? 5}/10

Sus tareas principales (MIT) para hoy son:
[${mitTexts}]

Teniendo en cuenta su estado y objetivos, genera:
1. Una frase "Ancla" (PNL) breve y poderosa (máx 15 palabras) diseñada para reencuadrar su mentalidad actual.
2. El tema del reencuadre (1-3 palabras).
3. Una pequeña recomendación estratégica sobre cómo afrontar sus MIT hoy dado su nivel de energía y ansiedad. (Máx 25 palabras).

Devuelve EXCLUSIVAMENTE un JSON con este formato y nada más:
{
  "anchor": "La frase ancla",
  "theme": "El tema",
  "recommendation": "La recomendación"
}`;

      const response = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL || "gemini-flash-latest",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        },
      });

      if (response.text) {
        let cleanText = response.text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        const parsed = adviceSchema.parse(JSON.parse(cleanText));
        return res.json({ success: true, data: parsed });
      }
    } catch (err: any) {
      handleGeminiError("anchor-advice", err);
    }
  }

  // Adaptive fallback using context & PNL psychology
  const anxiety = status?.anxiety ?? 5;
  const energy = status?.energy ?? 5;

  let targetMit = "";
  if (Array.isArray(mits) && mits.length > 0) {
    const firstActive = mits.find((m: any) => !m.done) || mits[0];
    if (firstActive) {
      targetMit = typeof firstActive === "string" ? firstActive : firstActive.text || "";
    }
  }

  let anchor = "Cada problema es información. Un obstáculo me enseña cómo preparar mejor la próxima oferta.";
  let theme = "Mentalidad de Aprendiz";
  let recommendation = targetMit
    ? `Enfócate hoy en "${targetMit}" en un bloque de 25 minutos con máxima presencia.`
    : "Avanza a tu ritmo, una tarea a la vez con descansos estratégicos.";

  if (anxiety >= 7) {
    anchor = "Tengo el control de mi ritmo y de mi atención en el presente.";
    theme = "Calma y Control";
    recommendation = targetMit
      ? `Baja el ritmo y aborda "${targetMit}" en micro-pasos de 15 minutos sin distracciones.`
      : "Haz la primera MIT en bloques de 15 minutos sin mirar notificaciones.";
  } else if (energy <= 4) {
    anchor = "La consistencia sin prisa supera la intensidad momentánea.";
    theme = "Energía Estratégica";
    recommendation = targetMit
      ? `Simplifica "${targetMit}" al mínimo paso viable para ganar impulso sin agotarte.`
      : "Elige la tarea más simple para ganar impulso y delega o pospone lo secundario.";
  } else if (energy >= 7 && anxiety <= 4) {
    anchor = "Hoy convierto cada interacción en un avance concreto y decisivo.";
    theme = "Alta Efectividad";
    recommendation = targetMit
      ? `Aprovecha tu alta energía para ejecutar "${targetMit}" a primera hora con determinación.`
      : "Aprovecha tu claridad para abordar tu cierre o llamada más desafiante primero.";
  }

  return res.json({ success: true, data: { anchor, theme, recommendation }, fallback: true });
});

// 6. SOS Advice
app.post("/api/gemini/sos-advice", async (req, res) => {
  const { block } = req.body;
  const blockName = block || "bloqueo general";

  const ai = getAI();
  if (ai) {
    try {
      const prompt = `Actúa como 5 personalidades disociadas para ayudar a un emprendedor/vendedor inmobiliario que sufre de este bloqueo: "${blockName}".

Devuelve la respuesta en JSON puro, que sea un array de objetos, cada uno con properties "role" (nombre del rol en mayúsculas) y "advice" (un consejo directo, frío, impactante, de 2 o 3 oraciones cortas).

Los 5 roles son:
1. PSIQUIATRA (científico, explica qué parte del cerebro está actuando y cómo calmar la amígdala).
2. PNL (reframing del rechazo, la creencia y la identidad).
3. VENTAS (frío, matemático, ley de promedios, cierre lógico).
4. CEO (exigente, pragmático, enfocado en resultados y ejecución).
5. COACH (inspirador, centrado en respirar, contar hasta 5 y moverse ahora).

No incluyas markdown. Solo el array JSON.`;

      const response = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL || "gemini-flash-latest",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        },
      });

      if (response.text) {
        let cleanText = response.text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        const parsed = sosSchema.parse(JSON.parse(cleanText));
        return res.json({ success: true, perspectives: parsed });
      }
    } catch (err: any) {
      handleGeminiError("sos-advice", err);
    }
  }

  // Dynamic role-based fallback perspectives
  const fallbacks: Record<string, any[]> = {
    rechazo: [
      { role: "PSIQUIATRA", advice: "Tu amígdala interpreta el rechazo social como peligro de muerte tribal. No estás en peligro real; respira en 4 tiempos y dile a tu córtex prefrontal que un 'no' es solo una respuesta verbal." },
      { role: "PNL", advice: "El cliente no te rechaza a ti; rechaza una oferta en este instante temporal. Separa tu valor personal de la respuesta externa. Reencuadra cada negativa como un filtro hacia el comprador real." },
      { role: "VENTAS", advice: "La ley de promedios es matemática pura: necesitas 9 'no' para encontrar 1 'sí'. Cada llamada que descarta un prospecto te acerca estadísticamente al cheque de comisión." },
      { role: "CEO", advice: "No cobras por tener miedo, cobras por ejecutar. La inacción cuesta dinero todos los días. Levanta el teléfono y haz 3 intentos ahora mismo." },
      { role: "COACH", advice: "Cuenta hasta 3, inhala profundo y marca sin pensar. La acción cura el miedo antes de que tu mente invente excusas. ¡Vamos!" }
    ],
    deuda: [
      { role: "PSIQUIATRA", advice: "El estrés financiero satura el ancho de banda cognitivo y reduce tu visión periférica. Baja el cortisol escribiendo el número exacto: la certidumbre calma el cerebro límbico." },
      { role: "PNL", advice: "La deuda no es una condena moral ni define quién eres; es simplemente un balance contable temporal. Cambia 'estoy atrapado' por 'estoy ejecutando mi plan de capitalización'." },
      { role: "VENTAS", advice: "La única cura para un problema de ingresos es generar más ventas. Concéntrate en la actividad que produce dinero hoy: contactar propietarios y compradores calificados." },
      { role: "CEO", advice: "Audita tus números con frialdad. Corta gastos superfluos y asigna el 80% de tus horas útiles a operaciones comerciales que muevan la aguja." },
      { role: "COACH", advice: "Un paso a la vez. No puedes pagar todo en un minuto, pero sí puedes hacer la llamada que inicie la próxima captación hoy. Concéntrate en este día." }
    ],
    arrancar: [
      { role: "PSIQUIATRA", advice: "La procrastinación no es pereza, es resistencia a una emoción negativa anticipada. Rompe la fricción de entrada aplicando la regla de los 2 minutos." },
      { role: "PNL", advice: "No necesitas sentirte motivado para actuar; la motivación surge después de empezar. Cambia el diálogo interno de 'tengo que hacer todo' a 'voy a dar solo el primer paso'." },
      { role: "VENTAS", advice: "El pipeline que no se alimenta hoy se seca en 60 días. Abre tu CRM, elige el primer lead y envía el mensaje antes de abrir otra pestaña." },
      { role: "CEO", advice: "El perfeccionismo es una forma elegante de cobardía. Entrega una versión funcional ahora. Lo hecho imperfecto genera ingresos, lo perfecto en la cabeza genera cero." },
      { role: "COACH", advice: "Respira, pon el temporizador en 15 minutos y no te levantes de la silla. Cuando suene la campana verás que ya estás en marcha." }
    ],
    abrumo: [
      { role: "PSIQUIATRA", advice: "Sobrecarga de memoria de trabajo: tu cerebro solo procesa 4 datos simultáneos. Vuelca todo en un papel para vaciar la memoria RAM cerebral de inmediato." },
      { role: "PNL", advice: "El abrumo ocurre cuando miras el horizonte completo en vez de tus pies. Reduce el marco temporal: en los próximos 30 minutos solo existe una sola acción." },
      { role: "VENTAS", advice: "Clasifica tus tareas: ¿Produce comisión directa hoy? Si no, va al final de la lista. Atiende primero a los leads calientes." },
      { role: "CEO", advice: "Priorización radical. De 10 pendientes, 8 pueden esperar sin consecuencias graves. Elige la MIT número uno y elimina el resto de tu vista." },
      { role: "COACH", advice: "Detén todo 60 segundos. Toma un vaso de agua, estira la espalda, suelta el aire despacio. Ahora elige una sola cosa y terminala con orgullo." }
    ]
  };

  const selectedKey = Object.keys(fallbacks).find(k => blockName.toLowerCase().includes(k)) || "arrancar";
  return res.json({ success: true, perspectives: fallbacks[selectedKey], fallback: true });
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV === 'production' && (process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST)) throw new Error('Emulators must not be enabled in production');
  app.use('/api', (_req,res)=>{res.status(404).json({error:'Ruta no disponible.'});});
  if (process.env.NODE_ENV !== "production") {
    const {createServer:createViteServer} = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist", "public");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      if (req.path.split('/').some(segment => segment.startsWith('.')) || path.extname(req.path) || req.path.startsWith('/server')) return void res.status(404).end();
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.use((err:any,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
    res.status(err?.type==='entity.too.large'?413:400).json({error:'No se pudo procesar la solicitud.'});
  });
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
