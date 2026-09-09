import { businessDate, daysBetween, calendarDateTime } from '../lib/dates';
import React, { useState, useEffect } from 'react';
import { Brain, Activity, ChevronRight, Loader2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { generateAnchorAndAdvice } from '../lib/gemini';

export default function Dashboard({ onNavigate }: { onNavigate: (view: any) => void }) {
  const currentDate = new Date().toLocaleDateString('es-ES', { month: 'long', day: 'numeric', year: 'numeric' });
  const [tasks, setTasks] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [tasksLoaded,setTasksLoaded] = useState(false);
  const [metricsLoaded,setMetricsLoaded] = useState(false);
  const [leads, setLeads] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  
  const [anchor, setAnchor] = useState({
     source: "Orientación local",
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
        setTasksLoaded(true);
     }, (err) => handleFirestoreError(err, OperationType.LIST, 'tasks'));

     // Fetch metrics
     const qMetrics = query(collection(db, 'users', userId, 'metrics'), orderBy('date', 'desc'), limit(7));
     const unsubMetrics = onSnapshot(qMetrics, (snapshot) => {
        // Reverse to get ascending chronological order for charts
        const metricsData = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) })).reverse();
        
        const uniqueMetricsMap = new Map();
        metricsData.forEach(m => uniqueMetricsMap.set(m.date, m));
        const uniqueMetrics = Array.from(uniqueMetricsMap.values());
        
        setMetrics(uniqueMetrics);
        setMetricsLoaded(true);
     }, (error) => handleFirestoreError(error, OperationType.LIST, 'metrics'));

     // Fetch leads for CRM summary
     const qLeads = query(collection(db, 'users', userId, 'leads'), orderBy('createdAt', 'desc'));
     const unsubLeads = onSnapshot(qLeads, (snapshot) => {
        setLeads(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter((l:any)=>!l.deletedAt));
     }, (error) => handleFirestoreError(error, OperationType.LIST, 'leads'));

     return () => {
         unsubTasks();
         unsubMetrics();
         unsubLeads();
     }
  }, []);
  
  useEffect(() => {
     if (metrics.length === 0) setChartData([]);
     if (metrics.length > 0) {
         const newChartData = metrics.map((d: any) => {
             const dateStr = d.date.split('-');
             const label = dateStr.length === 3 ? `${dateStr[2]}/${dateStr[1]}` : d.date;
             
             // Resiliencia (Estado del Check-in Matutino)
             const resiliencia = ((d.checkinMood + d.checkinEnergy + (10 - d.checkinAnxiety)) / 3) * 10;
             
             // Ejecución = % de Actividades (MIT) completadas + Ponderación del Check-out si no hay tareas
             const dayMits = tasks.filter(t => t.type === 'mit' && t.date === d.date);
             let ejecucion = 0;
             
             if (dayMits.length > 0) {
                 const doneMits = dayMits.filter(t => t.done).length;
                 ejecucion = (doneMits / dayMits.length) * 100;
             } else if (d.checkoutMood > 0) {
                 ejecucion = ((d.checkoutEnergy + (10 - d.checkoutAnxiety)) / 2) * 10;
             }
             
             return { name: label, resiliencia: Math.round(resiliencia), ejecucion: Math.round(ejecucion) };
         });
         setChartData(newChartData);
     }
  }, [metrics, tasks]);

  const fetchedRef = React.useRef(false);

  useEffect(() => {
     const runGemini = async () => {
         // Genera el ancla del día independientemente de si hay tareas o métricas, pero se ajusta
         const today = businessDate();
         const todayMetric = metrics.find(m => m.date === today);
         const todayMits = tasks.filter(t => t.type === 'mit' && t.date === today);
         
         setLoadingAnchor(true);
         const statusParams = todayMetric 
             ? { mood: todayMetric.checkinMood, energy: todayMetric.checkinEnergy, anxiety: todayMetric.checkinAnxiety }
             : { mood: 5, energy: 5, anxiety: 5 }; // default neutral
             
         try {const result = await generateAnchorAndAdvice(statusParams, todayMits); setAnchor(result);} catch { /* session invalidated; retain local guidance */ } finally {setLoadingAnchor(false);}
     };
     
     // Only run once when we get initial valid data or after 1 sec
     if (tasksLoaded && metricsLoaded && !loadingAnchor && !fetchedRef.current) {
         fetchedRef.current = true;
         runGemini();
     }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, metrics, tasksLoaded, metricsLoaded]);

  const today = businessDate();
  const todayMits = tasks.filter(t => t.type === 'mit' && t.date === today);
  const doneMits = todayMits.filter(t => t.done).length;
  const mitsProgress = todayMits.length > 0 ? Math.round((doneMits / todayMits.length) * 100) : 0;

  const globalHabits = tasks.filter(t => t.type === 'habit');
  const doneHabits = globalHabits.filter(t => t.done).length;
  const habitsProgress = globalHabits.length > 0 ? Math.round((doneHabits / globalHabits.length) * 100) : 0;
  
  const todayMetric = metrics.find(m => m.date === today);
  const energyScore = todayMetric ? (todayMetric.checkinMood + todayMetric.checkinEnergy + (10 - todayMetric.checkinAnxiety) + (todayMetric.checkinSleep || Number(todayMetric.checkinEnergy))) / 4 : 0;
  const energyLevel = todayMetric ? Math.round((energyScore / 10) * 100) : 0;
  const energyLabel = !todayMetric ? 'No registrado' : energyLevel > 70 ? 'Óptimo' : energyLevel > 40 ? 'Adecuado' : 'Agotado';

  // CRM Summary calcs
  const captaciones = leads.filter(l => l.type === 'captacion');
  const ventas = leads.filter(l => l.type !== 'captacion');

  const activeCaptaciones = captaciones.filter(l => l.stage !== 'Perdido' && l.stage !== 'Cierre (Captada)');
  const totalCaptacionesCerradas = captaciones.filter(l => l.stage === 'Cierre (Captada)').length;

  const activeVentas = ventas.filter(l => l.stage !== 'Perdido' && l.stage !== 'Cierre');
  const totalPipelineVentas = activeVentas.reduce((acc, lead) => acc + (Number(lead.propertyValue) || 0), 0);
  const totalVentasCerradas = ventas.filter(l => l.stage === 'Cierre').length;

  const pendingActions = leads.filter(l => {
    if (l.stage === 'Perdido' || l.stage === 'Cierre' || l.stage === 'Cierre (Captada)') return false;
    if (!l.nextActionDate) return false;
    const actionDate = businessDate(l.nextActionDate);
    return actionDate <= today;
  });

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <header className="flex flex-col md:flex-row md:justify-between md:items-end gap-4 mb-2">
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-widest text-[#A3B18A] font-bold">Identidad Principal</div>
          <h1 className="text-4xl font-serif italic text-[#3E4639]">Asesor Inmobiliario Profesional</h1>
          <p className="text-[#7B8371] text-sm italic">"La constancia diaria es la que construye al verdadero profesional inmobiliario."</p>
        </div>
        <div className="hidden md:flex items-center gap-4">
          <div className="text-right">
            <div className="text-xs uppercase tracking-widest opacity-50 mb-1">Fecha de hoy</div>
            <div className="text-lg font-medium text-[#3E4639]">{currentDate}</div>
          </div>
          <div className="w-12 h-12 bg-[#A3B18A] rounded-full flex items-center justify-center text-white text-xl shadow-inner">
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
              <p className="text-xs text-[#7B8371]">Votos de identidad ({doneHabits}/{globalHabits.length})</p>
            </div>
            <div className="bg-[#F9F8F4] p-2 rounded-xl border border-[#E5E2D9]">
              <Brain className="text-[#A3B18A] w-5 h-5" />
            </div>
          </div>
          <div>
            <Progress value={habitsProgress} className="h-2 mb-4 [&>div]:bg-[#A3B18A] bg-[#F9F8F4]" />
            <div className="flex items-center text-sm font-medium text-[#A3B18A]">
              Ir a calibración mental <ChevronRight className="w-4 h-4 ml-1" />
            </div>
          </div>
        </section>

        {/* Ejecución Diaria */}
        <section className="bg-[#3E4639] rounded-3xl p-6 text-white shadow-xl flex flex-col justify-between cursor-pointer hover:scale-[1.01] transition" onClick={() => onNavigate('execution')}>
          <div className="flex justify-between items-start mb-6">
            <div className="space-y-1">
              <div className="text-xs uppercase tracking-widest opacity-60 mb-1">MIT (Prioridades de hoy)</div>
              <h2 className="text-xl font-serif">Ejecución del Asesor</h2>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-2">
        {/* MIT Activities */}
        <section className="bg-white rounded-3xl p-6 border border-[#E5E2D9] shadow-sm flex flex-col justify-between">
          <div className="mb-6">
            <h2 className="text-lg font-serif text-[#3E4639] mb-1">Actividades Estratégicas (MIT)</h2>
            <p className="text-xs text-[#7B8371]">Cumplir estas 3 hace que el día valga la pena.</p>
          </div>
          <div className="space-y-4">
             {todayMits.length === 0 && <p className="text-sm text-[#7B8371] italic text-left py-4">No has registrado prioridades para hoy.</p>}
             {todayMits.map((mit) => (
                 <div key={mit.id} className={`flex items-center gap-3 p-3 rounded-xl border ${mit.done ? 'bg-[#F9F8F4] border-[#F0EEE6]' : 'bg-white border-[#D4A373]/30 shadow-sm'}`}>
                    <div className={`w-5 h-5 rounded flex items-center justify-center border shrink-0 ${mit.done ? 'bg-[#A3B18A] border-[#A3B18A]' : 'border-[#D4A373]'}`}>
                       {mit.done && <div className="w-2 h-2 bg-white rounded-[1px]"></div>}
                    </div>
                    <div className="flex-1 min-w-0">
                       <p className={`text-sm font-medium truncate ${mit.done ? 'text-[#4A4F41] line-through opacity-70' : 'text-[#3E4639]'}`}>{mit.text}</p>
                       <p className={`text-[10px] uppercase tracking-widest font-bold mt-0.5 ${mit.done ? 'text-[#7B8371]' : 'text-[#D4A373]'}`}>{mit.done ? 'Completado' : 'Planificado'}</p>
                    </div>
                 </div>
             ))}
          </div>
        </section>

        {/* CRM Overview */}
        <section className="bg-white rounded-3xl p-6 border border-[#E5E2D9] shadow-sm flex flex-col gap-6 text-[#3E4639] cursor-pointer hover:shadow-md transition" onClick={() => onNavigate('professional')}>
          <div className="flex justify-between items-start">
             <div>
                <h2 className="text-lg font-serif mb-1">Tu Negocio</h2>
                <p className="text-xs text-[#7B8371]">Gestión Comercial y Captaciones.</p>
             </div>
             <div className="p-2 border border-[#E5E2D9] rounded-xl bg-[#F9F8F4]">
                <Activity className="w-5 h-5 text-[#A3B18A]" />
             </div>
          </div>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 border-b border-[#E5E2D9] pb-4">
               <div>
                  <div className="text-[10px] uppercase tracking-widest text-[#7B8371] mb-1">Ventas Activas</div>
                  <div className="text-2xl font-serif">{activeVentas.length} <span className="text-xs font-sans text-[#7B8371]">leads</span></div>
                  <div className="text-[10px] text-[#A3B18A] mt-1">{totalVentasCerradas} cierres org.</div>
               </div>
               <div>
                  <div className="text-[10px] uppercase tracking-widest text-[#7B8371] mb-1">Captaciones Act.</div>
                  <div className="text-2xl font-serif">{activeCaptaciones.length} <span className="text-xs font-sans text-[#7B8371]">leads</span></div>
                  <div className="text-[10px] text-[#A3B18A] mt-1">{totalCaptacionesCerradas} captadas org.</div>
               </div>
            </div>
            
            <div className="flex justify-between items-end pb-2">
               <div>
                 <div className="text-[10px] uppercase tracking-widest text-[#7B8371] mb-1">Valor Potencial Estimado (Ventas)</div>
                 <div className="text-2xl font-medium">${totalPipelineVentas.toLocaleString()}</div>
               </div>
            </div>

            {pendingActions.length > 0 && (
              <div className="pt-3 border-t border-[#E5E2D9]">
                <div className="text-[10px] items-center font-bold uppercase tracking-widest text-red-600 mb-2 flex gap-1">
                  Acciones Requeridas Hoy <span className="bg-red-100 text-red-700 px-1.5 rounded-full text-[8px]">{pendingActions.length}</span>
                </div>
                <div className="space-y-2">
                  {pendingActions.slice(0, 3).map(lead => (
                    <div key={lead.id} className="text-xs flex justify-between bg-red-50 p-2 rounded-lg border border-red-100">
                      <span className="font-medium text-red-800 truncate" title={lead.name}>{lead.name}</span>
                      <span className="text-red-600 shrink-0 text-[10px] capitalize truncate max-w-[80px] text-right">{lead.type === 'captacion' ? 'Capt:' : 'Venta:'} {lead.stage}</span>
                    </div>
                  ))}
                  {pendingActions.length > 3 && (
                    <div className="text-center text-[10px] text-[#7B8371] mt-1">
                      +{pendingActions.length - 3} más pendientes
                    </div>
                  )}
                </div>
              </div>
            )}
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
              ✨ {anchor.source}
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
      <section className="bg-white rounded-3xl p-6 md:p-8 border border-[#E5E2D9] shadow-sm relative group">
        <div className="mb-6">
          <h2 className="text-xl font-serif text-[#3E4639] mb-1">Evolución: Resiliencia vs. Ejecución</h2>
          <p className="text-sm text-[#7B8371] mb-2">
            Compara tu estado de ánimo matutino con tu tasa de productividad real.
          </p>
          <div className="flex flex-wrap gap-4 text-[10px] uppercase tracking-widest text-[#7B8371]">
             <div className="bg-[#F9F8F4] px-3 py-1.5 rounded-lg border border-[#E5E2D9]">
               <strong>Resiliencia:</strong> Promedio de tu Check-in matutino (Ánimo + Energía - Ansiedad).
             </div>
             <div className="bg-[#F9F8F4] px-3 py-1.5 rounded-lg border border-[#E5E2D9]">
               <strong>Tasa de Ejecución:</strong> Porcentaje de tareas MIT completadas (o nivel de Check-out).
             </div>
          </div>
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
