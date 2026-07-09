import type { AccountPermissions, GmailPermission, ServicePermission } from "./auth.js";
import { toolService } from "./registry.js";

const GMAIL_ORDER: GmailPermission[] = ["none", "readonly", "draft", "full"];
const SERVICE_ORDER: ServicePermission[] = ["none", "readonly", "full"];

// The minimum permission tier each tool needs to have any chance of
// succeeding. Tools not listed here are read-only: any non-"none" tier for
// their service is sufficient.
//
// Derived directly from the assert*() guard calls in gmail.ts / calendar.ts /
// drive.ts / chat.ts — keep this in sync if a tool's guard changes. This is
// the single source of truth both the MCP endpoint's tools/list filtering and
// its tools/call gate are built from, so an agent's advertised toolset always
// matches what will actually succeed.
//
// gmail_reply is a special case: it calls assertGmailCanModify when
// isDraft:true and assertGmailCanSend when isDraft:false. "draft" here is the
// minimum tier for which *some* call shape succeeds; a non-draft reply still
// requires "full" and is enforced at call time by the tool itself.
export const TOOL_REQUIREMENTS: Record<string, string> = {
  gmail_draft: "draft",
  gmail_send: "full",
  gmail_reply: "draft",
  gmail_forward: "full",
  gmail_trash: "draft",
  gmail_delete: "draft",
  gmail_mark_read: "draft",
  gmail_mark_unread: "draft",
  gmail_star: "draft",
  gmail_unstar: "draft",
  gmail_apply_label: "draft",
  gmail_remove_label: "draft",
  gmail_send_draft: "full",

  calendar_create_event: "full",
  calendar_update_event: "full",
  calendar_delete_event: "full",
  calendar_quick_add: "full",
  calendar_respond_to_event: "full",

  drive_upload_file: "full",
  drive_create_folder: "full",
  drive_delete_file: "full",
  drive_share_file: "full",
  drive_move_file: "full",

  chat_send_message: "full",
  chat_add_reaction: "full",
  chat_delete_message: "full",
  chat_update_message: "full",
  chat_remove_reaction: "full",
  chat_create_space: "full",
  chat_add_member: "full",
  chat_remove_member: "full",
  chat_upload_attachment: "full",
};

function requiredLevel(toolName: string): string {
  return TOOL_REQUIREMENTS[toolName] ?? "readonly";
}

// Does this permission set meet or exceed what the tool needs? Returns false
// for tools with no recognizable service prefix.
export function meetsToolRequirement(
  permissions: AccountPermissions,
  toolName: string,
): boolean {
  const svc = toolService(toolName);
  if (!svc) return false;
  const need = requiredLevel(toolName);

  if (svc === "gmail") {
    return GMAIL_ORDER.indexOf(permissions.gmail) >= GMAIL_ORDER.indexOf(need as GmailPermission);
  }
  return (
    SERVICE_ORDER.indexOf(permissions[svc]) >=
    SERVICE_ORDER.indexOf(need as ServicePermission)
  );
}

// "gmail=draft" style label for error messages and agent-facing instructions.
export function toolRequirementLabel(toolName: string): string {
  const svc = toolService(toolName);
  return `${svc}=${requiredLevel(toolName)}`;
}

// Human-readable summary of one account's permissions, e.g.
// "gmail: draft (can prepare, not send) · calendar: full · drive: full · chat: none".
export function describePermissions(permissions: AccountPermissions): string {
  const gmailNote =
    permissions.gmail === "draft" ? " (can prepare, not send)" : "";
  return [
    `gmail: ${permissions.gmail}${gmailNote}`,
    `calendar: ${permissions.calendar}`,
    `drive: ${permissions.drive}`,
    `chat: ${permissions.chat}`,
  ].join(" · ");
}
