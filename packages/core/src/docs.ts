import { google } from "googleapis";
import { getAuthClient, assertDocsCanWrite } from "./auth.js";

// Walks a Docs API structural-elements tree and concatenates the plain text
// of every paragraph — tables and other structural elements are skipped for
// now (nested table cells have their own `content` arrays; add if needed).
function extractDocText(content: any[]): string {
  let text = "";
  for (const el of content || []) {
    if (el.paragraph) {
      for (const pe of el.paragraph.elements || []) {
        if (pe.textRun?.content) text += pe.textRun.content;
      }
    } else if (el.table) {
      for (const row of el.table.tableRows || []) {
        for (const cell of row.tableCells || []) {
          text += extractDocText(cell.content);
        }
      }
    }
  }
  return text;
}

// Escapes literal Markdown syntax so ordinary text can't gain formatting or
// links it doesn't have in the doc. Runs on raw text, before any generated
// formatting (bold, links, list markers) is added around it.
export function escapeMarkdown(text: string): string {
  return text
    .replace(/[\\`*_\[\]<>#|~]/g, "\\$&")
    .replace(/^(\s*)([-+])(?=\s)/, "$1\\$2")
    .replace(/^(\s*\d+)([.)])(?=\s)/, "$1\\$2");
}

// Wraps a run's text in emphasis markers, keeping them against the non-space
// text (Markdown ignores `** bold **`).
function wrapRun(text: string, style: any): string {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text)!;
  if (!m[2]) return text;
  let inner = escapeMarkdown(m[2]);
  if (style?.bold) inner = `**${inner}**`;
  if (style?.italic) inner = `*${inner}*`;
  if (style?.strikethrough) inner = `~~${inner}~~`;
  const url = style?.link?.url;
  if (url) inner = `[${inner}](${String(url).replace(/\)/g, "%29").replace(/ /g, "%20")})`;
  return m[1] + inner + m[3];
}

// Renders a tab's structural elements as Markdown: headings, bold/italic/
// links, and bulleted/numbered lists with nesting. A list child is indented by
// its parent's indent plus the parent's marker width ("- " = 2, "1. " = 3,
// "10. " = 4) — a fixed step would leave children of numbered items outside
// the item.
function renderMarkdown(content: any[], lists: any): string {
  const lines: string[] = [];
  // Per list: the counters and the content-column of each open nesting level.
  const state = new Map<string, { counts: number[]; cols: number[] }>();

  const renderParagraph = (p: any): string => {
    // Adjacent runs with the same emphasis/link are merged before wrapping,
    // otherwise bold "foo" + bold "bar" would render as `**foo****bar**`.
    const runs: { text: string; style: any; key: string }[] = [];
    for (const pe of p.elements || []) {
      const content = pe.textRun?.content;
      if (!content) continue;
      const style = pe.textRun.textStyle;
      const key = JSON.stringify([!!style?.bold, !!style?.italic, !!style?.strikethrough, style?.link?.url || ""]);
      const last = runs[runs.length - 1];
      if (last && last.key === key) last.text += content;
      else runs.push({ text: content, style, key });
    }
    const body = runs
      .map((r) => wrapRun(r.text, r.style))
      .join("")
      .replace(/\n+$/, "")
      .replace(/\n/g, "  \n");
    const bullet = p.bullet;
    if (bullet) {
      const level = bullet.nestingLevel ?? 0;
      const st = state.get(bullet.listId) ?? { counts: [], cols: [] };
      state.set(bullet.listId, st);
      const levelProps = lists?.[bullet.listId]?.listProperties?.nestingLevels?.[level];
      const glyphType = levelProps?.glyphType;
      const ordered = !!glyphType && glyphType !== "GLYPH_TYPE_UNSPECIFIED" && glyphType !== "NONE";
      st.counts.length = level + 1;
      st.cols.length = level + 1;
      const count = st.counts[level] === undefined ? (levelProps?.startNumber ?? 1) : st.counts[level] + 1;
      st.counts[level] = count;
      let indent = 0;
      for (let l = level - 1; l >= 0; l--) {
        if (st.cols[l] !== undefined) {
          indent = st.cols[l];
          break;
        }
      }
      const marker = ordered ? `${count}. ` : "- ";
      st.cols[level] = indent + marker.length;
      return " ".repeat(indent) + marker + body;
    }
    const heading = /^HEADING_(\d)$/.exec(p.paragraphStyle?.namedStyleType || "");
    if (heading) return `${"#".repeat(Number(heading[1]))} ${body}`;
    if (p.paragraphStyle?.namedStyleType === "TITLE") return `# ${body}`;
    return body;
  };

  const walk = (els: any[]) => {
    for (const el of els || []) {
      if (el.paragraph) {
        const isList = !!el.paragraph.bullet;
        const line = renderParagraph(el.paragraph);
        // Blank lines separate paragraphs; consecutive list items stay tight.
        if (!isList || !lines.length || !/^\s*(- |\d+\. )/.test(lines[lines.length - 1])) {
          if (lines.length && line !== "") lines.push("");
        }
        if (line !== "") lines.push(line);
      } else if (el.table) {
        for (const row of el.table.tableRows || []) {
          const cells = (row.tableCells || []).map((cell: any) => {
            const sub: string[] = [];
            for (const ce of cell.content || []) {
              if (ce.paragraph) sub.push(renderParagraph(ce.paragraph).trim());
            }
            return sub.filter(Boolean).join(" ");
          });
          lines.push(`| ${cells.join(" | ")} |`);
        }
      }
    }
  };
  walk(content);
  return lines.join("\n") + (lines.length ? "\n" : "");
}

export async function docsGetContent(
  email: string,
  documentId: string,
  tabId?: string,
  format: "text" | "markdown" = "text",
  limit?: number,
) {
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 0)) {
    throw new Error("limit must be a nonnegative integer.");
  }
  const { client } = await getAuthClient(email);
  const docs = google.docs({ version: "v1", auth: client });

  // Same reason as docsGetStructure: without includeTabsContent, a multi-tab
  // document only returns its first tab in `body`, silently dropping the rest.
  const response = await docs.documents.get({ documentId, includeTabsContent: true });
  const title = response.data.title;
  const tabs = flattenTabs((response.data as any).tabs || []);
  const allTabs =
    tabs.length > 0
      ? tabs
      : [{ tabId: undefined, title, content: response.data.body?.content || [], lists: (response.data as any).lists }];

  const render = (tab: { content: any[]; lists?: any }) => {
    const full = format === "markdown" ? renderMarkdown(tab.content, tab.lists) : extractDocText(tab.content);
    if (limit === undefined || full.length <= limit) return { content: full };
    return { content: full.slice(0, limit), truncated: true, totalCharacters: full.length };
  };

  if (tabId) {
    const target = findTab(allTabs, tabId);
    return JSON.stringify({ title, tabId: target.tabId, tabTitle: target.title, ...render(target) }, null, 2);
  }

  if (allTabs.length === 1) {
    return JSON.stringify({ title, ...render(allTabs[0]) }, null, 2);
  }

  return JSON.stringify(
    {
      title,
      tabs: allTabs.map((t) => ({ tabId: t.tabId, title: t.title })),
      note: "This document has multiple tabs. Pass tabId to get one tab's content.",
    },
    null,
    2,
  );
}

// The document body always ends with a trailing newline structural element
// that can't be written into — insert one position before it.
async function endIndex(docs: any, documentId: string, tabId?: string): Promise<number> {
  if (!tabId) {
    const doc = await docs.documents.get({ documentId });
    const content = doc.data.body?.content || [];
    const last = content[content.length - 1];
    return Math.max(1, (last?.endIndex ?? 1) - 1);
  }
  const doc = await docs.documents.get({ documentId, includeTabsContent: true });
  const tabs = flattenTabs((doc.data as any).tabs || []);
  const target = findTab(tabs, tabId);
  const last = target.content[target.content.length - 1];
  return Math.max(1, (last?.endIndex ?? 1) - 1);
}

export async function docsAppendText(
  email: string,
  documentId: string,
  text: string,
  tabId?: string,
) {
  const { client, permissions } = await getAuthClient(email);
  assertDocsCanWrite(permissions, email);
  const docs = google.docs({ version: "v1", auth: client });
  const index = await endIndex(docs, documentId, tabId);
  await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [{ insertText: { text, location: { index, ...(tabId ? { tabId } : {}) } } }],
    },
  });
  return `Appended ${text.length} character(s) to the end of the document${tabId ? ` (tab ${tabId})` : ""}.`;
}

export async function docsInsertText(
  email: string,
  documentId: string,
  text: string,
  index: number,
  tabId?: string,
) {
  const { client, permissions } = await getAuthClient(email);
  assertDocsCanWrite(permissions, email);
  const docs = google.docs({ version: "v1", auth: client });
  await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [{ insertText: { text, location: { index, ...(tabId ? { tabId } : {}) } } }],
    },
  });
  return `Inserted ${text.length} character(s) at index ${index}${tabId ? ` (tab ${tabId})` : ""}.`;
}

export async function docsReplaceText(
  email: string,
  documentId: string,
  findText: string,
  replaceText: string,
  matchCase?: boolean,
  tabId?: string,
) {
  const { client, permissions } = await getAuthClient(email);
  assertDocsCanWrite(permissions, email);
  const docs = google.docs({ version: "v1", auth: client });
  const response = await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [
        {
          replaceAllText: {
            containsText: { text: findText, matchCase: matchCase ?? false },
            replaceText,
            ...(tabId ? { tabsCriteria: { tabIds: [tabId] } } : {}),
          },
        },
      ],
    },
  });
  const occurrences =
    response.data.replies?.[0]?.replaceAllText?.occurrencesChanged ?? 0;
  return `Replaced ${occurrences} occurrence(s) of "${findText}" with "${replaceText}".`;
}

function structureParagraphs(content: any[]) {
  return content.map((el: any) => {
    if (el.paragraph) {
      const text = (el.paragraph.elements || [])
        .map((pe: any) => pe.textRun?.content || "")
        .join("");
      const bullet = el.paragraph.bullet;
      return {
        startIndex: el.startIndex,
        endIndex: el.endIndex,
        type: "paragraph",
        text,
        namedStyleType: el.paragraph.paragraphStyle?.namedStyleType ?? "NORMAL_TEXT",
        nestingLevel: bullet ? (bullet.nestingLevel ?? 0) : null,
      };
    }
    if (el.table) {
      return {
        startIndex: el.startIndex,
        endIndex: el.endIndex,
        type: "table",
        text: null,
        namedStyleType: null,
        nestingLevel: null,
      };
    }
    return {
      startIndex: el.startIndex,
      endIndex: el.endIndex,
      type: "other",
      text: null,
      namedStyleType: null,
      nestingLevel: null,
    };
  });
}

// Tabs nest (a tab can have childTabs), so this walks the whole tree into one
// flat, document-ordered list. A tab's own content lives under
// documentTab.body, not body — that field is unset at this (Tab) level.
function flattenTabs(
  tabs: any[],
): { tabId: string | undefined; title: string | null | undefined; content: any[]; lists?: any }[] {
  const out: { tabId: string | undefined; title: string | null | undefined; content: any[]; lists?: any }[] = [];
  for (const tab of tabs || []) {
    out.push({
      tabId: tab.tabProperties?.tabId,
      title: tab.tabProperties?.title,
      content: tab.documentTab?.body?.content || [],
      lists: tab.documentTab?.lists,
    });
    if (tab.childTabs?.length) out.push(...flattenTabs(tab.childTabs));
  }
  return out;
}

function findTab<T extends { tabId: string | undefined; title: string | null | undefined }>(
  tabs: T[],
  tabId: string,
): T {
  const target = tabs.find((t) => t.tabId === tabId);
  if (!target) {
    const available = tabs.map((t) => `${t.tabId} (${t.title})`).join(", ") || "none";
    throw new Error(`No tab "${tabId}" in this document. Available tabs: ${available}`);
  }
  return target;
}

// Flat list of top-level paragraphs with their index range, heading/bullet
// state, and text — lets a caller target an exact range for the formatting
// tools below instead of guessing offsets from docsGetContent's plain text.
// Tables are reported as a single opaque span (no cell-level indexes yet).
//
// includeTabsContent is always on: without it, a multi-tab document only
// returns its first tab in `body`, silently dropping the rest with no sign
// that anything was left out. With no tabId and more than one tab, this
// returns a tab index instead of dumping every tab's paragraphs — a 947k
// character, 38k line response is what "just return everything" produced on
// the WA Daily Catchup doc (os #1729 follow-up, 27 Oct 2026).
export async function docsGetStructure(
  email: string,
  documentId: string,
  tabId?: string,
  limit?: number,
) {
  const { client } = await getAuthClient(email);
  const docs = google.docs({ version: "v1", auth: client });
  const response = await docs.documents.get({ documentId, includeTabsContent: true });
  const title = response.data.title;

  const tabs = flattenTabs((response.data as any).tabs || []);
  // A document with no tabs feature in use carries its content in `body`
  // instead, with `tabs` left empty even when includeTabsContent is true.
  const allTabs = tabs.length > 0 ? tabs : [{ tabId: undefined, title, content: response.data.body?.content || [] }];

  if (tabId) {
    return paragraphsResponse(title, findTab(allTabs, tabId), limit);
  }

  if (allTabs.length === 1) return paragraphsResponse(title, allTabs[0], limit);

  return JSON.stringify(
    {
      title,
      tabs: allTabs.map((t) => ({ tabId: t.tabId, title: t.title, paragraphCount: t.content.length })),
      note: "This document has multiple tabs. Pass tabId to get one tab's structure.",
    },
    null,
    2,
  );
}

function paragraphsResponse(
  title: string | null | undefined,
  tab: { tabId: string | undefined; title: string | null | undefined; content: any[] },
  limit?: number,
) {
  const all = structureParagraphs(tab.content);
  const paragraphs = limit ? all.slice(0, limit) : all;
  return JSON.stringify(
    {
      title,
      ...(tab.tabId ? { tabId: tab.tabId, tabTitle: tab.title } : {}),
      paragraphs,
      ...(limit && all.length > paragraphs.length ? { truncated: true, totalParagraphs: all.length } : {}),
    },
    null,
    2,
  );
}

// Nesting level is inferred by the Docs API from each paragraph's
// indentation at the time bullets are created, not passed directly — this
// mirrors Google's documented technique (set indentFirstLine/indentStart
// before createParagraphBullets) using the same 0.5in-per-level step the
// Docs UI uses for Tab/Shift+Tab. Treat the result as a good default; verify
// visually for documents with custom list styles.
const BULLET_INDENT_PT_PER_LEVEL = 36;

export async function docsCreateBullets(
  email: string,
  documentId: string,
  startIndex: number,
  endIndex: number,
  nestingLevel: number = 0,
  bulletPreset: string = "BULLET_DISC_CIRCLE_SQUARE",
  tabId?: string,
) {
  const { client, permissions } = await getAuthClient(email);
  assertDocsCanWrite(permissions, email);
  const docs = google.docs({ version: "v1", auth: client });
  const range = { startIndex, endIndex, ...(tabId ? { tabId } : {}) };

  const requests: any[] = [];
  if (nestingLevel > 0) {
    const indentPt = nestingLevel * BULLET_INDENT_PT_PER_LEVEL;
    requests.push({
      updateParagraphStyle: {
        range,
        paragraphStyle: {
          indentFirstLine: { magnitude: indentPt, unit: "PT" },
          indentStart: { magnitude: indentPt, unit: "PT" },
        },
        fields: "indentFirstLine,indentStart",
      },
    });
  }
  requests.push({
    createParagraphBullets: { range, bulletPreset },
  });

  await docs.documents.batchUpdate({ documentId, requestBody: { requests } });
  return `Bullets created for range [${startIndex}, ${endIndex}) at nesting level ${nestingLevel}.`;
}

export async function docsUpdateParagraphStyle(
  email: string,
  documentId: string,
  startIndex: number,
  endIndex: number,
  namedStyleType: string,
  tabId?: string,
) {
  const { client, permissions } = await getAuthClient(email);
  assertDocsCanWrite(permissions, email);
  const docs = google.docs({ version: "v1", auth: client });
  await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [
        {
          updateParagraphStyle: {
            range: { startIndex, endIndex, ...(tabId ? { tabId } : {}) },
            paragraphStyle: { namedStyleType },
            fields: "namedStyleType",
          },
        },
      ],
    },
  });
  return `Paragraph style set to ${namedStyleType} for range [${startIndex}, ${endIndex}).`;
}

export async function docsUpdateTextStyle(
  email: string,
  documentId: string,
  startIndex: number,
  endIndex: number,
  bold?: boolean,
  italic?: boolean,
  underline?: boolean,
  tabId?: string,
) {
  const { client, permissions } = await getAuthClient(email);
  assertDocsCanWrite(permissions, email);
  const docs = google.docs({ version: "v1", auth: client });

  const textStyle: Record<string, boolean> = {};
  const fields: string[] = [];
  if (bold !== undefined) {
    textStyle.bold = bold;
    fields.push("bold");
  }
  if (italic !== undefined) {
    textStyle.italic = italic;
    fields.push("italic");
  }
  if (underline !== undefined) {
    textStyle.underline = underline;
    fields.push("underline");
  }
  if (fields.length === 0) {
    throw new Error(
      "docs_update_text_style requires at least one of bold, italic, or underline.",
    );
  }

  await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [
        {
          updateTextStyle: {
            range: { startIndex, endIndex, ...(tabId ? { tabId } : {}) },
            textStyle,
            fields: fields.join(","),
          },
        },
      ],
    },
  });
  return `Text style updated for range [${startIndex}, ${endIndex}).`;
}

export async function docsDeleteContentRange(
  email: string,
  documentId: string,
  startIndex: number,
  endIndex: number,
  tabId?: string,
) {
  const { client, permissions } = await getAuthClient(email);
  assertDocsCanWrite(permissions, email);
  const docs = google.docs({ version: "v1", auth: client });
  await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [{ deleteContentRange: { range: { startIndex, endIndex, ...(tabId ? { tabId } : {}) } } }],
    },
  });
  return `Deleted content range [${startIndex}, ${endIndex}).`;
}

// Raw passthrough to the Docs API's batchUpdate: any mix of the request
// kinds in https://developers.google.com/docs/api/reference/rest/v1/documents/request
// (insertText, deleteContentRange, createParagraphBullets,
// updateParagraphStyle, updateTextStyle, etc.), applied atomically in one
// call. Google resolves each request's indexes against the document *as it
// exists after every prior request in the same array* — so a caller can
// compute all ranges once from a single docs_get_structure snapshot without
// re-fetching between steps, unlike chaining the narrower docs_* tools.
export async function docsBatchUpdate(
  email: string,
  documentId: string,
  requests: unknown[],
) {
  const { client, permissions } = await getAuthClient(email);
  assertDocsCanWrite(permissions, email);
  const docs = google.docs({ version: "v1", auth: client });
  const response = await docs.documents.batchUpdate({
    documentId,
    requestBody: { requests: requests as any[] },
  });
  return JSON.stringify({ replies: response.data.replies ?? [] }, null, 2);
}
