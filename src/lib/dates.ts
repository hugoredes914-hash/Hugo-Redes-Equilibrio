export const BUSINESS_TIME_ZONE = 'America/Asuncion';
export function businessDate(value: Date | number = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone:BUSINESS_TIME_ZONE, year:'numeric',month:'2-digit',day:'2-digit' }).formatToParts(value);
  const part=(type:string)=>parts.find(p=>p.type===type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function daysBetween(a:string,b:string):number {return Math.round((Date.parse(a+'T12:00:00Z')-Date.parse(b+'T12:00:00Z'))/86400000);}
export function calendarDateTime(date:string,time='12:00'):number {
  // Paraguay observes UTC-03 year round. Validate rather than relying on the device timezone.
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))return NaN;
  const result = Date.parse(`${date}T${time}:00-03:00`);
  return Number.isFinite(result) && businessDate(result) === date ? result : NaN;
}
