import { google } from "googleapis";
import { getAuthClient, assertCalendarCanWrite } from "./auth.js";

export async function calendarListCalendars(email: string) {
  const { client } = await getAuthClient(email);
  const calendar = google.calendar({ version: "v3", auth: client });
  const response = await calendar.calendarList.list();
  const items = (response.data.items || []).map((c) => ({
    id: c.id,
    name: c.summary,
    description: c.description,
    primary: c.primary || false,
    accessRole: c.accessRole,
    timeZone: c.timeZone,
  }));
  return JSON.stringify(items, null, 2);
}

export async function calendarListEvents(
  email: string,
  calendarId: string,
  maxResults: number = 10,
  timeMin?: string,
  timeMax?: string,
  query?: string,
  pageToken?: string,
) {
  const { client } = await getAuthClient(email);
  const calendar = google.calendar({ version: "v3", auth: client });
  const response = await calendar.events.list({
    calendarId,
    maxResults,
    singleEvents: true,
    orderBy: "startTime",
    timeMin: timeMin || new Date().toISOString(),
    timeMax: timeMax || undefined,
    q: query || undefined,
    pageToken,
  });
  const events = (response.data.items || []).map((e) => ({
    id: e.id,
    title: e.summary,
    description: e.description,
    location: e.location,
    start: e.start?.dateTime || e.start?.date,
    end: e.end?.dateTime || e.end?.date,
    attendees: (e.attendees || []).map((a) => ({
      email: a.email,
      name: a.displayName,
      status: a.responseStatus,
    })),
    status: e.status,
    htmlLink: e.htmlLink,
  }));
  return JSON.stringify(
    { events, nextPageToken: response.data.nextPageToken || null },
    null,
    2,
  );
}

export async function calendarGetEvent(
  email: string,
  calendarId: string,
  eventId: string,
) {
  const { client } = await getAuthClient(email);
  const calendar = google.calendar({ version: "v3", auth: client });
  const response = await calendar.events.get({ calendarId, eventId });
  const e = response.data;
  return JSON.stringify(
    {
      id: e.id,
      title: e.summary,
      description: e.description,
      location: e.location,
      start: e.start?.dateTime || e.start?.date,
      end: e.end?.dateTime || e.end?.date,
      attendees: (e.attendees || []).map((a) => ({
        email: a.email,
        name: a.displayName,
        status: a.responseStatus,
      })),
      organizer: e.organizer,
      status: e.status,
      htmlLink: e.htmlLink,
      meetLink:
        e.hangoutLink ||
        e.conferenceData?.entryPoints?.find(
          (ep) => ep.entryPointType === "video",
        )?.uri,
      created: e.created,
      updated: e.updated,
    },
    null,
    2,
  );
}

// Meet conference data is generated asynchronously by Calendar; poll briefly
// until the meeting code shows up so we can configure the Meet space afterward.
async function pollForMeetingCode(
  calendar: any,
  calendarId: string,
  eventId: string,
  attempts: number = 5,
): Promise<string | null> {
  for (let i = 0; i < attempts; i++) {
    const ev = await calendar.events.get({ calendarId, eventId });
    const conferenceId = ev.data.conferenceData?.conferenceId;
    if (conferenceId) return conferenceId;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return null;
}

async function enableGeminiNotesForSpace(client: any, meetingCode: string) {
  const meet = google.meet({ version: "v2", auth: client });
  await meet.spaces.patch({
    name: `spaces/${meetingCode}`,
    updateMask: "config.artifactConfig.smartNotesConfig.autoSmartNotesGeneration",
    requestBody: {
      config: {
        artifactConfig: {
          smartNotesConfig: { autoSmartNotesGeneration: "ON" },
        },
      },
    },
  });
}

export async function calendarCreateEvent(
  email: string,
  calendarId: string,
  title: string,
  startDateTime: string,
  endDateTime: string,
  description?: string,
  location?: string,
  attendees?: string,
  isAllDay?: boolean,
  timeZone?: string,
  addGoogleMeet?: boolean,
  enableGeminiNotes?: boolean,
) {
  const { client, permissions } = await getAuthClient(email);
  assertCalendarCanWrite(permissions, email);
  const calendar = google.calendar({ version: "v3", auth: client });

  const attendeeList = attendees
    ? attendees.split(",").map((a) => ({ email: a.trim() }))
    : [];

  const startObj = isAllDay
    ? { date: startDateTime }
    : { dateTime: startDateTime, timeZone };
  const endObj = isAllDay
    ? { date: endDateTime }
    : { dateTime: endDateTime, timeZone };

  const requestBody: any = {
    summary: title,
    description,
    location,
    start: startObj,
    end: endObj,
    attendees: attendeeList.length > 0 ? attendeeList : undefined,
  };

  if (addGoogleMeet) {
    requestBody.conferenceData = {
      createRequest: {
        requestId: `meet-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }

  const response = await calendar.events.insert({
    calendarId,
    conferenceDataVersion: addGoogleMeet ? 1 : undefined,
    requestBody,
  });

  const meetLink =
    response.data.hangoutLink ||
    response.data.conferenceData?.entryPoints?.find(
      (e) => e.entryPointType === "video",
    )?.uri;

  let notesNote = "";
  if (addGoogleMeet && enableGeminiNotes) {
    try {
      const meetingCode =
        response.data.conferenceData?.conferenceId ||
        (await pollForMeetingCode(calendar, calendarId, response.data.id!));
      if (meetingCode) {
        await enableGeminiNotesForSpace(client, meetingCode);
        notesNote = " Gemini note-taking enabled.";
      } else {
        notesNote =
          " (Meet link created, but Gemini notes could not be enabled: conference data was not ready in time.)";
      }
    } catch (e: any) {
      notesNote = ` (Meet link created, but Gemini notes could not be enabled: ${e.message})`;
    }
  }

  return `Event created. ID: ${response.data.id}${meetLink ? `, Meet Link: ${meetLink}` : ""}, Link: ${response.data.htmlLink}.${notesNote}`;
}

export async function calendarUpdateEvent(
  email: string,
  calendarId: string,
  eventId: string,
  title?: string,
  startDateTime?: string,
  endDateTime?: string,
  description?: string,
  location?: string,
  attendees?: string,
  timeZone?: string,
) {
  const { client, permissions } = await getAuthClient(email);
  assertCalendarCanWrite(permissions, email);
  const calendar = google.calendar({ version: "v3", auth: client });

  await calendar.events.get({ calendarId, eventId });
  const patch: any = {};
  if (title !== undefined) patch.summary = title;
  if (description !== undefined) patch.description = description;
  if (location !== undefined) patch.location = location;
  if (startDateTime !== undefined)
    patch.start = { dateTime: startDateTime, timeZone };
  if (endDateTime !== undefined)
    patch.end = { dateTime: endDateTime, timeZone };
  if (attendees !== undefined)
    patch.attendees = attendees.split(",").map((a) => ({ email: a.trim() }));

  const response = await calendar.events.patch({
    calendarId,
    eventId,
    requestBody: patch,
  });
  return `Event updated. ID: ${response.data.id}, Link: ${response.data.htmlLink}`;
}

export async function calendarDeleteEvent(
  email: string,
  calendarId: string,
  eventId: string,
) {
  const { client, permissions } = await getAuthClient(email);
  assertCalendarCanWrite(permissions, email);
  const calendar = google.calendar({ version: "v3", auth: client });
  await calendar.events.delete({ calendarId, eventId });
  return `Event ${eventId} deleted.`;
}

export async function calendarQuickAdd(
  email: string,
  calendarId: string,
  text: string,
) {
  const { client, permissions } = await getAuthClient(email);
  assertCalendarCanWrite(permissions, email);
  const calendar = google.calendar({ version: "v3", auth: client });
  const response = await calendar.events.quickAdd({ calendarId, text });
  return `Event created. ID: ${response.data.id}, Title: ${response.data.summary}, Start: ${response.data.start?.dateTime || response.data.start?.date}, Link: ${response.data.htmlLink}`;
}

export async function calendarRespondToEvent(
  email: string,
  calendarId: string,
  eventId: string,
  responseStatus: "accepted" | "declined" | "tentative",
) {
  const { client, permissions } = await getAuthClient(email);
  assertCalendarCanWrite(permissions, email);
  const calendar = google.calendar({ version: "v3", auth: client });

  const existing = await calendar.events.get({ calendarId, eventId });
  const attendees = existing.data.attendees || [];
  const selfIndex = attendees.findIndex(
    (a) => a.email?.toLowerCase() === email.toLowerCase(),
  );

  if (selfIndex === -1) {
    throw new Error(
      `Account ${email} is not listed as an attendee of event ${eventId}.`,
    );
  }

  attendees[selfIndex] = { ...attendees[selfIndex], responseStatus };

  const response = await calendar.events.patch({
    calendarId,
    eventId,
    requestBody: { attendees },
  });
  return `RSVP updated to '${responseStatus}' for event ${eventId}. Link: ${response.data.htmlLink}`;
}
