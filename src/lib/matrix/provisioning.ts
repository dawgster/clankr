import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { registerMatrixAccount } from "./api";

const SERVER_NAME = process.env.MATRIX_SERVER_NAME || "localhost";

function randomPassword(): string {
  return randomBytes(32).toString("base64url");
}

function sanitizeUsername(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9._=-]/g, "").slice(0, 40);
}

export async function ensureUserMatrixAccount(user: {
  id: string;
  username: string;
  matrixAccessToken?: string | null;
}) {
  if (user.matrixAccessToken) {
    return db.user.findUniqueOrThrow({ where: { id: user.id } });
  }

  const username = `clankr-${sanitizeUsername(user.username)}`;
  const password = randomPassword();

  const result = await registerMatrixAccount(username, password);

  return db.user.update({
    where: { id: user.id },
    data: {
      matrixUserId: result.user_id,
      matrixAccessToken: result.access_token,
      matrixDeviceId: result.device_id,
    },
  });
}

export async function provisionAgentMatrixAccount(agent: {
  id: string;
  name: string;
  matrixAccessToken?: string | null;
}) {
  if (agent.matrixAccessToken) {
    return db.externalAgent.findUniqueOrThrow({ where: { id: agent.id } });
  }

  const username = `agent-${sanitizeUsername(agent.name)}-${agent.id.slice(-6)}`;
  const password = randomPassword();

  const result = await registerMatrixAccount(username, password);

  return db.externalAgent.update({
    where: { id: agent.id },
    data: {
      matrixUserId: result.user_id,
      matrixAccessToken: result.access_token,
      matrixDeviceId: result.device_id,
    },
  });
}

export { SERVER_NAME };
