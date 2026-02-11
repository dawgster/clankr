"use server";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export async function getMyThreads() {
  const user = await requireUser();

  const participations = await db.messageThreadParticipant.findMany({
    where: { userId: user.id },
    include: {
      thread: {
        include: {
          participants: {
            include: { user: { include: { profile: true } } },
          },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      },
    },
    orderBy: { thread: { updatedAt: "desc" } },
  });

  return participations.map((p) => p.thread);
}

export async function getThreadMessages(threadId: string) {
  const user = await requireUser();

  // Verify participation
  const participant = await db.messageThreadParticipant.findUnique({
    where: { threadId_userId: { threadId, userId: user.id } },
  });
  if (!participant) throw new Error("Not a participant");

  return db.directMessage.findMany({
    where: { threadId },
    include: { sender: { include: { profile: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function sendMessage(threadId: string, content: string) {
  const user = await requireUser();

  if (!content.trim() || content.length > 5000) {
    throw new Error("Invalid message");
  }

  // Verify participation
  const participant = await db.messageThreadParticipant.findUnique({
    where: { threadId_userId: { threadId, userId: user.id } },
  });
  if (!participant) throw new Error("Not a participant");

  const message = await db.directMessage.create({
    data: {
      threadId,
      senderId: user.id,
      content: content.trim(),
    },
    include: { sender: { include: { profile: true } } },
  });

  await db.messageThread.update({
    where: { id: threadId },
    data: { updatedAt: new Date() },
  });

  // Notify other participants
  const otherParticipants = await db.messageThreadParticipant.findMany({
    where: { threadId, userId: { not: user.id } },
  });

  for (const p of otherParticipants) {
    await db.notification.create({
      data: {
        userId: p.userId,
        type: "NEW_MESSAGE",
        title: "New message",
        body: `${user.profile?.displayName || user.username}: ${content.slice(0, 100)}`,
        metadata: { threadId },
      },
    });
  }

  return message;
}

export async function getOrCreateThread(otherUserId: string) {
  const user = await requireUser();

  // Check if thread already exists between these users
  const existingThread = await db.messageThread.findFirst({
    where: {
      AND: [
        { participants: { some: { userId: user.id } } },
        { participants: { some: { userId: otherUserId } } },
      ],
    },
  });

  if (existingThread) return existingThread.id;

  // Verify connection exists
  const connection = await db.connection.findFirst({
    where: {
      OR: [
        { userAId: user.id, userBId: otherUserId },
        { userAId: otherUserId, userBId: user.id },
      ],
    },
  });
  if (!connection) throw new Error("Not connected");

  const thread = await db.messageThread.create({ data: {} });
  await db.messageThreadParticipant.createMany({
    data: [
      { threadId: thread.id, userId: user.id },
      { threadId: thread.id, userId: otherUserId },
    ],
  });

  return thread.id;
}
