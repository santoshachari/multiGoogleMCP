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
  const reconnectId = sp.get("reconnect");
  let tiers = {
    gmail: coerceGmailTier(sp.get("gmail")),
    calendar: coerceServiceTier(sp.get("calendar")),
    drive: coerceServiceTier(sp.get("drive")),
    chat: coerceServiceTier(sp.get("chat")),
  };
  if (reconnectId) {
    const account = await prisma.connectedAccount.findFirst({
      where: { id: reconnectId, userId: session.user.id },
    });
    if (account) tiers = summarizeScopes(account.grantedScopes);
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
