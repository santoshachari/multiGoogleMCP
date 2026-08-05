"use server";

import { signIn } from "@/lib/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { sendPasswordResetEmail } from "@/lib/mail";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "")
    .toLowerCase()
    .trim();
  const password = String(formData.get("password") ?? "");

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/dashboard",
    });
  } catch (error) {
    // Auth.js signals a successful signIn's redirect by throwing internally;
    // only AuthError means the credentials themselves were rejected.
    if (error instanceof AuthError) {
      redirect("/?error=invalid");
    }
    throw error;
  }
}

export async function signup(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  const qs = `?token=${encodeURIComponent(token)}`;
  if (!password) redirect(`/signup${qs}&error=missing`);
  if (password.length < 8) redirect(`/signup${qs}&error=weak`);
  if (password !== confirmPassword) redirect(`/signup${qs}&error=mismatch`);

  const invite = await prisma.invite.findUnique({ where: { token } });
  if (!invite || invite.redeemedAt || invite.expiresAt < new Date()) {
    redirect("/signup"); // shows the "invite required" screen
  }

  const existing = await prisma.user.findUnique({ where: { email: invite.email } });
  if (existing) redirect(`/signup${qs}&error=taken`);

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.$transaction([
    prisma.user.create({ data: { email: invite.email, passwordHash } }),
    prisma.invite.update({ where: { id: invite.id }, data: { redeemedAt: new Date() } }),
  ]);

  try {
    await signIn("credentials", {
      email: invite.email,
      password,
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      // Vanishingly unlikely (we just created this exact credential), but
      // fall back to the login page rather than silently swallowing it.
      redirect("/?error=invalid");
    }
    throw error;
  }
}

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "")
    .toLowerCase()
    .trim();

  if (email) {
    const user = await prisma.user.findUnique({ where: { email } });
    // Only send/create a token if the account exists, but always show the
    // same confirmation screen below — don't leak which emails are registered.
    if (user) {
      const token = crypto.randomBytes(32).toString("hex");
      await prisma.verificationToken.create({
        data: { identifier: email, token, expires: new Date(Date.now() + 60 * 60 * 1000) },
      });
      const resetUrl = `${process.env.PUBLIC_BASE_URL ?? ""}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
      await sendPasswordResetEmail(email, resetUrl);
    }
  }

  redirect("/forgot-password?sent=1");
}

export async function resetPassword(formData: FormData) {
  const email = String(formData.get("email") ?? "")
    .toLowerCase()
    .trim();
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  const qs = `?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
  if (password.length < 8) redirect(`/reset-password${qs}&error=weak`);
  if (password !== confirmPassword) redirect(`/reset-password${qs}&error=mismatch`);

  const record = await prisma.verificationToken.findUnique({
    where: { identifier_token: { identifier: email, token } },
  });
  if (!record || record.expires < new Date()) {
    redirect(`/reset-password${qs}&error=invalid`);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.$transaction([
    prisma.user.update({ where: { email }, data: { passwordHash } }),
    prisma.verificationToken.delete({
      where: { identifier_token: { identifier: email, token } },
    }),
  ]);

  redirect("/?reset=ok");
}
