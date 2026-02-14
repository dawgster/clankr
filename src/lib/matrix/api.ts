const HOMESERVER_URL =
  process.env.MATRIX_HOMESERVER_URL || "http://localhost:6167";

interface MatrixRegisterResponse {
  user_id: string;
  access_token: string;
  device_id: string;
}

interface MatrixCreateRoomResponse {
  room_id: string;
}

interface MatrixSendResponse {
  event_id: string;
}

interface MatrixMessage {
  type: string;
  sender: string;
  origin_server_ts: number;
  event_id: string;
  content: {
    msgtype?: string;
    body?: string;
  };
}

interface MatrixMessagesResponse {
  start: string;
  end: string;
  chunk: MatrixMessage[];
}

interface MatrixSyncResponse {
  next_batch: string;
  rooms?: {
    join?: Record<
      string,
      {
        timeline?: {
          events: MatrixMessage[];
          prev_batch: string;
        };
      }
    >;
  };
}

async function matrixFetch<T>(
  path: string,
  options: RequestInit & { accessToken?: string } = {},
): Promise<T> {
  const { accessToken, ...fetchOptions } = options;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };

  const res = await fetch(`${HOMESERVER_URL}${path}`, {
    ...fetchOptions,
    headers,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Matrix API error ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

export async function registerMatrixAccount(
  username: string,
  password: string,
): Promise<MatrixRegisterResponse> {
  return matrixFetch<MatrixRegisterResponse>(
    "/_matrix/client/v3/register",
    {
      method: "POST",
      body: JSON.stringify({
        username,
        password,
        auth: { type: "m.login.dummy" },
        inhibit_login: false,
      }),
    },
  );
}

export async function createDirectRoom(
  accessToken: string,
  inviteUserId: string,
): Promise<MatrixCreateRoomResponse> {
  return matrixFetch<MatrixCreateRoomResponse>(
    "/_matrix/client/v3/createRoom",
    {
      method: "POST",
      accessToken,
      body: JSON.stringify({
        is_direct: true,
        invite: [inviteUserId],
        preset: "trusted_private_chat",
      }),
    },
  );
}

export async function joinRoom(
  accessToken: string,
  roomId: string,
): Promise<void> {
  await matrixFetch(
    `/_matrix/client/v3/join/${encodeURIComponent(roomId)}`,
    { method: "POST", accessToken, body: JSON.stringify({}) },
  );
}

let txnCounter = 0;

export async function sendMessage(
  accessToken: string,
  roomId: string,
  content: string,
): Promise<MatrixSendResponse> {
  const txnId = `clankr-${Date.now()}-${txnCounter++}`;
  return matrixFetch<MatrixSendResponse>(
    `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
    {
      method: "PUT",
      accessToken,
      body: JSON.stringify({
        msgtype: "m.text",
        body: content,
      }),
    },
  );
}

export async function getMessages(
  accessToken: string,
  roomId: string,
  from?: string,
  limit = 50,
): Promise<MatrixMessagesResponse> {
  const params = new URLSearchParams({
    dir: "b",
    limit: String(limit),
  });
  if (from) params.set("from", from);

  return matrixFetch<MatrixMessagesResponse>(
    `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages?${params}`,
    { accessToken },
  );
}

export async function sync(
  accessToken: string,
  since?: string,
  timeout = 0,
): Promise<MatrixSyncResponse> {
  const params = new URLSearchParams({ timeout: String(timeout) });
  if (since) params.set("since", since);

  return matrixFetch<MatrixSyncResponse>(
    `/_matrix/client/v3/sync?${params}`,
    { accessToken },
  );
}

export { HOMESERVER_URL };
export type {
  MatrixRegisterResponse,
  MatrixCreateRoomResponse,
  MatrixSendResponse,
  MatrixMessage,
  MatrixMessagesResponse,
  MatrixSyncResponse,
};
