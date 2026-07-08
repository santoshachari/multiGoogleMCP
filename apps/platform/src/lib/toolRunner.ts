import { google } from "googleapis";
import {
  executeTool,
  type AccountPermissions,
  type AuthResolver,
} from "@multigoogle/core";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { summarizeScopes } from "@/lib/googleScopes";

// Builds an auth resolver scoped to ONE platform user's connected accounts.
// Given the tool's `email` selector, it finds that user's connected account,
// decrypts the refresh token, and returns an authorized client plus the
// effective permissions.
//
// `overrides` will carry per-account agent grants once agents exist (Phase 3):
// the effective permission becomes min(account ceiling, agent grant). Until
// then the ceiling (what Google granted) is the effective permission.
export function resolverForUser(
  userId: string,
  overrides?: Map<string, AccountPermissions>,
): AuthResolver {
  return async (email: string) => {
    const account = await prisma.connectedAccount.findFirst({
      where: { userId, googleEmail: email, status: "active" },
    });
    if (!account) {
      throw new Error(`No connected account for ${email}.`);
    }

    const client = new google.auth.OAuth2(
      process.env.AUTH_GOOGLE_ID,
      process.env.AUTH_GOOGLE_SECRET,
    );
    client.setCredentials({
      refresh_token: decryptSecret(account.refreshTokenEnc),
    });

    const ceiling = summarizeScopes(account.grantedScopes) as AccountPermissions;
    const permissions = overrides?.get(email) ?? ceiling;

    return { client, permissions };
  };
}

export async function runToolForUser(
  userId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  return executeTool(resolverForUser(userId), name, args);
}

// What an agent may do with one connected account.
export interface GrantEntry {
  refreshTokenEnc: string;
  permissions: AccountPermissions;
}

// Resolver for the MCP endpoint: an agent can ONLY reach the accounts it has
// been granted, and only at the granted permission. Any other email is
// rejected — this is what stops an agent from touching the owner's other
// connected accounts.
export function resolverForGrants(
  grantsByEmail: Map<string, GrantEntry>,
): AuthResolver {
  return async (email: string) => {
    const grant = grantsByEmail.get(email);
    if (!grant) {
      throw new Error(`This agent has no access to ${email}.`);
    }
    const client = new google.auth.OAuth2(
      process.env.AUTH_GOOGLE_ID,
      process.env.AUTH_GOOGLE_SECRET,
    );
    client.setCredentials({
      refresh_token: decryptSecret(grant.refreshTokenEnc),
    });
    return { client, permissions: grant.permissions };
  };
}
