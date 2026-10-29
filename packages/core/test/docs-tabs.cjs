// Proves the tabId plumbing added for os #1802: reading or editing one tab
// of a multi-tab document returns/touches only that tab, never the other.
// Mocks the googleapis "google.docs" client (no network, no real document)
// so request shapes can be asserted directly.
// Run: node test/docs-tabs.cjs
const assert = require("node:assert");
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

// A 2-tab document. Each tab's content is independently indexed (both start
// at 1), which is exactly the case a tabId mix-up would get wrong silently.
const TAB_A = { tabId: "t.A", title: "Tab A" };
const TAB_B = { tabId: "t.B", title: "Tab B" };
function fakeDocument() {
  return {
    title: "Demo doc",
    tabs: [
      {
        tabProperties: TAB_A,
        documentTab: {
          body: {
            content: [
              {
                startIndex: 1,
                endIndex: 12,
                paragraph: {
                  elements: [{ textRun: { content: "Tab A text\n" } }],
                  paragraphStyle: { namedStyleType: "NORMAL_TEXT" },
                },
              },
            ],
          },
        },
      },
      {
        tabProperties: TAB_B,
        documentTab: {
          body: {
            content: [
              {
                startIndex: 1,
                endIndex: 12,
                paragraph: {
                  elements: [{ textRun: { content: "Tab B text\n" } }],
                  paragraphStyle: { namedStyleType: "NORMAL_TEXT" },
                },
              },
            ],
          },
        },
      },
    ],
  };
}

// Captures every batchUpdate call so a test can assert exactly what was sent
// to Google, instead of only what docsX() returned.
const batchUpdateCalls = [];
const fakeGoogleapis = {
  google: {
    docs: () => ({
      documents: {
        get: async () => ({ data: fakeDocument() }),
        batchUpdate: async (params) => {
          batchUpdateCalls.push(params);
          return { data: { replies: [{}] } };
        },
      },
    }),
    // Other services aren't exercised by these tests, but auth.ts/registry.ts
    // import `google` from the same module — give it enough surface that an
    // unrelated accidental call fails loudly instead of crashing the mock.
    calendar: () => ({}),
    drive: () => ({}),
    gmail: () => ({}),
    chat: () => ({}),
    sheets: () => ({}),
  },
};

// Install the mock in Node's module cache *before* dist/index.js (and
// everything it requires) loads "googleapis", so docs.ts's
// `import { google } from "googleapis"` resolves to the fake above.
const googleapisPath = require.resolve("googleapis");
require.cache[googleapisPath] = {
  id: googleapisPath,
  filename: googleapisPath,
  loaded: true,
  exports: fakeGoogleapis,
};

const { executeTool } = require("../dist/index.js");

function resolver(permissions) {
  return async () => ({ client: {}, permissions });
}
const fullDocs = resolver({
  gmail: "none",
  calendar: "none",
  drive: "none",
  chat: "none",
  sheets: "none",
  docs: "full",
});

(async () => {
  // 1. No tabId on a multi-tab doc: docs_get_structure returns a tab index,
  //    not a dump of every tab's paragraphs (os #1729 follow-up: a 947k
  //    character response on a real multi-tab doc).
  const indexResult = JSON.parse(
    await executeTool(fullDocs, "docs_get_structure", {
      email: "u@x.com",
      documentId: "doc1",
    }),
  );
  check(
    "docs_get_structure with no tabId returns a tab index, not paragraphs",
    Array.isArray(indexResult.tabs) &&
      indexResult.tabs.length === 2 &&
      indexResult.paragraphs === undefined,
  );

  // 2. tabId: "t.B" returns ONLY tab B's paragraph — tab A's text must not
  //    appear anywhere in the response.
  const structureB = JSON.parse(
    await executeTool(fullDocs, "docs_get_structure", {
      email: "u@x.com",
      documentId: "doc1",
      tabId: "t.B",
    }),
  );
  check(
    "docs_get_structure(tabId=t.B) returns tab B's own paragraph",
    structureB.tabId === "t.B" &&
      structureB.paragraphs.length === 1 &&
      structureB.paragraphs[0].text === "Tab B text\n",
  );
  check(
    "docs_get_structure(tabId=t.B) does not include tab A's text",
    !JSON.stringify(structureB).includes("Tab A text"),
  );

  // 3. Same isolation for docs_get_content.
  const contentB = JSON.parse(
    await executeTool(fullDocs, "docs_get_content", {
      email: "u@x.com",
      documentId: "doc1",
      tabId: "t.B",
    }),
  );
  check(
    "docs_get_content(tabId=t.B) returns tab B's text and not tab A's",
    contentB.content === "Tab B text\n" && !contentB.content.includes("Tab A"),
  );

  // 4. docs_insert_text with tabId=t.B sends location.tabId=t.B to the Docs
  //    API, and the request body contains no mention of tab A at all.
  batchUpdateCalls.length = 0;
  await executeTool(fullDocs, "docs_insert_text", {
    email: "u@x.com",
    documentId: "doc1",
    text: "new text",
    index: 1,
    tabId: "t.B",
  });
  check(
    "docs_insert_text(tabId=t.B) targets tab B in the Docs API request",
    batchUpdateCalls.length === 1 &&
      batchUpdateCalls[0].requestBody.requests[0].insertText.location.tabId === "t.B",
  );
  check(
    "docs_insert_text(tabId=t.B) request never references tab A",
    !JSON.stringify(batchUpdateCalls[0]).includes("t.A"),
  );

  // 5. docs_create_bullets with a nesting level: both the indent request and
  //    the createParagraphBullets request must carry the same tab.
  batchUpdateCalls.length = 0;
  await executeTool(fullDocs, "docs_create_bullets", {
    email: "u@x.com",
    documentId: "doc1",
    startIndex: 1,
    endIndex: 10,
    nestingLevel: 1,
    tabId: "t.B",
  });
  const bulletsReqs = batchUpdateCalls[0]?.requestBody.requests ?? [];
  check(
    "docs_create_bullets(tabId=t.B) scopes both the indent and bullet requests to tab B",
    bulletsReqs.length === 2 &&
      bulletsReqs[0].updateParagraphStyle.range.tabId === "t.B" &&
      bulletsReqs[1].createParagraphBullets.range.tabId === "t.B",
  );

  // 6. docs_delete_content_range with tabId=t.B.
  batchUpdateCalls.length = 0;
  await executeTool(fullDocs, "docs_delete_content_range", {
    email: "u@x.com",
    documentId: "doc1",
    startIndex: 1,
    endIndex: 5,
    tabId: "t.B",
  });
  check(
    "docs_delete_content_range(tabId=t.B) scopes the delete to tab B",
    batchUpdateCalls[0].requestBody.requests[0].deleteContentRange.range.tabId === "t.B",
  );

  // 7. docs_replace_text with tabId=t.B uses tabsCriteria, not a bare scope.
  batchUpdateCalls.length = 0;
  await executeTool(fullDocs, "docs_replace_text", {
    email: "u@x.com",
    documentId: "doc1",
    findText: "foo",
    replaceText: "bar",
    tabId: "t.B",
  });
  check(
    "docs_replace_text(tabId=t.B) scopes the replace via tabsCriteria.tabIds",
    batchUpdateCalls[0].requestBody.requests[0].replaceAllText.tabsCriteria.tabIds[0] === "t.B",
  );

  // 8. Asking for a tab that doesn't exist fails loudly instead of silently
  //    falling back to the first tab.
  let threw = false;
  try {
    await executeTool(fullDocs, "docs_get_structure", {
      email: "u@x.com",
      documentId: "doc1",
      tabId: "t.nonexistent",
    });
  } catch (e) {
    threw = /No tab/.test(e.message);
  }
  check("docs_get_structure(tabId=<unknown>) throws rather than guessing", threw);

  if (failures) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll docs-tabs checks passed.");
})();
