"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function disconnectAccount(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return;

  const id = formData.get("id");
  if (typeof id !== "string") return;

  // Scope the delete to the current user so one user can't remove another's
  // account by guessing an id.
  await prisma.connectedAccount.deleteMany({
    where: { id, userId: session.user.id },
  });

  revalidatePath("/dashboard");
}
