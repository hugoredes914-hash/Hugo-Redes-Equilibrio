import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BrainCircuit, BookOpen, Search, Plus, Loader2, Sparkles, X, ChevronRight } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, query, onSnapshot, orderBy } from 'firebase/firestore';
import { getGemini } from '../lib/gemini';

const STAGES = ['Prospección', 'Calificación', 'Seguimiento', 'Propuesta', 'Cierre'];

const TEMPLATES = [
  { id: 'captacion', label: 'Captacion', content: 'Hola, soy [Tu Nombre] de Century 21. Estoy trabajando con compradores/inquilinos activos en la zona y quería saber si estás evaluando vender o alquilar tu propiedad. Si te parece, puedo hacerte una estimación realista de valor y comentarte cómo sería el proceso sin compromiso.' },
  { id: 'seguimiento', label: 'Seguimiento', content: 'Hola [Nombre], te escribo para dar seguimiento a nuestra charla sobre [Propiedad]. ¿Pudiste pensar en la propuesta? Quedo a tu disposición para cualquier duda.' },
  { id: 'reactivar', label: 'Reactivar', content: 'Hola [Nombre], hace un tiempo hablamos sobre tus planes inmobiliarios. Quería saber si retomaste la idea o si ya lo resolviste.' },
  { id: 'objecion_precio', label: 'Objecion precio', content: 'Entiendo tu postura sobre el precio, [Nombre]. Muchos clientes sentían lo mismo al principio, pero luego de ver el análisis de mercado competitivo comprobaron que ese es el valor óptimo. ¿Te gustaría que te muestre ese estudio?' },
  { id: 'lead_meta', label: 'Lead Meta Ads', content: 'Hola [Nombre], vi que dejaste tus datos en nuestro anuncio interesado en [Proyecto/Servicio]. ¿En qué horario te queda mejor que te llame para darte los detalles?' },
  { id: 'negociar_pago', label: 'Negociar pago', content: 'Respecto a las condiciones de pago, [Nombre], podemos presentar esta oferta al propietario. Lo ideal es ser lo más flexibles posible para que ambas partes ganen. ¿Cuál sería tu propuesta formal para ponerla sobre la mesa?' },
];

export default function ProfessionalModule() {
  const [activeTab, setActiveTab] = useState('crm');
  const [leads, setLeads] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<any>(TEMPLATES[0]);
  
  const [isAddingLead, setIsAddingLead] = useState(false);
  const [newLead, setNewLead] = useState({ name: '', property: '', stage: 'Prospección', notes: '', nextActionDate: '' });

  const [aiMessageLead, setAiMessageLead] = useState<any>(null);
  const [generatedScript, setGeneratedScript] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (!auth.currentUser) return;
    const q = query(collection(db, 'users', auth.currentUser.uid, 'leads'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
       setLeads(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'leads'));
    
    return () => unsub();
  }, []);

  const handleAddLead = async () => {
    if (!auth.currentUser || !newLead.name) return;
    try {
      const parsedDate = newLead.nextActionDate ? new Date(newLead.nextActionDate).getTime() : 0;
      await addDoc(collection(db, 'users', auth.currentUser.uid, 'leads'), {
        userId: auth.currentUser.uid,
        name: newLead.name,
        property: newLead.property || '',
        notes: newLead.notes || '',
        nextActionDate: parsedDate,
        stage: newLead.stage,
        createdAt: Date.now()
      });
      setIsAddingLead(false);
      setNewLead({ name: '', property: '', stage: 'Prospección', notes: '', nextActionDate: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'leads');
    }
  };

  const handleUpdateStage = async (leadId: string, stage: string) => {
    if (!auth.currentUser) return;
    try {
      await updateDoc(doc(db, 'users', auth.currentUser.uid, 'leads', leadId), { stage });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'leads');
    }
  };

  const handleDeleteLead = async (leadId: string) => {
     if (!auth.currentUser || !window.confirm('¿Eliminar lead?')) return;
     try {
       await deleteDoc(doc(db, 'users', auth.currentUser.uid, 'leads', leadId));
     } catch (error) {
       handleFirestoreError(error, OperationType.DELETE, 'leads');
     }
  };

  const draftMessage = async (lead: any) => {
     setAiMessageLead(lead);
     setIsGenerating(true);
     setGeneratedScript('');
     
     try {
         const gemini = getGemini();
         const prompt = `Actúa como un asesor altamente persuasivo especializado en metodologías de ventas inmobiliarias.
         El cliente se llama ${lead.name}.
         La propiedad de interés es: ${lead.property || 'No especificada'}.
         Está en la etapa de venta de: ${lead.stage}.
         Notas o siguiente paso: ${lead.notes || 'Ninguna especificada'}.

         Redacta un mensaje de WhatsApp corto y directo para contactar a este prospecto. Debe ser profesional, orientando al cliente hacia el siguiente paso lógico según su etapa de venta.
         Solo responde con el mensaje redactado, sin introducciones.
         `;
         
         const result = await gemini.models.generateContent({
             model: "gemini-flash-latest",
             contents: prompt,
         });
         
         setGeneratedScript(result.text || 'Error al generar');
     } catch(err) {
         console.error(err);
         setGeneratedScript("Hubo un error al generar el mensaje.");
     } finally {
         setIsGenerating(false);
     }
  };

  const filteredLeads = leads.filter(l => l.name.toLowerCase().includes(search.toLowerCase()) || l.property?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <header className="mb-8">
        <h2 className="text-3xl font-serif tracking-tight mb-2 text-[#3E4639]">Desempeño Profesional</h2>
        <p className="text-[#7B8371] text-sm">CRM Ágil y seguimiento de leads.</p>
      </header>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-[200px] max-w-full grid-cols-1 bg-[#E5E2D9] rounded-xl p-1 mb-8">
          <TabsTrigger value="crm" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-[#3E4639] text-[#7B8371] data-[state=active]:shadow-sm">CRM y Scripts</TabsTrigger>
        </TabsList>

        <TabsContent value="crm" className="outline-none">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <section className="xl:col-span-2 bg-white rounded-3xl p-6 md:p-8 flex flex-col border border-[#E5E2D9] shadow-sm">
              <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="flex items-center text-xl font-serif text-[#3E4639] mb-1">
                    <BrainCircuit className="w-5 h-5 mr-2 opacity-80" /> 
                    CRM Ágil: Pipeline
                  </h2>
                  <p className="text-xs text-[#7B8371]">
                    Gestiona prospectos, genera mensajes con IA y haz un seguimiento efectivo.
                  </p>
                </div>
              <Button onClick={() => setIsAddingLead(!isAddingLead)} className="bg-[#3E4639] hover:bg-[#2C3328] text-white rounded-xl shadow-lg shadow-[#3E4639]/20 font-medium px-4">
                 {isAddingLead ? <X className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                 {isAddingLead ? 'Cancelar' : 'Nuevo Lead'}
              </Button>
            </div>
            
            {isAddingLead && (
               <div className="bg-[#F9F8F4] p-4 rounded-2xl border border-[#F0EEE6] mb-8 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div>
                        <label className="text-[10px] font-bold uppercase tracking-widest text-[#7B8371]">Nombre</label>
                        <Input value={newLead.name} onChange={e => setNewLead({...newLead, name: e.target.value})} className="bg-white" placeholder="Ej. Carlos Díaz" />
                     </div>
                     <div>
                        <label className="text-[10px] font-bold uppercase tracking-widest text-[#7B8371]">Propiedad</label>
                        <Input value={newLead.property} onChange={e => setNewLead({...newLead, property: e.target.value})} className="bg-white" placeholder="Ej. Casa Bosques" />
                     </div>
                     <div>
                        <label className="text-[10px] font-bold uppercase tracking-widest text-[#7B8371]">Etapa</label>
                        <select value={newLead.stage} onChange={e => setNewLead({...newLead, stage: e.target.value})} className="w-full h-10 px-3 py-2 rounded-md bg-white border border-[#E5E2D9] text-sm focus:outline-none focus:ring-2 focus:ring-[#A3B18A] focus:border-transparent">
                           {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                     </div>
                     <div>
                        <label className="text-[10px] font-bold uppercase tracking-widest text-[#7B8371]">Próxima Acción (Fecha)</label>
                        <Input type="date" value={newLead.nextActionDate} onChange={e => setNewLead({...newLead, nextActionDate: e.target.value})} className="bg-white" />
                     </div>
                     <div className="md:col-span-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-[#7B8371]">Notas / Siguiente paso</label>
                        <Input value={newLead.notes} onChange={e => setNewLead({...newLead, notes: e.target.value})} className="bg-white" placeholder="Ej. Interesado en financiación a 10 años. Llamar el viernes." />
                     </div>
                  </div>
                  <Button onClick={handleAddLead} className="w-full bg-[#A3B18A] hover:bg-[#8CA070] text-white">
                     Guardar Lead
                  </Button>
               </div>
            )}
            
            <div className="mb-6">
              <Input 
                 placeholder="Buscar por nombre o propiedad..." 
                 className="max-w-md bg-[#F9F8F4] border-[#E5E2D9]" 
                 value={search}
                 onChange={e => setSearch(e.target.value)}
                 icon={<Search className="w-4 h-4 text-[#7B8371]" />}
              />
            </div>

            <div className="space-y-4">
              {filteredLeads.length === 0 && <p className="text-sm text-[#7B8371] italic py-4">No hay leads registrados.</p>}
              {filteredLeads.map((lead) => (
                <div key={lead.id} className="p-4 border border-[#F0EEE6] rounded-2xl bg-white shadow-sm flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                  
                  <div className="flex-1 w-full md:w-auto">
                    <div className="flex items-center gap-2 mb-1">
                       <span className="font-serif text-lg text-[#3E4639] font-medium">{lead.name}</span>
                       <span className="text-xs bg-[#F9F8F4] px-2 py-0.5 rounded text-[#7B8371]">{lead.property || 'Sin propiedad'}</span>
                    </div>
                    <div className="flex flex-col gap-2 mt-2">
                       <div className="flex flex-wrap items-center gap-2">
                          <select 
                             value={lead.stage} 
                             onChange={(e) => handleUpdateStage(lead.id, e.target.value)}
                             className="text-xs px-2 py-1 rounded bg-[#F9F8F4] border border-[#E5E2D9] text-[#3E4639] font-medium focus:outline-none"
                          >
                            {STAGES.map((s, idx) => <option key={s} value={s}>{idx+1}. {s}</option>)}
                          </select>
                          {lead.nextActionDate > 0 && (
                             <span className="text-xs bg-[#A3B18A]/10 text-[#A3B18A] px-2 py-1 rounded font-medium">
                               📅 {new Date(lead.nextActionDate).toLocaleDateString('es-ES')}
                             </span>
                          )}
                       </div>
                       {lead.notes && (
                          <p className="text-xs text-[#7B8371] italic mt-1 bg-[#F9F8F4] p-2 rounded-lg border border-[#E5E2D9]">{lead.notes}</p>
                       )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                     <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => draftMessage(lead)}
                        className="text-[#A3B18A] border-[#A3B18A] bg-[#F9F8F4] hover:bg-[#A3B18A] hover:text-white flex-1 md:flex-auto"
                     >
                       <Sparkles className="w-3 h-3 mr-1" /> Mensaje
                     </Button>
                     <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={() => handleDeleteLead(lead.id)}
                        className="text-red-500 hover:text-red-600 hover:bg-red-50"
                     >
                        <X className="w-4 h-4" />
                     </Button>
                  </div>
                  
                </div>
              ))}
            </div>
            
            {/* AI Generator Overlay */}
            {aiMessageLead && (
               <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                  <div className="bg-white rounded-3xl p-6 md:p-8 w-full max-w-lg shadow-2xl relative">
                     <Button variant="ghost" size="icon" onClick={() => setAiMessageLead(null)} className="absolute top-4 right-4"><X className="w-5 h-5"/></Button>
                     <h3 className="font-serif text-xl text-[#3E4639] mb-1 flex items-center">
                        <Sparkles className="w-5 h-5 mr-2 text-[#D4A373]" />
                        Generador de Seguimiento (PNL)
                     </h3>
                     <p className="text-sm text-[#7B8371] mb-6">Generando guión para <strong>{aiMessageLead.name}</strong> ({aiMessageLead.vak}) en etapa de {aiMessageLead.stage}.</p>
                     
                     <div className="bg-[#F9F8F4] p-4 rounded-xl border border-[#E5E2D9] min-h-[120px] relative mt-4">
                        {isGenerating ? (
                           <div className="absolute inset-0 flex items-center justify-center flex-col text-[#A3B18A]">
                              <Loader2 className="w-6 h-6 animate-spin mb-2" />
                              <span className="text-xs font-bold uppercase tracking-widest">Redactando...</span>
                           </div>
                        ) : (
                           <p className="text-sm text-[#3E4639] whitespace-pre-wrap">{generatedScript}</p>
                        )}
                     </div>
                     {!isGenerating && (
                        <div className="mt-6 flex justify-end">
                           <Button onClick={() => {
                               navigator.clipboard.writeText(generatedScript);
                               alert("Copiado al portapapeles");
                           }} className="bg-[#3E4639] text-white">Copiar Mensaje</Button>
                        </div>
                     )}
                  </div>
               </div>
            )}
            
            </section>

            {/* Plantillas Section */}
            <section className="bg-white rounded-3xl p-6 flex flex-col border border-[#E5E2D9] shadow-sm self-start sticky top-6">
               <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#A3B18A] mb-1">PLANTILLAS</h4>
                    <h3 className="text-lg font-serif text-[#3E4639] font-bold">Mensajes para destrabar</h3>
                  </div>
                  <Button variant="outline" size="sm" className="text-xs border-[#E5E2D9] text-[#3E4639] bg-[#F9F8F4] hover:bg-[#E5E2D9] shadow-none">Sugerir mensaje</Button>
               </div>
               
               <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 mb-4">
                  {TEMPLATES.map(t => (
                     <button 
                       key={t.id} 
                       className={`py-2 px-2 text-[11px] font-bold rounded-lg transition-colors
                          ${selectedTemplate?.id === t.id ? 'bg-[#3E4639] text-white' : 'bg-[#F9F8F4] text-[#7B8371] hover:bg-[#E5E2D9]'}
                       `}
                       onClick={() => setSelectedTemplate(t)}
                     >
                       {t.label}
                     </button>
                  ))}
               </div>
               
               <div className="flex-1 bg-white border border-[#E5E2D9] rounded-xl flex flex-col overflow-hidden mb-4 min-h-[200px] focus-within:ring-2 focus-within:ring-[#A3B18A] focus-within:border-transparent">
                  <div className="p-4 flex-1">
                     <p className="text-sm text-[#3E4639] leading-relaxed outline-none" contentEditable suppressContentEditableWarning>
                        {selectedTemplate?.content || 'Selecciona una plantilla...'}
                     </p>
                  </div>
               </div>
               <Button 
                 onClick={() => {
                   if (selectedTemplate) {
                     navigator.clipboard.writeText(selectedTemplate.content);
                     alert("Copiado al portapapeles");
                   }
                 }} 
                 className="w-full bg-[#3E4639] hover:bg-[#2C3328] text-white rounded-xl font-bold py-6 shadow-lg shadow-[#3E4639]/20"
               >
                  Copiar mensaje
               </Button>
            </section>
          </div>
        </TabsContent>

      </Tabs>
    </div>
  );
}
