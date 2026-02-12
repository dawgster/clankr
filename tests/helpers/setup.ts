import { db } from "@/lib/db";

/**
 * Clean all test data from the database in the correct order
 * to respect foreign key constraints.
 */
export async function cleanDatabase() {
  await db.notification.deleteMany();
  await db.agentMessage.deleteMany();
  await db.agentEvent.deleteMany();
  await db.agentConversation.deleteMany();
  await db.directMessage.deleteMany();
  await db.messageThreadParticipant.deleteMany();
  await db.messageThread.deleteMany();
  await db.connection.deleteMany();
  await db.connectionRequest.deleteMany();
  await db.negotiation.deleteMany();
  await db.listing.deleteMany();
  await db.externalAgent.deleteMany();
  await db.profile.deleteMany();
  await db.user.deleteMany();
}
