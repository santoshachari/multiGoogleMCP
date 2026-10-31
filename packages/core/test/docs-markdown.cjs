// Covers docs_get_content format=markdown / limit on a multi-tab document
// (os #1913): list nesting, escaping, bold, tab isolation, truncation.
// Run: node test/docs-markdown.cjs
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
    elements: runs.map((r) => (typeof r === "string" ? { textRun: { content: r } } : { textRun: r })),
    paragraphStyle: { namedStyleType: "NORMAL_TEXT" },
    ...extra,
  },
});
const item = (text, listId, nestingLevel, runs) =>
  para(runs || [text + "\n"], { bullet: { listId, nestingLevel } });

function fakeDocument() {
  return {
    title: "Demo doc",
    tabs: [
      {
        tabProperties: { tabId: "t.A", title: "Tab A" },
        documentTab: {
          lists: {
            num: { listProperties: { nestingLevels: [{ glyphType: "DECIMAL" }, { glyphType: "GLYPH_TYPE_UNSPECIFIED" }] } },
            dot: { listProperties: { nestingLevels: [{ bulletSymbol: "●" }, { bulletSymbol: "○" }] } },
            five: { listProperties: { nestingLevels: [{ glyphType: "DECIMAL", startNumber: 5 }] } },
          },
          body: {
            content: [
              { paragraph: { ...para(["Title\n"]).paragraph, paragraphStyle: { namedStyleType: "HEADING_2" } } },
              item("", "num", 0, ["First ", { content: "bold", textStyle: { bold: true } }, "\n"]),
              item("Child of numbered", "num", 1),
              item("Second", "num", 0),
              item("Dot parent", "dot", 0),
              item("Dot child", "dot", 1),
              para(["*important* and [label](http://x.y)\n"]),
              para(["# not a heading\n"]),
              item("Five", "five", 0),
              item("Six", "five", 0),
              para([
                { content: "foo", textStyle: { bold: true } },
                { content: "bar", textStyle: { bold: true } },
                " plain\n",
              ]),
            ],
          },
        },
      },
      {
        tabProperties: { tabId: "t.B", title: "Tab B" },
        documentTab: { body: { content: [para(["Only in B\n"])] } },
      },
    ],
  };
}

const googleapisPath = require.resolve("googleapis");
require.cache[googleapisPath] = {
  id: googleapisPath,
  filename: googleapisPath,
  loaded: true,
  exports: {
    google: {
      docs: () => ({ documents: { get: async () => ({ data: fakeDocument() }) } }),
      calendar: () => ({}),
      drive: () => ({}),
      gmail: () => ({}),
      chat: () => ({}),
      sheets: () => ({}),
    },
  },
};

const { executeTool } = require("../dist/index.js");
const perms = { gmail: "none", calendar: "none", drive: "none", chat: "none", sheets: "none", docs: "full" };
const resolver = async () => ({ client: {}, permissions: perms });
const read = async (extra) =>
  JSON.parse(await executeTool(resolver, "docs_get_content", { email: "u@x.com", documentId: "d", ...extra }));

(async () => {
  const a = await read({ tabId: "t.A", format: "markdown" });
  const lines = a.content.split("\n");

  check("heading rendered", lines[0] === "## Title");
  check("bold preserved in numbered item", a.content.includes("1. First **bold**"));
  check(
    "child of numbered parent indented 3 spaces",
    lines.includes("   - Child of numbered") && !lines.includes("  - Child of numbered"),
  );
  check("numbering continues after child", a.content.includes("2. Second"));
  check("bullet child indented 2 spaces", a.content.includes("- Dot parent\n  - Dot child"));
  check("emphasis and link syntax escaped", a.content.includes("\\*important\\* and \\[label\\](http://x.y)"));
  check("leading '# ' escaped", a.content.includes("\\# not a heading"));
  check("ordered list honors startNumber", a.content.includes("5. Five\n6. Six"));
  check("other tab excluded", !a.content.includes("Only in B"));

  const b = await read({ tabId: "t.B", format: "markdown" });
  check("tab B has only its own text", b.content === "Only in B\n");

  const cut = await read({ tabId: "t.A", format: "markdown", limit: 20 });
  check("limit truncates", cut.content.length === 20 && cut.truncated === true && cut.totalCharacters === a.content.length);

  check("adjacent bold runs merged", a.content.includes("**foobar** plain") && !a.content.includes("****"));

  const zero = await read({ tabId: "t.A", format: "markdown", limit: 0 });
  check("limit 0 returns nothing", zero.content === "" && zero.truncated === true);
  for (const bad of [-1, 1.5, "5"]) {
    let threw = false;
    try {
      await read({ tabId: "t.A", limit: bad });
    } catch {
      threw = true;
    }
    check(`invalid limit ${JSON.stringify(bad)} rejected`, threw);
  }

  const text = await read({ tabId: "t.A" });
  check("default format stays plain text", text.content.startsWith("Title\nFirst bold\n"));

  if (failures) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll docs-markdown checks passed.");
})();
