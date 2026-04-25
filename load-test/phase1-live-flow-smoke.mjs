import { io } from "socket.io-client";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:4000/api/v1";
const WS_BASE_URL = process.env.WS_BASE_URL ?? "http://localhost:4000";
const SMOKE_TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? 15000);
const EXPECT_START_ERROR = process.env.EXPECT_START_ERROR === "1";

const password = "password123";
const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const observed = [];

function logStep(message, data) {
  if (data === undefined) {
    console.log(`[smoke] ${message}`);
    return;
  }

  console.log(`[smoke] ${message}`, JSON.stringify(data));
}

function fail(message, data) {
  if (data !== undefined) {
    console.error(`[smoke] ${message}`, JSON.stringify(data, null, 2));
  } else {
    console.error(`[smoke] ${message}`);
  }
  process.exitCode = 1;
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {})
    }
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = new Error(body?.error ?? `HTTP ${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return body;
}

async function registerAndLogin(index) {
  const email = `phase1-smoke-${runId}-${index}@example.com`;
  const displayName = `Smoke ${index}`;

  await request("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, displayName, password })
  });

  const login = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });

  if (!login?.accessToken || !login?.user?.id) {
    throw new Error(`Login response missing accessToken or user.id for ${email}`);
  }

  return {
    email,
    displayName,
    userId: login.user.id,
    accessToken: login.accessToken
  };
}

async function createRoom(accessToken) {
  return request("/rooms", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ isPrivate: true, maxPlayers: 8 })
  });
}

async function joinRoom(accessToken, roomCode) {
  return request("/rooms/join", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ roomCode })
  });
}

async function startRoom(accessToken, roomId) {
  return request(`/rooms/${roomId}/start`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` }
  });
}

function connectSocket(label, token, roomCode) {
  const socket = io(WS_BASE_URL, {
    path: "/ws",
    transports: ["websocket"],
    auth: { token },
    reconnection: false,
    timeout: SMOKE_TIMEOUT_MS
  });

  socket.on("message", (envelope) => {
    observed.push({ label, envelope });
    logStep(`socket ${label} message`, envelope);
  });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error(`Socket ${label} did not connect within ${SMOKE_TIMEOUT_MS}ms`));
    }, SMOKE_TIMEOUT_MS);

    socket.on("connect", () => {
      clearTimeout(timer);
      socket.emit("message", {
        type: "room:join",
        version: "v1",
        payload: { roomCode }
      });
      resolve(socket);
    });

    socket.on("connect_error", (error) => {
      clearTimeout(timer);
      socket.disconnect();
      reject(error);
    });
  });
}

function waitForStartOutcome(fromObservedIndex) {
  const startedAt = Date.now();
  let sawCountdown = false;

  return new Promise((resolve, reject) => {
    const interval = setInterval(() => {
      for (const item of observed.slice(fromObservedIndex)) {
        if (item.envelope?.type === "round:countdown_started") {
          sawCountdown = true;
        }

        if (item.envelope?.type === "round:question_started") {
          clearInterval(interval);
          resolve({ outcome: "question_started", sawCountdown, envelope: item.envelope });
          return;
        }

        if (item.envelope?.type === "error") {
          clearInterval(interval);
          resolve({ outcome: "error", sawCountdown, envelope: item.envelope });
          return;
        }
      }

      if (Date.now() - startedAt > SMOKE_TIMEOUT_MS) {
        clearInterval(interval);
        reject(new Error(`Timed out waiting for countdown/question/error after ${SMOKE_TIMEOUT_MS}ms`));
      }
    }, 100);
  });
}

async function main() {
  logStep("config", { API_BASE_URL, WS_BASE_URL, SMOKE_TIMEOUT_MS, EXPECT_START_ERROR });

  const [host, guest] = await Promise.all([registerAndLogin(1), registerAndLogin(2)]);
  logStep("registered and logged in users", {
    hostUserId: host.userId,
    guestUserId: guest.userId
  });

  const soloRoom = await createRoom(host.accessToken);
  try {
    await startRoom(host.accessToken, soloRoom.roomId);
    throw new Error("One-player start unexpectedly succeeded");
  } catch (error) {
    if (error.status !== 400) {
      throw error;
    }

    logStep("one-player start blocked", error.body);
  }

  const room = await createRoom(host.accessToken);
  logStep("room created", { roomId: room.roomId, roomCode: room.roomCode });

  const joined = await joinRoom(guest.accessToken, room.roomCode);
  logStep("guest joined room", {
    roomId: joined.roomId,
    roomCode: joined.roomCode,
    players: joined.room?.players?.length
  });

  const hostSocket = await connectSocket("host", host.accessToken, room.roomCode);
  const guestSocket = await connectSocket("guest", guest.accessToken, room.roomCode);

  try {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const startObservedIndex = observed.length;

    try {
      const startResponse = await startRoom(host.accessToken, room.roomId);
      logStep("start response", {
        roomId: startResponse.roomId,
        phase: startResponse.room?.phase,
        startedAt: startResponse.startedAt
      });
    } catch (error) {
      logStep("start REST error", {
        status: error.status,
        body: error.body
      });

      if (EXPECT_START_ERROR) {
        return;
      }

      throw error;
    }

    const outcome = await waitForStartOutcome(startObservedIndex);
    logStep("start socket outcome", outcome);

    if (!outcome.sawCountdown) {
      throw new Error("Start flow did not emit round:countdown_started before terminal outcome");
    }

    if (outcome.outcome === "error" && !EXPECT_START_ERROR) {
      throw new Error(`Start flow emitted error: ${JSON.stringify(outcome.envelope.payload)}`);
    }
  } finally {
    hostSocket.disconnect();
    guestSocket.disconnect();
  }
}

main().catch((error) => {
  fail(error.message, {
    status: error.status,
    body: error.body,
    observed
  });
});
