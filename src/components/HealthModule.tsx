import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Activity, BatteryCharging, Moon, Sun, TrendingUp, AlertCircle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, orderBy, limit } from 'firebase/firestore';

export default function HealthModule() {
  const [isDayStarted, setIsDayStarted] = useState(false);
  const [isDayEnded, setIsDayEnded] = useState(false);
  
  const [checkIn, setCheckIn] = useState({ mood: 5, anxiety: 5, energy: 5, sleep: 6 });
  const [checkOut, setCheckOut] = useState({ mood: 5, anxiety: 5, energy: 5, cause: '' });
  const [currentMetricId, setCurrentMetricId] = useState<string | null>(null);

  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
     if (!auth.currentUser) return;
     const userId = auth.currentUser.uid;
     // Fetch last 7 metrics for history
     const qMetrics = query(collection(db, 'users', userId, 'metrics'), orderBy('date', 'asc'), limit(14));
     const unsub = onSnapshot(qMetrics, (snapshot) => {
         const metrics = snapshot.docs.map(doc => {
             const d = doc.data();
             const dateStr = d.date.split('-');
             const label = dateStr.length === 3 ? `${dateStr[2]}/${dateStr[1]}` : d.date;
             
             let checkinScore = (d.checkinMood + d.checkinEnergy + (10 - d.checkinAnxiety) + d.checkinSleep) / 4;
             let checkoutScore = (d.checkoutMood + d.checkoutEnergy + (10 - d.checkoutAnxiety)) / 3;
             
             return {
                 id: doc.id,
                 day: label,
                 date: d.date,
                 checkin: Math.round(checkinScore * 10),
                 checkout: Math.round(checkoutScore * 10),
                 raw: d
             };
         });
         setHistory(metrics);
         
         // Check if today is already started/ended
         const today = new Date().toISOString().split('T')[0];
         const todayMetric = metrics.find(m => m.date === today);
         
         if (todayMetric) {
            setCurrentMetricId(todayMetric.id);
            setIsDayStarted(true);
            setCheckIn({
               mood: todayMetric.raw.checkinMood,
               anxiety: todayMetric.raw.checkinAnxiety,
               energy: todayMetric.raw.checkinEnergy,
               sleep: todayMetric.raw.checkinSleep
            });
            if (todayMetric.raw.checkoutCause && todayMetric.raw.checkoutCause !== '') {
               setIsDayEnded(true);
               setCheckOut({
                   mood: todayMetric.raw.checkoutMood,
                   anxiety: todayMetric.raw.checkoutAnxiety,
                   energy: todayMetric.raw.checkoutEnergy,
                   cause: todayMetric.raw.checkoutCause
               });
            }
         } else {
            setIsDayStarted(false);
            setIsDayEnded(false);
            setCurrentMetricId(null);
         }
     }, (error) => handleFirestoreError(error, OperationType.LIST, 'metrics'));

     return () => unsub();
  }, []);

  const handleStartDay = async () => {
    if (!auth.currentUser) return;
    const today = new Date().toISOString().split('T')[0];
    try {
        const docRef = await addDoc(collection(db, 'users', auth.currentUser.uid, 'metrics'), {
            userId: auth.currentUser.uid,
            date: today,
            checkinMood: checkIn.mood,
            checkinAnxiety: checkIn.anxiety,
            checkinEnergy: checkIn.energy,
            checkinSleep: checkIn.sleep,
            checkoutMood: 0,
            checkoutAnxiety: 0,
            checkoutEnergy: 0,
            checkoutCause: '',
            createdAt: Date.now(),
            updatedAt: Date.now()
        });
        setCurrentMetricId(docRef.id);
        setIsDayStarted(true);
    } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, 'metrics');
    }
  };

  const handleEndDay = async () => {
    if (!auth.currentUser || !currentMetricId) return;
    try {
        await updateDoc(doc(db, 'users', auth.currentUser.uid, 'metrics', currentMetricId), {
            checkoutMood: checkOut.mood,
            checkoutAnxiety: checkOut.anxiety,
            checkoutEnergy: checkOut.energy,
            checkoutCause: checkOut.cause,
            updatedAt: Date.now()
        });
        setIsDayEnded(true);
    } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, 'metrics');
    }
  };

  const getDayRecommendation = () => {
    if (checkIn.sleep < 5 || checkIn.energy < 4) {
      return {
        type: 'alert',
        title: 'Alerta de Agotamiento',
        text: 'Niveles bajos de energía detectados. Prioriza solo 1-2 tareas vitales. Delega, pospón o elimina el resto. Necesitas descansar temprano.',
        color: 'text-[#D4A373] bg-[#FDFBF7] border-[#D4A373]'
      };
    }
    if (checkIn.anxiety > 7) {
      return {
        type: 'warning',
        title: 'Ansiedad Elevada',
        text: 'Tu ansiedad está alta hoy. Evita tomar decisiones financieras grandes hoy. Desglosa las tareas en pasos muy pequeños y respira 4-7-8 antes de cualquier llamada.',
        color: 'text-[#7B8371] bg-[#F9F8F4] border-[#E5E2D9]'
      };
    }
    if (checkIn.energy >= 7 && checkIn.mood >= 7) {
      return {
        type: 'optimal',
        title: 'Estado Óptimo',
        text: 'Día perfecto para tareas de alta demanda cognitiva: cierre de ventas difíciles, estudio o planificación estratégica. Aprovecha este pico de rendimiento.',
        color: 'text-[#A3B18A] bg-[#FDFBF7] border-[#A3B18A]'
      };
    }
    
    return {
      type: 'normal',
      title: 'Día Equilibrado',
      text: 'Tu estado está estable. Mantén tu ritmo planificado y respeta tus micro-hábitos y descansos para no desgastarte prematuramente.',
      color: 'text-[#3E4639] bg-white border-[#E5E2D9]'
    };
  };

  const rec = getDayRecommendation();

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <header className="mb-8">
        <h2 className="text-3xl font-serif tracking-tight mb-2 text-[#3E4639]">Biometría y Rendimiento</h2>
        <p className="text-[#7B8371] text-sm">Ajusta tu día a tu estado fisiológico y psicológico, no al revés.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left Column: Interactive Check-in / Check-out */}
        <div className="space-y-6 flex flex-col">
          {!isDayStarted ? (
            <section className="bg-white border border-[#E5E2D9] rounded-3xl p-6 md:p-8 shadow-sm flex-1">
              <div className="mb-8">
                <h2 className="flex items-center text-xl font-serif text-[#3E4639] mb-1">
                  <Sun className="w-5 h-5 mr-2 opacity-80" />
                  Check-in Matutino
                </h2>
                <p className="text-xs text-[#7B8371]">
                  Sé sincero con tus métricas para que el sistema ajuste tu enfoque ideal.
                </p>
              </div>
              
              <div className="space-y-6">
                {[
                  { label: 'Ánimo', stateKey: 'mood', val: checkIn.mood, desc: '1: Muy bajo - 10: Excelente' },
                  { label: 'Ansiedad', stateKey: 'anxiety', val: checkIn.anxiety, desc: '1: Relajado - 10: Pánico/Alta tensión' },
                  { label: 'Energía Física', stateKey: 'energy', val: checkIn.energy, desc: '1: Agotado - 10: Máxima vitalidad' },
                  { label: 'Calidad de Sueño', stateKey: 'sleep', val: checkIn.sleep, desc: '1: Pésima - 10: Muy reparador' }
                ].map((item, i) => (
                  <div key={i} className="space-y-2">
                    <div className="flex justify-between items-end">
                      <label className="text-xs font-bold uppercase tracking-widest text-[#3E4639]">{item.label}</label>
                      <span className="text-xl font-serif text-[#A3B18A]">{item.val}</span>
                    </div>
                    <input 
                      type="range" min="1" max="10" 
                      value={item.val}
                      onChange={(e) => setCheckIn({...checkIn, [item.stateKey]: parseInt(e.target.value)})}
                      className="w-full h-2 bg-[#E5E2D9] rounded-lg appearance-none cursor-pointer accent-[#3E4639]"
                    />
                    <p className="text-[10px] text-[#7B8371]">{item.desc}</p>
                  </div>
                ))}
              </div>

              <div className="mt-10">
                <Button 
                  onClick={handleStartDay}
                  className="w-full bg-[#3E4639] hover:bg-[#2C3328] text-white rounded-xl shadow-lg shadow-[#3E4639]/20 font-medium py-4 h-auto"
                >
                  Inicializar Día
                </Button>
              </div>
            </section>
          ) : !isDayEnded ? (
            <section className="bg-[#3E4639] text-white border border-[#E5E2D9] rounded-3xl p-6 md:p-8 shadow-xl relative overflow-hidden flex-1">
              <div className="absolute top-0 right-0 w-48 h-48 bg-[#A3B18A] rounded-full blur-3xl opacity-20 -mr-20 -mt-20 pointer-events-none"></div>
              
              <div className="mb-8 relative z-10">
                <h2 className="flex items-center text-xl font-serif text-white mb-1">
                  <Moon className="w-5 h-5 mr-2 opacity-80 text-[#A3B18A]" />
                  Check-out Nocturno
                </h2>
                <p className="text-[10px] uppercase tracking-widest text-[#E5E2D9]">
                  ¿Cómo terminó tu tanque hoy?
                </p>
              </div>
              
              {new Date().getHours() >= 20 || new Date().getHours() < 4 ? (
                <>
                  <div className="space-y-6 relative z-10">
                {[
                  { label: 'Ánimo Final', stateKey: 'mood', val: checkOut.mood, emoji: checkOut.mood > 5 ? '🙂' : '😔' },
                  { label: 'Ansiedad Final', stateKey: 'anxiety', val: checkOut.anxiety, emoji: checkOut.anxiety > 5 ? '😰' : '🧘' },
                  { label: 'Energía Restante', stateKey: 'energy', val: checkOut.energy, emoji: checkOut.energy > 5 ? '⚡' : '🔋' },
                ].map((item, i) => (
                  <div key={i} className="space-y-2">
                    <div className="flex justify-between items-end">
                      <label className="text-xs font-medium text-white/80">{item.label}</label>
                      <span className="text-lg font-mono text-white/90">{item.val} {item.emoji}</span>
                    </div>
                    <input 
                      type="range" min="1" max="10" 
                      value={item.val}
                      onChange={(e) => setCheckOut({...checkOut, [item.stateKey]: parseInt(e.target.value)})}
                      className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-[#D4A373]"
                    />
                  </div>
                ))}

                <div className="pt-4 space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-[#A3B18A]">Causalidad principal (breve)</label>
                  <textarea 
                    value={checkOut.cause}
                    onChange={(e) => setCheckOut({...checkOut, cause: e.target.value})}
                    placeholder="Ej. Terminé abrumado por las re-agendas de leads, o muy motivado tras cerrar la venta."
                    className="w-full h-24 bg-white/10 border border-white/20 rounded-xl p-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-[#A3B18A] resize-none"
                  />
                </div>
              </div>

              <div className="mt-8 relative z-10">
                <Button 
                  onClick={handleEndDay}
                  className="w-full bg-[#A3B18A] hover:bg-[#8D9B75] text-[#3E4639] rounded-xl font-bold py-4 h-auto"
                  disabled={!checkOut.cause}
                >
                  Cerrar Día y Ver Análisis
                </Button>
              </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-center space-y-4 relative z-10 mt-6 border-t border-white/10 pt-10">
                   <div className="bg-white/10 p-4 rounded-full">
                     <Moon className="w-10 h-10 text-[#A3B18A]" />
                   </div>
                   <div>
                     <h3 className="text-lg text-white font-serif mb-1">Cierre en espera</h3>
                     <p className="text-sm text-white/70 max-w-[250px] mx-auto">
                       El check-out nocturno se habilitará automáticamente a partir de las 20:00 hs.
                     </p>
                   </div>
                </div>
              )}
            </section>
          ) : (
            <section className="bg-white border border-[#E5E2D9] rounded-3xl p-6 md:p-8 shadow-sm flex-1 flex flex-col justify-center items-center text-center">
               <div className="w-16 h-16 bg-[#F9F8F4] rounded-full flex items-center justify-center mb-6">
                 <Moon className="w-8 h-8 text-[#3E4639]" />
               </div>
               <h2 className="text-2xl font-serif text-[#3E4639] mb-2">Día Registrado</h2>
               <p className="text-sm text-[#7B8371] mb-6 max-w-sm">
                 Tu estado ha sido guardado. Evalúa tu gráfica de evolución para que mañana ajustes tus estrategias operativas.
               </p>
               <Button variant="outline" className="text-[#3E4639] border-[#E5E2D9] rounded-xl font-medium" onClick={() => {
                 setIsDayStarted(false);
                 setIsDayEnded(false);
                 setCheckOut({ mood: 5, anxiety: 5, energy: 5, cause: '' });
                 // Pop the last "Hoy" to restart loop for demo purposes
                 setHistory(history.slice(0, -1));
               }}>
                 Reiniciar Demo (Nuevo Día)
               </Button>
            </section>
          )}
        </div>

        {/* Right Column: Dashboard / Recommendations */}
        <div className="space-y-6 flex flex-col">
          
          {/* Directive AI / Recommandation */}
          {isDayStarted && !isDayEnded && (
            <section className={`rounded-3xl p-6 border-l-4 shadow-sm animate-in fade-in slide-in-from-top-4 ${rec.color}`}>
              <div className="flex items-start">
                 <AlertCircle className="w-6 h-6 mr-3 mt-0.5 opacity-80" />
                 <div>
                    <h3 className="font-serif text-xl mb-2">{rec.title}</h3>
                    <p className="text-sm leading-relaxed opacity-90">{rec.text}</p>
                 </div>
              </div>
            </section>
          )}

          {/* Evolution Chart */}
          <section className="bg-[#FDFBF7] border border-[#E5E2D9] rounded-3xl p-6 md:p-8 shadow-sm flex-1 flex flex-col">
            <div className="mb-6">
              <h2 className="flex items-center text-xl font-serif text-[#3E4639] mb-1">
                <TrendingUp className="w-5 h-5 mr-2 opacity-80" />
                Evolución de Rendimiento
              </h2>
              <p className="text-[10px] uppercase tracking-widest text-[#7B8371]">
                Índice de bienestar: Mañana vs Noche
              </p>
            </div>
            
            <div className="flex-1 w-full min-h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorCheckin" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3E4639" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3E4639" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorCheckout" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#D4A373" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#D4A373" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#7B8371' }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#7B8371' }} domain={[0, 100]} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: '1px solid #E5E2D9', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                    labelStyle={{ fontWeight: 'bold', color: '#3E4639', marginBottom: '4px' }}
                  />
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E2D9" />
                  <Area type="monotone" dataKey="checkin" name="Inicio (Mañana)" stroke="#3E4639" strokeWidth={3} fillOpacity={1} fill="url(#colorCheckin)" />
                  <Area type="monotone" dataKey="checkout" name="Fin (Noche)" stroke="#D4A373" strokeWidth={3} fillOpacity={1} fill="url(#colorCheckout)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-6 flex flex-wrap justify-center gap-4 text-xs font-medium text-[#7B8371]">
               <div className="flex items-center"><span className="w-3 h-3 rounded-full bg-[#3E4639] mr-2"></span> Mañana</div>
               <div className="flex items-center"><span className="w-3 h-3 rounded-full bg-[#D4A373] mr-2"></span> Noche (Desgaste)</div>
            </div>

            {isDayEnded && checkOut.cause && (
               <div className="mt-8 p-4 bg-white rounded-2xl border border-[#E5E2D9] animate-in fade-in slide-in-from-bottom-2">
                 <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#D4A373] mb-2">Causa del desgaste hoy</h4>
                 <p className="text-sm text-[#3E4639] italic">"{checkOut.cause}"</p>
               </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

