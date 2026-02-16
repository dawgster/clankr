"use server";

// Old DB-backed messaging functions have been removed.
// User-to-user DMs now use Matrix via the /api/matrix/user-room and /api/matrix/messages routes.
// See src/lib/matrix/user-dm.ts for room provisioning logic.
