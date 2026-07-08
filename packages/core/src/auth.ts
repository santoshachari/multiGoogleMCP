import { AsyncLocalStorage } from "node:async_hooks";

// --- Permission model (shared with the CLI's per-service tiers) ---

export type GmailPermission = "none" | "readonly" | "draft" | "full";
export type ServicePermission = "none" | "readonly" | "full";

export interface AccountPermissions {
  gmail: GmailPermission;
  calendar: ServicePermission;
  drive: ServicePermission;
  chat: ServicePermission;
}

// What a tool needs to act on one Google account: an authorized client plus the
// effective permissions for this call.
//
// `client` is an authorized googleapis OAuth2 client. It's typed loosely on
// purpose: the consumer builds it with *its own* copy of googleapis, and the
// google-auth-library types don't unify across copies. Tool bodies pass it
// straight into `google.gmail({ auth: client })`, where it's duck-typed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface AuthContext {
  client: any;
  permissions: AccountPermissions;
}

// Resolves a tool's `email` account-selector to a live auth context. Each host
// supplies its own: the local server reads tokens.json; the platform decrypts a
// ConnectedAccount and intersects its ceiling with the calling agent's grant.
export type AuthResolver = (email: string) => Promise<AuthContext>;

// Per-call context via AsyncLocalStorage so tool bodies can stay unchanged
// (they still call getAuthClient(email)) while remaining concurrency-safe in a
// multi-tenant server — each request runs in its own isolated store.
const store = new AsyncLocalStorage<{ resolver: AuthResolver }>();

export function runWithAuth<T>(
  resolver: AuthResolver,
  fn: () => Promise<T>,
): Promise<T> {
  return store.run({ resolver }, fn);
}

export async function getAuthClient(email: string): Promise<AuthContext> {
  const current = store.getStore();
  if (!current) {
    throw new Error(
      "No auth context in scope. Tool invoked outside runWithAuth()/executeTool().",
    );
  }
  return current.resolver(email);
}

// --- Permission guards (moved verbatim from the CLI server) ---

export function assertGmailCanSend(
  permissions: AccountPermissions,
  email: string,
) {
  if (permissions.gmail !== "full") {
    throw new Error(
      `Cannot send emails from ${email}: Gmail permission is '${permissions.gmail}' (requires 'full').`,
    );
  }
}

export function assertGmailCanModify(
  permissions: AccountPermissions,
  email: string,
) {
  if (permissions.gmail === "readonly" || permissions.gmail === "none") {
    throw new Error(
      `Cannot modify emails from ${email}: Gmail permission is '${permissions.gmail}' (requires 'draft' or 'full').`,
    );
  }
}

export function assertCalendarCanWrite(
  permissions: AccountPermissions,
  email: string,
) {
  if (permissions.calendar !== "full") {
    throw new Error(
      `Cannot modify calendar from ${email}: Calendar permission is '${permissions.calendar}' (requires 'full').`,
    );
  }
}

export function assertDriveCanWrite(
  permissions: AccountPermissions,
  email: string,
) {
  if (permissions.drive !== "full") {
    throw new Error(
      `Cannot modify Drive from ${email}: Drive permission is '${permissions.drive}' (requires 'full').`,
    );
  }
}

export function assertChatCanSend(
  permissions: AccountPermissions,
  email: string,
) {
  if (permissions.chat !== "full") {
    throw new Error(
      `Cannot send Chat messages from ${email}: Chat permission is '${permissions.chat}' (requires 'full').`,
    );
  }
}
