import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { ChatShell } from "@/components/chat/chat-shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  // Check if user has completed onboarding
  const user = await db.user.findUnique({
    where: { clerkId },
    include: { profile: true },
  });

  if (user && !user.profile) {
    redirect("/onboarding");
  }

  return <ChatShell>{children}</ChatShell>;
}
