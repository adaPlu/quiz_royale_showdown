import http from "http";
import { Server } from "socket.io";

import { createApp } from "./app";
import { env } from "./config/env";
import { socketAuthMiddleware } from "./socket/middleware";
import { registerSocketHandlers } from "./socket/registerHandlers";

const app = createApp();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: env.corsOrigin,
    credentials: true
  },
  path: "/ws"
});

io.use(socketAuthMiddleware);
registerSocketHandlers(io);

server.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Quiz Royale backend listening on http://localhost:${env.port}`);
});
