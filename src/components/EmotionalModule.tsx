import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Heart, RefreshCcw, Check, BookOpen, X } from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, addDoc, query, onSnapshot, orderBy } from 'firebase/firestore';

import BreathingExercise from './BreathingExercise';

export default function EmotionalModule() {
  const [situation, setSituation] = useState('');
  const [automaticThought, setAutomaticThought] = useState('');
  const [emotion, setEmotion] = useState('');
  const [emotionIntensity, setEmotionIntensity] = useState<number | string>('');
  const [evidenceFor, setEvidenceFor] = useState('');
  const [evidenceAgainst, setEvidenceAgainst] = useState('');
  const [rationalResponse, setRationalResponse] = useState('');

  const [isReframingLoading, setIsReframingLoading] = useState(false);
  const [reframingSuccess, setReframingSuccess] = useState(false);
  
  const [gratitude1, setGratitude1] = useState('');
  const [gratitude2, setGratitude2] = useState('');
  const [gratitude3, setGratitude3] = useState('');
  const [isGratitudeLoading, setIsGratitudeLoading] = useState(false);
  const [gratitudeSuccess, setGratitudeSuccess] = useState(false);

  const [viewHistory, setViewHistory] = useState(false);
  const [tccLogs, setTccLogs] = useState<any[]>([]);

  useEffect(() => {
    if (!auth.currentUser) return;
    const q = query(collection(db, 'users', auth.currentUser.uid, 'reframings'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
       setTccLogs(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'reframings'));
    
    return () => unsub();
  }, []);

  const handleSaveReframing = async () => {
    if (!auth.currentUser || !situation || !automaticThought || !rationalResponse) return;
    setIsReframingLoading(true);
    try {
      await addDoc(collection(db, 'users', auth.currentUser.uid, 'reframings'), {
        userId: auth.currentUser.uid,
        situation,
        automaticThought,
        emotion,
        emotionIntensity: Number(emotionIntensity) || 0,
        evidenceFor,
        evidenceAgainst,
        rationalResponse,
        createdAt: Date.now()
      });
      setReframingSuccess(true);
      setTimeout(() => {
         setReframingSuccess(false);
         setSituation('');
         setAutomaticThought('');
         setEmotion('');
         setEmotionIntensity('');
         setEvidenceFor('');
         setEvidenceAgainst('');
         setRationalResponse('');
         setViewHistory(true);
      }, 2000);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'reframings');
    } finally {
      setIsReframingLoading(false);
    }
  };

  const handleSaveGratitude = async () => {
    if (!auth.currentUser || (!gratitude1 && !gratitude2 && !gratitude3)) return;
    setIsGratitudeLoading(true);
    try {
      const items = [gratitude1, gratitude2, gratitude3].filter(Boolean);
      await addDoc(collection(db, 'users', auth.currentUser.uid, 'gratitudes'), {
        userId: auth.currentUser.uid,
        items,
        createdAt: Date.now()
      });
      setGratitudeSuccess(true);
      setTimeout(() => {
         setGratitudeSuccess(false);
         setGratitude1('');
         setGratitude2('');
         setGratitude3('');
      }, 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'gratitudes');
    } finally {
      setIsGratitudeLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <header className="mb-8">
        <h2 className="text-3xl font-serif tracking-tight mb-2 text-[#3E4639]">Estabilidad Emocional</h2>
        <p className="text-[#7B8371] text-sm">Módulo de cimentación: Terapia Cognitivo Conductual (TCC) y Gratitud.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* TCC Section */}
        <section className="bg-white rounded-3xl p-6 md:p-8 flex flex-col border border-[#E5E2D9] shadow-sm">
          <div className="mb-6 flex justify-between items-start">
            <div>
              <h2 className="flex items-center text-xl font-serif text-[#3E4639] mb-1">
                <RefreshCcw className="w-5 h-5 mr-2 opacity-80" />
                Registro TCC
              </h2>
              <p className="text-xs text-[#7B8371]">
                 Pasa del piloto automático a la respuesta consciente.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setViewHistory(!viewHistory)} className="text-xs">
              <BookOpen className="w-4 h-4 mr-2" />
              {viewHistory ? 'Nuevo Registro' : 'Ver Historial'}
            </Button>
          </div>
          
          {viewHistory ? (
             <div className="flex-1 overflow-y-auto max-h-[500px] space-y-4 pr-2">
                {tccLogs.length === 0 && <p className="text-sm text-[#7B8371] italic text-center py-8">No hay registros TCC.</p>}
                {tccLogs.map(log => (
                    <div key={log.id} className="bg-[#FDFBF7] p-4 rounded-2xl border border-[#E5E2D9] space-y-3">
                       <div>
                          <span className="text-[10px] font-bold uppercase tracking-widest text-[#7B8371]">1. Situación</span>
                          <p className="text-sm text-[#3E4639]">{log.situation}</p>
                       </div>
                       <div className="grid grid-cols-2 gap-4">
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-[#D4A373]">2. Pensamiento Automático</span>
                            <p className="text-sm text-[#3E4639]">{log.automaticThought}</p>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-[#D4A373]">3. Emoción</span>
                            <p className="text-sm text-[#3E4639]">{log.emotion} {log.emotionIntensity ? `(${log.emotionIntensity}/10)` : ''}</p>
                          </div>
                       </div>
                       {(log.evidenceFor || log.evidenceAgainst) && (
                         <div className="grid grid-cols-2 gap-4">
                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-widest text-[#A3B18A]">Evidencia a favor</span>
                              <p className="text-sm text-[#3E4639]">{log.evidenceFor}</p>
                            </div>
                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-widest text-[#A3B18A]">Evidencia en contra</span>
                              <p className="text-sm text-[#3E4639]">{log.evidenceAgainst}</p>
                            </div>
                         </div>
                       )}
                       <div className="pt-2 border-t border-[#E5E2D9]">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-[#3E4639]">Respuesta Racional</span>
                          <p className="text-sm text-[#3E4639] font-medium">{log.rationalResponse}</p>
                       </div>
                       <div className="text-[9px] text-[#7B8371] text-right">
                          {new Date(log.createdAt).toLocaleString('es-ES')}
                       </div>
                    </div>
                ))}
             </div>
          ) : (
            <>
              <div className="space-y-4 flex-1">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-[#3E4639]">¿Qué pasó?</label>
                  <Input 
                    placeholder="La situación concreta"
                    className="bg-[#F9F8F4] border-[#E5E2D9] focus-visible:ring-[#A3B18A] text-sm"
                    value={situation}
                    onChange={(e) => setSituation(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-[#D4A373]">¿Qué pensaste automáticamente?</label>
                  <Input 
                    placeholder="El pensamiento que apareció"
                    className="bg-[#F9F8F4] border-[#E5E2D9] focus-visible:ring-[#D4A373] text-sm"
                    value={automaticThought}
                    onChange={(e) => setAutomaticThought(e.target.value)}
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-[#D4A373]">¿Qué emoción sentiste?</label>
                  <div className="flex gap-4">
                     <Input 
                       placeholder="Miedo, vergüenza, rabia..."
                       className="flex-1 bg-[#F9F8F4] border-[#E5E2D9] focus-visible:ring-[#D4A373] text-sm"
                       value={emotion}
                       onChange={(e) => setEmotion(e.target.value)}
                     />
                     <Input 
                       placeholder="1-10"
                       type="number"
                       min="1"
                       max="10"
                       className="w-24 bg-[#F9F8F4] border-[#E5E2D9] focus-visible:ring-[#D4A373] text-sm"
                       value={emotionIntensity}
                       onChange={(e) => setEmotionIntensity(e.target.value)}
                     />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-[#A3B18A]">Evidencia a favor</label>
                  <Textarea 
                    placeholder="¿Qué datos concretos apoyan ese pensamiento?"
                    className="resize-none h-16 bg-[#F9F8F4] border-[#E5E2D9] focus-visible:ring-[#A3B18A] text-sm"
                    value={evidenceFor}
                    onChange={(e) => setEvidenceFor(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-[#A3B18A]">Evidencia en contra</label>
                  <Textarea 
                    placeholder="¿Qué datos lo contradicen?"
                    className="resize-none h-16 bg-[#F9F8F4] border-[#E5E2D9] focus-visible:ring-[#A3B18A] text-sm"
                    value={evidenceAgainst}
                    onChange={(e) => setEvidenceAgainst(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-[#3E4639]">Pensamiento más equilibrado</label>
                  <Input 
                    placeholder="Una forma más realista de verlo"
                    className="bg-white border-[#E5E2D9] focus-visible:ring-[#3E4639] text-sm shadow-sm"
                    value={rationalResponse}
                    onChange={(e) => setRationalResponse(e.target.value)}
                  />
                </div>
              </div>
              
              <div className="mt-6">
                <Button 
                    onClick={handleSaveReframing}
                    className="w-full bg-[#3E4639] hover:bg-[#2C3328] text-white rounded-xl shadow-lg shadow-[#3E4639]/20 font-medium py-3 h-auto transition-all" 
                    disabled={!rationalResponse || isReframingLoading}
                >
                   {isReframingLoading ? 'Guardando...' : reframingSuccess ? <><Check className="w-4 h-4 mr-2"/> Guardado</> : 'Registrar Evaluación'}
                </Button>
              </div>
            </>
          )}
        </section>

        {/* Diario de Gratitud */}
        <section className="bg-white rounded-3xl p-6 md:p-8 flex flex-col border border-[#E5E2D9] shadow-sm">
          <div className="mb-6">
            <h2 className="flex items-center text-xl font-serif text-[#3E4639] mb-1">
              <Heart className="w-5 h-5 mr-2 opacity-80 text-[#D4A373]" />
              Diario de Gratitud y Logros
            </h2>
            <p className="text-xs text-[#7B8371]">
              Anota 3 cosas por las que agradeces o 3 pequeños logros de hoy.
            </p>
          </div>
          
          <div className="space-y-4 flex-1">
             <div className="space-y-4">
                <div className="flex items-center space-x-3 bg-[#F9F8F4] p-3 rounded-xl border border-[#F0EEE6]">
                  <div className="w-8 h-8 rounded-full bg-[#A3B18A] text-white flex items-center justify-center font-serif flex-shrink-0">1</div>
                  <Input 
                    placeholder="Ej. Agradezco el apoyo de mis padres" 
                    value={gratitude1} 
                    onChange={(e) => setGratitude1(e.target.value)} 
                    className="border-none bg-transparent shadow-none focus-visible:ring-0 px-0 placeholder:text-[#7B8371]/50 text-sm"
                  />
                </div>
                <div className="flex items-center space-x-3 bg-[#F9F8F4] p-3 rounded-xl border border-[#F0EEE6]">
                  <div className="w-8 h-8 rounded-full bg-[#D4A373] text-white flex items-center justify-center font-serif flex-shrink-0">2</div>
                  <Input 
                    placeholder="Ej. Logré levantarme y hacer mi cama" 
                    value={gratitude2} 
                    onChange={(e) => setGratitude2(e.target.value)} 
                    className="border-none bg-transparent shadow-none focus-visible:ring-0 px-0 placeholder:text-[#7B8371]/50 text-sm"
                  />
                </div>
                <div className="flex items-center space-x-3 bg-[#F9F8F4] p-3 rounded-xl border border-[#F0EEE6]">
                  <div className="w-8 h-8 rounded-full border border-[#D4A373] text-[#D4A373] flex items-center justify-center font-serif flex-shrink-0">3</div>
                  <Input 
                    placeholder="Ej. Leí 10 páginas de un libro" 
                    value={gratitude3} 
                    onChange={(e) => setGratitude3(e.target.value)} 
                    className="border-none bg-transparent shadow-none focus-visible:ring-0 px-0 placeholder:text-[#7B8371]/50 text-sm"
                  />
                </div>
             </div>
          </div>

          <div className="mt-6">
            <Button 
                onClick={handleSaveGratitude}
                variant="outline" 
                className="w-full border-[#E5E2D9] text-[#7B8371] rounded-xl hover:bg-[#F9F8F4] font-medium py-3 h-auto transition-all" 
                disabled={(!gratitude1 && !gratitude2 && !gratitude3) || isGratitudeLoading}
            >
               {isGratitudeLoading ? 'Registrando...' : gratitudeSuccess ? <><Check className="w-4 h-4 mr-2"/> Registrado</> : 'Registrar Gratitud'}
            </Button>
          </div>
        </section>
      </div>
      
      <BreathingExercise />
    </div>
  );
}
