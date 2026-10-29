// Proves optional attendees (os #1800): create sends optional: true, de-dupes
// ignoring case; update keeps optional flags and RSVP state; get and list show
// `optional`. The mock insert/patch really store the attendees, and every
// check reads the event back through get and list.
// Run: node test/calendar-optional.cjs
const Module = require("node:module");

let failures = 0;
function check(label, cond) {
  if (cond) {
    console.log(`✓ ${label}`);
  } else {
    console.error(`✗ ${label}`);
    failures++;
  }
}

let stored = null;
const insertCalls = [];
const patchCalls = [];
const fakeGoogleapis = {
  google: {
    calendar: () => ({
      events: {
        insert: async (params) => {
          insertCalls.push(params);
          stored = { id: "ev1", htmlLink: "http://x", ...params.requestBody };
          return { data: stored };
        },
        get: async () => ({ data: JSON.parse(JSON.stringify(stored)) }),
        list: async () => ({ data: { items: [JSON.parse(JSON.stringify(stored))] } }),
        patch: async (params) => {
          patchCalls.push(params);
          // A real patch replaces the attendees array wholesale.
          stored = { ...stored, ...params.requestBody };
          return { data: stored };
        },
      },
    }),
    docs: () => ({}),
    drive: () => ({}),
    gmail: () => ({}),
    chat: () => ({}),
    sheets: () => ({}),
  },
};

const googleapisPath = require.resolve("googleapis");
require.cache[googleapisPath] = {
  id: googleapisPath,
  filename: googleapisPath,
  loaded: true,
  exports: fakeGoogleapis,
};

const { executeTool } = require("../dist/index.js");

const fullCalendar = async () => ({
  client: {},
  permissions: {
    gmail: "none",
    calendar: "full",
    drive: "none",
    chat: "none",
    sheets: "none",
    docs: "none",
  },
});

async function readBack() {
  const got = JSON.parse(
    await executeTool(fullCalendar, "calendar_get_event", {
      email: "u@x.com",
      calendarId: "primary",
      eventId: "ev1",
    }),
  );
  const listed = JSON.parse(
    await executeTool(fullCalendar, "calendar_list_events", {
      email: "u@x.com",
      calendarId: "primary",
    }),
  ).events[0];
  return { got: got.attendees, listed: listed.attendees };
}
const find = (list, email) => list.find((a) => a.email === email);

(async () => {
  // 1. Create: one required, one optional, plus case-variant duplicates and an
  //    address present in both lists (optional wins).
  await executeTool(fullCalendar, "calendar_create_event", {
    email: "u@x.com",
    calendarId: "primary",
    title: "Call",
    startDateTime: "2026-10-30T10:00:00Z",
    endDateTime: "2026-10-30T11:00:00Z",
    attendees: "a@x.com, A@X.com, both@x.com",
    optionalAttendees: "rahul@x.com, RAHUL@x.com, BOTH@x.com",
  });
  const sent = insertCalls[0].requestBody.attendees;
  check("create sends 3 de-duplicated attendees", sent.length === 3);
  check("create: required attendee has no optional flag", !find(sent, "a@x.com").optional);
  check("create: optional attendee sent optional: true", find(sent, "rahul@x.com").optional === true);
  check("create: address in both lists is optional", find(sent, "both@x.com").optional === true);

  let back = await readBack();
  for (const [name, list] of [["get", back.got], ["list", back.listed]]) {
    check(`${name} after create: a@x.com required`, !find(list, "a@x.com").optional);
    check(`${name} after create: rahul@x.com optional`, find(list, "rahul@x.com").optional === true);
  }

  // Guests respond.
  stored.attendees.find((a) => a.email === "a@x.com").responseStatus = "accepted";
  stored.attendees.find((a) => a.email === "rahul@x.com").responseStatus = "tentative";

  // 2. Update: replace the list (add c@x.com, drop both@x.com), passing the
  //    existing guests in different case. Flags and RSVP must survive.
  await executeTool(fullCalendar, "calendar_update_event", {
    email: "u@x.com",
    calendarId: "primary",
    eventId: "ev1",
    attendees: "A@x.com, c@x.com",
    optionalAttendees: "Rahul@x.com",
  });
  back = await readBack();
  for (const [name, list] of [["get", back.got], ["list", back.listed]]) {
    check(`${name} after update: 3 guests`, list.length === 3);
    const a = list.find((x) => x.email.toLowerCase() === "a@x.com");
    const r = list.find((x) => x.email.toLowerCase() === "rahul@x.com");
    const c = find(list, "c@x.com");
    check(`${name} after update: a still required and accepted`, !a.optional && a.status === "accepted");
    check(`${name} after update: rahul still optional and tentative`, r.optional === true && r.status === "tentative");
    check(`${name} after update: new guest c is plain`, c && !c.optional && !c.status);
    check(`${name} after update: both@x.com removed`, !find(list, "both@x.com"));
  }

  // 3. Update with attendees only keeps the optional flag of a staying guest.
  await executeTool(fullCalendar, "calendar_update_event", {
    email: "u@x.com",
    calendarId: "primary",
    eventId: "ev1",
    attendees: "rahul@x.com",
  });
  back = await readBack();
  check(
    "update with attendees only keeps optional and RSVP",
    back.got.length === 1 &&
      back.got[0].optional === true &&
      back.got[0].status === "tentative" &&
      back.listed[0].optional === true,
  );

  if (failures) {
    console.error(`${failures} check(s) failed`);
    process.exit(1);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
