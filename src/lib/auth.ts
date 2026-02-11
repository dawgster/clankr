import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "./db";

export async function getCurrentUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;

  const existing = await db.user.findUnique({
    where: { clerkId },
    include: { profile: true, externalAgent: true },
  });
  if (existing) return existing;

  // User exists in Clerk but not in our DB (e.g. webhook hasn't fired yet).
  // Auto-provision from Clerk data so local dev works without webhooks.
  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  const email = clerkUser.emailAddresses[0]?.emailAddress;
  if (!email) return null;

  const username =
    clerkUser.username ||
    clerkUser.firstName?.toLowerCase().replace(/\s+/g, "") ||
    clerkId.slice(0, 12);

  const user = await db.user.create({
    data: {
      clerkId,
      email,
      username,
    },
    include: { profile: true, externalAgent: true },
  });

  return user;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}
