// Offline check of optional attendees: create sends optional: true, update keeps
// each guest's optional flag + RSVP, get/list output shows `optional`.
// Run: node test/calendar-attendees.cjs (after `npm run build`)
const assert = require("node:assert");
const { google } = require("googleapis");
const { executeTool } = require("../dist/index.js");

const resolver = async () => ({
  client: {},
  permissions: { gmail: "none", calendar: "full", drive: "none", chat: "none" },
});

const stored = {
  id: "ev1",
  attendees: [],
};
let inserted, patched;
google.calendar = () => ({
  events: {
    insert: async ({ requestBody }) => {
      inserted = requestBody;
      stored.attendees = requestBody.attendees.map((a) => ({ ...a, responseStatus: "needsAction" }));
      return { data: { id: "ev1", htmlLink: "http://x" } };
    },
    get: async () => ({ data: stored }),
    patch: async ({ requestBody }) => {
      patched = requestBody;
      return { data: { id: "ev1", htmlLink: "http://x" } };
    },
    list: async () => ({ data: { items: [stored] } }),
  },
});

(async () => {
  await executeTool(resolver, "calendar_create_event", {
    email: "u@x.com", calendarId: "primary", title: "t",
    startDateTime: "2026-01-01T10:00:00Z", endDateTime: "2026-01-01T11:00:00Z",
    attendees: "req@x.com", optionalAttendees: "opt@x.com",
  });
  assert.deepStrictEqual(inserted.attendees, [
    { email: "req@x.com" },
    { email: "opt@x.com", optional: true },
  ]);

  // Guests RSVP before the update.
  stored.attendees[0].responseStatus = "accepted";
  stored.attendees[1].responseStatus = "tentative";

  // Replace the list (plus a new guest): existing flags and RSVPs survive.
  await executeTool(resolver, "calendar_update_event", {
    email: "u@x.com", calendarId: "primary", eventId: "ev1",
    attendees: "REQ@x.com, opt@x.com, new@x.com",
  });
  assert.deepStrictEqual(patched.attendees, [
    { email: "req@x.com", responseStatus: "accepted" },
    { email: "opt@x.com", optional: true, responseStatus: "tentative" },
    { email: "new@x.com" },
  ]);

  await executeTool(resolver, "calendar_update_event", {
    email: "u@x.com", calendarId: "primary", eventId: "ev1",
    attendees: "req@x.com", optionalAttendees: "opt@x.com",
  });
  assert.deepStrictEqual(patched.attendees, [
    { email: "req@x.com", responseStatus: "accepted" },
    { email: "opt@x.com", optional: true, responseStatus: "tentative" },
  ]);

  const got = JSON.parse(await executeTool(resolver, "calendar_get_event", { email: "u@x.com", calendarId: "primary", eventId: "ev1" }));
  assert.deepStrictEqual(got.attendees.map((a) => a.optional), [undefined, true]);
  const listed = JSON.parse(await executeTool(resolver, "calendar_list_events", { email: "u@x.com", calendarId: "primary" }));
  assert.deepStrictEqual(listed.events[0].attendees.map((a) => a.optional), [undefined, true]);

  console.log("✓ optional attendees: create, update (flags + RSVP kept), get, list");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
