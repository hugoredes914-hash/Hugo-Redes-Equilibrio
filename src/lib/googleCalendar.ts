import { GoogleAuthProvider, reauthenticateWithPopup, onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import { BUSINESS_TIME_ZONE, calendarDateTime, businessDate } from './dates';
let cached: {token:string;uid:string;expiresAt:number}|null=null;
onAuthStateChanged(auth, user=>{if(!user || cached?.uid!==user.uid)cached=null;});
export function getCachedAccessToken() {
  if(!cached || cached.uid!==auth.currentUser?.uid || cached.expiresAt<=Date.now()){cached=null;return null;}
  return cached.token;
}
export function clearCalendarToken(){cached=null;}
export async function authorizeGoogleCalendar():Promise<string|null> {
  const user=auth.currentUser;if(!user)throw new Error('Inicia sesión primero.');
  const provider=new GoogleAuthProvider();provider.addScope('https://www.googleapis.com/auth/calendar.events');
  provider.setCustomParameters({prompt:'consent',login_hint:user.email||''});
  const result=await reauthenticateWithPopup(user,provider);
  if(auth.currentUser?.uid!==user.uid)throw new Error('La sesión cambió.');
  const token=GoogleAuthProvider.credentialFromResult(result)?.accessToken;
  if(token)cached={token,uid:user.uid,expiresAt:Date.now()+50*60_000};return token||null;
}
export interface CalendarEvent {id:string;summary:string;description:string;startDate:string;time?:string;durationMinutes?:number;notificationMinutes?:number;location?:string;}
export async function calendarEventId(uid:string,leadId:string) {
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`equilibrio:${uid}:${leadId}`));
  return 'eq'+Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function request(path:string,method:string,body?:unknown) {
  const token=getCachedAccessToken();const uid=auth.currentUser?.uid;
  if(!token||!uid)throw new Error('Conecta Google Calendar nuevamente para sincronizar.');
  const response=await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events${path}`,{method,
    headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
  if(auth.currentUser?.uid!==uid)throw new Error('La sesión cambió.');
  if(response.status===401){cached=null;throw new Error('La conexión con Calendar venció. Reconéctala.');}return response;
}
export async function createGoogleCalendarEvent(event:CalendarEvent):Promise<boolean> {
  const duration=event.durationMinutes??30,notification=event.notificationMinutes??30;
  if(!/^[a-v0-9]{5,1024}$/.test(event.id)||duration<1||duration>1440||notification<0||notification>40320)throw new Error('Agenda no válida');
  const body:any={summary:event.summary,description:event.description,reminders:{useDefault:false,overrides:[{method:'popup',minutes:notification},{method:'email',minutes:notification}]}};
  if(event.location)body.location=event.location;
  if(event.time){const start=calendarDateTime(event.startDate,event.time);if(!Number.isFinite(start))throw new Error('Fecha no válida');
    body.start={dateTime:new Date(start).toISOString(),timeZone:BUSINESS_TIME_ZONE};body.end={dateTime:new Date(start+duration*60000).toISOString(),timeZone:BUSINESS_TIME_ZONE};
  }else{const noon=calendarDateTime(event.startDate,'12:00');if(!Number.isFinite(noon))throw new Error('Fecha no válida');body.start={date:event.startDate};body.end={date:businessDate(noon+86400000)};}
  let response=await request('','POST',{id:event.id,...body});if(response.status===409)response=await request('/'+event.id,'PATCH',body);
  if(!response.ok)throw new Error('No se pudo sincronizar con Calendar. El registro del CRM permanece guardado.');return true;
}
export async function cancelGoogleCalendarEvent(eventId:string) {
  if(!/^[a-v0-9]{5,1024}$/.test(eventId))throw new Error('Identificador no válido');
  const response=await request('/'+eventId,'DELETE');if(!response.ok&&response.status!==404&&response.status!==410)throw new Error('No se pudo cancelar el recordatorio.');
}
