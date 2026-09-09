import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from './firebase';

let cachedAccessToken: string | null = null;

export const getCachedAccessToken = () => cachedAccessToken;
export const setCachedAccessToken = (token: string | null) => {
  cachedAccessToken = token;
};

export const authorizeGoogleCalendar = async (): Promise<string | null> => {
  const provider = new GoogleAuthProvider();
  provider.addScope('https://www.googleapis.com/auth/calendar.events');
  provider.setCustomParameters({
    prompt: 'consent',
  });
  
  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) {
      cachedAccessToken = credential.accessToken;
      return cachedAccessToken;
    }
  } catch (error) {
    console.error("Error connecting to Google Calendar", error);
    throw error;
  }
  return null;
};

export interface CalendarEvent {
  summary: string;
  description: string;
  startDate: string; // "YYYY-MM-DD"
  time?: string; // "HH:MM" (e.g. "10:30")
  durationMinutes?: number; // e.g. 30, 60
  notificationMinutes?: number; // e.g. 10, 15, 30, 60, 1440
  location?: string;
}

export const createGoogleCalendarEvent = async (event: CalendarEvent): Promise<boolean> => {
  const token = cachedAccessToken;
  if (!token) {
    console.error("No access token found. Please authorize Google Calendar.");
    return false;
  }

  const notificationMin = event.notificationMinutes !== undefined ? event.notificationMinutes : 30;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Asuncion';

  let eventBody: any = {
    summary: event.summary,
    description: event.description,
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: notificationMin },
        { method: 'email', minutes: notificationMin }
      ]
    }
  };

  if (event.location) {
    eventBody.location = event.location;
  }

  if (event.time && event.time.includes(':')) {
    const [hoursStr, minutesStr] = event.time.split(':');
    const hours = parseInt(hoursStr, 10);
    const minutes = parseInt(minutesStr, 10);

    const [year, month, day] = event.startDate.split('-').map(Number);
    const startDateTime = new Date(year, month - 1, day, hours, minutes, 0);
    const duration = event.durationMinutes || 30;
    const endDateTime = new Date(startDateTime.getTime() + duration * 60 * 1000);

    // Format ISO strings without milliseconds
    const formatISO = (d: Date) => {
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
    };

    eventBody.start = {
      dateTime: `${formatISO(startDateTime)}`,
      timeZone: timeZone,
    };
    eventBody.end = {
      dateTime: `${formatISO(endDateTime)}`,
      timeZone: timeZone,
    };
  } else {
    const startAndEnd = getEventDates(event.startDate);
    eventBody.start = {
      date: startAndEnd.start,
    };
    eventBody.end = {
      date: startAndEnd.end,
    };
  }
  
  try {
    const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(eventBody)
    });
    
    if (response.ok) {
      console.log("Calendar event created successfully with notification:", notificationMin, "minutes");
      return true;
    } else {
      const errData = await response.json();
      console.error("Error creating Google Calendar event:", errData);
      return false;
    }
  } catch (err) {
    console.error("Network error when creating Google Calendar event", err);
    return false;
  }
};

// Helper to calculate exact exclusive end date for all-day events
function getEventDates(startDateStr: string) {
  const dateParts = startDateStr.split('-');
  const year = parseInt(dateParts[0], 10);
  const month = parseInt(dateParts[1], 10) - 1;
  const day = parseInt(dateParts[2], 10);
  
  const startDate = new Date(year, month, day);
  const endDate = new Date(year, month, day + 1);
  
  const format = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dayStr = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dayStr}`;
  };
  
  return {
    start: format(startDate),
    end: format(endDate)
  };
}
