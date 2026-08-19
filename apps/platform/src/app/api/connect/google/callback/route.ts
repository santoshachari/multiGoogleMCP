import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto";
import { publicOrigin } from "@/lib/publicUrl";

function back(req: NextRequest, status: string) {
  const res = NextResponse.redirect(
    new URL(`/dashboard?connect=${status}`, publicOrigin(req)),
  );
  // Any terminal exit (success-with-nothing-queued, denied, or error) ends a
  // reconnect-all chain — don't let a cancelled/failed step silently resume
  // on some unrelated later visit.
  res.cookies.delete("connect_state");
  res.cookies.delete("reconnect_queue");
  return res;
}

// Reconnect-all continues the chain: pop the next account off the queue
// cookie and kick off its OAuth flow immediately, instead of landing back on
// the dashboard between every single account.
function continueQueue(req: NextRequest): NextResponse | null {
  const queue = req.cookies.get("reconnect_queue")?.value;
  if (!queue) return null;
  const ids = queue.split(",").filter(Boolean);
  if (ids.length === 0) return null;

  const [nextId, ...rest] = ids;
  const nextUrl = new URL("/api/connect/google/start", publicOrigin(req));
  nextUrl.searchParams.set("reconnect", nextId);
  nextUrl.searchParams.set("queue", rest.join(","));
  const res = NextResponse.redirect(nextUrl.toString());
  res.cookies.delete("connect_state");
  res.cookies.delete("reconnect_queue"); // start route re-sets it from ?queue
  return res;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/", publicOrigin(req)));
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
    publicOrigin(req),
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
        connectedAt: new Date(),
      },
      update: {
        googleEmail,
        refreshTokenEnc: encryptSecret(tokens.refresh_token),
        grantedScopes: tokens.scope ?? "",
        status: "active",
        connectedAt: new Date(),
      },
    });

    const next = continueQueue(req);
    if (next) return next;
    return back(req, "ok");
  } catch (err) {
    console.error("connect callback failed:", err);
    return back(req, "error");
  }
}
