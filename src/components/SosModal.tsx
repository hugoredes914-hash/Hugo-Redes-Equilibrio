import React, { useState } from 'react';
import { X, ShieldAlert, PhoneCall, DollarSign, Timer, AlertTriangle, Loader2 } from 'lucide-react';
import { getGemini } from '../lib/gemini';

const BLOCKS = [
  { id: 'rechazo', icon: PhoneCall, label: 'Evito llamar / Miedo al rechazo' },
  { id: 'deuda', icon: DollarSign, label: 'La deuda me paraliza' },
  { id: 'arrancar', icon: Timer, label: 'No puedo arrancar / Procrastino' },
  { id: 'abrumo', icon: AlertTriangle, label: 'Todo me abruma' }
];

export default function SosModal({ onClose }: { onClose: () => void }) {
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [perspectives, setPerspectives] = useState<any[]>([]);

  const generateHelp = async (block: string) => {
    setSelectedBlock(block);
    setLoading(true);
    setPerspectives([]);
    
    try {
      const gemini = getGemini();
      const prompt = `Actúa como 5 personalidades disociadas para ayudar a un emprendedor/vendedor inmobiliario que sufre de este bloqueo: "${block}".
      
      Devuelve la respuesta en JSON puro, que sea un array de objetos, cada uno con properties "role" (nombre del rol en mayúsculas) y "advice" (un consejo directo, frío, impactante, de 2 o 3 oraciones cortas).
      
      Los 5 roles son:
      1. PSIQUIATRA (científico, explica qué parte del cerebro está actuando y cómo calmar la amígdala).
      2. PNL (reframing del rechazo, la creencia y la identidad).
      3. VENTAS (frío, matemático, ley de promedios, cierre lógico).
      4. CEO (exigente, pragmático, enfocado en resultados y ejecución).
      5. COACH (inspirador, centrado en respirar, contar hasta 5 y moverse ahora).
      
      No incluyas markdown. Solo el array JSON.`;
      
      const response = await gemini.models.generateContent({
        model: 'gemini-flash-latest',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        }
      });
      
      let text = response.text || '[]';
      text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      setPerspectives(JSON.parse(text));
    } catch (e) {
       console.error("SOS Error: ", e);
    } finally {
       setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#3E4639]/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#FDFBF7] rounded-3xl p-6 md:p-8 w-full max-w-2xl border border-[#E5E2D9] shadow-2xl relative">
        <button onClick={onClose} className="absolute right-4 top-4 text-[#7B8371] hover:text-[#3E4639] transition-colors">
          <X className="w-5 h-5" />
        </button>
        
        <div className="mb-6">
          <h2 className="text-2xl font-serif text-red-500 flex items-center mb-1">
            <ShieldAlert className="w-6 h-6 mr-2" />
            ¿Qué te bloquea?
          </h2>
          <p className="text-[#7B8371] text-sm">Selecciona tu situación actual para recibir asesoría inmediata.</p>
        </div>
        
        {!selectedBlock && (
          <div className="space-y-3">
             {BLOCKS.map(b => (
                <button 
                  key={b.id} 
                  onClick={() => generateHelp(b.label)}
                  className="w-full text-left p-4 rounded-xl border border-[#E5E2D9] bg-white hover:bg-[#F9F8F4] text-[#3E4639] font-medium flex items-center transition-all group"
                >
                   <b.icon className="w-5 h-5 mr-3 text-red-400 group-hover:text-red-500" />
                   {b.label}
                </button>
             ))}
          </div>
        )}
        
        {loading && (
           <div className="flex flex-col items-center justify-center py-12 text-[#7B8371]">
              <Loader2 className="w-8 h-8 animate-spin text-red-500 mb-4" />
              <p className="font-serif italic">Activando comité de crisis...</p>
           </div>
        )}
        
        {!loading && perspectives.length > 0 && (
           <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
              {perspectives.map((p, i) => (
                 <div key={i} className="bg-white border text-[#3E4639] p-4 rounded-xl shadow-sm" 
                   style={{
                      borderColor: i === 0 ? '#A3B18A' : i === 1 ? '#D4A373' : i === 2 ? '#3E4639' : i === 3 ? '#a8a29e' : '#ef4444',
                      borderLeftWidth: '4px'
                   }}>
                    <span className="text-[10px] font-bold text-[#7B8371] tracking-widest uppercase block mb-1">{p.role}</span>
                    <p className="text-[#3E4639] text-sm leading-relaxed">{p.advice}</p>
                 </div>
              ))}
              <div className="pt-4">
                 <button onClick={onClose} className="w-full text-center p-4 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold transition-colors shadow-lg shadow-red-500/20">
                    LISTO. A EJECUTAR.
                 </button>
              </div>
           </div>
        )}
      </div>
    </div>
  );
}
