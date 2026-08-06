const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const registerNumberHunt = require("./server/games/number-hunt");
const registerColourMemory = require("./server/games/colour-memory");
const registerPixelDrawing = require("./server/games/pixel-drawing");
const registerConnectDots = require("./server/games/connect-dots");
const registerMaze = require("./server/games/maze");
const registerConnectFour = require("./server/games/connect-four");

const app = express();
const server = http.createServer(app);

function parseAllowedOrigins() {
  return String(process.env.CLIENT_ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

const allowedOrigins = parseAllowedOrigins();
const io = new Server(server, {
  cors: {
    origin(origin, callback) {
      // Requests without an Origin include health checks and same-host tools.
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin is not allowed by CLIENT_ORIGIN."));
    },
    methods: ["GET", "POST"]
  },
  transports: ["websocket", "polling"]
});

app.disable("x-powered-by");
app.get("/health", (_request, response) => {
  response.status(200).json({ ok: true, service: "mini-game-arcade" });
});
app.use(express.static(path.join(__dirname, "public")));

registerNumberHunt(io.of("/number-hunt"));
registerColourMemory(io.of("/colour-memory"));
registerPixelDrawing(io.of("/pixel-drawing"));
registerConnectDots(io.of("/connect-dots"));
registerMaze(io.of("/maze"));
registerConnectFour(io.of("/connect-four"));

const PORT = Number(process.env.PORT) || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Mini Game Arcade server listening on port ${PORT}`);
  if (allowedOrigins.length > 0) {
    console.log(`Allowed frontend origins: ${allowedOrigins.join(", ")}`);
  }
});
