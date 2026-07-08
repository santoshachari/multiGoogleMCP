import { google } from "googleapis";
import { getAuthClient, assertChatCanSend } from "./auth.js";

interface ResolvedChatUser {
  name?: string;
  email?: string;
}

// Chat returns sender/member/reaction identities as opaque "users/{id}" resource
// names when authenticating as a user (Google withholds displayName in that
// case). "{id}" is the same numeric ID as the People API's "people/{id}", so we
// batch-resolve them into names/emails. Best-effort: external or unresolvable
// users are simply left out of the returned map.
async function resolveChatUsers(
  client: any,
  resourceNames: (string | null | undefined)[],
): Promise<Map<string, ResolvedChatUser>> {
  const unique = [
    ...new Set(
      resourceNames.filter(
        (n): n is string => !!n && n.startsWith("users/"),
      ),
    ),
  ];
  const map = new Map<string, ResolvedChatUser>();
  if (unique.length === 0) return map;

  const people = google.people({ version: "v1", auth: client });

  for (let i = 0; i < unique.length; i += 200) {
    const batch = unique.slice(i, i + 200);
    try {
      const response = await people.people.getBatchGet({
        resourceNames: batch.map((u) => `people/${u.slice("users/".length)}`),
        personFields: "names,emailAddresses",
      });
      for (const r of response.data.responses || []) {
        if (!r.person || !r.requestedResourceName) continue;
        const chatUser = `users/${r.requestedResourceName.slice("people/".length)}`;
        map.set(chatUser, {
          name: r.person.names?.[0]?.displayName || undefined,
          email: r.person.emailAddresses?.[0]?.value || undefined,
        });
      }
    } catch {
      // Ignore lookup failures (e.g. external users) — callers fall back to the id.
    }
  }
  return map;
}

function describeChatUser(
  resourceName: string | null | undefined,
  displayName: string | null | undefined,
  resolved: Map<string, ResolvedChatUser>,
): { name: string; email?: string } {
  const info = resourceName ? resolved.get(resourceName) : undefined;
  return {
    name: info?.name || displayName || resourceName || "Unknown",
    email: info?.email,
  };
}

export async function chatListSpaces(
  email: string,
  maxResults: number = 25,
  pageToken?: string,
) {
  const { client } = await getAuthClient(email);
  const chat = google.chat({ version: "v1", auth: client });

  const response = await chat.spaces.list({ pageSize: maxResults, pageToken });
  const spaces = response.data.spaces;
  if (!spaces || spaces.length === 0) {
    return "No spaces found for this account.";
  }

  const result = spaces.map((s) => ({
    name: s.name,
    displayName: s.displayName || "(Direct Message)",
    type: s.spaceType,
  }));

  return JSON.stringify(
    { spaces: result, nextPageToken: response.data.nextPageToken || null },
    null,
    2,
  );
}

export async function chatListMessages(
  email: string,
  spaceName: string,
  maxResults: number = 25,
  pageToken?: string,
) {
  const { client } = await getAuthClient(email);
  const chat = google.chat({ version: "v1", auth: client });

  const response = await chat.spaces.messages.list({
    parent: spaceName,
    pageSize: maxResults,
    orderBy: "createTime desc",
    pageToken,
  });

  const messages = response.data.messages;
  if (!messages || messages.length === 0) {
    return "No messages found in this space.";
  }

  const resolved = await resolveChatUsers(
    client,
    messages.map((m) => m.sender?.name),
  );

  const result = messages.map((m) => ({
    name: m.name,
    threadName: m.thread?.name,
    sender: describeChatUser(m.sender?.name, m.sender?.displayName, resolved),
    text: m.text || m.formattedText || "",
    createTime: m.createTime,
    attachments: (m.attachment || []).map((a) => ({
      resourceName: a.attachmentDataRef?.resourceName,
      contentName: a.contentName,
      contentType: a.contentType,
    })),
  }));

  return JSON.stringify(
    { messages: result, nextPageToken: response.data.nextPageToken || null },
    null,
    2,
  );
}

export async function chatSendMessage(
  email: string,
  spaceName: string,
  text: string,
  threadName?: string,
) {
  const { client, permissions } = await getAuthClient(email);
  assertChatCanSend(permissions, email);

  const chat = google.chat({ version: "v1", auth: client });
  const response = await chat.spaces.messages.create({
    parent: spaceName,
    messageReplyOption: threadName ? "REPLY_MESSAGE_OR_FAIL" : undefined,
    requestBody: {
      text,
      thread: threadName ? { name: threadName } : undefined,
    },
  });

  return `Message sent successfully. Message name: ${response.data.name}`;
}

export async function chatAddReaction(
  email: string,
  messageName: string,
  emoji: string,
) {
  const { client, permissions } = await getAuthClient(email);
  assertChatCanSend(permissions, email);

  const chat = google.chat({ version: "v1", auth: client });
  await chat.spaces.messages.reactions.create({
    parent: messageName,
    requestBody: { emoji: { unicode: emoji } },
  });

  return `Reaction '${emoji}' added to message ${messageName}.`;
}

export async function chatGetMessage(email: string, messageName: string) {
  const { client } = await getAuthClient(email);
  const chat = google.chat({ version: "v1", auth: client });
  const response = await chat.spaces.messages.get({ name: messageName });
  const m = response.data;
  const resolved = await resolveChatUsers(client, [m.sender?.name]);
  return JSON.stringify(
    {
      name: m.name,
      threadName: m.thread?.name,
      sender: describeChatUser(m.sender?.name, m.sender?.displayName, resolved),
      text: m.text || m.formattedText || "",
      createTime: m.createTime,
      lastUpdateTime: m.lastUpdateTime,
      attachments: (m.attachment || []).map((a) => ({
        resourceName: a.attachmentDataRef?.resourceName,
        contentName: a.contentName,
        contentType: a.contentType,
      })),
    },
    null,
    2,
  );
}

export async function chatDeleteMessage(email: string, messageName: string) {
  const { client, permissions } = await getAuthClient(email);
  assertChatCanSend(permissions, email);
  const chat = google.chat({ version: "v1", auth: client });
  await chat.spaces.messages.delete({ name: messageName });
  return `Message ${messageName} deleted.`;
}

export async function chatUpdateMessage(
  email: string,
  messageName: string,
  text: string,
) {
  const { client, permissions } = await getAuthClient(email);
  assertChatCanSend(permissions, email);
  const chat = google.chat({ version: "v1", auth: client });
  const response = await chat.spaces.messages.patch({
    name: messageName,
    updateMask: "text",
    requestBody: { text },
  });
  return `Message ${response.data.name} updated.`;
}

export async function chatListReactions(
  email: string,
  messageName: string,
  maxResults: number = 25,
  pageToken?: string,
) {
  const { client } = await getAuthClient(email);
  const chat = google.chat({ version: "v1", auth: client });
  const response = await chat.spaces.messages.reactions.list({
    parent: messageName,
    pageSize: maxResults,
    pageToken,
  });
  const reactionList = response.data.reactions || [];
  const resolved = await resolveChatUsers(
    client,
    reactionList.map((r) => r.user?.name),
  );
  const reactions = reactionList.map((r) => ({
    name: r.name,
    emoji: r.emoji?.unicode || r.emoji?.customEmoji?.uid,
    user: describeChatUser(r.user?.name, r.user?.displayName, resolved),
  }));
  return JSON.stringify(
    { reactions, nextPageToken: response.data.nextPageToken || null },
    null,
    2,
  );
}

export async function chatRemoveReaction(email: string, reactionName: string) {
  const { client, permissions } = await getAuthClient(email);
  assertChatCanSend(permissions, email);
  const chat = google.chat({ version: "v1", auth: client });
  await chat.spaces.messages.reactions.delete({ name: reactionName });
  return `Reaction ${reactionName} removed.`;
}

export async function chatGetAttachment(
  email: string,
  resourceName: string,
  filename?: string,
) {
  const { client } = await getAuthClient(email);
  const chat = google.chat({ version: "v1", auth: client });
  const response = await chat.media.download(
    { resourceName },
    { responseType: "arraybuffer" },
  );
  const buffer = Buffer.from(response.data as ArrayBuffer);
  return JSON.stringify({
    filename: filename || "attachment",
    size: buffer.length,
    data: buffer.toString("base64"),
  });
}

export async function chatListMembers(
  email: string,
  spaceName: string,
  maxResults: number = 50,
  pageToken?: string,
) {
  const { client } = await getAuthClient(email);
  const chat = google.chat({ version: "v1", auth: client });
  const response = await chat.spaces.members.list({
    parent: spaceName,
    pageSize: maxResults,
    pageToken,
  });
  const memberships = response.data.memberships || [];
  const resolved = await resolveChatUsers(
    client,
    memberships.map((m) => m.member?.name),
  );
  const members = memberships.map((m) => ({
    name: m.name,
    member: describeChatUser(m.member?.name, m.member?.displayName, resolved),
    role: m.role,
    state: m.state,
  }));
  return JSON.stringify(
    { members, nextPageToken: response.data.nextPageToken || null },
    null,
    2,
  );
}

export async function chatGetSpace(email: string, spaceName: string) {
  const { client } = await getAuthClient(email);
  const chat = google.chat({ version: "v1", auth: client });
  const response = await chat.spaces.get({ name: spaceName });
  const s = response.data;
  return JSON.stringify(
    {
      name: s.name,
      displayName: s.displayName || "(Direct Message)",
      type: s.spaceType,
      threadedMessages: s.spaceThreadingState,
    },
    null,
    2,
  );
}

export async function chatCreateSpace(
  email: string,
  displayName: string,
  memberEmails?: string,
) {
  const { client, permissions } = await getAuthClient(email);
  assertChatCanSend(permissions, email);
  const chat = google.chat({ version: "v1", auth: client });

  const memberships = memberEmails
    ? memberEmails
        .split(",")
        .map((e) => ({ member: { name: `users/${e.trim()}`, type: "HUMAN" } }))
    : undefined;

  const response = await chat.spaces.setup({
    requestBody: {
      space: { spaceType: "SPACE", displayName },
      memberships,
    },
  });
  return `Space created. Name: ${response.data.name}, Display Name: ${response.data.displayName}`;
}

export async function chatAddMember(
  email: string,
  spaceName: string,
  memberEmail: string,
) {
  const { client, permissions } = await getAuthClient(email);
  assertChatCanSend(permissions, email);
  const chat = google.chat({ version: "v1", auth: client });
  const response = await chat.spaces.members.create({
    parent: spaceName,
    requestBody: { member: { name: `users/${memberEmail}`, type: "HUMAN" } },
  });
  return `${memberEmail} added to ${spaceName}. Membership: ${response.data.name}`;
}

export async function chatRemoveMember(
  email: string,
  spaceName: string,
  memberEmail: string,
) {
  const { client, permissions } = await getAuthClient(email);
  assertChatCanSend(permissions, email);
  const chat = google.chat({ version: "v1", auth: client });
  await chat.spaces.members.delete({
    name: `${spaceName}/members/${memberEmail}`,
  });
  return `${memberEmail} removed from ${spaceName}.`;
}

export async function chatUploadAttachment(
  email: string,
  spaceName: string,
  filename: string,
  mimeType: string,
  data: string,
  text?: string,
  threadName?: string,
) {
  const { client, permissions } = await getAuthClient(email);
  assertChatCanSend(permissions, email);
  const chat = google.chat({ version: "v1", auth: client });

  const buffer = Buffer.from(data, "base64");
  const { Readable } = await import("stream");
  const stream = Readable.from(buffer);

  const uploadResponse = await chat.media.upload({
    parent: spaceName,
    requestBody: { filename },
    media: { mimeType, body: stream },
  });

  const attachmentUploadToken =
    uploadResponse.data.attachmentDataRef?.attachmentUploadToken;
  if (!attachmentUploadToken) {
    throw new Error(
      "Attachment upload succeeded but no upload token was returned.",
    );
  }

  const response = await chat.spaces.messages.create({
    parent: spaceName,
    messageReplyOption: threadName ? "REPLY_MESSAGE_OR_FAIL" : undefined,
    requestBody: {
      text,
      thread: threadName ? { name: threadName } : undefined,
      attachment: [{ attachmentDataRef: { attachmentUploadToken } }],
    },
  });

  return `File uploaded and sent. Message name: ${response.data.name}`;
}
