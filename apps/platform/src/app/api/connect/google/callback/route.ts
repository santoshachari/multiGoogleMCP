import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto";

function back(req: NextRequest, status: string) {
  return NextResponse.redirect(new URL(`/dashboard?connect=${status}`, req.url));
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  const sp = req.nextUrl.searchParams;
  const code = sp.get("code");
  const state = sp.get("state");
  const cookieState = req.cookies.get("connect_state")?.value;

  if (sp.get("error")) return back(req, "denied");
  if (!code || !state || !cookieState || state !== cookieState) {
    return back(req, "error");
  }

  const redirectUri = new URL(
    "/api/connect/google/callback",
    req.nextUrl.origin,
  ).toString();

  const oauth2 = new google.auth.OAuth2(
    process.env.AUTH_GOOGLE_ID,
    process.env.AUTH_GOOGLE_SECRET,
    redirectUri,
  );

  try {
    const { tokens } = await oauth2.getToken(code);
    if (!tokens.refresh_token) {
      // Google only returns a refresh token when it hasn't already been granted
      // to this client. prompt=consent should force one; if it's still missing,
      // the user can revoke access at myaccount.google.com and retry.
      return back(req, "norefresh");
    }
    oauth2.setCredentials(tokens);

    const me = await google.oauth2({ version: "v2", auth: oauth2 }).userinfo.get();
    const googleEmail = me.data.email;
    const googleSub = me.data.id;
    if (!googleEmail || !googleSub) return back(req, "error");

    await prisma.connectedAccount.upsert({
      where: {
        userId_googleSub: { userId: session.user.id, googleSub },
      },
      create: {
        userId: session.user.id,
        googleEmail,
        googleSub,
        refreshTokenEnc: encryptSecret(tokens.refresh_token),
        grantedScopes: tokens.scope ?? "",
        status: "active",
      },
      update: {
        googleEmail,
        refreshTokenEnc: encryptSecret(tokens.refresh_token),
        grantedScopes: tokens.scope ?? "",
        status: "active",
      },
    });

    const res = back(req, "ok");
    res.cookies.delete("connect_state");
    return res;
  } catch (err) {
    console.error("connect callback failed:", err);
    return back(req, "error");
  }
}
