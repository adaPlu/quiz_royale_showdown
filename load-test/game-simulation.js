import http from "k6/http";
import ws from "k6/ws";
import { check, sleep } from "k6";

export const options = {
  vus: 20,
  duration: "30s"
};

const API_BASE = __ENV.API_BASE_URL || "http://localhost:4000/api/v1";
const WS_BASE = (__ENV.WS_BASE_URL || "ws://localhost:4000").replace(/^http/, "ws");

export default function () {
  const registerPayload = JSON.stringify({
    email: `loadtest_${__VU}_${__ITER}@example.com`,
    displayName: `VU-${__VU}`,
    password: "password123"
  });

  const registerResponse = http.post(`${API_BASE}/auth/register`, registerPayload, {
    headers: { "Content-Type": "application/json" }
  });

  check(registerResponse, {
    "register accepted": (response) => [201, 409].includes(response.status)
  });

  let accessToken = null;
  if (registerResponse.status === 201) {
    accessToken = registerResponse.json("tokens.accessToken");
  } else {
    const loginResponse = http.post(
      `${API_BASE}/auth/login`,
      JSON.stringify({
        email: `loadtest_${__VU}_${__ITER}@example.com`,
        password: "password123"
      }),
      {
        headers: { "Content-Type": "application/json" }
      }
    );
    accessToken = loginResponse.json("tokens.accessToken");
  }

  const connectionUrl = `${WS_BASE}/ws?EIO=4&transport=websocket`;
  const socketResponse = ws.connect(
    connectionUrl,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    },
    (socket) => {
      socket.on("open", () => {
        socket.send('42["message",{"type":"room:join","version":"v1","payload":{"roomCode":"ROYALE"}}]');
      });

      socket.on("message", () => {
        socket.close();
      });
    }
  );

  check(socketResponse, {
    "socket connected": (response) => response && response.status === 101
  });

  sleep(1);
}
