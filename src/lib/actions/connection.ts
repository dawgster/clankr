"use server";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import {
  connectionRequestSchema,
  type ConnectionRequestInput,
} from "@/lib/validators";
import { inngest } from "@/inngest/client";

export async function sendConnectionRequest(input: ConnectionRequestInput) {
  const user = await requireUser();
  const data = connectionRequestSchema.parse(input);

  if (data.toUserId === user.id) {
    throw new Error("Cannot connect with yourself");
  }

  // Check if already connected
  const existing = await db.connection.findFirst({
    where: {
      OR: [
        { userAId: user.id, userBId: data.toUserId },
        { userAId: data.toUserId, userBId: user.id },
      ],
    },
  });
  if (existing) throw new Error("Already connected");

  // Check for existing pending request
  const existingRequest = await db.connectionRequest.findUnique({
    where: {
      fromUserId_toUserId: {
        fromUserId: user.id,
        toUserId: data.toUserId,
      },
    },
  });
  if (existingRequest) throw new Error("Request already sent");

  const request = await db.connectionRequest.create({
    data: {
      fromUserId: user.id,
      toUserId: data.toUserId,
      category: data.category,
      intent: data.intent,
    },
  });

  // Fire Inngest event to evaluate connection
  await inngest.send({
    name: "connection/request.created",
    data: {
      requestId: request.id,
    },
  });

  return request;
}

export async function getMyConnections() {
  const user = await requireUser();

  return db.connection.findMany({
    where: {
      OR: [{ userAId: user.id }, { userBId: user.id }],
    },
    include: {
      userA: { include: { profile: true } },
      userB: { include: { profile: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getMyRequests() {
  const user = await requireUser();

  const [sent, received] = await Promise.all([
    db.connectionRequest.findMany({
      where: { fromUserId: user.id },
      include: { toUser: { include: { profile: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.connectionRequest.findMany({
      where: { toUserId: user.id },
      include: { fromUser: { include: { profile: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return { sent, received };
}

export async function overrideAgentDecision(
  requestId: string,
  decision: "ACCEPTED" | "REJECTED",
) {
  const user = await requireUser();

  const request = await db.connectionRequest.findUnique({
    where: { id: requestId },
  });

  if (!request || request.toUserId !== user.id) {
    throw new Error("Not authorized");
  }

  await db.connectionRequest.update({
    where: { id: requestId },
    data: { status: decision },
  });

  if (decision === "ACCEPTED") {
    // Create connection
    await db.connection.create({
      data: {
        userAId: request.fromUserId,
        userBId: request.toUserId,
      },
    });

    // Create message thread
    const thread = await db.messageThread.create({ data: {} });
    await db.messageThreadParticipant.createMany({
      data: [
        { threadId: thread.id, userId: request.fromUserId },
        { threadId: thread.id, userId: request.toUserId },
      ],
    });

    // Notify requester
    await db.notification.create({
      data: {
        userId: request.fromUserId,
        type: "CONNECTION_ACCEPTED",
        title: "Connection accepted!",
        body: "Your connection request has been accepted.",
        metadata: { requestId },
      },
    });
  } else {
    await db.notification.create({
      data: {
        userId: request.fromUserId,
        type: "CONNECTION_REJECTED",
        title: "Connection request declined",
        body: "Your connection request was not accepted.",
        metadata: { requestId },
      },
    });
  }
}

export async function cancelConnectionRequest(requestId: string) {
  const user = await requireUser();
  return db.connectionRequest.update({
    where: { id: requestId, fromUserId: user.id },
    data: { status: "CANCELLED" },
  });
}
