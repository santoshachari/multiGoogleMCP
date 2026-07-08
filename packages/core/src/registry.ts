import { type AuthResolver, runWithAuth } from "./auth.js";
import * as gmail from "./gmail.js";

type Args = Record<string, unknown>;

const str = (v: unknown): v is string => typeof v === "string";
const num = (v: unknown): v is number => typeof v === "number";

// Names of the tools this core currently implements. (Calendar/Drive/Chat are
// ported next; the local server still serves those from its own copy.)
export const IMPLEMENTED_TOOLS = [
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
] as const;

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
        typeof args.isDraft === "boolean" ? args.isDraft : false,
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
