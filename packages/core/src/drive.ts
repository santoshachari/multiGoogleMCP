import { google } from "googleapis";
import { getAuthClient, assertDriveCanWrite } from "./auth.js";

export async function driveListFiles(
  email: string,
  folderId?: string,
  maxResults: number = 20,
  pageToken?: string,
) {
  const { client } = await getAuthClient(email);
  const drive = google.drive({ version: "v3", auth: client });
  const parent = folderId || "root";
  const response = await drive.files.list({
    q: `'${parent}' in parents and trashed = false`,
    pageSize: maxResults,
    pageToken,
    fields:
      "nextPageToken, files(id,name,mimeType,size,modifiedTime,webViewLink,parents)",
  });
  const files = (response.data.files || []).map((f) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    size: f.size,
    modifiedTime: f.modifiedTime,
    webViewLink: f.webViewLink,
  }));
  return JSON.stringify(
    { files, nextPageToken: response.data.nextPageToken || null },
    null,
    2,
  );
}

export async function driveSearchFiles(
  email: string,
  query: string,
  maxResults: number = 20,
  pageToken?: string,
) {
  const { client } = await getAuthClient(email);
  const drive = google.drive({ version: "v3", auth: client });
  const response = await drive.files.list({
    q: `${query} and trashed = false`,
    pageSize: maxResults,
    pageToken,
    fields:
      "nextPageToken, files(id,name,mimeType,size,modifiedTime,webViewLink,parents)",
  });
  const files = (response.data.files || []).map((f) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    size: f.size,
    modifiedTime: f.modifiedTime,
    webViewLink: f.webViewLink,
  }));
  return JSON.stringify(
    { files, nextPageToken: response.data.nextPageToken || null },
    null,
    2,
  );
}

export async function driveGetFile(email: string, fileId: string) {
  const { client } = await getAuthClient(email);
  const drive = google.drive({ version: "v3", auth: client });
  const response = await drive.files.get({
    fileId,
    fields:
      "id,name,mimeType,size,modifiedTime,createdTime,webViewLink,parents,owners,shared,description",
  });
  return JSON.stringify(response.data, null, 2);
}

export async function driveReadFile(email: string, fileId: string) {
  const { client } = await getAuthClient(email);
  const drive = google.drive({ version: "v3", auth: client });

  const meta = await drive.files.get({ fileId, fields: "mimeType,name" });
  const mimeType = meta.data.mimeType || "";

  if (mimeType === "application/vnd.google-apps.document") {
    const response = await drive.files.export(
      { fileId, mimeType: "text/plain" },
      { responseType: "text" },
    );
    return response.data as string;
  }
  if (mimeType === "application/vnd.google-apps.spreadsheet") {
    const response = await drive.files.export(
      { fileId, mimeType: "text/csv" },
      { responseType: "text" },
    );
    return response.data as string;
  }
  if (mimeType === "application/vnd.google-apps.presentation") {
    const response = await drive.files.export(
      { fileId, mimeType: "text/plain" },
      { responseType: "text" },
    );
    return response.data as string;
  }

  const response = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "text" },
  );
  return response.data as string;
}

export async function driveDownloadFile(
  email: string,
  fileId: string,
  exportMimeType?: string,
) {
  const { client } = await getAuthClient(email);
  const drive = google.drive({ version: "v3", auth: client });

  const meta = await drive.files.get({ fileId, fields: "name,mimeType" });
  const originalMimeType = meta.data.mimeType || "application/octet-stream";
  const filename = meta.data.name || "file";

  let buffer: Buffer;
  let mimeType: string;

  if (originalMimeType.startsWith("application/vnd.google-apps.")) {
    mimeType = exportMimeType || "application/pdf";
    const response = await drive.files.export(
      { fileId, mimeType },
      { responseType: "arraybuffer" },
    );
    buffer = Buffer.from(response.data as ArrayBuffer);
  } else {
    mimeType = originalMimeType;
    const response = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "arraybuffer" },
    );
    buffer = Buffer.from(response.data as ArrayBuffer);
  }

  return JSON.stringify({
    filename,
    mimeType,
    size: buffer.length,
    data: buffer.toString("base64"),
  });
}

export async function driveUploadFile(
  email: string,
  filename: string,
  mimeType: string,
  data: string,
  folderId?: string,
) {
  const { client, permissions } = await getAuthClient(email);
  assertDriveCanWrite(permissions, email);
  const drive = google.drive({ version: "v3", auth: client });

  const buffer = Buffer.from(data, "base64");
  const { Readable } = await import("stream");
  const stream = Readable.from(buffer);

  const response = await drive.files.create({
    requestBody: {
      name: filename,
      parents: folderId ? [folderId] : undefined,
    },
    media: { mimeType, body: stream },
    fields: "id,name,webViewLink",
  });
  return `File uploaded. ID: ${response.data.id}, Name: ${response.data.name}, Link: ${response.data.webViewLink}`;
}

export async function driveCreateFolder(
  email: string,
  name: string,
  parentFolderId?: string,
) {
  const { client, permissions } = await getAuthClient(email);
  assertDriveCanWrite(permissions, email);
  const drive = google.drive({ version: "v3", auth: client });
  const response = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentFolderId ? [parentFolderId] : undefined,
    },
    fields: "id,name,webViewLink",
  });
  return `Folder created. ID: ${response.data.id}, Name: ${response.data.name}`;
}

export async function driveDeleteFile(email: string, fileId: string) {
  const { client, permissions } = await getAuthClient(email);
  assertDriveCanWrite(permissions, email);
  const drive = google.drive({ version: "v3", auth: client });
  await drive.files.delete({ fileId });
  return `File ${fileId} deleted.`;
}

export async function driveShareFile(
  email: string,
  fileId: string,
  shareWithEmail: string,
  role: string = "reader",
  sendNotification: boolean = true,
) {
  const { client, permissions } = await getAuthClient(email);
  assertDriveCanWrite(permissions, email);
  const drive = google.drive({ version: "v3", auth: client });
  await drive.permissions.create({
    fileId,
    sendNotificationEmail: sendNotification,
    requestBody: { type: "user", role, emailAddress: shareWithEmail },
  });
  return `File ${fileId} shared with ${shareWithEmail} as ${role}.`;
}

export async function driveMoveFile(
  email: string,
  fileId: string,
  newParentFolderId: string,
) {
  const { client, permissions } = await getAuthClient(email);
  assertDriveCanWrite(permissions, email);
  const drive = google.drive({ version: "v3", auth: client });

  const file = await drive.files.get({ fileId, fields: "parents" });
  const previousParents = (file.data.parents || []).join(",");

  await drive.files.update({
    fileId,
    addParents: newParentFolderId,
    removeParents: previousParents,
    fields: "id,parents",
  });
  return `File ${fileId} moved to folder ${newParentFolderId}.`;
}
