import http from "http";
import { WebSocketServer } from "ws";
import { v4 as uuid } from "uuid";
import { MatchEngine } from "./matchEngine";
import type { ClientEvent, ServerEvent } from "./types";

const PORT = Number(process.env.PORT ?? "3000");

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server, path: "/ws" });
const engine = new MatchEngine();

function send(ws: any, msg: ServerEvent) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

wss.on("connection", (ws) => {
  const playerId = uuid();

  ws.on("message", (data: any) => {
    let env: ClientEvent | null = null;
    try {
      env = JSON.parse(data.toString());
    } catch {
      send(ws, { type: "ERROR", payload: { code: "BAD_JSON", message: "Invalid JSON" } });
      return;
    }

    if (!env || typeof (env as any).type !== "string") {
      send(ws, { type: "ERROR", payload: { code: "BAD_ENVELOPE", message: "Missing type" } });
      return;
    }

    if (env.type === "PING") {
      send(ws, { type: "PONG", payload: { t: (env as any).payload.t, serverTimeMs: Date.now() } });
      return;
    }

    if (env.type === "JOIN_MATCH") {
      engine.enqueue((env as any).payload.mode, { playerId, ws, alive: true, shield: false });
      return;
    }

    if (env.type === "SUBMIT_ANSWER") {
      const p = (env as any).payload;
      engine.submitAnswer(p.matchId, playerId, p.round, p.choiceId);
      return;
    }

    if (env.type === "USE_POWERUP") {
      const p = (env as any).payload;
      engine.usePowerUp(p.matchId, playerId, p.round, p.powerup);
      return;
    }

    send(ws, { type: "ERROR", payload: { code: "UNHANDLED", message: "Unhandled " + (env as any).type } });
  });

  ws.on("close", () => engine.removePlayer(playerId));
  ws.on("error", () => engine.removePlayer(playerId));
});

server.listen(PORT, () => {
  console.log("Server running: http://localhost:" + PORT);
  console.log("WS endpoint: ws://localhost:" + PORT + "/ws");
  console.log("MATCH_THRESHOLD=" + (process.env.MATCH_THRESHOLD ?? "2"));
});
