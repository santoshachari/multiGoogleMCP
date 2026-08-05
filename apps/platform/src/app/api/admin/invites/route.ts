import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { publicOrigin } from "@/lib/publicUrl";

// Separate from user login — a standing secret only whoever manages
// invitations (you, or Veda on your behalf) holds. Not tied to any account.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "")
    .toLowerCase()
    .trim();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "invalid email" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "user already exists" }, { status: 409 });
  }

  const inviteToken = crypto.randomBytes(24).toString("hex");
  await prisma.invite.create({
    data: {
      email,
      token: inviteToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  const url = new URL(`/signup?token=${inviteToken}`, publicOrigin(req)).toString();
  return NextResponse.json({ email, url, expiresInDays: 7 });
}
