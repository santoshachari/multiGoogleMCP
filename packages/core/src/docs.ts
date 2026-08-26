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
