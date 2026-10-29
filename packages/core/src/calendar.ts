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
      optional: a.optional || undefined,
    })),
    organizer: e.organizer
      ? { email: e.organizer.email, name: e.organizer.displayName, self: e.organizer.self || undefined }
      : undefined,
    // "opaque" (the default) blocks the calendar; "transparent" means the
    // event doesn't show as busy — useful for telling a real meeting from an
    // FYI/reminder entry without opening it.
    transparency: e.transparency,
    meetLink:
      e.hangoutLink ||
      e.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === "video")?.uri,
    status: e.status,
    htmlLink: e.htmlLink,
    // Present only on instances of a repeating event — this is the id of the
    // series itself. Pass it (not this instance's own id) to
    // calendar_update_event/calendar_delete_event to affect the whole series.
    recurringEventId: e.recurringEventId,
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
        optional: a.optional || undefined,
        organizer: a.organizer || undefined,
        self: a.self || undefined,
      })),
      organizer: e.organizer,
      status: e.status,
      // "opaque" (the default) blocks the calendar; "transparent" means the
      // event doesn't show as busy.
      transparency: e.transparency,
      visibility: e.visibility,
      htmlLink: e.htmlLink,
      meetLink:
        e.hangoutLink ||
        e.conferenceData?.entryPoints?.find(
          (ep) => ep.entryPointType === "video",
        )?.uri,
      // recurrence is only present when eventId refers to a series itself
      // (RFC 5545 RRULE/EXRULE/RDATE/EXDATE lines). recurringEventId is only
      // present when eventId refers to one instance of a series.
      recurrence: e.recurrence,
      recurringEventId: e.recurringEventId,
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

function splitEmails(list?: string): string[] {
  return (list || "")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
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
  recurrence?: string[],
  optionalAttendees?: string,
) {
  const { client, permissions } = await getAuthClient(email);
  assertCalendarCanWrite(permissions, email);
  const calendar = google.calendar({ version: "v3", auth: client });

  const attendeeList = [
    ...splitEmails(attendees).map((a) => ({ email: a })),
    ...splitEmails(optionalAttendees).map((a) => ({ email: a, optional: true })),
  ];

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
    recurrence: recurrence && recurrence.length > 0 ? recurrence : undefined,
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

  const recurrenceNote =
    response.data.recurrence && response.data.recurrence.length > 0
      ? ` Repeats: ${response.data.recurrence.join("; ")}.`
      : "";

  return `Event created. ID: ${response.data.id}${meetLink ? `, Meet Link: ${meetLink}` : ""}, Link: ${response.data.htmlLink}.${notesNote}${recurrenceNote}`;
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
  recurrence?: string[],
  addGoogleMeet?: boolean,
  meetLink?: string,
  sendUpdates?: "all" | "externalOnly" | "none",
  optionalAttendees?: string,
) {
  if (addGoogleMeet && meetLink)
    throw new Error("Pass addGoogleMeet or meetLink, not both.");
  const meetCode = meetLink ? parseMeetCode(meetLink) : undefined;

  const { client, permissions } = await getAuthClient(email);
  assertCalendarCanWrite(permissions, email);
  const calendar = google.calendar({ version: "v3", auth: client });

  const existing = await calendar.events.get({ calendarId, eventId });
  const patch: any = {};
  if (title !== undefined) patch.summary = title;
  if (description !== undefined) patch.description = description;
  if (location !== undefined) patch.location = location;
  if (startDateTime !== undefined)
    patch.start = { dateTime: startDateTime, timeZone };
  if (endDateTime !== undefined)
    patch.end = { dateTime: endDateTime, timeZone };
  // Passing either list replaces the guest list. Anyone already on the event
  // keeps their entry (optional flag, RSVP status); optionalAttendees forces
  // optional: true. Anyone in neither list is removed.
  if (attendees !== undefined || optionalAttendees !== undefined) {
    const current = new Map(
      (existing.data.attendees || []).map((a) => [(a.email || "").toLowerCase(), a]),
    );
    const optionalSet = new Set(splitEmails(optionalAttendees).map((a) => a.toLowerCase()));
    const seen = new Set<string>();
    patch.attendees = [...splitEmails(attendees), ...splitEmails(optionalAttendees)]
      .filter((a) => !seen.has(a.toLowerCase()) && seen.add(a.toLowerCase()))
      .map((a) => {
        const entry: any = { ...(current.get(a.toLowerCase()) ?? { email: a }) };
        if (optionalSet.has(a.toLowerCase())) entry.optional = true;
        return entry;
      });
  }
  // Pass [] to clear an event's recurrence (turn it back into a single event).
  if (recurrence !== undefined) patch.recurrence = recurrence;

  // Replace the conference itself, not add a second link to the description:
  // the "Join with Google Meet" button reads conferenceData, so a link anywhere
  // else leaves two rooms on one invite.
  if (addGoogleMeet) {
    patch.conferenceData = {
      createRequest: {
        requestId: `meet-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  } else if (meetCode) {
    patch.conferenceData = {
      conferenceId: meetCode,
      conferenceSolution: { key: { type: "hangoutsMeet" } },
      entryPoints: [
        {
          entryPointType: "video",
          uri: `https://meet.google.com/${meetCode}`,
          label: `meet.google.com/${meetCode}`,
        },
      ],
    };
  }
  const touchesConference = Boolean(addGoogleMeet || meetCode);
  const emailed = sendUpdates ?? "none";

  const response = await calendar.events.patch({
    calendarId,
    eventId,
    requestBody: patch,
    conferenceDataVersion: touchesConference ? 1 : undefined,
    sendUpdates: emailed,
  });

  let meetNote = "";
  if (touchesConference) {
    const newMeet =
      response.data.hangoutLink ||
      response.data.conferenceData?.entryPoints?.find(
        (e) => e.entryPointType === "video",
      )?.uri;
    const pending =
      response.data.conferenceData?.createRequest?.status?.statusCode ===
      "pending";
    meetNote = newMeet
      ? `, Meet Link: ${newMeet}`
      : pending
        ? ", Meet Link: still being created, read the event again in a few seconds"
        : ", Meet Link: Google did not return one";
  }
  return `Event updated. ID: ${response.data.id}${meetNote}, Link: ${response.data.htmlLink}, Guests emailed: ${emailed}`;
}

/** Accepts https://meet.google.com/abc-defg-hij or the bare abc-defg-hij code. */
export function parseMeetCode(link: string): string {
  const code = link
    .trim()
    .replace(/^https?:\/\/meet\.google\.com\//, "")
    .split(/[?#/]/)[0];
  if (!/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(code))
    throw new Error(
      `"${link}" is not a Meet link. Expected https://meet.google.com/abc-defg-hij or abc-defg-hij.`,
    );
  return code;
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
