"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const me = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!me?.isAdmin) redirect("/dashboard");
  return me;
}

export async function adminSetPassword(formData: FormData) {
  await requireAdmin();

  const userId = String(formData.get("userId") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!userId || password.length < 8) {
    redirect("/dashboard/admin?error=weak");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

  revalidatePath("/dashboard/admin");
  redirect("/dashboard/admin?ok=1");
}
