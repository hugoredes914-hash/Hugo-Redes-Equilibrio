import {doc,runTransaction,collection,arrayUnion,updateDoc} from 'firebase/firestore';
import {auth,db} from './firebase';
import {calendarEventId,createGoogleCalendarEvent,cancelGoogleCalendarEvent,getCachedAccessToken} from './googleCalendar';
import {businessDate} from './dates';
export async function persistLead(uid:string,id:string|undefined,values:Record<string,any>,history:any[]) {
  if(auth.currentUser?.uid!==uid)throw new Error('La sesión cambió.');
  const ref=id?doc(db,'users',uid,'leads',id):doc(collection(db,'users',uid,'leads'));
  await runTransaction(db,async tx=>{
    if(auth.currentUser?.uid!==uid)throw new Error('La sesión cambió.');
    const snapshot=await tx.get(ref);
    if(id&&!snapshot.exists())throw new Error('El registro ya no existe.');
    if(id&&snapshot.data()?.deletedAt)throw new Error('El registro fue eliminado.');
    if(snapshot.exists())tx.update(ref,{...values,history:arrayUnion(...history),updatedAt:Date.now()});
    else tx.set(ref,{...values,userId:uid,createdAt:Date.now(),updatedAt:Date.now(),history,deletedAt:0});
  });return ref;
}
export async function synchronizeLeadCalendar(uid:string,id:string,lead:any) {
  if(auth.currentUser?.uid!==uid)throw new Error('La sesión cambió.');
  const ref=doc(db,'users',uid,'leads',id),eventId=lead.calendarEventId||await calendarEventId(uid,id);
  const terminal=lead.deletedAt||lead.stage==='Perdido'||lead.stage?.includes('Cierre');
  const wanted=lead.googleCalendarSyncEnabled&&lead.nextActionDate>0&&!terminal;
  if(!wanted&&!lead.calendarEventId)return;
  await updateDoc(ref,{calendarEventId:eventId,calendarSyncStatus:wanted?'pending':'cancel-pending',updatedAt:Date.now()});
  if(!getCachedAccessToken())throw new Error('CRM guardado. Conecta Google Calendar para completar la sincronización pendiente.');
  if(wanted)await createGoogleCalendarEvent({id:eventId,summary:`Próxima acción con ${lead.name}`,description:'Recordatorio de seguimiento. Consulta los detalles en Equilibrio.',startDate:businessDate(lead.nextActionDate),time:lead.nextActionTime||undefined,durationMinutes:lead.calendarDurationMinutes??30,notificationMinutes:lead.calendarNotificationMinutes??30});
  else await cancelGoogleCalendarEvent(eventId);
  if(auth.currentUser?.uid!==uid)throw new Error('La sesión cambió.');
  await updateDoc(ref,{calendarSyncStatus:wanted?'synced':'cancelled',updatedAt:Date.now()});
}
