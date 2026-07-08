import { google } from "googleapis";
import { marked } from "marked";
import {
  getAuthClient,
  assertGmailCanModify,
  assertGmailCanSend,
} from "./auth.js";

export async function searchEmails(
  email: string,
  query: string,
  maxResults: number = 10,
  pageToken?: string,
) {
  const { client } = await getAuthClient(email);
  const gmail = google.gmail({ version: "v1", auth: client });

  const response = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults,
    pageToken,
  });

  const messages = response.data.messages;
  if (!messages || messages.length === 0) {
    return "No emails found matching the query.";
  }

  const detailedMessages = await Promise.all(
    messages.map(async (msg) => {
      if (!msg.id) return null;
      try {
        const details = await gmail.users.messages.get({
          userId: "me",
          id: msg.id,
          format: "metadata",
          metadataHeaders: ["Subject", "From", "Date", "Message-ID"],
        });

        const headers = details.data.payload?.headers || [];
        const subject =
          headers.find((h) => h.name === "Subject")?.value || "No Subject";
        const from =
          headers.find((h) => h.name === "From")?.value || "Unknown Sender";
        const date = headers.find((h) => h.name === "Date")?.value || "";
        const messageId =
          headers.find((h) => h.name === "Message-ID")?.value || "";

        return {
          id: msg.id,
          threadId: details.data.threadId,
          messageId,
          snippet: details.data.snippet,
          subject,
          from,
          date,
        };
      } catch {
        return null;
      }
    }),
  );

  const validMessages = detailedMessages.filter((m) => m !== null);

  return JSON.stringify(
    { emails: validMessages, nextPageToken: response.data.nextPageToken || null },
    null,
    2,
  );
}

export function extractText(part: any): string {
  if (part.mimeType === "text/plain" && part.body?.data) {
    return Buffer.from(part.body.data, "base64").toString("utf-8");
  }

  if (part.parts) {
    for (const p of part.parts) {
      const text = extractText(p);
      if (text) return text;
    }
  }

  if (part.mimeType === "text/html" && part.body?.data) {
    const html = Buffer.from(part.body.data, "base64").toString("utf-8");
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  return "";
}

export function collectAttachments(
  part: any,
  acc: Array<{
    filename: string;
    mimeType: string;
    size: number;
    attachmentId: string;
  }>,
) {
  if (part.filename && part.body?.attachmentId) {
    acc.push({
      filename: part.filename,
      mimeType: part.mimeType || "application/octet-stream",
      size: part.body.size || 0,
      attachmentId: part.body.attachmentId,
    });
  }
  if (part.parts) {
    for (const p of part.parts) {
      collectAttachments(p, acc);
    }
  }
}

export async function readEmail(email: string, messageId: string) {
  const { client } = await getAuthClient(email);
  const gmail = google.gmail({ version: "v1", auth: client });

  const response = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });

  const payload = response.data.payload;
  if (!payload) return "Could not retrieve email payload.";

  let textContent = extractText(payload);
  if (!textContent && response.data.snippet) {
    textContent = response.data.snippet;
  }

  const attachments: Array<{
    filename: string;
    mimeType: string;
    size: number;
    attachmentId: string;
  }> = [];
  collectAttachments(payload, attachments);

  const headers = payload.headers || [];
  const subject =
    headers.find((h) => h.name === "Subject")?.value || "No Subject";
  const from =
    headers.find((h) => h.name === "From")?.value || "Unknown Sender";
  const to =
    headers.find((h) => h.name === "To")?.value || "Unknown Recipient";
  const date = headers.find((h) => h.name === "Date")?.value || "";
  const rfcMessageId =
    headers.find((h) => h.name === "Message-ID")?.value || "";
  const references =
    headers.find((h) => h.name === "References")?.value || "";
  const threadId = response.data.threadId || "";

  return JSON.stringify(
    {
      from,
      to,
      date,
      subject,
      messageId: rfcMessageId,
      threadId,
      references,
      body: textContent,
      attachments,
    },
    null,
    2,
  );
}

export async function getAttachment(
  email: string,
  messageId: string,
  attachmentId: string,
  filename?: string,
) {
  const { client } = await getAuthClient(email);
  const gmail = google.gmail({ version: "v1", auth: client });

  const res = await gmail.users.messages.attachments.get({
    userId: "me",
    messageId,
    id: attachmentId,
  });

  return JSON.stringify({
    filename: filename || "attachment",
    size: res.data.size,
    data: res.data.data,
  });
}

export async function readThread(email: string, threadId: string) {
  const { client } = await getAuthClient(email);
  const gmail = google.gmail({ version: "v1", auth: client });

  const response = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
    format: "full",
  });

  const messages = response.data.messages;
  if (!messages || messages.length === 0) {
    return "No messages found in thread.";
  }

  const result = messages.map((msg) => {
    const payload = msg.payload;
    if (!payload) return { messageId: msg.id, error: "No payload" };

    const headers = payload.headers || [];
    const attachments: Array<{
      filename: string;
      mimeType: string;
      size: number;
      attachmentId: string;
    }> = [];
    collectAttachments(payload, attachments);

    return {
      id: msg.id,
      threadId: msg.threadId,
      from: headers.find((h) => h.name === "From")?.value || "",
      to: headers.find((h) => h.name === "To")?.value || "",
      date: headers.find((h) => h.name === "Date")?.value || "",
      subject: headers.find((h) => h.name === "Subject")?.value || "",
      messageId: headers.find((h) => h.name === "Message-ID")?.value || "",
      body: extractText(payload) || msg.snippet || "",
      attachments,
    };
  });

  return JSON.stringify(result, null, 2);
}

export interface EmailAttachment {
  filename: string;
  data: string;
  mimeType: string;
}

export async function createRawEmail(opts: {
  to: string;
  subject: string;
  body: string;
  from?: string;
  cc?: string;
  bcc?: string;
  inReplyTo?: string;
  references?: string;
  contentType?: "text" | "markdown" | "html";
  attachments?: EmailAttachment[];
}): Promise<string> {
  const format = opts.contentType || "text";
  let bodyMimeType: string;
  let emailBody: string;

  if (format === "markdown") {
    bodyMimeType = "text/html";
    emailBody = await marked.parse(opts.body);
  } else if (format === "html") {
    bodyMimeType = "text/html";
    emailBody = opts.body;
  } else {
    bodyMimeType = "text/plain";
    emailBody = opts.body;
  }

  const boundary = `----=_Part_${Math.random().toString(36).slice(2)}`;
  const hasAttachments = opts.attachments && opts.attachments.length > 0;

  const headers: string[] = [
    `To: ${opts.to}`,
    "MIME-Version: 1.0",
    `Subject: =?utf-8?B?${Buffer.from(opts.subject).toString("base64")}?=`,
  ];
  if (opts.from) headers.push(`From: ${opts.from}`);
  if (opts.cc) headers.push(`Cc: ${opts.cc}`);
  if (opts.bcc) headers.push(`Bcc: ${opts.bcc}`);
  if (opts.inReplyTo) headers.push(`In-Reply-To: ${opts.inReplyTo}`);
  if (opts.references) headers.push(`References: ${opts.references}`);

  let message: string;

  if (hasAttachments) {
    headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
    const parts: string[] = [
      `--${boundary}`,
      `Content-Type: ${bodyMimeType}; charset=utf-8`,
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from(emailBody).toString("base64"),
    ];
    for (const att of opts.attachments!) {
      parts.push(
        `--${boundary}`,
        `Content-Type: ${att.mimeType}; name="${att.filename}"`,
        "Content-Transfer-Encoding: base64",
        `Content-Disposition: attachment; filename="${att.filename}"`,
        "",
        att.data,
      );
    }
    parts.push(`--${boundary}--`);
    message = [...headers, "", ...parts].join("\n");
  } else {
    headers.push(`Content-Type: ${bodyMimeType}; charset=utf-8`);
    message = [...headers, "", emailBody].join("\n");
  }

  return Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function draftEmail(
  email: string,
  to: string,
  subject: string,
  body: string,
  contentType?: "text" | "markdown" | "html",
  cc?: string,
  bcc?: string,
  attachments?: EmailAttachment[],
) {
  const { client, permissions } = await getAuthClient(email);
  assertGmailCanModify(permissions, email);

  const gmail = google.gmail({ version: "v1", auth: client });
  const raw = await createRawEmail({
    to,
    subject,
    body,
    from: email,
    contentType,
    cc,
    bcc,
    attachments,
  });

  const response = await gmail.users.drafts.create({
    userId: "me",
    requestBody: { message: { raw } },
  });

  return `Draft created successfully. Draft ID: ${response.data.id}, Thread ID: ${response.data.message?.threadId ?? "unknown"}`;
}

export async function sendEmail(
  email: string,
  to: string,
  subject: string,
  body: string,
  contentType?: "text" | "markdown" | "html",
  cc?: string,
  bcc?: string,
  attachments?: EmailAttachment[],
) {
  const { client, permissions } = await getAuthClient(email);
  assertGmailCanSend(permissions, email);

  const gmail = google.gmail({ version: "v1", auth: client });
  const raw = await createRawEmail({
    to,
    subject,
    body,
    from: email,
    contentType,
    cc,
    bcc,
    attachments,
  });

  const response = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });

  return `Email sent successfully. Message ID: ${response.data.id}, Thread ID: ${response.data.threadId}`;
}

export async function replyToEmail(
  email: string,
  threadId: string,
  inReplyTo: string,
  to: string,
  subject: string,
  body: string,
  references?: string,
  isDraft?: boolean,
  contentType?: "text" | "markdown" | "html",
  cc?: string,
  bcc?: string,
  attachments?: EmailAttachment[],
) {
  const { client, permissions } = await getAuthClient(email);
  if (isDraft) {
    assertGmailCanModify(permissions, email);
  } else {
    assertGmailCanSend(permissions, email);
  }

  const gmail = google.gmail({ version: "v1", auth: client });
  const refsChain = references ? `${references} ${inReplyTo}` : inReplyTo;
  const raw = await createRawEmail({
    to,
    subject,
    body,
    from: email,
    inReplyTo,
    references: refsChain,
    contentType,
    cc,
    bcc,
    attachments,
  });

  if (isDraft) {
    const response = await gmail.users.drafts.create({
      userId: "me",
      requestBody: { message: { raw, threadId } },
    });
    return `Draft reply created successfully. Draft ID: ${response.data.id}, Thread ID: ${response.data.message?.threadId ?? "unknown"}`;
  } else {
    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw, threadId },
    });
    return `Reply sent successfully. Message ID: ${response.data.id}, Thread ID: ${response.data.threadId}`;
  }
}

export async function forwardEmail(
  email: string,
  to: string,
  subject: string,
  body: string,
  originalMessageId: string,
  cc?: string,
  bcc?: string,
  contentType?: "text" | "markdown" | "html",
  attachments?: EmailAttachment[],
) {
  const { client, permissions } = await getAuthClient(email);
  assertGmailCanSend(permissions, email);

  const gmail = google.gmail({ version: "v1", auth: client });

  const original = await gmail.users.messages.get({
    userId: "me",
    id: originalMessageId,
    format: "full",
  });
  const origHeaders = original.data.payload?.headers || [];
  const origFrom = origHeaders.find((h) => h.name === "From")?.value || "";
  const origDate = origHeaders.find((h) => h.name === "Date")?.value || "";
  const origSubject =
    origHeaders.find((h) => h.name === "Subject")?.value || "";
  const origBody = extractText(original.data.payload) || "";

  const fwdSuffix = `\n\n---------- Forwarded message ----------\nFrom: ${origFrom}\nDate: ${origDate}\nSubject: ${origSubject}\n\n${origBody}`;
  const fullBody = body + fwdSuffix;

  const raw = await createRawEmail({
    to,
    subject,
    body: fullBody,
    from: email,
    cc,
    bcc,
    contentType,
    attachments,
  });
  const response = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });
  return `Email forwarded successfully. Message ID: ${response.data.id}, Thread ID: ${response.data.threadId}`;
}

export async function trashEmail(email: string, messageId: string) {
  const { client, permissions } = await getAuthClient(email);
  assertGmailCanModify(permissions, email);
  const gmail = google.gmail({ version: "v1", auth: client });
  await gmail.users.messages.trash({ userId: "me", id: messageId });
  return `Message ${messageId} moved to trash.`;
}

export async function deleteEmail(email: string, messageId: string) {
  const { client, permissions } = await getAuthClient(email);
  assertGmailCanModify(permissions, email);
  const gmail = google.gmail({ version: "v1", auth: client });
  await gmail.users.messages.delete({ userId: "me", id: messageId });
  return `Message ${messageId} permanently deleted.`;
}

async function modifyMessageLabels(
  email: string,
  messageId: string,
  addLabelIds: string[],
  removeLabelIds: string[],
) {
  const { client, permissions } = await getAuthClient(email);
  assertGmailCanModify(permissions, email);
  const gmail = google.gmail({ version: "v1", auth: client });
  await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: { addLabelIds, removeLabelIds },
  });
  return messageId;
}

export async function markRead(email: string, messageId: string) {
  await modifyMessageLabels(email, messageId, [], ["UNREAD"]);
  return `Message ${messageId} marked as read.`;
}

export async function markUnread(email: string, messageId: string) {
  await modifyMessageLabels(email, messageId, ["UNREAD"], []);
  return `Message ${messageId} marked as unread.`;
}

export async function starEmail(email: string, messageId: string) {
  await modifyMessageLabels(email, messageId, ["STARRED"], []);
  return `Message ${messageId} starred.`;
}

export async function unstarEmail(email: string, messageId: string) {
  await modifyMessageLabels(email, messageId, [], ["STARRED"]);
  return `Message ${messageId} unstarred.`;
}

export async function applyLabel(
  email: string,
  messageId: string,
  labelId: string,
) {
  await modifyMessageLabels(email, messageId, [labelId], []);
  return `Label ${labelId} applied to message ${messageId}.`;
}

export async function removeLabel(
  email: string,
  messageId: string,
  labelId: string,
) {
  await modifyMessageLabels(email, messageId, [], [labelId]);
  return `Label ${labelId} removed from message ${messageId}.`;
}

export async function listLabels(email: string) {
  const { client } = await getAuthClient(email);
  const gmail = google.gmail({ version: "v1", auth: client });
  const response = await gmail.users.labels.list({ userId: "me" });
  const labels = (response.data.labels || []).map((l) => ({
    id: l.id,
    name: l.name,
    type: l.type,
  }));
  return JSON.stringify(labels, null, 2);
}

export async function listDrafts(
  email: string,
  maxResults: number = 10,
  pageToken?: string,
) {
  const { client } = await getAuthClient(email);
  const gmail = google.gmail({ version: "v1", auth: client });
  const response = await gmail.users.drafts.list({
    userId: "me",
    maxResults,
    pageToken,
  });
  const drafts = response.data.drafts;
  if (!drafts || drafts.length === 0) return "No drafts found.";

  const detailed = await Promise.all(
    drafts.map(async (d) => {
      if (!d.id) return null;
      try {
        const draft = await gmail.users.drafts.get({
          userId: "me",
          id: d.id,
          format: "metadata",
        });
        const headers = draft.data.message?.payload?.headers || [];
        return {
          draftId: d.id,
          messageId: draft.data.message?.id,
          subject:
            headers.find((h) => h.name === "Subject")?.value || "(no subject)",
          to: headers.find((h) => h.name === "To")?.value || "",
          date: headers.find((h) => h.name === "Date")?.value || "",
        };
      } catch {
        return null;
      }
    }),
  );
  return JSON.stringify(
    {
      drafts: detailed.filter(Boolean),
      nextPageToken: response.data.nextPageToken || null,
    },
    null,
    2,
  );
}

export async function sendDraft(email: string, draftId: string) {
  const { client, permissions } = await getAuthClient(email);
  assertGmailCanSend(permissions, email);
  const gmail = google.gmail({ version: "v1", auth: client });
  const response = await gmail.users.drafts.send({
    userId: "me",
    requestBody: { id: draftId },
  });
  return `Draft sent successfully. Message ID: ${response.data.id}, Thread ID: ${response.data.threadId}`;
}
