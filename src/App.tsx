import { useState, useEffect } from 'react';
import { LayoutDashboard, Brain, Activity, Briefcase, HeartPulse, LifeBuoy } from 'lucide-react';
import Dashboard from './components/Dashboard';
import EmotionalModule from './components/EmotionalModule';
import ExecutionModule from './components/ExecutionModule';
import ProfessionalModule from './components/ProfessionalModule';
import HealthModule from './components/HealthModule';
import SosModal from './components/SosModal';
import { auth, loginWithGoogle, logout, db } from './lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

type View = 'dashboard' | 'emotional' | 'execution' | 'professional' | 'health';

export default function App() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [user, setUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [hasCheckedIn, setHasCheckedIn] = useState<boolean>(true);
  const [showSos, setShowSos] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoadingAuth(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    const today = new Date().toISOString().split('T')[0];
    const q = query(collection(db, 'users', user.uid, 'metrics'), where('date', '==', today));
    
    let isFirstLoad = true;
    const unsub = onSnapshot(q, (snap) => {
       if (snap.empty) {
           setHasCheckedIn(false);
           setCurrentView('health'); // force redirect
       } else {
           if (!isFirstLoad && snap.docChanges().some(change => change.type === 'added')) {
               setCurrentView('execution'); // Redirect after morning check-in
           }
           setHasCheckedIn(true);
       }
       isFirstLoad = false;
    });
    return () => unsub();
  }, [user]);

  const navigation = [
    { id: 'dashboard', label: 'Resumen', icon: LayoutDashboard },
    { id: 'emotional', label: 'Estabilidad Emocional', icon: Brain },
    { id: 'execution', label: 'Ejecución Diaria', icon: Activity },
    { id: 'professional', label: 'Desempeño Profesional', icon: Briefcase },
    { id: 'health', label: 'Control y Alertas', icon: HeartPulse },
  ];

  if (loadingAuth) {
     return <div className="flex h-screen items-center justify-center bg-[#F9F8F4] text-[#3E4639] font-serif">Cargando...</div>;
  }

  if (!user) {
      return (
          <div className="flex h-screen items-center justify-center bg-[#F9F8F4]">
              <div className="text-center p-8 bg-white border border-[#E5E2D9] rounded-3xl shadow-lg max-w-sm w-full">
                  <h1 className="text-3xl font-serif mb-2 text-[#3E4639]">Equilibrio</h1>
                  <p className="text-sm text-[#7B8371] mb-8">Inicia sesión para sincronizar tus módulos y registrar tu evolución diaria.</p>
                  <button 
                      onClick={loginWithGoogle}
                      className="w-full py-4 rounded-xl bg-[#3E4639] text-white hover:bg-[#2C3328] font-medium transition-colors shadow-sm"
                  >
                      Continuar con Google
                  </button>
              </div>
          </div>
      );
  }

  const renderView = () => {
    switch (currentView) {
      case 'dashboard': return <Dashboard onNavigate={(val: View) => setCurrentView(val)} />;
      case 'emotional': return <EmotionalModule />;
      case 'execution': return <ExecutionModule />;
      case 'professional': return <ProfessionalModule />;
      case 'health': return <HealthModule />;
      default: return <Dashboard onNavigate={(val: View) => setCurrentView(val)} />;
    }
  };

  return (
    <div className="flex h-screen bg-[#F9F8F4] text-[#4A4F41] font-sans overflow-hidden">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-[#3E4639] text-[#F9F8F4] hidden md:flex flex-col p-6 shadow-xl relative z-20">
        <div className="mb-10 text-2xl font-serif italic tracking-tight">Equilibrio</div>
        
        <nav className="space-y-6 flex-1">
          <div className="opacity-60 text-xs uppercase tracking-widest">Módulos</div>
          <div className="space-y-2">
            {navigation.map((item) => {
              const active = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => hasCheckedIn && setCurrentView(item.id as View)}
                  disabled={!hasCheckedIn && item.id !== 'health'}
                  className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors ${
                    active ? 'bg-[#F9F8F4]/10' : 'hover:bg-[#F9F8F4]/5 opacity-70 hover:opacity-100'
                  } ${!hasCheckedIn && item.id !== 'health' ? 'opacity-30 cursor-not-allowed pointer-events-none' : ''}`}
                >
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${active ? 'bg-[#A3B18A]' : 'bg-transparent'}`}></div>
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  <span className="font-medium text-sm text-left flex-1 truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
        
        <div className="pt-6 border-t border-white/10 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium truncate max-w-[150px]">{user.displayName || user.email}</div>
            <div className="text-[10px] uppercase tracking-widest opacity-50 mt-1 cursor-pointer hover:opacity-100 transition-opacity" onClick={logout}>Cerrar Sesión</div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto w-full p-4 md:p-8">
        {/* Mobile Nav Top Bar Placeholder */}
        <div className="md:hidden bg-[#3E4639] text-[#F9F8F4] p-4 flex flex-col gap-3 rounded-2xl mb-6 shadow-md">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-serif italic">Equilibrio</h1>
            <select 
              className="border-none font-medium text-sm bg-black/20 rounded-lg px-3 py-2 text-[#F9F8F4] outline-none disabled:opacity-50"
              value={currentView}
              onChange={(e) => hasCheckedIn && setCurrentView(e.target.value as View)}
              disabled={!hasCheckedIn}
            >
              {navigation.map(item => <option key={item.id} value={item.id} className="text-neutral-900" disabled={!hasCheckedIn && item.id !== 'health'}>{item.label}</option>)}
            </select>
          </div>
          <div className="text-xs opacity-70 border-t border-white/10 pt-2 pb-1">
            {new Date().toLocaleDateString('es-ES', { weekday: 'long', month: 'long', day: 'numeric' }).replace(/^\w/, c => c.toUpperCase())}
          </div>
        </div>
        
        <div className="max-w-5xl mx-auto h-full">
           {renderView()}
        </div>
      </main>
      
      {/* SOS Button */}
      <button 
        onClick={() => setShowSos(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center text-white shadow-xl shadow-red-500/20 transition-transform hover:scale-105 z-40"
      >
        <LifeBuoy className="w-6 h-6" />
      </button>
      
      {showSos && <SosModal onClose={() => setShowSos(false)} />}
    </div>
  );
}
