// Scope definitions for connecting a Google account. Ported from the CLI
// (src/auth.ts in the repo root) so the platform requests exactly the same
// scopes per permission tier. The scopes Google grants become the account's
// "ceiling" — the most any agent can ever be allowed to do with it.

export type GmailTier = "none" | "readonly" | "draft" | "full";
export type ServiceTier = "none" | "readonly" | "full";

export interface TierSelection {
  gmail: GmailTier;
  calendar: ServiceTier;
  drive: ServiceTier;
  chat: ServiceTier;
}

// Always requested, so we can identify the account (email + stable subject id).
const BASE_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

const GMAIL_SCOPES: Record<GmailTier, string[]> = {
  none: [],
  readonly: ["https://www.googleapis.com/auth/gmail.readonly"],
  draft: [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.compose",
  ],
  full: [
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/gmail.send",
  ],
};

const CALENDAR_SCOPES: Record<ServiceTier, string[]> = {
  none: [],
  readonly: ["https://www.googleapis.com/auth/calendar.readonly"],
  full: [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/meetings.space.created",
    "https://www.googleapis.com/auth/meetings.space.settings",
  ],
};

const DRIVE_SCOPES: Record<ServiceTier, string[]> = {
  none: [],
  readonly: ["https://www.googleapis.com/auth/drive.readonly"],
  full: ["https://www.googleapis.com/auth/drive"],
};

const CHAT_SCOPES: Record<ServiceTier, string[]> = {
  none: [],
  readonly: [
    "https://www.googleapis.com/auth/chat.messages.readonly",
    "https://www.googleapis.com/auth/chat.spaces.readonly",
    "https://www.googleapis.com/auth/chat.memberships.readonly",
    "https://www.googleapis.com/auth/directory.readonly",
  ],
  full: [
    "https://www.googleapis.com/auth/chat.messages",
    "https://www.googleapis.com/auth/chat.messages.reactions",
    "https://www.googleapis.com/auth/chat.spaces.readonly",
    "https://www.googleapis.com/auth/chat.spaces.create",
    "https://www.googleapis.com/auth/chat.memberships",
    "https://www.googleapis.com/auth/directory.readonly",
  ],
};

export function buildConnectScopes(sel: TierSelection): string[] {
  const scopes = new Set<string>(BASE_SCOPES);
  for (const s of GMAIL_SCOPES[sel.gmail]) scopes.add(s);
  for (const s of CALENDAR_SCOPES[sel.calendar]) scopes.add(s);
  for (const s of DRIVE_SCOPES[sel.drive]) scopes.add(s);
  for (const s of CHAT_SCOPES[sel.chat]) scopes.add(s);
  return [...scopes];
}

// Derive the per-service permission a granted scope string actually confers.
// Used to show a connected account's ceiling and, later, to intersect with an
// agent's grant.
export interface ScopeSummary {
  gmail: GmailTier;
  calendar: ServiceTier;
  drive: ServiceTier;
  chat: ServiceTier;
}

export function summarizeScopes(granted: string): ScopeSummary {
  const s = new Set(granted.split(/\s+/).filter(Boolean));
  const has = (scope: string) =>
    s.has(`https://www.googleapis.com/auth/${scope}`);

  const gmail: GmailTier = has("gmail.modify")
    ? "full"
    : has("gmail.compose")
      ? "draft"
      : has("gmail.readonly")
        ? "readonly"
        : "none";

  const calendar: ServiceTier = has("calendar")
    ? "full"
    : has("calendar.readonly")
      ? "readonly"
      : "none";

  const drive: ServiceTier = has("drive")
    ? "full"
    : has("drive.readonly")
      ? "readonly"
      : "none";

  const chat: ServiceTier = has("chat.messages")
    ? "full"
    : has("chat.messages.readonly")
      ? "readonly"
      : "none";

  return { gmail, calendar, drive, chat };
}

export function coerceGmailTier(v: string | null): GmailTier {
  return v === "readonly" || v === "draft" || v === "full" ? v : "none";
}

export function coerceServiceTier(v: string | null): ServiceTier {
  return v === "readonly" || v === "full" ? v : "none";
}
