import { createRequire } from "node:module";
import path from "node:path";
import readline from "node:readline";

const require = createRequire(path.join(process.cwd(), "package.json"));
const { io } = require("socket.io-client");
const ports = [8100, 8101];
const tokens = [process.env.REALTIME_TOKEN_A, process.env.REALTIME_TOKEN_B];
const eventId = process.env.REALTIME_EVENT_ID;
const origin = process.env.REALTIME_ORIGIN;

if (tokens.some((token) => !token) || !eventId || !origin) {
  throw new Error("The local realtime acceptance environment is incomplete.");
}

const clients = ports.map((port, index) =>
  io(`http://127.0.0.1:${port}`, {
    autoConnect: false,
    forceNew: true,
    reconnection: false,
    timeout: 10000,
    transports: ["websocket"],
    extraHeaders: {
      Origin: origin,
      Cookie: `lms_session=${tokens[index]}`,
    },
  }),
);

const received = [[], []];
const waitFor = (promise, timeoutMs, label) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out.`)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });

try {
  await Promise.all(
    clients.map(
      (client) =>
        new Promise((resolve, reject) => {
          client.once("connect", resolve);
          client.once("connect_error", reject);
          client.connect();
        }),
    ),
  );
  console.log("CONNECTED");

  const eventWaits = clients.map(
    (client, index) =>
      new Promise((resolve) => {
        client.once("state.changed", (payload) => {
          received[index].push(payload);
          resolve(payload);
        });
      }),
  );
  const payloads = await waitFor(Promise.all(eventWaits), 15000, "Realtime event");
  for (const payload of payloads) {
    if (
      JSON.stringify(Object.keys(payload).sort()) !==
        JSON.stringify(["eventId", "eventType"]) ||
      payload.eventId !== eventId ||
      payload.eventType !== "state.changed"
    ) {
      throw new Error("Socket.IO emitted a payload outside the minimal allowlist.");
    }
  }

  const statuses = await Promise.all(
    tokens.map(async (token) => {
      const response = await fetch("http://127.0.0.1:8100/v1/me/notifications", {
        headers: { Origin: origin, Cookie: `lms_session=${token}` },
      });
      return response.status;
    }),
  );
  if (statuses.some((status) => status !== 200)) {
    throw new Error(`Recipient-scoped API refetch failed: ${statuses.join(",")}.`);
  }
  console.log(`RECEIVED ${JSON.stringify({ payloads, restStatuses: statuses })}`);

  if (process.env.REALTIME_EXIT_ON_RECEIVE === "true") {
    process.exitCode = 0;
  } else {
    const lines = readline.createInterface({ input: process.stdin });
    let revokeRequested = false;
    for await (const line of lines) {
      if (line.trim() === "REVOKE") {
        revokeRequested = true;
        break;
      }
    }
    lines.close();
    if (!revokeRequested) {
      throw new Error("The session revocation signal was not received.");
    }

    const revokedClientDisconnected = new Promise((resolve) =>
      clients[1].once("disconnect", resolve),
    );
    const reason = await waitFor(
      revokedClientDisconnected,
      35000,
      "Revoked-session disconnect",
    );
    if (!clients[0].connected || clients[1].connected) {
      throw new Error("Session revocation did not isolate the disconnect to the revoked client.");
    }
    console.log(
      `DISCONNECTED ${JSON.stringify({ revokedReason: reason, unaffectedClientConnected: true })}`,
    );
  }
} finally {
  for (const client of clients) client.disconnect();
}
