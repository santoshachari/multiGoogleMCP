import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { auth } from "@/lib/auth";
import {
  buildConnectScopes,
  coerceGmailTier,
  coerceServiceTier,
} from "@/lib/googleScopes";

// Begins the "connect a Google account" OAuth flow. Distinct from platform
// login: this requests Gmail/Calendar/Drive/Chat scopes and asks for offline
// access so we receive a refresh token to store (encrypted).
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  const sp = req.nextUrl.searchParams;
  const scopes = buildConnectScopes({
    gmail: coerceGmailTier(sp.get("gmail")),
    calendar: coerceServiceTier(sp.get("calendar")),
    drive: coerceServiceTier(sp.get("drive")),
    chat: coerceServiceTier(sp.get("chat")),
  });

  const state = crypto.randomBytes(16).toString("hex");
  const redirectUri = new URL(
    "/api/connect/google/callback",
    req.nextUrl.origin,
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
  return res;
}
