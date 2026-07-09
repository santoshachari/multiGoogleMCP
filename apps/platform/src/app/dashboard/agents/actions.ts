"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { generateApiKey } from "@/lib/apiKeys";
import { summarizeScopes, type GmailTier, type ServiceTier } from "@/lib/googleScopes";
import { clampGmail, clampService } from "@/lib/permissions";

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  return session.user.id;
}

export async function createAgent(formData: FormData) {
  const userId = await requireUserId();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const description = String(formData.get("description") ?? "").trim() || null;

  const agent = await prisma.agent.create({
    data: { userId, name, description },
  });
  redirect(`/dashboard/agents/${agent.id}`);
}

export async function deleteAgent(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");
  await prisma.agent.deleteMany({ where: { id, userId } });
  redirect("/dashboard/agents");
}

export async function saveGrant(formData: FormData) {
  const userId = await requireUserId();
  const agentId = String(formData.get("agentId") ?? "");
  const connectedAccountId = String(formData.get("connectedAccountId") ?? "");

  // Ownership: the agent and the account must both belong to the caller.
  const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
  const account = await prisma.connectedAccount.findFirst({
    where: { id: connectedAccountId, userId },
  });
  if (!agent || !account) return;

  // Clamp each requested tier to the account's granted ceiling — a grant can
  // never exceed what Google actually authorized for the account.
  const ceiling = summarizeScopes(account.grantedScopes);
  const gmail = clampGmail(
    String(formData.get("gmail") ?? "none") as GmailTier,
    ceiling.gmail,
  );
  const calendar = clampService(
    String(formData.get("calendar") ?? "none") as ServiceTier,
    ceiling.calendar,
  );
  const drive = clampService(
    String(formData.get("drive") ?? "none") as ServiceTier,
    ceiling.drive,
  );
  const chat = clampService(
    String(formData.get("chat") ?? "none") as ServiceTier,
    ceiling.chat,
  );

  await prisma.agentGrant.upsert({
    where: { agentId_connectedAccountId: { agentId, connectedAccountId } },
    create: { agentId, connectedAccountId, gmail, calendar, drive, chat },
    update: { gmail, calendar, drive, chat },
  });

  revalidatePath(`/dashboard/agents/${agentId}`);
  // revalidatePath alone can leave the client's Router Cache serving the
  // pre-mutation page (the selects visually "reset" to the old values even
  // though the DB is correct — confirmed via a hard reload showing the right
  // data). Redirecting back to the same URL forces a real navigation, which
  // is not served from that stale cache.
  redirect(`/dashboard/agents/${agentId}`);
}

export async function removeGrant(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");
  const agentId = String(formData.get("agentId") ?? "");
  // Scope the delete through the owning agent.
  await prisma.agentGrant.deleteMany({
    where: { id, agent: { userId } },
  });
  revalidatePath(`/dashboard/agents/${agentId}`);
  redirect(`/dashboard/agents/${agentId}`);
}

// Returns the plaintext key exactly once; only its hash is stored.
export async function mintApiKey(
  agentId: string,
  name: string,
): Promise<string> {
  const userId = await requireUserId();
  const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
  if (!agent) throw new Error("Agent not found.");

  const { plaintext, hash, prefix } = generateApiKey();
  await prisma.apiKey.create({
    data: { agentId, name: name.trim() || null, keyHash: hash, prefix },
  });
  revalidatePath(`/dashboard/agents/${agentId}`);
  return plaintext;
}

export async function revokeApiKey(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");
  const agentId = String(formData.get("agentId") ?? "");
  await prisma.apiKey.updateMany({
    where: { id, agent: { userId }, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  revalidatePath(`/dashboard/agents/${agentId}`);
  redirect(`/dashboard/agents/${agentId}`);
}
