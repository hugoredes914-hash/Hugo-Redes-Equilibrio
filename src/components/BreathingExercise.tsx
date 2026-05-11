import React, { useState, useEffect } from 'react';
import { Play, Wind, Pause, Square } from 'lucide-react';

export default function BreathingExercise() {
  const [isActive, setIsActive] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'inhale' | 'hold' | 'exhale'>('idle');
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    let timer: any;
    if (isActive) {
      if (countdown > 0) {
        timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      } else {
        if (phase === 'inhale') {
          setPhase('hold');
          setCountdown(7);
        } else if (phase === 'hold') {
          setPhase('exhale');
          setCountdown(8);
        } else if (phase === 'exhale' || phase === 'idle') {
          setPhase('inhale');
          setCountdown(4);
        }
      }
    }
    return () => clearTimeout(timer);
  }, [isActive, phase, countdown]);

  const toggleExercise = () => {
    if (isActive) {
      setIsActive(false);
      setPhase('idle');
      setCountdown(0);
    } else {
      setIsActive(true);
      setPhase('inhale');
      setCountdown(4);
    }
  };

  const getPhaseText = () => {
    switch (phase) {
      case 'inhale': return 'INHALA';
      case 'hold': return 'SOSTIENE';
      case 'exhale': return 'EXHALA';
      default: return '';
    }
  };

  return (
    <section className="bg-white rounded-3xl p-6 md:p-8 border border-[#E5E2D9] shadow-sm mt-6 text-[#3E4639] relative overflow-hidden">
      {!isActive ? (
        <div className="flex items-center justify-between z-10 relative">
          <div>
            <h2 className="flex items-center text-xl font-serif mb-1 text-[#3E4639]">
              <Wind className="w-5 h-5 mr-2 opacity-80 text-[#A3B18A]" />
              Respiración 4-7-8
            </h2>
            <p className="text-[#7B8371] text-sm">
              Ancla de calma. Úsala antes de una llamada difícil.
            </p>
          </div>
          <button 
            onClick={toggleExercise}
            className="flex items-center px-6 py-3 rounded-xl bg-[#F9F8F4] hover:bg-[#E5E2D9] border border-[#E5E2D9] transition-all font-medium text-[#3E4639]"
          >
            <Play className="w-4 h-4 mr-2" /> Iniciar
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-6 z-10 relative">
          <div className="w-32 h-32 rounded-full border-4 border-[#E5E2D9] flex items-center justify-center relative mb-4">
             <div 
               className={`absolute inset-0 bg-[#A3B18A]/20 rounded-full transition-all duration-1000 ease-in-out ${
                 phase === 'inhale' ? 'scale-110 opacity-100' : phase === 'hold' ? 'scale-110 opacity-50' : 'scale-75 opacity-20'
               }`} 
             />
             <div className="text-4xl font-serif relative z-10 text-[#3E4639]">{countdown}</div>
          </div>
          <h3 className="text-xl font-bold tracking-widest text-[#A3B18A] mb-6 uppercase">{getPhaseText()}</h3>
          <button 
            onClick={toggleExercise}
            className="flex items-center text-sm px-4 py-2 rounded-lg text-[#7B8371] hover:text-[#3E4639] hover:bg-[#F9F8F4] transition-all border border-transparent hover:border-[#E5E2D9]"
          >
            <Square className="w-4 h-4 mr-2 fill-current" /> Detener
          </button>
        </div>
      )}
    </section>
  );
}
