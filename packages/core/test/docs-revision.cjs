// Proves os #1912: reads return the document's revisionId, and
// docs_batch_update passes requiredRevisionId as writeControl so a stale
// revision fails with a clear error and writes nothing.
// Mocks googleapis (no network). Run: node test/docs-revision.cjs
let failures = 0;
function check(label, cond) {
  if (cond) console.log(`✓ ${label}`);
  else {
    console.error(`✗ ${label}`);
    failures++;
  }
}

const CURRENT_REVISION = "rev-2";
const calls = [];
const fakeGoogleapis = {
  google: {
    docs: () => ({
      documents: {
        get: async () => ({
          data: {
            title: "Demo",
            revisionId: CURRENT_REVISION,
            body: {
              content: [
                {
                  startIndex: 1,
                  endIndex: 6,
                  paragraph: { elements: [{ textRun: { content: "Hello\n" } }] },
                },
              ],
            },
          },
        }),
        // Mimics Google: a stale requiredRevisionId is a 400 and writes nothing.
        batchUpdate: async (params) => {
          const required = params.requestBody.writeControl?.requiredRevisionId;
          if (required && required !== CURRENT_REVISION) {
            const e = new Error("Invalid requests[0]: the required revision ID does not match the document's current revision.");
            e.code = 400;
            throw e;
          }
          calls.push(params);
          return { data: { replies: [{}] } };
        },
      },
    }),
    calendar: () => ({}),
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
const fullDocs = async () => ({
  client: {},
  permissions: { gmail: "none", calendar: "none", drive: "none", chat: "none", sheets: "none", docs: "full" },
});
const requests = [{ insertText: { text: "x", location: { index: 1 } } }];

(async () => {
  const structure = JSON.parse(
    await executeTool(fullDocs, "docs_get_structure", { email: "u@x.com", documentId: "d1" }),
  );
  check("docs_get_structure returns revisionId", structure.revisionId === CURRENT_REVISION);

  const content = JSON.parse(
    await executeTool(fullDocs, "docs_get_content", { email: "u@x.com", documentId: "d1" }),
  );
  check("docs_get_content returns revisionId", content.revisionId === CURRENT_REVISION);

  await executeTool(fullDocs, "docs_batch_update", {
    email: "u@x.com",
    documentId: "d1",
    requests,
    requiredRevisionId: CURRENT_REVISION,
  });
  check("matching revision succeeds and sends writeControl", calls.length === 1 &&
    calls[0].requestBody.writeControl.requiredRevisionId === CURRENT_REVISION);

  let message = "";
  try {
    await executeTool(fullDocs, "docs_batch_update", {
      email: "u@x.com",
      documentId: "d1",
      requests,
      requiredRevisionId: "rev-1",
    });
  } catch (e) {
    message = e.message;
  }
  check("stale revision fails with a clear re-read error", /changed since it was read/.test(message) && /re-read/i.test(message));
  check("stale revision writes nothing", calls.length === 1);

  await executeTool(fullDocs, "docs_batch_update", { email: "u@x.com", documentId: "d1", requests });
  check("no revision id: unchanged request body (no writeControl)", calls.length === 2 &&
    !("writeControl" in calls[1].requestBody));

  if (failures) {
    console.error(`${failures} check(s) failed`);
    process.exit(1);
  }
})();
