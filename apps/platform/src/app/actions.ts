"use server";

import { signIn } from "@/lib/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

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
  const email = String(formData.get("email") ?? "")
    .toLowerCase()
    .trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!email || !password) redirect("/signup?error=missing");
  if (password.length < 8) redirect("/signup?error=weak");
  if (password !== confirmPassword) redirect("/signup?error=mismatch");

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) redirect("/signup?error=taken");

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({ data: { email, passwordHash } });

  try {
    await signIn("credentials", {
      email,
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
