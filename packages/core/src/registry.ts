import { type AuthResolver, runWithAuth } from "./auth.js";
import * as gmail from "./gmail.js";
import * as chat from "./chat.js";
import * as calendar from "./calendar.js";
import * as drive from "./drive.js";

type Args = Record<string, unknown>;

const str = (v: unknown): v is string => typeof v === "string";
const num = (v: unknown): v is number => typeof v === "number";
const bool = (v: unknown): v is boolean => typeof v === "boolean";
const strArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

// Every tool this core implements (the local server's tokens.json-only
// gmail_list_accounts is intentionally excluded).
export const IMPLEMENTED_TOOLS = [
  // Gmail
  "gmail_search",
  "gmail_read",
  "gmail_read_thread",
  "gmail_draft",
  "gmail_send",
  "gmail_reply",
  "gmail_forward",
  "gmail_get_attachment",
  "gmail_trash",
  "gmail_delete",
  "gmail_mark_read",
  "gmail_mark_unread",
  "gmail_star",
  "gmail_unstar",
  "gmail_list_labels",
  "gmail_apply_label",
  "gmail_remove_label",
  "gmail_list_drafts",
  "gmail_send_draft",
  // Chat
  "chat_list_spaces",
  "chat_list_messages",
  "chat_send_message",
  "chat_add_reaction",
  "chat_get_message",
  "chat_delete_message",
  "chat_update_message",
  "chat_list_reactions",
  "chat_remove_reaction",
  "chat_get_attachment",
  "chat_list_members",
  "chat_get_space",
  "chat_create_space",
  "chat_add_member",
  "chat_remove_member",
  "chat_upload_attachment",
  // Calendar
  "calendar_list_calendars",
  "calendar_list_events",
  "calendar_get_event",
  "calendar_create_event",
  "calendar_update_event",
  "calendar_delete_event",
  "calendar_quick_add",
  "calendar_respond_to_event",
  // Drive
  "drive_list_files",
  "drive_search_files",
  "drive_get_file",
  "drive_read_file",
  "drive_download_file",
  "drive_upload_file",
  "drive_create_folder",
  "drive_delete_file",
  "drive_share_file",
  "drive_move_file",
] as const;

// Which service a tool belongs to — used by hosts to filter the advertised
// toolset to the services an agent actually has access to.
export function toolService(
  name: string,
): "gmail" | "chat" | "calendar" | "drive" | null {
  const prefix = name.split("_")[0];
  if (prefix === "gmail" || prefix === "chat" || prefix === "calendar" || prefix === "drive") {
    return prefix;
  }
  return null;
}

async function dispatch(name: string, args: Args): Promise<string> {
  const contentType = args.contentType as
    | "text"
    | "markdown"
    | "html"
    | undefined;
  const attachments = Array.isArray(args.attachments)
    ? (args.attachments as gmail.EmailAttachment[])
    : undefined;

  switch (name) {
    // ---- Gmail ----
    case "gmail_search":
      if (!str(args.email) || !str(args.query))
        throw new Error("Missing or invalid arguments for gmail_search.");
      return gmail.searchEmails(
        args.email,
        args.query,
        num(args.maxResults) ? args.maxResults : 10,
        str(args.pageToken) ? args.pageToken : undefined,
      );
    case "gmail_read":
      if (!str(args.email) || !str(args.messageId))
        throw new Error("Missing or invalid arguments for gmail_read.");
      return gmail.readEmail(args.email, args.messageId);
    case "gmail_read_thread":
      if (!str(args.email) || !str(args.threadId))
        throw new Error("Missing or invalid arguments for gmail_read_thread.");
      return gmail.readThread(args.email, args.threadId);
    case "gmail_draft":
      if (!str(args.email) || !str(args.to) || !str(args.subject) || !str(args.body))
        throw new Error("Missing or invalid arguments for gmail_draft.");
      return gmail.draftEmail(
        args.email,
        args.to,
        args.subject,
        args.body,
        contentType,
        str(args.cc) ? args.cc : undefined,
        str(args.bcc) ? args.bcc : undefined,
        attachments,
      );
    case "gmail_send":
      if (!str(args.email) || !str(args.to) || !str(args.subject) || !str(args.body))
        throw new Error("Missing or invalid arguments for gmail_send.");
      return gmail.sendEmail(
        args.email,
        args.to,
        args.subject,
        args.body,
        contentType,
        str(args.cc) ? args.cc : undefined,
        str(args.bcc) ? args.bcc : undefined,
        attachments,
      );
    case "gmail_reply":
      if (
        !str(args.email) ||
        !str(args.threadId) ||
        !str(args.inReplyTo) ||
        !str(args.to) ||
        !str(args.subject) ||
        !str(args.body)
      )
        throw new Error("Missing or invalid arguments for gmail_reply.");
      return gmail.replyToEmail(
        args.email,
        args.threadId,
        args.inReplyTo,
        args.to,
        args.subject,
        args.body,
        str(args.references) ? args.references : undefined,
        bool(args.isDraft) ? args.isDraft : false,
        contentType,
        str(args.cc) ? args.cc : undefined,
        str(args.bcc) ? args.bcc : undefined,
        attachments,
      );
    case "gmail_forward":
      if (
        !str(args.email) ||
        !str(args.to) ||
        !str(args.subject) ||
        !str(args.body) ||
        !str(args.originalMessageId)
      )
        throw new Error("Missing or invalid arguments for gmail_forward.");
      return gmail.forwardEmail(
        args.email,
        args.to,
        args.subject,
        args.body,
        args.originalMessageId,
        str(args.cc) ? args.cc : undefined,
        str(args.bcc) ? args.bcc : undefined,
        contentType,
        attachments,
      );
    case "gmail_get_attachment":
      if (!str(args.email) || !str(args.messageId) || !str(args.attachmentId))
        throw new Error("Missing or invalid arguments for gmail_get_attachment.");
      return gmail.getAttachment(
        args.email,
        args.messageId,
        args.attachmentId,
        str(args.filename) ? args.filename : undefined,
      );
    case "gmail_trash":
      if (!str(args.email) || !str(args.messageId))
        throw new Error("Missing or invalid arguments for gmail_trash.");
      return gmail.trashEmail(args.email, args.messageId);
    case "gmail_delete":
      if (!str(args.email) || !str(args.messageId))
        throw new Error("Missing or invalid arguments for gmail_delete.");
      return gmail.deleteEmail(args.email, args.messageId);
    case "gmail_mark_read":
      if (!str(args.email) || !str(args.messageId))
        throw new Error("Missing or invalid arguments for gmail_mark_read.");
      return gmail.markRead(args.email, args.messageId);
    case "gmail_mark_unread":
      if (!str(args.email) || !str(args.messageId))
        throw new Error("Missing or invalid arguments for gmail_mark_unread.");
      return gmail.markUnread(args.email, args.messageId);
    case "gmail_star":
      if (!str(args.email) || !str(args.messageId))
        throw new Error("Missing or invalid arguments for gmail_star.");
      return gmail.starEmail(args.email, args.messageId);
    case "gmail_unstar":
      if (!str(args.email) || !str(args.messageId))
        throw new Error("Missing or invalid arguments for gmail_unstar.");
      return gmail.unstarEmail(args.email, args.messageId);
    case "gmail_list_labels":
      if (!str(args.email))
        throw new Error("Missing or invalid arguments for gmail_list_labels.");
      return gmail.listLabels(args.email);
    case "gmail_apply_label":
      if (!str(args.email) || !str(args.messageId) || !str(args.labelId))
        throw new Error("Missing or invalid arguments for gmail_apply_label.");
      return gmail.applyLabel(args.email, args.messageId, args.labelId);
    case "gmail_remove_label":
      if (!str(args.email) || !str(args.messageId) || !str(args.labelId))
        throw new Error("Missing or invalid arguments for gmail_remove_label.");
      return gmail.removeLabel(args.email, args.messageId, args.labelId);
    case "gmail_list_drafts":
      if (!str(args.email))
        throw new Error("Missing or invalid arguments for gmail_list_drafts.");
      return gmail.listDrafts(
        args.email,
        num(args.maxResults) ? args.maxResults : 10,
        str(args.pageToken) ? args.pageToken : undefined,
      );
    case "gmail_send_draft":
      if (!str(args.email) || !str(args.draftId))
        throw new Error("Missing or invalid arguments for gmail_send_draft.");
      return gmail.sendDraft(args.email, args.draftId);

    // ---- Chat ----
    case "chat_list_spaces":
      if (!str(args.email))
        throw new Error("Missing or invalid arguments for chat_list_spaces.");
      return chat.chatListSpaces(
        args.email,
        num(args.maxResults) ? args.maxResults : 25,
        str(args.pageToken) ? args.pageToken : undefined,
      );
    case "chat_list_messages":
      if (!str(args.email) || !str(args.spaceName))
        throw new Error("Missing or invalid arguments for chat_list_messages.");
      return chat.chatListMessages(
        args.email,
        args.spaceName,
        num(args.maxResults) ? args.maxResults : 25,
        str(args.pageToken) ? args.pageToken : undefined,
      );
    case "chat_send_message":
      if (!str(args.email) || !str(args.spaceName) || !str(args.text))
        throw new Error("Missing or invalid arguments for chat_send_message.");
      return chat.chatSendMessage(
        args.email,
        args.spaceName,
        args.text,
        str(args.threadName) ? args.threadName : undefined,
      );
    case "chat_add_reaction":
      if (!str(args.email) || !str(args.messageName) || !str(args.emoji))
        throw new Error("Missing or invalid arguments for chat_add_reaction.");
      return chat.chatAddReaction(args.email, args.messageName, args.emoji);
    case "chat_get_message":
      if (!str(args.email) || !str(args.messageName))
        throw new Error("Missing or invalid arguments for chat_get_message.");
      return chat.chatGetMessage(args.email, args.messageName);
    case "chat_delete_message":
      if (!str(args.email) || !str(args.messageName))
        throw new Error("Missing or invalid arguments for chat_delete_message.");
      return chat.chatDeleteMessage(args.email, args.messageName);
    case "chat_update_message":
      if (!str(args.email) || !str(args.messageName) || !str(args.text))
        throw new Error("Missing or invalid arguments for chat_update_message.");
      return chat.chatUpdateMessage(args.email, args.messageName, args.text);
    case "chat_list_reactions":
      if (!str(args.email) || !str(args.messageName))
        throw new Error("Missing or invalid arguments for chat_list_reactions.");
      return chat.chatListReactions(
        args.email,
        args.messageName,
        num(args.maxResults) ? args.maxResults : 25,
        str(args.pageToken) ? args.pageToken : undefined,
      );
    case "chat_remove_reaction":
      if (!str(args.email) || !str(args.reactionName))
        throw new Error("Missing or invalid arguments for chat_remove_reaction.");
      return chat.chatRemoveReaction(args.email, args.reactionName);
    case "chat_get_attachment":
      if (!str(args.email) || !str(args.resourceName))
        throw new Error("Missing or invalid arguments for chat_get_attachment.");
      return chat.chatGetAttachment(
        args.email,
        args.resourceName,
        str(args.filename) ? args.filename : undefined,
      );
    case "chat_list_members":
      if (!str(args.email) || !str(args.spaceName))
        throw new Error("Missing or invalid arguments for chat_list_members.");
      return chat.chatListMembers(
        args.email,
        args.spaceName,
        num(args.maxResults) ? args.maxResults : 50,
        str(args.pageToken) ? args.pageToken : undefined,
      );
    case "chat_get_space":
      if (!str(args.email) || !str(args.spaceName))
        throw new Error("Missing or invalid arguments for chat_get_space.");
      return chat.chatGetSpace(args.email, args.spaceName);
    case "chat_create_space":
      if (!str(args.email) || !str(args.displayName))
        throw new Error("Missing or invalid arguments for chat_create_space.");
      return chat.chatCreateSpace(
        args.email,
        args.displayName,
        str(args.memberEmails) ? args.memberEmails : undefined,
      );
    case "chat_add_member":
      if (!str(args.email) || !str(args.spaceName) || !str(args.memberEmail))
        throw new Error("Missing or invalid arguments for chat_add_member.");
      return chat.chatAddMember(args.email, args.spaceName, args.memberEmail);
    case "chat_remove_member":
      if (!str(args.email) || !str(args.spaceName) || !str(args.memberEmail))
        throw new Error("Missing or invalid arguments for chat_remove_member.");
      return chat.chatRemoveMember(args.email, args.spaceName, args.memberEmail);
    case "chat_upload_attachment":
      if (
        !str(args.email) ||
        !str(args.spaceName) ||
        !str(args.filename) ||
        !str(args.mimeType) ||
        !str(args.data)
      )
        throw new Error("Missing or invalid arguments for chat_upload_attachment.");
      return chat.chatUploadAttachment(
        args.email,
        args.spaceName,
        args.filename,
        args.mimeType,
        args.data,
        str(args.text) ? args.text : undefined,
        str(args.threadName) ? args.threadName : undefined,
      );

    // ---- Calendar ----
    case "calendar_list_calendars":
      if (!str(args.email))
        throw new Error("Missing or invalid arguments for calendar_list_calendars.");
      return calendar.calendarListCalendars(args.email);
    case "calendar_list_events":
      if (!str(args.email) || !str(args.calendarId))
        throw new Error("Missing or invalid arguments for calendar_list_events.");
      return calendar.calendarListEvents(
        args.email,
        args.calendarId,
        num(args.maxResults) ? args.maxResults : 10,
        str(args.timeMin) ? args.timeMin : undefined,
        str(args.timeMax) ? args.timeMax : undefined,
        str(args.query) ? args.query : undefined,
        str(args.pageToken) ? args.pageToken : undefined,
      );
    case "calendar_get_event":
      if (!str(args.email) || !str(args.calendarId) || !str(args.eventId))
        throw new Error("Missing or invalid arguments for calendar_get_event.");
      return calendar.calendarGetEvent(args.email, args.calendarId, args.eventId);
    case "calendar_create_event":
      if (
        !str(args.email) ||
        !str(args.calendarId) ||
        !str(args.title) ||
        !str(args.startDateTime) ||
        !str(args.endDateTime)
      )
        throw new Error("Missing or invalid arguments for calendar_create_event.");
      return calendar.calendarCreateEvent(
        args.email,
        args.calendarId,
        args.title,
        args.startDateTime,
        args.endDateTime,
        str(args.description) ? args.description : undefined,
        str(args.location) ? args.location : undefined,
        str(args.attendees) ? args.attendees : undefined,
        bool(args.isAllDay) ? args.isAllDay : false,
        str(args.timeZone) ? args.timeZone : undefined,
        bool(args.addGoogleMeet) ? args.addGoogleMeet : false,
        bool(args.enableGeminiNotes) ? args.enableGeminiNotes : false,
        strArray(args.recurrence) ? args.recurrence : undefined,
      );
    case "calendar_update_event":
      if (!str(args.email) || !str(args.calendarId) || !str(args.eventId))
        throw new Error("Missing or invalid arguments for calendar_update_event.");
      return calendar.calendarUpdateEvent(
        args.email,
        args.calendarId,
        args.eventId,
        str(args.title) ? args.title : undefined,
        str(args.startDateTime) ? args.startDateTime : undefined,
        str(args.endDateTime) ? args.endDateTime : undefined,
        str(args.description) ? args.description : undefined,
        str(args.location) ? args.location : undefined,
        str(args.attendees) ? args.attendees : undefined,
        str(args.timeZone) ? args.timeZone : undefined,
        strArray(args.recurrence) ? args.recurrence : undefined,
      );
    case "calendar_delete_event":
      if (!str(args.email) || !str(args.calendarId) || !str(args.eventId))
        throw new Error("Missing or invalid arguments for calendar_delete_event.");
      return calendar.calendarDeleteEvent(args.email, args.calendarId, args.eventId);
    case "calendar_quick_add":
      if (!str(args.email) || !str(args.calendarId) || !str(args.text))
        throw new Error("Missing or invalid arguments for calendar_quick_add.");
      return calendar.calendarQuickAdd(args.email, args.calendarId, args.text);
    case "calendar_respond_to_event":
      if (
        !str(args.email) ||
        !str(args.calendarId) ||
        !str(args.eventId) ||
        !str(args.responseStatus)
      )
        throw new Error("Missing or invalid arguments for calendar_respond_to_event.");
      return calendar.calendarRespondToEvent(
        args.email,
        args.calendarId,
        args.eventId,
        args.responseStatus as "accepted" | "declined" | "tentative",
      );

    // ---- Drive ----
    case "drive_list_files":
      if (!str(args.email))
        throw new Error("Missing or invalid arguments for drive_list_files.");
      return drive.driveListFiles(
        args.email,
        str(args.folderId) ? args.folderId : undefined,
        num(args.maxResults) ? args.maxResults : 20,
        str(args.pageToken) ? args.pageToken : undefined,
      );
    case "drive_search_files":
      if (!str(args.email) || !str(args.query))
        throw new Error("Missing or invalid arguments for drive_search_files.");
      return drive.driveSearchFiles(
        args.email,
        args.query,
        num(args.maxResults) ? args.maxResults : 20,
        str(args.pageToken) ? args.pageToken : undefined,
      );
    case "drive_get_file":
      if (!str(args.email) || !str(args.fileId))
        throw new Error("Missing or invalid arguments for drive_get_file.");
      return drive.driveGetFile(args.email, args.fileId);
    case "drive_read_file":
      if (!str(args.email) || !str(args.fileId))
        throw new Error("Missing or invalid arguments for drive_read_file.");
      return drive.driveReadFile(args.email, args.fileId);
    case "drive_download_file":
      if (!str(args.email) || !str(args.fileId))
        throw new Error("Missing or invalid arguments for drive_download_file.");
      return drive.driveDownloadFile(
        args.email,
        args.fileId,
        str(args.exportMimeType) ? args.exportMimeType : undefined,
      );
    case "drive_upload_file":
      if (
        !str(args.email) ||
        !str(args.filename) ||
        !str(args.mimeType) ||
        !str(args.data)
      )
        throw new Error("Missing or invalid arguments for drive_upload_file.");
      return drive.driveUploadFile(
        args.email,
        args.filename,
        args.mimeType,
        args.data,
        str(args.folderId) ? args.folderId : undefined,
      );
    case "drive_create_folder":
      if (!str(args.email) || !str(args.name))
        throw new Error("Missing or invalid arguments for drive_create_folder.");
      return drive.driveCreateFolder(
        args.email,
        args.name,
        str(args.parentFolderId) ? args.parentFolderId : undefined,
      );
    case "drive_delete_file":
      if (!str(args.email) || !str(args.fileId))
        throw new Error("Missing or invalid arguments for drive_delete_file.");
      return drive.driveDeleteFile(args.email, args.fileId);
    case "drive_share_file":
      if (!str(args.email) || !str(args.fileId) || !str(args.shareWithEmail))
        throw new Error("Missing or invalid arguments for drive_share_file.");
      return drive.driveShareFile(
        args.email,
        args.fileId,
        args.shareWithEmail,
        str(args.role) ? args.role : "reader",
        bool(args.sendNotification) ? args.sendNotification : true,
      );
    case "drive_move_file":
      if (!str(args.email) || !str(args.fileId) || !str(args.newParentFolderId))
        throw new Error("Missing or invalid arguments for drive_move_file.");
      return drive.driveMoveFile(args.email, args.fileId, args.newParentFolderId);

    default:
      throw new Error(`Unknown or unimplemented tool: ${name}`);
  }
}

// Execute a tool by name against an injected auth resolver. All resolution and
// permission checks happen inside runWithAuth, isolated per call.
export async function executeTool(
  resolver: AuthResolver,
  name: string,
  args: Args = {},
): Promise<string> {
  return runWithAuth(resolver, () => dispatch(name, args));
}
