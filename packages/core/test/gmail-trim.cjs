// Proves gmail_read / gmail_read_thread stripQuotedReplies + maxBodyChars
// (os #1914): plain text and HTML, English and Portuguese "wrote:" lines, a
// 55k-character message, and unchanged output when the options are absent.
// Run: node test/gmail-trim.cjs
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

const b64 = (s) => Buffer.from(s, "utf-8").toString("base64");
const NEW_TEXT = "Thanks, Friday works for me.\nSee you then.";
const quotedHistory = Array.from({ length: 1500 }, (_, i) => `> earlier line ${i} of the quoted history`).join("\n");

const plainEn = `${NEW_TEXT}\n\nOn Thu, Oct 30, 2026 at 10:00 AM Bob Smith <bob@x.com> wrote:\n${quotedHistory}`;
const plainPt = `${NEW_TEXT}\n\nEm qui., 30 de out. de 2026 às 10:00, Bob Silva <bob@x.com> escreveu:\n${quotedHistory}`;
const plainWrapped = `${NEW_TEXT}\n\nOn Thu, Oct 30, 2026 at 10:00 AM Bob Smith\n<bob@x.com> wrote:\n${quotedHistory}`;
const plainQuotesOnly = `${NEW_TEXT}\n> a quoted line\nmore new text`;
const htmlGmail =
  `<div dir="ltr">Thanks, Friday works for me.<br>See you then.</div><br>` +
  `<div class="gmail_quote"><div class="gmail_attr">On Thu, Oct 30, 2026 at 10:00 AM Bob &lt;bob@x.com&gt; wrote:<br></div>` +
  `<blockquote class="gmail_quote">${"<p>earlier html history</p>".repeat(2000)}</blockquote></div>`;
const htmlPtBlockquote =
  `<p>Thanks, Friday works for me.</p><p>See you then.</p>` +
  `<p>Em qui., 30 de out. de 2026 às 10:00, Bob Silva &lt;bob@x.com&gt; escreveu:</p>` +
  `<blockquote>${"<p>historico anterior</p>".repeat(2000)}</blockquote>`;

const textMsg = (id, text) => ({
  id,
  threadId: "t1",
  snippet: "snippet",
  labelIds: [],
  payload: {
    mimeType: "multipart/alternative",
    headers: [{ name: "Subject", value: "Re: plan" }],
    parts: [{ mimeType: "text/plain", body: { data: b64(text) } }],
  },
});
const htmlMsg = (id, html) => ({
  id,
  threadId: "t1",
  snippet: "snippet",
  labelIds: [],
  payload: {
    mimeType: "multipart/alternative",
    headers: [{ name: "Subject", value: "Re: plan" }],
    parts: [{ mimeType: "text/html", body: { data: b64(html) } }],
  },
});

const messages = {
  en: textMsg("en", plainEn),
  pt: textMsg("pt", plainPt),
  wrapped: textMsg("wrapped", plainWrapped),
  quotesOnly: textMsg("quotesOnly", plainQuotesOnly),
  htmlEn: htmlMsg("htmlEn", htmlGmail),
  htmlPt: htmlMsg("htmlPt", htmlPtBlockquote),
};

const fakeGoogleapis = {
  google: {
    gmail: () => ({
      users: {
        messages: { get: async ({ id }) => ({ data: JSON.parse(JSON.stringify(messages[id])) }) },
        threads: {
          get: async () => ({
            data: { messages: [JSON.parse(JSON.stringify(messages.en)), JSON.parse(JSON.stringify(messages.pt))] },
          }),
        },
      },
    }),
    calendar: () => ({}),
    docs: () => ({}),
    drive: () => ({}),
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

const fullGmail = async () => ({
  client: {},
  permissions: { gmail: "full", calendar: "none", drive: "none", chat: "none", sheets: "none", docs: "none" },
});

const read = async (messageId, extra = {}) =>
  JSON.parse(await executeTool(fullGmail, "gmail_read", { email: "u@x.com", messageId, ...extra }));

(async () => {
  // Default behaviour: untouched (full body, quotes included).
  for (const id of ["en", "pt"]) {
    const body = (await read(id)).body;
    check(`default ${id}: full body kept`, body.length > 50000 && body.includes("> earlier line 1499"));
  }
  const defHtml = (await read("htmlEn")).body;
  check("default html: quoted history kept", defHtml.includes("earlier html history") && defHtml.includes("wrote:"));

  // Strip: plain text, English and Portuguese, wrapped header.
  for (const id of ["en", "pt", "wrapped"]) {
    const body = (await read(id, { stripQuotedReplies: true })).body;
    check(`strip ${id}: only the new text remains`, body === NEW_TEXT);
  }
  const q = (await read("quotesOnly", { stripQuotedReplies: true })).body;
  check("strip: '>' lines dropped without a wrote: header", q === `${NEW_TEXT}\nmore new text`);

  // Strip: HTML (gmail_quote container and bare blockquote with Portuguese header).
  const he = (await read("htmlEn", { stripQuotedReplies: true })).body;
  check("strip html (gmail_quote): new text only", he === NEW_TEXT);
  const hp = (await read("htmlPt", { stripQuotedReplies: true })).body;
  check("strip html (blockquote, escreveu): new text only", hp === "Thanks, Friday works for me.\nSee you then.");

  // Cap.
  const capped = (await read("en", { maxBodyChars: 20 })).body;
  check("cap alone: cut at N and says so", capped.startsWith(plainEn.slice(0, 20)) && capped.includes("[truncated: showing first 20 of"));
  const short = (await read("en", { stripQuotedReplies: true, maxBodyChars: 1000 })).body;
  check("cap larger than body: no truncation note", short === NEW_TEXT);
  const both = (await read("en", { stripQuotedReplies: true, maxBodyChars: 10 })).body;
  check("strip + cap: stripped first, then cut", both.startsWith(NEW_TEXT.slice(0, 10)) && both.includes(`of ${NEW_TEXT.length} characters`));

  // 55k case: a few hundred characters instead of 55k.
  check("fixture is >50k chars", plainEn.length > 50000);
  const small = (await read("en", { stripQuotedReplies: true })).body;
  check("stripped 50k+ message is a few hundred chars", small.length < 300);

  // Thread.
  const thread = JSON.parse(
    await executeTool(fullGmail, "gmail_read_thread", { email: "u@x.com", threadId: "t1", stripQuotedReplies: true, maxBodyChars: 500 }),
  );
  check("thread: every message stripped", thread.length === 2 && thread.every((m) => m.body === NEW_TEXT));
  const threadDefault = JSON.parse(await executeTool(fullGmail, "gmail_read_thread", { email: "u@x.com", threadId: "t1" }));
  check("thread default: unchanged", threadDefault.every((m) => m.body.length > 50000));

  // Bad option values are ignored rather than applied.
  const bad = (await read("en", { maxBodyChars: -5, stripQuotedReplies: "yes" })).body;
  check("invalid options ignored", bad.length > 50000);

  if (failures) {
    console.error(`${failures} check(s) failed`);
    process.exit(1);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
