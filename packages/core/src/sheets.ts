import { google } from "googleapis";
import { getAuthClient, assertSheetsCanWrite } from "./auth.js";

export async function sheetsListTabs(email: string, spreadsheetId: string) {
  const { client } = await getAuthClient(email);
  const sheets = google.sheets({ version: "v4", auth: client });
  const response = await sheets.spreadsheets.get({ spreadsheetId });
  const tabs = (response.data.sheets || []).map((s) => ({
    sheetId: s.properties?.sheetId,
    title: s.properties?.title,
    index: s.properties?.index,
    rowCount: s.properties?.gridProperties?.rowCount,
    columnCount: s.properties?.gridProperties?.columnCount,
  }));
  return JSON.stringify(
    { spreadsheetTitle: response.data.properties?.title, tabs },
    null,
    2,
  );
}

export async function sheetsReadRange(
  email: string,
  spreadsheetId: string,
  range: string,
) {
  const { client } = await getAuthClient(email);
  const sheets = google.sheets({ version: "v4", auth: client });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });
  return JSON.stringify(
    { range: response.data.range, values: response.data.values || [] },
    null,
    2,
  );
}

export async function sheetsUpdateRange(
  email: string,
  spreadsheetId: string,
  range: string,
  values: unknown[][],
) {
  const { client, permissions } = await getAuthClient(email);
  assertSheetsCanWrite(permissions, email);
  const sheets = google.sheets({ version: "v4", auth: client });
  const response = await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
  return `Updated ${response.data.updatedCells} cell(s) in range ${response.data.updatedRange}.`;
}

export async function sheetsAppendRows(
  email: string,
  spreadsheetId: string,
  range: string,
  values: unknown[][],
) {
  const { client, permissions } = await getAuthClient(email);
  assertSheetsCanWrite(permissions, email);
  const sheets = google.sheets({ version: "v4", auth: client });
  const response = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values },
  });
  return `Appended ${response.data.updates?.updatedRows ?? 0} row(s) to ${response.data.updates?.updatedRange}.`;
}

export async function sheetsClearRange(
  email: string,
  spreadsheetId: string,
  range: string,
) {
  const { client, permissions } = await getAuthClient(email);
  assertSheetsCanWrite(permissions, email);
  const sheets = google.sheets({ version: "v4", auth: client });
  const response = await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range,
  });
  return `Cleared range ${response.data.clearedRange}.`;
}
