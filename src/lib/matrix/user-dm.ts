import { db } from "@/lib/db";
import { ensureUserMatrixAccount } from "./provisioning";
import { createDirectRoom, joinRoom } from "./api";

/**
 * Ensure a Matrix DM room exists for a Connection.
 * Idempotent — returns early if matrixRoomId is already set.
 */
export async function ensureConnectionMatrixRoom(connectionId: string) {
  const connection = await db.connection.findUniqueOrThrow({
    where: { id: connectionId },
    include: {
      userA: true,
      userB: true,
    },
  });

  if (connection.matrixRoomId) {
    return connection.matrixRoomId;
  }

  // Provision Matrix accounts for both users
  const [userA, userB] = await Promise.all([
    ensureUserMatrixAccount(connection.userA),
    ensureUserMatrixAccount(connection.userB),
  ]);

  if (!userA.matrixAccessToken || !userB.matrixUserId || !userB.matrixAccessToken) {
    throw new Error("Failed to provision Matrix accounts for connection");
  }

  // UserA creates the room, inviting userB
  const room = await createDirectRoom(userA.matrixAccessToken, userB.matrixUserId);

  // UserB joins
  await joinRoom(userB.matrixAccessToken, room.room_id);

  // Store room ID on connection
  await db.connection.update({
    where: { id: connectionId },
    data: { matrixRoomId: room.room_id },
  });

  return room.room_id;
}

/**
 * Find the Connection between two users and ensure it has a Matrix room.
 * Returns the connection ID (used by the ?with=userId redirect flow).
 */
export async function getOrCreateMatrixRoom(
  currentUserId: string,
  otherUserId: string,
) {
  const connection = await db.connection.findFirst({
    where: {
      OR: [
        { userAId: currentUserId, userBId: otherUserId },
        { userAId: otherUserId, userBId: currentUserId },
      ],
    },
  });

  if (!connection) {
    throw new Error("Not connected");
  }

  await ensureConnectionMatrixRoom(connection.id);
  return connection.id;
}
