import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Target, CheckCircle2, History, Plus } from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, deleteDoc } from 'firebase/firestore';

export default function ExecutionModule() {
  const [mits, setMits] = useState<any[]>([]);
  const [allMits, setAllMits] = useState<any[]>([]);
  const [newMit, setNewMit] = useState('');
  const [newMitTime, setNewMitTime] = useState('');
  const [newMitLocation, setNewMitLocation] = useState('');

  const [habits, setHabits] = useState<any[]>([]);
  const [newHabit, setNewHabit] = useState('');
  const [newHabitIdentity, setNewHabitIdentity] = useState('');
  const [newHabitIsTwoMin, setNewHabitIsTwoMin] = useState(false);
  const [isAddingHabitExpanded, setIsAddingHabitExpanded] = useState(false);

  const [logs, setLogs] = useState<any[]>([]);
  const [newLog, setNewLog] = useState({ done: '', plannedNotDone: '', wouldLikeToDo: '', failureCause: '' });
  const [isAddingLog, setIsAddingLog] = useState(false);

  useEffect(() => {
    if (!auth.currentUser) return;
    const userId = auth.currentUser.uid;
    const today = new Date().toISOString().split('T')[0];

    const qTasks = query(collection(db, 'users', userId, 'tasks'));
    const unsubTasks = onSnapshot(qTasks, (snapshot) => {
      const allTasks = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any));
      const mitsTasks = allTasks.filter(t => t.type === 'mit');
      setAllMits(mitsTasks);
      setMits(mitsTasks.filter(t => t.date === today));
      setHabits(allTasks.filter(t => t.type === 'habit'));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'tasks'));

    const qLogs = query(collection(db, 'users', userId, 'activityLogs'), where('date', '==', today));
    const unsubLogs = onSnapshot(qLogs, (snapshot) => {
      setLogs(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'activityLogs'));

    return () => {
      unsubTasks();
      unsubLogs();
    };
  }, []);

  const addMit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMit.trim() || !auth.currentUser) return;
    const today = new Date().toISOString().split('T')[0];
    try {
      await addDoc(collection(db, 'users', auth.currentUser.uid, 'tasks'), {
        userId: auth.currentUser.uid,
        type: 'mit',
        text: newMit,
        time: newMitTime,
        location: newMitLocation,
        done: false,
        date: today,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      setNewMit('');
      setNewMitTime('');
      setNewMitLocation('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'tasks');
    }
  };

  const toggleTask = async (id: string, currentDone: boolean) => {
    if (!auth.currentUser) return;
    try {
      await updateDoc(doc(db, 'users', auth.currentUser.uid, 'tasks', id), {
        done: !currentDone,
        updatedAt: Date.now()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'tasks');
    }
  };

  const deleteTask = async (id: string) => {
    if (!auth.currentUser) return;
    try {
      await deleteDoc(doc(db, 'users', auth.currentUser.uid, 'tasks', id));
    } catch (error) {
       handleFirestoreError(error, OperationType.DELETE, 'tasks');
    }
  };

  const addHabit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHabit.trim() || !auth.currentUser) return;
    try {
      await addDoc(collection(db, 'users', auth.currentUser.uid, 'tasks'), {
        userId: auth.currentUser.uid,
        type: 'habit',
        text: newHabit,
        identityVote: newHabitIdentity,
        isTwoMinute: newHabitIsTwoMin,
        done: false,
        date: '',
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      setNewHabit('');
      setNewHabitIdentity('');
      setNewHabitIsTwoMin(false);
      setIsAddingHabitExpanded(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'tasks');
    }
  };

  const addActivityLog = async () => {
    if (!auth.currentUser) return;
    const today = new Date().toISOString().split('T')[0];
    try {
      await addDoc(collection(db, 'users', auth.currentUser.uid, 'activityLogs'), {
        userId: auth.currentUser.uid,
        done: newLog.done,
        plannedNotDone: newLog.plannedNotDone,
        wouldLikeToDo: newLog.wouldLikeToDo,
        failureCause: newLog.failureCause,
        date: today,
        createdAt: Date.now()
      });
      setNewLog({ done: '', plannedNotDone: '', wouldLikeToDo: '', failureCause: '' });
      setIsAddingLog(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'activityLogs');
    }
  };

  const deleteLog = async (id: string) => {
    if (!auth.currentUser) return;
    try {
      await deleteDoc(doc(db, 'users', auth.currentUser.uid, 'activityLogs', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'activityLogs');
    }
  };

  const positiveLogs = logs.filter(l => l.plannedNotDone === '+').length;
  const negativeLogs = logs.filter(l => l.plannedNotDone === '-').length;
  const neutralLogs = logs.filter(l => l.plannedNotDone === '=').length;
  
  const completedHabits = habits.filter(h => h.done).length;
  const totalHabits = habits.length;
  const habitsProgress = totalHabits > 0 ? Math.round((completedHabits / totalHabits) * 100) : 0;

  const mitsByDate = allMits.reduce((acc: any, mit: any) => {
      if (!mit.date) return acc;
      if (!acc[mit.date]) acc[mit.date] = [];
      acc[mit.date].push(mit);
      return acc;
  }, {});

  const pastDatesKeys = Object.keys(mitsByDate)
      .filter(date => date !== new Date().toISOString().split('T')[0])
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
      .slice(0, 7);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <header className="mb-8">
        <h2 className="text-3xl font-serif tracking-tight mb-2 text-[#3E4639]">Ejecución Diaria</h2>
        <p className="text-[#7B8371] text-sm">Micro-hábitos y las 3 Actividades Importantes (MIT).</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* MITs */}
        <section className="lg:col-span-1 flex flex-col gap-6">
          <div className="bg-[#FDFBF7] border border-[#E5E2D9] rounded-3xl p-6 shadow-sm">
            <div className="mb-6">
              <h2 className="flex items-center text-xl font-serif text-[#3E4639] mb-1">
                <Target className="w-5 h-5 mr-2 opacity-80" />
                Regla de 3 (MIT)
              </h2>
              <p className="text-[10px] uppercase tracking-widest text-[#D4A373]">
                Si te pierdes, vuelve aquí.
              </p>
            </div>
            
            <div className="space-y-4">
                {mits.length === 0 && <p className="text-sm text-[#7B8371] italic text-center py-4">No has agregado tareas MIT para hoy.</p>}
               {mits.map((mit) => (
                  <div key={mit.id} className="group flex items-start justify-between bg-white p-3 rounded-xl border border-[#F0EEE6] hover:border-[#D4A373]/50 transition-colors shadow-sm">
                     <div className="flex items-start space-x-3 flex-1 cursor-pointer" onClick={() => toggleTask(mit.id, mit.done)}>
                         <Checkbox checked={mit.done} className="mt-0.5 data-[state=checked]:bg-[#A3B18A] data-[state=checked]:border-[#A3B18A]" />
                         <div className="flex flex-col">
                             <span className={`text-sm ${mit.done ? 'text-[#7B8371] opacity-50 line-through' : 'text-[#3E4639] font-medium'}`}>
                               {mit.text}
                             </span>
                             {(mit.time || mit.location) && (
                                <span className="text-[10px] text-[#A3B18A] uppercase tracking-widest mt-1">
                                  Intención: Yo haré esto a las {mit.time || '[Hora]'} en {mit.location || '[Lugar]'}
                                </span>
                             )}
                         </div>
                     </div>
                     <button onClick={() => deleteTask(mit.id)} className="text-[#D4A373] opacity-0 group-hover:opacity-100 transition-opacity text-xs font-medium ml-2">Eliminar</button>
                  </div>
               ))}
               {mits.length < 3 && (
                  <form onSubmit={addMit} className="flex flex-col gap-2 mt-4 bg-[#F9F8F4] p-3 rounded-xl border border-[#E5E2D9]">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-[#7B8371] mb-1">Nueva Intención de Implementación</span>
                      <Input 
                        value={newMit}
                        onChange={(e) => setNewMit(e.target.value)}
                        placeholder="Conducta (Ej. Prospección)"
                        className="bg-white border-[#E5E2D9] text-sm focus-visible:ring-[#D4A373]"
                      />
                      <div className="flex gap-2">
                          <Input 
                            value={newMitTime}
                            onChange={(e) => setNewMitTime(e.target.value)}
                            placeholder="Hora"
                            className="bg-white border-[#E5E2D9] text-sm focus-visible:ring-[#D4A373] flex-1"
                          />
                          <Input 
                            value={newMitLocation}
                            onChange={(e) => setNewMitLocation(e.target.value)}
                            placeholder="Lugar"
                            className="bg-white border-[#E5E2D9] text-sm focus-visible:ring-[#D4A373] flex-1"
                          />
                      </div>
                      <Button type="submit" className="bg-[#3E4639] hover:bg-[#2C3328] text-white w-full mt-2">Agregar Intención</Button>
                  </form>
               )}
            </div>
          </div>
          
          {/* Historial MITs */}
          <div className="bg-white border border-[#E5E2D9] rounded-3xl p-6 shadow-sm">
             <h3 className="font-serif text-[#3E4639] mb-4 flex items-center">
               <History className="w-4 h-4 mr-2" /> Historial MITs
             </h3>
             {pastDatesKeys.length === 0 ? (
                <p className="text-xs text-[#7B8371] italic">No hay historial de días anteriores aún.</p>
             ) : (
                <div className="space-y-4">
                   {pastDatesKeys.map((dateStr) => {
                      const dayMits = mitsByDate[dateStr];
                      const completed = dayMits.filter((m: any) => m.done).length;
                      const allDone = completed === dayMits.length && dayMits.length > 0;
                      
                      return (
                        <div key={dateStr} className="border-b border-[#F0EEE6] pb-3 last:border-0">
                           <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-bold text-[#7B8371] uppercase tracking-wider">{dateStr}</span>
                              <span className={`text-[10px] px-2 py-1 rounded font-bold ${allDone ? 'bg-[#A3B18A] text-white' : 'bg-[#E5E2D9] text-[#7B8371]'}`}>
                                 {completed}/{dayMits.length}
                              </span>
                           </div>
                           <ul className="space-y-1">
                              {dayMits.map((m: any) => (
                                 <li key={m.id} className="text-xs flex items-center text-[#7B8371]">
                                    <CheckCircle2 className={`w-3 h-3 mr-1 ${m.done ? 'text-[#A3B18A]' : 'text-gray-300'}`} />
                                    <span className={m.done ? 'line-through opacity-70' : ''}>{m.text}</span>
                                 </li>
                              ))}
                           </ul>
                        </div>
                      );
                   })}
                </div>
             )}
          </div>
        </section>

        {/* Habit Scorecard */}
        <section className="lg:col-span-2 bg-white rounded-3xl p-6 md:p-8 flex flex-col border border-[#E5E2D9] shadow-sm">
          <div className="mb-6 flex justify-between items-start">
            <div>
              <h2 className="flex items-center text-xl font-serif text-[#3E4639] mb-1">
                <History className="w-5 h-5 mr-2 opacity-80" />
                Habit Scorecard Diario
              </h2>
              <p className="text-xs text-[#7B8371]">
                Clasifica tus acciones automáticas de hoy como positivas (+), negativas (-) o neutras (=).
              </p>
            </div>
            {logs.length > 0 && (
              <div className="flex space-x-2 text-xs">
                <span className="bg-[#A3B18A]/10 text-[#A3B18A] px-2 py-1 rounded font-bold">{positiveLogs} +</span>
                <span className="bg-red-500/10 text-red-600 px-2 py-1 rounded font-bold">{negativeLogs} -</span>
                <span className="bg-gray-100 text-gray-500 px-2 py-1 rounded font-bold">{neutralLogs} =</span>
              </div>
            )}
          </div>
          
          <div className="overflow-x-auto flex-1">
             <table className="w-full text-xs text-left">
                <thead className="text-[10px] uppercase tracking-widest text-[#7B8371] border-b border-[#F0EEE6]">
                   <tr>
                      <th className="px-4 py-3 font-normal">Hábito / Acción Automática</th>
                      <th className="px-4 py-3 font-normal">Evaluación</th>
                      <th className="px-4 py-3 font-normal">Nota / Efecto</th>
                      <th className="px-4 py-3 font-normal text-right"></th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-[#F0EEE6] text-[#3E4639]">
                   {logs.map((log) => (
                       <tr key={log.id} className="group">
                          <td className="px-4 py-4">{log.done}</td>
                          <td className={`px-4 py-4 font-bold text-center w-24 ${log.plannedNotDone === '+' ? 'text-[#A3B18A]' : log.plannedNotDone === '-' ? 'text-red-500' : 'text-[#7B8371]'}`}>{log.plannedNotDone}</td>
                          <td className="px-4 py-4 italic opacity-70">{log.failureCause}</td>
                          <td className="px-4 py-4 text-right">
                            <button onClick={() => deleteLog(log.id)} className="text-red-400 opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-600">×</button>
                          </td>
                       </tr>
                   ))}
                   {!isAddingLog ? (
                       <tr className="bg-[#F9F8F4]">
                          <td colSpan={3} className="px-4 py-4 text-[#A3B18A] font-medium cursor-pointer hover:underline text-center" onClick={() => setIsAddingLog(true)}>+ Registrar Hábito Scorecard</td>
                       </tr>
                   ) : (
                       <tr className="bg-[#F9F8F4]">
                          <td className="px-2 py-2"><Input className="h-8 text-xs bg-white" placeholder="Ej. Revisé Instagram 30 mins" value={newLog.done} onChange={e => setNewLog({...newLog, done: e.target.value})} /></td>
                          <td className="px-2 py-2">
                             <select className="h-8 text-xs bg-white border border-[#E5E2D9] rounded-md px-2 w-full focus-visible:ring-[#A3B18A]" value={newLog.plannedNotDone} onChange={e => setNewLog({...newLog, plannedNotDone: e.target.value})}>
                                <option value="">...</option>
                                <option value="+">+ Positivo</option>
                                <option value="-">- Negativo</option>
                                <option value="=">= Neutro</option>
                             </select>
                          </td>
                          <td className="px-2 py-2">
                              <div className="flex gap-2">
                                  <Input className="h-8 text-xs bg-white flex-1" placeholder="Ej. Me generó ansiedad..." value={newLog.failureCause} onChange={e => setNewLog({...newLog, failureCause: e.target.value})} />
                                  <Button size="sm" className="h-8 bg-[#A3B18A] hover:bg-[#8D9B75] text-white" onClick={addActivityLog}>Ok</Button>
                                  <Button size="sm" variant="ghost" className="h-8" onClick={() => setIsAddingLog(false)}>X</Button>
                              </div>
                          </td>
                       </tr>
                   )}
                </tbody>
             </table>
          </div>
          
          <Separator className="my-6 bg-[#F0EEE6]" />
          
          <div>
            <div className="mb-4 flex justify-between items-end">
              <div>
                 <h3 className="text-lg font-serif text-[#3E4639] flex items-center mb-1">
                    <CheckCircle2 className="w-4 h-4 mr-2 text-[#A3B18A]" /> 
                    Motor de Micro-hábitos
                 </h3>
                 <p className="text-[10px] uppercase tracking-widest text-[#7B8371]">La consistencia &gt; la intensidad inicial. (Globales)</p>
              </div>
              {totalHabits > 0 && (
                 <div className="text-xs text-[#7B8371] bg-[#F9F8F4] px-3 py-1.5 rounded-full border border-[#E5E2D9]">
                    <span className="font-bold text-[#A3B18A]">{completedHabits}</span> / {totalHabits} completados ({habitsProgress}%)
                 </div>
              )}
            </div>
             <div className="flex flex-col gap-4">
                 <div className="flex flex-wrap gap-2 items-center">
                    {habits.map((habit) => (
                        <div key={habit.id} className="group relative pr-4">
                            <span 
                                onClick={() => toggleTask(habit.id, habit.done)}
                                className={`inline-flex flex-col items-start px-4 py-2 text-xs font-medium rounded-xl border cursor-pointer transition-colors ${
                                    habit.done 
                                    ? 'bg-[#F9F8F4] text-[#7B8371] border-[#E5E2D9] opacity-70 hover:opacity-100' 
                                    : 'bg-white text-[#4A4F41] border-[#D4A373] hover:bg-[#F9F8F4]'
                                }`}
                            >
                              <span className={habit.done ? 'line-through' : ''}>{habit.text} {habit.isTwoMinute && <span className="ml-1 text-[9px] bg-[#A3B18A] text-white px-1.5 py-0.5 rounded-full no-underline">2 Min</span>}</span>
                              {habit.identityVote && <span className="text-[9px] text-[#A3B18A] uppercase tracking-widest mt-1 no-underline">Voto: {habit.identityVote}</span>}
                            </span>
                            <button onClick={() => deleteTask(habit.id)} className="absolute -top-2 right-0 bg-red-100 text-red-600 rounded-full w-4 h-4 text-[10px] items-center justify-center hidden group-hover:flex leading-none hover:bg-red-200">×</button>
                        </div>
                    ))}
                    {!isAddingHabitExpanded && (
                       <Button variant="outline" size="sm" onClick={() => setIsAddingHabitExpanded(true)} className="border-dashed border-[#A3B18A] text-[#A3B18A] hover:bg-[#F9F8F4] text-xs h-8">
                         + Añadir Hábito
                       </Button>
                    )}
                 </div>
                 
                 {isAddingHabitExpanded && (
                     <form onSubmit={addHabit} className="flex flex-col gap-2 bg-[#F9F8F4] p-4 rounded-xl border border-[#E5E2D9] w-full max-w-sm mt-2">
                         <span className="text-[10px] font-bold uppercase tracking-widest text-[#7B8371] mb-1">Nuevo Hábito</span>
                         <Input 
                           value={newHabit}
                           onChange={(e) => setNewHabit(e.target.value)}
                           placeholder="Nombre del hábito (Ej. Prospección fría)"
                           className="bg-white border-[#E5E2D9] text-xs focus-visible:ring-[#A3B18A]"
                         />
                         <Input 
                           value={newHabitIdentity}
                           onChange={(e) => setNewHabitIdentity(e.target.value)}
                           placeholder="Voto de identidad (Ej. Asesor Elite)"
                           className="bg-white border-[#E5E2D9] text-xs focus-visible:ring-[#A3B18A]"
                         />
                         <div className="flex items-center space-x-2 mt-1">
                           <Checkbox id="two-min" checked={newHabitIsTwoMin} onCheckedChange={(val) => setNewHabitIsTwoMin(!!val)} className="data-[state=checked]:bg-[#A3B18A] data-[state=checked]:border-[#A3B18A] w-4 h-4" />
                           <label htmlFor="two-min" className="text-xs text-[#7B8371] cursor-pointer">Regla de 2 Minutos (Reducir resistencia)</label>
                         </div>
                         <div className="flex gap-2 mt-2">
                            <Button type="submit" className="bg-[#3E4639] hover:bg-[#2C3328] text-white text-xs h-8 flex-1">Guardar</Button>
                            <Button type="button" variant="ghost" className="text-xs h-8" onClick={() => setIsAddingHabitExpanded(false)}>Cancelar</Button>
                         </div>
                     </form>
                 )}
             </div>
          </div>
        </section>
      </div>
    </div>
  );
}
