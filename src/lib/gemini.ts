import { GoogleGenAI } from "@google/genai";

let ai: GoogleGenAI | null = null;

export function getGemini(): GoogleGenAI {
  if (!ai) {
    const key = process.env.GEMINI_API_KEY || (import.meta as any).env.VITE_GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is missing.");
    }
    ai = new GoogleGenAI({ apiKey: key });
  }
  return ai;
}

export async function generateAnchorAndAdvice(status: any, mits: any[]) {
    try {
        const gemini = getGemini();
        
        const mitTexts = mits.map(m => m.text).join(", ") || "Ninguna registrada hoy";
        
        const prompt = `Actúa como un coach de alto rendimiento y PNL.
El usuario tiene hoy este estado:
- Ánimo: ${status.mood}/10
- Energía: ${status.energy}/10
- Ansiedad: ${status.anxiety}/10

Sus tareas principales (MIT) para hoy son:
[${mitTexts}]

Teniendo en cuenta su estado y objetivos, genera:
1. Una frase "Ancla" (PNL) breve y poderosa (máx 15 palabras) diseñada para reencuadrar su mentalidad actual (ej. si tiene alta ansiedad, un ancla de control y calma; si tiene baja energía, un ancla de constancia sin fricción).
2. El tema del reencuadre (1-3 palabras, ej. "Mentalidad de Cierre", "Pausas Estratégicas").
3. Una pequeña recomendación estratégica sobre cómo afrontar sus MIT hoy dado su nivel de energía y ansiedad. (Máx 25 palabras).

Devuelve EXCLUSIVAMENTE un JSON con este formato y nada más:
{
  "anchor": "La frase ancla",
  "theme": "El tema",
  "recommendation": "La recomendación"
}
`;

        const response = await gemini.models.generateContent({
            model: "gemini-flash-latest",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
            }
        });
        
        if (response.text) {
           let text = response.text;
           text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
           return JSON.parse(text);
        }
    } catch (err) {
        console.error("Gemini Error:", err);
    }
    
    return {
        anchor: "Cada problema es información. Un obstáculo me enseña cómo preparar mejor la próxima oferta.",
        theme: "Mentalidad de Aprendiz",
        recommendation: "Avanza a tu ritmo, una tarea a la vez."
    };
}
