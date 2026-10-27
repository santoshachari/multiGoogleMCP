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

export async function docsGetContent(email: string, documentId: string) {
  const { client } = await getAuthClient(email);
  const docs = google.docs({ version: "v1", auth: client });
  const response = await docs.documents.get({ documentId });
  const text = extractDocText(response.data.body?.content || []);
  return JSON.stringify(
    { title: response.data.title, content: text },
    null,
    2,
  );
}

// The document body always ends with a trailing newline structural element
// that can't be written into — insert one position before it.
async function endIndex(docs: any, documentId: string): Promise<number> {
  const doc = await docs.documents.get({ documentId });
  const content = doc.data.body?.content || [];
  const last = content[content.length - 1];
  return Math.max(1, (last?.endIndex ?? 1) - 1);
}

export async function docsAppendText(
  email: string,
  documentId: string,
  text: string,
) {
  const { client, permissions } = await getAuthClient(email);
  assertDocsCanWrite(permissions, email);
  const docs = google.docs({ version: "v1", auth: client });
  const index = await endIndex(docs, documentId);
  await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [{ insertText: { text, location: { index } } }],
    },
  });
  return `Appended ${text.length} character(s) to the end of the document.`;
}

export async function docsInsertText(
  email: string,
  documentId: string,
  text: string,
  index: number,
) {
  const { client, permissions } = await getAuthClient(email);
  assertDocsCanWrite(permissions, email);
  const docs = google.docs({ version: "v1", auth: client });
  await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [{ insertText: { text, location: { index } } }],
    },
  });
  return `Inserted ${text.length} character(s) at index ${index}.`;
}

export async function docsReplaceText(
  email: string,
  documentId: string,
  findText: string,
  replaceText: string,
  matchCase?: boolean,
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
          },
        },
      ],
    },
  });
  const occurrences =
    response.data.replies?.[0]?.replaceAllText?.occurrencesChanged ?? 0;
  return `Replaced ${occurrences} occurrence(s) of "${findText}" with "${replaceText}".`;
}

// Flat list of top-level paragraphs with their index range, heading/bullet
// state, and text — lets a caller target an exact range for the formatting
// tools below instead of guessing offsets from docsGetContent's plain text.
// Tables are reported as a single opaque span (no cell-level indexes yet).
export async function docsGetStructure(email: string, documentId: string) {
  const { client } = await getAuthClient(email);
  const docs = google.docs({ version: "v1", auth: client });
  const response = await docs.documents.get({ documentId });
  const content = response.data.body?.content || [];

  const paragraphs = content.map((el: any) => {
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

  return JSON.stringify({ title: response.data.title, paragraphs }, null, 2);
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
) {
  const { client, permissions } = await getAuthClient(email);
  assertDocsCanWrite(permissions, email);
  const docs = google.docs({ version: "v1", auth: client });

  const requests: any[] = [];
  if (nestingLevel > 0) {
    const indentPt = nestingLevel * BULLET_INDENT_PT_PER_LEVEL;
    requests.push({
      updateParagraphStyle: {
        range: { startIndex, endIndex },
        paragraphStyle: {
          indentFirstLine: { magnitude: indentPt, unit: "PT" },
          indentStart: { magnitude: indentPt, unit: "PT" },
        },
        fields: "indentFirstLine,indentStart",
      },
    });
  }
  requests.push({
    createParagraphBullets: { range: { startIndex, endIndex }, bulletPreset },
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
            range: { startIndex, endIndex },
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
            range: { startIndex, endIndex },
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
) {
  const { client, permissions } = await getAuthClient(email);
  assertDocsCanWrite(permissions, email);
  const docs = google.docs({ version: "v1", auth: client });
  await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [{ deleteContentRange: { range: { startIndex, endIndex } } }],
    },
  });
  return `Deleted content range [${startIndex}, ${endIndex}).`;
}
