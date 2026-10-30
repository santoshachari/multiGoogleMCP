// Proves docs_get_content's format/maxChars options (os #1913) on a multi-tab
// document: markdown keeps headings, bullets, nesting and bold; maxChars
// truncates; the output never includes another tab.
// Run: node test/docs-content-markdown.cjs
const Module = require("node:module");

let failures = 0;
function check(label, cond) {
  if (cond) console.log(`✓ ${label}`);
  else {
    console.error(`✗ ${label}`);
    failures++;
  }
}

const para = (runs, extra = {}) => ({
  paragraph: {
    elements: runs.map(([content, bold]) => ({ textRun: { content, textStyle: bold ? { bold: true } : {} } })),
    paragraphStyle: { namedStyleType: extra.style || "NORMAL_TEXT" },
    ...(extra.bullet ? { bullet: extra.bullet } : {}),
  },
});

function fakeDocument() {
  return {
    title: "Demo doc",
    tabs: [
      {
        tabProperties: { tabId: "t.A", title: "Tab A" },
        documentTab: { body: { content: [para([["Other tab secret\n"]])] } },
      },
      {
        tabProperties: { tabId: "t.B", title: "Tab B" },
        documentTab: {
          lists: {
            "kix.num": { listProperties: { nestingLevels: [{ glyphType: "DECIMAL" }] } },
            "kix.bul": { listProperties: { nestingLevels: [{ glyphType: "GLYPH_TYPE_UNSPECIFIED" }, {}] } },
          },
          body: {
            content: [
              para([["Newest entry\n"]], { style: "HEADING_2" }),
              para([["Done: ", false], ["shipped", true], [" it\n", false]], { bullet: { listId: "kix.bul", nestingLevel: 0 } }),
              para([["nested point\n"]], { bullet: { listId: "kix.bul", nestingLevel: 1 } }),
              para([["first step\n"]], { bullet: { listId: "kix.num", nestingLevel: 0 } }),
              para([["Plain closing paragraph\n"]]),
            ],
          },
        },
      },
    ],
  };
}

const fakeGoogleapis = {
  google: {
    docs: () => ({ documents: { get: async () => ({ data: fakeDocument() }) } }),
    calendar: () => ({}),
    drive: () => ({}),
    gmail: () => ({}),
    chat: () => ({}),
    sheets: () => ({}),
  },
};
const googleapisPath = require.resolve("googleapis");
require.cache[googleapisPath] = { id: googleapisPath, filename: googleapisPath, loaded: true, exports: fakeGoogleapis };

const { executeTool } = require("../dist/index.js");
const fullDocs = async () => ({
  client: {},
  permissions: { gmail: "none", calendar: "none", drive: "none", chat: "none", sheets: "none", docs: "full" },
});
const read = async (extra) =>
  JSON.parse(await executeTool(fullDocs, "docs_get_content", { email: "u@x.com", documentId: "doc1", ...extra }));

(async () => {
  const md = await read({ tabId: "t.B", format: "markdown" });
  check(
    "markdown keeps heading, bold, bullets, nesting and numbering",
    md.content ===
      "## Newest entry\n- Done: **shipped** it\n  - nested point\n1. first step\nPlain closing paragraph\n",
  );
  check("markdown for tab B excludes tab A", !JSON.stringify(md).includes("Other tab secret"));

  const cut = await read({ tabId: "t.B", format: "markdown", maxChars: 20 });
  check(
    "maxChars truncates and reports totals",
    cut.content === md.content.slice(0, 20) && cut.truncated === true && cut.totalChars === md.content.length,
  );

  const big = await read({ tabId: "t.B", format: "markdown", maxChars: 5000 });
  check("maxChars larger than the tab is not marked truncated", big.truncated === undefined);

  const text = await read({ tabId: "t.B" });
  check("default format is unchanged plain text", text.content.startsWith("Newest entry\nDone: shipped it\n"));

  const index = await read({ format: "markdown" });
  check("multi-tab doc without tabId still returns a tab index", Array.isArray(index.tabs) && index.content === undefined);

  if (failures) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll docs-content-markdown checks passed.");
})();
