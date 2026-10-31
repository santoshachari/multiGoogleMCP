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

export async function docsGetContent(
  email: string,
  documentId: string,
  tabId?: string,
) {
  const { client } = await getAuthClient(email);
  const docs = google.docs({ version: "v1", auth: client });

  // Same reason as docsGetStructure: without includeTabsContent, a multi-tab
  // document only returns its first tab in `body`, silently dropping the rest.
  const response = await docs.documents.get({ documentId, includeTabsContent: true });
  const title = response.data.title;
  const revisionId = response.data.revisionId;
  const tabs = flattenTabs((response.data as any).tabs || []);
  const allTabs = tabs.length > 0 ? tabs : [{ tabId: undefined, title, content: response.data.body?.content || [] }];

  if (tabId) {
    const target = findTab(allTabs, tabId);
    return JSON.stringify(
      { title, revisionId, tabId: target.tabId, tabTitle: target.title, content: extractDocText(target.content) },
      null,
      2,
    );
  }

  if (allTabs.length === 1) {
    return JSON.stringify({ title, revisionId, content: extractDocText(allTabs[0].content) }, null, 2);
  }

  return JSON.stringify(
    {
      title,
      revisionId,
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
): { tabId: string | undefined; title: string | null | undefined; content: any[] }[] {
  const out: { tabId: string | undefined; title: string | null | undefined; content: any[] }[] = [];
  for (const tab of tabs || []) {
    out.push({
      tabId: tab.tabProperties?.tabId,
      title: tab.tabProperties?.title,
      content: tab.documentTab?.body?.content || [],
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

  const revisionId = response.data.revisionId;
  const tabs = flattenTabs((response.data as any).tabs || []);
  // A document with no tabs feature in use carries its content in `body`
  // instead, with `tabs` left empty even when includeTabsContent is true.
  const allTabs = tabs.length > 0 ? tabs : [{ tabId: undefined, title, content: response.data.body?.content || [] }];

  if (tabId) {
    return paragraphsResponse(title, revisionId, findTab(allTabs, tabId), limit);
  }

  if (allTabs.length === 1) return paragraphsResponse(title, revisionId, allTabs[0], limit);

  return JSON.stringify(
    {
      title,
      revisionId,
      tabs: allTabs.map((t) => ({ tabId: t.tabId, title: t.title, paragraphCount: t.content.length })),
      note: "This document has multiple tabs. Pass tabId to get one tab's structure.",
    },
    null,
    2,
  );
}

function paragraphsResponse(
  title: string | null | undefined,
  revisionId: string | null | undefined,
  tab: { tabId: string | undefined; title: string | null | undefined; content: any[] },
  limit?: number,
) {
  const all = structureParagraphs(tab.content);
  const paragraphs = limit ? all.slice(0, limit) : all;
  return JSON.stringify(
    {
      title,
      revisionId,
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
  requiredRevisionId?: string,
) {
  const { client, permissions } = await getAuthClient(email);
  assertDocsCanWrite(permissions, email);
  const docs = google.docs({ version: "v1", auth: client });
  let response;
  try {
    response = await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: requests as any[],
        // Google rejects the whole batch (nothing is written) if the document
        // has moved past this revision.
        ...(requiredRevisionId ? { writeControl: { requiredRevisionId } } : {}),
      },
    });
  } catch (err: any) {
    const status = err?.code ?? err?.status ?? err?.response?.status;
    if (requiredRevisionId && String(status) === "400" && /revision/i.test(String(err?.message))) {
      throw new Error(
        "The document changed since it was read (revision no longer matches). Nothing was written. Re-read it with docs_get_structure and retry with the new revisionId.",
      );
    }
    throw err;
  }
  return JSON.stringify({ replies: response.data.replies ?? [] }, null, 2);
}
