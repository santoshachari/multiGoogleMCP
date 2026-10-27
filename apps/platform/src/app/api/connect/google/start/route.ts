import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  buildConnectScopes,
  coerceGmailTier,
  coerceServiceTier,
  summarizeScopes,
} from "@/lib/googleScopes";
import { publicOrigin } from "@/lib/publicUrl";

// Begins the "connect a Google account" OAuth flow. Distinct from platform
// login: this requests Gmail/Calendar/Drive/Chat scopes and asks for offline
// access so we receive a refresh token to store (encrypted).
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(new URL("/", publicOrigin(req)));
  }

  const sp = req.nextUrl.searchParams;

  // Reconnecting an existing (expired/revoked) account: reuse its exact
  // prior tiers rather than asking the user to re-pick them. The callback
  // upserts on the same googleSub, so this refreshes that same row.
  //
  // The one-click "Reconnect" link on the dashboard sends only `reconnect`
  // (no tier params) and means "same access as before". The "Edit access"
  // form sends `reconnect` *plus* every tier field explicitly (it's the same
  // form used to connect a new account, pre-filled) and means "use exactly
  // what I just picked" — so an explicit `gmail` param always wins over the
  // account's stored scopes, letting one service be raised (e.g. docs) or
  // lowered without silently resetting the others back to a hardcoded
  // default.
  const reconnectId = sp.get("reconnect");
  const explicitTiers = sp.has("gmail");
  let tiers = {
    gmail: coerceGmailTier(sp.get("gmail")),
    calendar: coerceServiceTier(sp.get("calendar")),
    drive: coerceServiceTier(sp.get("drive")),
    chat: coerceServiceTier(sp.get("chat")),
    sheets: coerceServiceTier(sp.get("sheets")),
    docs: coerceServiceTier(sp.get("docs")),
  };
  let loginHint: string | undefined;
  if (reconnectId) {
    const account = await prisma.connectedAccount.findFirst({
      where: { id: reconnectId, userId: session.user.id },
    });
    if (account) {
      if (!explicitTiers) tiers = summarizeScopes(account.grantedScopes);
      loginHint = account.googleEmail;
    }
  }

  const scopes = buildConnectScopes(tiers);

  const state = crypto.randomBytes(16).toString("hex");
  const redirectUri = new URL(
    "/api/connect/google/callback",
    publicOrigin(req),
  ).toString();

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", process.env.AUTH_GOOGLE_ID!);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scopes.join(" "));
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent"); // force a refresh token every time
  authUrl.searchParams.set("state", state);
  if (loginHint) authUrl.searchParams.set("login_hint", loginHint);

  const res = NextResponse.redirect(authUrl.toString());
  res.cookies.set("connect_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });

  // "Reconnect all": accounts still queued up after this one. The callback
  // pops the next id off this cookie and immediately starts its flow instead
  // of landing back on the dashboard between every single account.
  const queue = sp.get("queue");
  if (queue) {
    res.cookies.set("reconnect_queue", queue, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 600,
      path: "/",
    });
  } else {
    res.cookies.delete("reconnect_queue");
  }
  return res;
}
