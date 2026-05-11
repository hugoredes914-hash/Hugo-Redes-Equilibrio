import React, { useState, useEffect } from 'react';
import { Brain, Activity, ChevronRight, Loader2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { generateAnchorAndAdvice } from '../lib/gemini';

const defaultChartData = [
  { name: 'Lun', resiliencia: 40, ejecucion: 24 },
  { name: 'Mar', resiliencia: 45, ejecucion: 30 },
  { name: 'Mie', resiliencia: 42, ejecucion: 28 },
  { name: 'Jue', resiliencia: 50, ejecucion: 40 },
  { name: 'Vie', resiliencia: 60, ejecucion: 55 },
  { name: 'Sab', resiliencia: 65, ejecucion: 50 },
  { name: 'Dom', resiliencia: 70, ejecucion: 65 },
];

export default function Dashboard({ onNavigate }: { onNavigate: (view: any) => void }) {
  const currentDate = new Date().toLocaleDateString('es-ES', { month: 'long', day: 'numeric', year: 'numeric' });
  const [tasks, setTasks] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [chartData, setChartData] = useState(defaultChartData);
  
  const [anchor, setAnchor] = useState({
     anchor: "Cada problema es información. Un obstáculo me enseña cómo preparar mejor la próxima oferta.",
     theme: "Mentalidad de Aprendiz",
     recommendation: "Avanza a tu ritmo, una tarea a la vez."
  });
  const [loadingAnchor, setLoadingAnchor] = useState(false);

  useEffect(() => {
     if (!auth.currentUser) return;
     const userId = auth.currentUser.uid;
     
     // Fetch tasks (MITs and Habits)
     const qTasks = query(collection(db, 'users', userId, 'tasks'));
     const unsubTasks = onSnapshot(qTasks, (snapshot) => {
        setTasks(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
     }, (err) => handleFirestoreError(err, OperationType.LIST, 'tasks'));

     // Fetch metrics
     const qMetrics = query(collection(db, 'users', userId, 'metrics'), orderBy('date', 'asc'), limit(7));
     const unsubMetrics = onSnapshot(qMetrics, (snapshot) => {
        const metricsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setMetrics(metricsData);
        
        if (metricsData.length > 0) {
            const newChartData = metricsData.map((d: any) => {
                const dateStr = d.date.split('-');
                const label = dateStr.length === 3 ? `${dateStr[2]}/${dateStr[1]}` : d.date;
                const resiliencia = (d.checkinMood + d.checkinEnergy + (10 - d.checkinAnxiety)) * 3.33; // out of ~100
                const ejecucion = d.checkoutMood > 0 ? (d.checkoutEnergy + (10 - d.checkoutAnxiety)) * 5 : 0; // approximate execution rate
                return { name: label, resiliencia: Math.round(resiliencia), ejecucion: Math.round(ejecucion) };
            });
            setChartData(newChartData);
        }
     }, (error) => handleFirestoreError(error, OperationType.LIST, 'metrics'));

     return () => {
         unsubTasks();
         unsubMetrics();
     }
  }, []);
  
  const fetchedRef = React.useRef(false);

  useEffect(() => {
     const runGemini = async () => {
         // Genera el ancla del día independientemente de si hay tareas o métricas, pero se ajusta
         const today = new Date().toISOString().split('T')[0];
         const todayMetric = metrics.find(m => m.date === today);
         const todayMits = tasks.filter(t => t.type === 'mit' && t.date === today);
         
         setLoadingAnchor(true);
         const statusParams = todayMetric 
             ? { mood: todayMetric.checkinMood, energy: todayMetric.checkinEnergy, anxiety: todayMetric.checkinAnxiety }
             : { mood: 5, energy: 5, anxiety: 5 }; // default neutral
             
         const result = await generateAnchorAndAdvice(statusParams, todayMits);
         setAnchor(result);
         setLoadingAnchor(false);
     };
     
     // Only run once when we get initial valid data or after 1 sec
     if (!loadingAnchor && !fetchedRef.current) {
         fetchedRef.current = true;
         runGemini();
     }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, metrics]);

  const today = new Date().toISOString().split('T')[0];
  const todayMits = tasks.filter(t => t.type === 'mit' && t.date === today);
  const doneMits = todayMits.filter(t => t.done).length;
  const mitsProgress = todayMits.length > 0 ? Math.round((doneMits / todayMits.length) * 100) : 0;

  const globalHabits = tasks.filter(t => t.type === 'habit');
  const doneHabits = globalHabits.filter(t => t.done).length;
  const habitsProgress = globalHabits.length > 0 ? Math.round((doneHabits / globalHabits.length) * 100) : 0;
  
  const todayMetric = metrics.find(m => m.date === today);
  const energyLevel = todayMetric ? Math.round((todayMetric.checkinEnergy / 10) * 100) : 0;
  const energyLabel = energyLevel > 70 ? 'Óptimo' : energyLevel > 40 ? 'Adecuado' : 'Agotado';

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <header className="flex flex-col md:flex-row md:justify-between md:items-end gap-4 mb-2">
        <div className="space-y-1">
          <h1 className="text-4xl font-serif italic text-[#3E4639]">Hola, Hugo</h1>
          <p className="text-[#7B8371] text-sm italic">"La calma es la fundación de la acción de alto impacto."</p>
        </div>
        <div className="hidden md:flex items-center gap-4">
          <div className="text-right">
            <div className="text-xs uppercase tracking-widest opacity-50 mb-1">Fecha de hoy</div>
            <div className="text-lg font-medium text-[#3E4639]">{currentDate}</div>
          </div>
          <div className="w-12 h-12 bg-[#A3B18A] rounded-full flex items-center justify-center text-white text-xl">
            H
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-fr">
        {/* Resiliencia Emocional */}
        <section className="bg-white rounded-3xl p-6 border border-[#E5E2D9] shadow-sm flex flex-col justify-between cursor-pointer hover:shadow-md transition" onClick={() => onNavigate('emotional')}>
          <div className="flex justify-between items-start mb-6">
            <div className="space-y-1">
              <h2 className="text-lg font-serif text-[#3E4639]">Estabilidad Emocional</h2>
              <p className="text-xs text-[#7B8371]">Hábitos completados ({doneHabits}/{globalHabits.length})</p>
            </div>
            <div className="bg-[#F9F8F4] p-2 rounded-xl border border-[#E5E2D9]">
              <Brain className="text-[#A3B18A] w-5 h-5" />
            </div>
          </div>
          <div>
            <Progress value={habitsProgress} className="h-2 mb-4 [&>div]:bg-[#A3B18A] bg-[#F9F8F4]" />
            <div className="flex items-center text-sm font-medium text-[#A3B18A]">
              Ir al diario de gratitud <ChevronRight className="w-4 h-4 ml-1" />
            </div>
          </div>
        </section>

        {/* Ejecución Diaria */}
        <section className="bg-[#3E4639] rounded-3xl p-6 text-white shadow-xl flex flex-col justify-between cursor-pointer hover:scale-[1.01] transition" onClick={() => onNavigate('execution')}>
          <div className="flex justify-between items-start mb-6">
            <div className="space-y-1">
              <div className="text-xs uppercase tracking-widest opacity-60 mb-1">MIT (Prioridades)</div>
              <h2 className="text-xl font-serif">Ejecución Diaria</h2>
            </div>
            <div className="bg-white/10 p-2 rounded-xl border border-white/5">
              <Activity className="text-white opacity-80 w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="text-xs mb-2 opacity-80">Tareas MIT ({doneMits}/{todayMits.length})</div>
            <Progress value={mitsProgress} className="h-2 mb-4 bg-white/10 [&>div]:bg-[#D4A373]" />
            <div className="flex items-center text-sm font-medium text-[#D4A373]">
              Continuar tareas <ChevronRight className="w-4 h-4 ml-1" />
            </div>
          </div>
        </section>

        {/* Carga de Estrés */}
        <section className="bg-[#E9E7E0] rounded-3xl p-6 flex flex-col justify-between cursor-pointer hover:shadow-md transition" onClick={() => onNavigate('health')}>
          <div className="space-y-3 mb-4">
            <h2 className="text-xl font-serif text-[#3E4639]">Monitor de Energía</h2>
            <p className="text-sm text-[#7B8371]">Descanso estratégico preventivo.</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-4xl font-serif text-[#3E4639]">{energyLevel}%</div>
            <div className="flex-1">
               <div className="text-[10px] uppercase tracking-widest text-[#7B8371] mb-2">Nivel: {energyLabel}</div>
               <div className="h-2 w-full bg-[#D1CFCA] rounded-full">
                  <div className="h-full bg-[#3E4639] rounded-full transition-all" style={{ width: `${energyLevel}%` }}></div>
               </div>
            </div>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-2">
        {/* MIT Activities */}
        <section className="bg-white rounded-3xl p-6 border border-[#E5E2D9] shadow-sm">
          <div className="mb-6">
            <h2 className="text-lg font-serif text-[#3E4639] mb-1">Actividades Estratégicas (MIT)</h2>
            <p className="text-xs text-[#7B8371]">Cumplir estas 3 hace que el día valga la pena.</p>
          </div>
          <div className="space-y-4">
             {todayMits.length === 0 && <p className="text-sm text-[#7B8371] italic text-center py-4">No has registrado MIT para hoy.</p>}
             {todayMits.map((mit) => (
                 <div key={mit.id} className={`flex items-center gap-3 p-3 rounded-xl border ${mit.done ? 'bg-[#F9F8F4] border-[#F0EEE6]' : 'bg-white border-[#D4A373]/30 shadow-sm'}`}>
                    <div className={`w-5 h-5 rounded flex items-center justify-center border ${mit.done ? 'bg-[#A3B18A] border-[#A3B18A]' : 'border-[#D4A373]'}`}>
                       {mit.done && <div className="w-2 h-2 bg-white rounded-[1px]"></div>}
                    </div>
                    <div className="flex-1">
                       <p className={`text-sm font-medium ${mit.done ? 'text-[#4A4F41] line-through opacity-70' : 'text-[#3E4639]'}`}>{mit.text}</p>
                       <p className={`text-[10px] uppercase tracking-widest font-bold mt-0.5 ${mit.done ? 'text-[#7B8371]' : 'text-[#D4A373]'}`}>{mit.done ? 'Completado' : 'Planificado'}</p>
                    </div>
                 </div>
             ))}
          </div>
        </section>

        {/* Ancla del Dia */}
        <section className="bg-white rounded-3xl p-8 border border-[#E5E2D9] shadow-sm flex flex-col justify-between relative overflow-hidden">
          {loadingAnchor && (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-[#A3B18A] animate-spin" />
            </div>
          )}
          <div className="flex justify-between items-start mb-6">
            <div className="space-y-2">
              <h2 className="text-xl font-serif text-[#3E4639]">Ancla del Día (PNL)</h2>
              <p className="text-sm text-[#7B8371]">Asesoría de IA en base a tu estado de biometría actual.</p>
            </div>
            <div className="bg-[#F9F8F4] px-3 py-1 rounded-full text-xs font-medium text-[#A3B18A] border border-[#A3B18A]">
              ✨ Inteligencia Artificial
            </div>
          </div>
          
          <div className="my-2 p-6 bg-[#FDFBF7] rounded-2xl border-l-4 border-[#D4A373] flex-1 flex flex-col justify-center">
            <div className="text-sm md:text-md text-[#3E4639] leading-relaxed italic mb-4">
              "{anchor.anchor}"
            </div>
            <div className="text-[10px] text-[#D4A373] uppercase font-bold text-right pt-2 border-t border-[#F0EEE6]">
              {anchor.theme}
            </div>
          </div>

          <div className="mt-6 flex justify-end">
             <div className="w-full text-xs text-[#7B8371] p-3 bg-[#F9F8F4] rounded-xl border border-[#E5E2D9]">
               <strong>Dato Estratégico:</strong> {anchor.recommendation}
             </div>
          </div>
        </section>
      </div>
      
      {/* Chart Section */}
      <section className="bg-white rounded-3xl p-6 md:p-8 border border-[#E5E2D9] shadow-sm">
        <div className="mb-6">
          <h2 className="text-xl font-serif text-[#3E4639] mb-1">Evolución: Resiliencia vs. Ejecución</h2>
          <p className="text-sm text-[#7B8371]">A medida que mejora tu resiliencia, tu capacidad de ejecución escala.</p>
        </div>
        <div className="h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E2D9" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#7B8371' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#7B8371' }} domain={[0, 100]} />
              <Tooltip 
                contentStyle={{ borderRadius: '12px', border: '1px solid #E5E2D9', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', backgroundColor: '#fff' }}
              />
              <Line type="monotone" dataKey="resiliencia" stroke="#A3B18A" strokeWidth={4} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} name="Resiliencia Emocional" />
              <Line type="monotone" dataKey="ejecucion" stroke="#D4A373" strokeWidth={4} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} name="Tasa de Ejecución" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

    </div>
  );
}
