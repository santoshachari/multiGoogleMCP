// Proves os #1912: docs_batch_update can be guarded by the revisionId a read
// tool returned, so a write fails cleanly (and writes nothing) when the
// document changed since it was read. Mocks the googleapis "google.docs"
// client; the fake rejects a stale requiredRevisionId the way the Docs API does.
// Run: node test/docs-revision.cjs
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

const CURRENT_REVISION = "rev-2";
const applied = [];
const fakeGoogleapis = {
  google: {
    docs: () => ({
      documents: {
        get: async () => ({
          data: {
            title: "Daily catch-up",
            revisionId: CURRENT_REVISION,
            body: {
              content: [
                {
                  startIndex: 1,
                  endIndex: 6,
                  paragraph: {
                    elements: [{ textRun: { content: "Hello\n" } }],
                    paragraphStyle: { namedStyleType: "NORMAL_TEXT" },
                  },
                },
              ],
            },
          },
        }),
        batchUpdate: async (params) => {
          const required = params.requestBody.writeControl?.requiredRevisionId;
          if (required && required !== CURRENT_REVISION) {
            const err = new Error("The requested revision ID is not the latest revision of the document.");
            err.code = 400;
            throw err;
          }
          applied.push(params);
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
const base = { email: "u@x.com", documentId: "doc1", requests: [{ insertText: { text: "x", location: { index: 1 } } }] };

(async () => {
  const structure = JSON.parse(await executeTool(fullDocs, "docs_get_structure", { email: "u@x.com", documentId: "doc1" }));
  check("docs_get_structure returns revisionId", structure.revisionId === CURRENT_REVISION);
  const content = JSON.parse(await executeTool(fullDocs, "docs_get_content", { email: "u@x.com", documentId: "doc1" }));
  check("docs_get_content returns revisionId", content.revisionId === CURRENT_REVISION);

  // Matching revision succeeds and is passed through as writeControl.
  applied.length = 0;
  await executeTool(fullDocs, "docs_batch_update", { ...base, requiredRevisionId: CURRENT_REVISION });
  check(
    "matching requiredRevisionId succeeds and is sent as writeControl",
    applied.length === 1 && applied[0].requestBody.writeControl.requiredRevisionId === CURRENT_REVISION,
  );

  // Stale revision fails with a clear error and writes nothing.
  applied.length = 0;
  let message = "";
  try {
    await executeTool(fullDocs, "docs_batch_update", { ...base, requiredRevisionId: "rev-1" });
  } catch (e) {
    message = e.message;
  }
  check("stale requiredRevisionId throws a 'document changed' error", /document changed/i.test(message) && /re-read/i.test(message));
  check("stale requiredRevisionId writes nothing", applied.length === 0);

  // No revision id: behaves exactly as before (no writeControl key at all).
  applied.length = 0;
  await executeTool(fullDocs, "docs_batch_update", base);
  check(
    "without requiredRevisionId the request has no writeControl",
    applied.length === 1 && !("writeControl" in applied[0].requestBody),
  );

  if (failures) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll docs-revision checks passed.");
})();
