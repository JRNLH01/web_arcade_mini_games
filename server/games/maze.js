const COUNTDOWN_MS = 3000;
const RESULT_DELAY_MS = 4200;
const GRID_OPTIONS = [9, 13, 17, 21, 25, 31];
const TIME_OPTIONS = [45, 60, 90, 120, 180];
const ROUND_OPTIONS = [1, 3, 5];

const NORTH = 1;
const EAST = 2;
const SOUTH = 4;
const WEST = 8;
const DIRECTIONS = [
  { dr: -1, dc: 0, bit: NORTH, opposite: SOUTH },
  { dr: 0, dc: 1, bit: EAST, opposite: WEST },
  { dr: 1, dc: 0, bit: SOUTH, opposite: NORTH },
  { dr: 0, dc: -1, bit: WEST, opposite: EAST }
];

function randomItem(values) {
  return values[Math.floor(Math.random() * values.length)];
}

function shuffle(values) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

function makeRoomCode(rooms) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 5; index += 1) code += chars[Math.floor(Math.random() * chars.length)];
  return rooms.has(code) ? makeRoomCode(rooms) : code;
}

function chooseOption(value, allowed, fallback) {
  const parsed = Number(value);
  return allowed.includes(parsed) ? parsed : fallback;
}

function sameCoord(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a[0] === b[0] && a[1] === b[1];
}

function coordKey(coord) {
  return `${coord[0]},${coord[1]}`;
}

function indexOf(size, row, column) {
  return row * size + column;
}

function oppositeCorner(size, corner) {
  return [size - 1 - corner[0], size - 1 - corner[1]];
}

function solveMaze(size, openings, start, end) {
  const queue = [start];
  const previous = new Map([[coordKey(start), null]]);

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    if (sameCoord(current, end)) break;
    const mask = openings[indexOf(size, current[0], current[1])];
    for (const direction of DIRECTIONS) {
      if (!(mask & direction.bit)) continue;
      const next = [current[0] + direction.dr, current[1] + direction.dc];
      const key = coordKey(next);
      if (previous.has(key)) continue;
      previous.set(key, current);
      queue.push(next);
    }
  }

  if (!previous.has(coordKey(end))) return [];
  const path = [];
  let current = end;
  while (current) {
    path.push(current);
    current = previous.get(coordKey(current));
  }
  return path.reverse();
}

function generateMaze(size) {
  const corners = [[0, 0], [0, size - 1], [size - 1, 0], [size - 1, size - 1]];
  let best = null;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const openings = Array(size * size).fill(0);
    const visited = Array(size * size).fill(false);
    const carveStart = [Math.floor(Math.random() * size), Math.floor(Math.random() * size)];
    const stack = [carveStart];
    visited[indexOf(size, carveStart[0], carveStart[1])] = true;

    while (stack.length) {
      const current = stack[stack.length - 1];
      const candidates = shuffle(DIRECTIONS).filter((direction) => {
        const row = current[0] + direction.dr;
        const column = current[1] + direction.dc;
        return row >= 0 && row < size && column >= 0 && column < size
          && !visited[indexOf(size, row, column)];
      });

      if (!candidates.length) {
        stack.pop();
        continue;
      }

      const direction = candidates[0];
      const next = [current[0] + direction.dr, current[1] + direction.dc];
      openings[indexOf(size, current[0], current[1])] |= direction.bit;
      openings[indexOf(size, next[0], next[1])] |= direction.opposite;
      visited[indexOf(size, next[0], next[1])] = true;
      stack.push(next);
    }

    const start = randomItem(corners);
    const end = oppositeCorner(size, start);
    const solutionPath = solveMaze(size, openings, start, end);
    const candidate = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      size,
      openings,
      start,
      end,
      solutionPath
    };

    if (!best || candidate.solutionPath.length > best.solutionPath.length) best = candidate;
    if (candidate.solutionPath.length >= Math.max(size * 2, Math.floor(size * size * 0.22))) return candidate;
  }

  return best;
}

function directionBetween(a, b) {
  const dr = b[0] - a[0];
  const dc = b[1] - a[1];
  return DIRECTIONS.find((direction) => direction.dr === dr && direction.dc === dc) || null;
}

function validatePath(path, maze) {
  if (!Array.isArray(path) || path.length < 2) return { valid: false, reason: "The path is incomplete." };
  if (path.length > maze.size * maze.size) return { valid: false, reason: "The path contains too many squares." };

  const cleaned = [];
  const seen = new Set();
  for (const raw of path) {
    if (!Array.isArray(raw) || raw.length !== 2) return { valid: false, reason: "The path data is invalid." };
    const row = Number(raw[0]);
    const column = Number(raw[1]);
    if (!Number.isInteger(row) || !Number.isInteger(column)
      || row < 0 || row >= maze.size || column < 0 || column >= maze.size) {
      return { valid: false, reason: "The path leaves the maze." };
    }
    const coord = [row, column];
    const key = coordKey(coord);
    if (seen.has(key)) return { valid: false, reason: "The final path cannot loop over the same square." };
    seen.add(key);
    cleaned.push(coord);
  }

  if (!sameCoord(cleaned[0], maze.start)) return { valid: false, reason: "Start from the green entrance." };
  if (!sameCoord(cleaned[cleaned.length - 1], maze.end)) return { valid: false, reason: "Reach the red exit first." };

  for (let index = 1; index < cleaned.length; index += 1) {
    const previous = cleaned[index - 1];
    const current = cleaned[index];
    const direction = directionBetween(previous, current);
    if (!direction) return { valid: false, reason: "Move through neighbouring squares only." };
    const mask = maze.openings[indexOf(maze.size, previous[0], previous[1])];
    if (!(mask & direction.bit)) return { valid: false, reason: "The path crossed a wall." };
  }

  return { valid: true, path: cleaned };
}

function formatDuration(milliseconds) {
  return `${(milliseconds / 1000).toFixed(2)}s`;
}

function registerMaze(namespace) {
  const rooms = new Map();

  function getRoomOf(socketId) {
    for (const room of rooms.values()) {
      if (room.players.some((player) => player.id === socketId)) return room;
    }
    return null;
  }

  function makePlayer(socket, name, number) {
    return {
      id: socket.id,
      name: String(name || "").trim().slice(0, 18) || `Player ${number}`,
      number,
      finished: false,
      finishMs: null,
      roundWins: 0,
      completedTimes: [],
      totalCompletedMs: 0
    };
  }

  function clearTimers(room) {
    for (const timer of room.timers) clearTimeout(timer);
    room.timers.clear();
  }

  function schedule(room, callback, delay) {
    const timer = setTimeout(() => {
      room.timers.delete(timer);
      callback();
    }, delay);
    room.timers.add(timer);
  }

  function rankings(room) {
    return room.players
      .map((player) => ({
        id: player.id,
        name: player.name,
        roundWins: player.roundWins,
        completedRounds: player.completedTimes.length,
        averageMs: player.completedTimes.length
          ? Math.round(player.totalCompletedMs / player.completedTimes.length)
          : null,
        totalCompletedMs: player.totalCompletedMs
      }))
      .sort((a, b) => b.roundWins - a.roundWins
        || b.completedRounds - a.completedRounds
        || (a.totalCompletedMs || Number.MAX_SAFE_INTEGER) - (b.totalCompletedMs || Number.MAX_SAFE_INTEGER));
  }

  function publicMaze(room, includeSolution = false) {
    if (!room.maze) return null;
    const payload = {
      id: room.maze.id,
      size: room.maze.size,
      openings: room.maze.openings,
      start: room.maze.start,
      end: room.maze.end
    };
    if (includeSolution) payload.solutionPath = room.maze.solutionPath;
    return payload;
  }

  function payload(room, player) {
    const host = room.players.find((candidate) => candidate.id === room.hostId);
    return {
      roomCode: room.code,
      phase: room.phase,
      options: room.options,
      round: room.round,
      totalRounds: room.options.rounds,
      phaseEndsAt: room.phaseEndsAt,
      startedAt: room.startedAt,
      serverNow: Date.now(),
      maze: ["countdown", "play", "result", "final"].includes(room.phase)
        ? publicMaze(room, ["result", "final"].includes(room.phase))
        : null,
      isHost: room.hostId === player.id,
      hostName: host?.name || "",
      message: room.message,
      me: {
        id: player.id,
        name: player.name,
        number: player.number,
        finished: player.finished,
        finishMs: player.finishMs,
        roundWins: player.roundWins
      },
      players: room.players.map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        number: candidate.number,
        finished: candidate.finished,
        finishMs: ["result", "final"].includes(room.phase) ? candidate.finishMs : null,
        roundWins: candidate.roundWins,
        completedRounds: candidate.completedTimes.length,
        averageMs: candidate.completedTimes.length
          ? Math.round(candidate.totalCompletedMs / candidate.completedTimes.length)
          : null
      })),
      lastRound: room.lastRound,
      rankings: room.phase === "final" ? rankings(room) : []
    };
  }

  function emitRoom(room) {
    for (const player of room.players) namespace.to(player.id).emit("mazeState", payload(room, player));
  }

  function resetCompetition(room) {
    room.round = 0;
    room.maze = null;
    room.lastRound = null;
    for (const player of room.players) {
      player.finished = false;
      player.finishMs = null;
      player.roundWins = 0;
      player.completedTimes = [];
      player.totalCompletedMs = 0;
    }
  }

  function setLobby(room, message) {
    clearTimers(room);
    resetCompetition(room);
    room.phase = room.players.length === 2 ? "settings" : "waiting";
    room.phaseEndsAt = null;
    room.startedAt = null;
    room.message = message || (room.players.length === 2
      ? `${room.players.find((player) => player.id === room.hostId)?.name || "Host"} can choose options and start.`
      : "Waiting for another player...");
    emitRoom(room);
  }

  function startRound(room) {
    if (room.players.length !== 2) return setLobby(room, "Waiting for another player...");
    clearTimers(room);
    room.round += 1;
    room.maze = generateMaze(room.options.gridSize);
    room.phase = "countdown";
    room.phaseEndsAt = Date.now() + COUNTDOWN_MS;
    room.startedAt = null;
    room.lastRound = null;
    room.message = `Round ${room.round}: get ready to race through the maze.`;
    for (const player of room.players) {
      player.finished = false;
      player.finishMs = null;
    }
    emitRoom(room);
    schedule(room, () => beginPlay(room), COUNTDOWN_MS);
  }

  function beginPlay(room) {
    if (room.phase !== "countdown") return;
    room.phase = "play";
    room.startedAt = Date.now();
    room.phaseEndsAt = room.startedAt + room.options.timeSeconds * 1000;
    room.message = "Slide from the green entrance to the red exit without crossing a wall.";
    emitRoom(room);
    schedule(room, () => finishTimedOutRound(room), room.options.timeSeconds * 1000);
  }

  function finishTimedOutRound(room) {
    if (room.phase !== "play") return;
    clearTimers(room);
    room.phase = "result";
    room.phaseEndsAt = Date.now() + RESULT_DELAY_MS;
    room.lastRound = {
      round: room.round,
      winnerId: null,
      winnerName: null,
      finishMs: null,
      path: room.maze.solutionPath,
      timedOut: true
    };
    room.message = "Time is up. The shortest route is shown below.";
    emitRoom(room);
    schedule(room, () => advanceAfterResult(room), RESULT_DELAY_MS);
  }

  function finishWonRound(room, player, path) {
    if (room.phase !== "play") return;
    clearTimers(room);
    const finishMs = Math.max(0, Date.now() - room.startedAt);
    player.finished = true;
    player.finishMs = finishMs;
    player.roundWins += 1;
    player.completedTimes.push(finishMs);
    player.totalCompletedMs += finishMs;
    room.phase = "result";
    room.phaseEndsAt = Date.now() + RESULT_DELAY_MS;
    room.lastRound = {
      round: room.round,
      winnerId: player.id,
      winnerName: player.name,
      finishMs,
      path,
      timedOut: false
    };
    room.message = `${player.name} escaped first in ${formatDuration(finishMs)}!`;
    emitRoom(room);
    schedule(room, () => advanceAfterResult(room), RESULT_DELAY_MS);
  }

  function advanceAfterResult(room) {
    if (room.round >= room.options.rounds) finishGame(room);
    else startRound(room);
  }

  function finishGame(room) {
    clearTimers(room);
    room.phase = "final";
    room.phaseEndsAt = null;
    room.startedAt = null;
    const ordered = rankings(room);
    const top = ordered[0];
    const tied = ordered.filter((entry) => entry.roundWins === top.roundWins
      && entry.completedRounds === top.completedRounds
      && entry.totalCompletedMs === top.totalCompletedMs);
    room.message = tied.length > 1
      ? `The maze race ends in a tie with ${top.roundWins} round win${top.roundWins === 1 ? "" : "s"} each.`
      : `${top.name} wins the maze race with ${top.roundWins} round win${top.roundWins === 1 ? "" : "s"}!`;
    emitRoom(room);
  }

  namespace.on("connection", (socket) => {
    socket.on("createMazeRoom", ({ name } = {}) => {
      const code = makeRoomCode(rooms);
      const room = {
        code,
        players: [],
        hostId: socket.id,
        options: { gridSize: 17, timeSeconds: 90, rounds: 3 },
        phase: "waiting",
        phaseEndsAt: null,
        startedAt: null,
        round: 0,
        maze: null,
        lastRound: null,
        message: "Waiting for another player...",
        timers: new Set()
      };
      room.players.push(makePlayer(socket, name, 1));
      rooms.set(code, room);
      socket.join(code);
      emitRoom(room);
    });

    socket.on("joinMazeRoom", ({ code, name } = {}) => {
      const cleanedCode = String(code || "").trim().toUpperCase();
      const room = rooms.get(cleanedCode);
      if (!room) return socket.emit("mazeError", "Room not found.");
      if (room.players.length >= 2) return socket.emit("mazeError", "Room is full.");
      if (room.phase !== "waiting") return socket.emit("mazeError", "This game has already started.");
      const playerNumber = room.players.some((player) => player.number === 1) ? 2 : 1;
      room.players.push(makePlayer(socket, name, playerNumber));
      socket.join(room.code);
      setLobby(room, `${room.players[0].name} is host. Choose options, then start.`);
    });

    socket.on("updateMazeOptions", ({ gridSize, timeSeconds, rounds } = {}) => {
      const room = getRoomOf(socket.id);
      if (!room || room.hostId !== socket.id || !["waiting", "settings"].includes(room.phase)) return;
      room.options.gridSize = chooseOption(gridSize, GRID_OPTIONS, room.options.gridSize);
      room.options.timeSeconds = chooseOption(timeSeconds, TIME_OPTIONS, room.options.timeSeconds);
      room.options.rounds = chooseOption(rounds, ROUND_OPTIONS, room.options.rounds);
      room.message = `Options: ${room.options.gridSize}×${room.options.gridSize} maze, ${room.options.timeSeconds}s, ${room.options.rounds} round${room.options.rounds === 1 ? "" : "s"}.`;
      emitRoom(room);
    });

    socket.on("startMazeGame", () => {
      const room = getRoomOf(socket.id);
      if (!room || room.hostId !== socket.id || room.phase !== "settings") return;
      if (room.players.length !== 2) return socket.emit("mazeError", "Need 2 players before starting.");
      resetCompetition(room);
      startRound(room);
    });

    socket.on("finishMaze", ({ path } = {}) => {
      const room = getRoomOf(socket.id);
      if (!room || room.phase !== "play" || Date.now() > room.phaseEndsAt + 250) return;
      const player = room.players.find((candidate) => candidate.id === socket.id);
      if (!player || player.finished) return;
      const validation = validatePath(path, room.maze);
      if (!validation.valid) return socket.emit("mazeError", validation.reason);
      finishWonRound(room, player, validation.path);
    });

    socket.on("restartMazeLobby", () => {
      const room = getRoomOf(socket.id);
      if (!room) return;
      setLobby(room, `${room.players.find((player) => player.id === room.hostId)?.name || "Host"} can change options and start again.`);
    });

    socket.on("disconnect", () => {
      const room = getRoomOf(socket.id);
      if (!room) return;
      clearTimers(room);
      const wasHost = room.hostId === socket.id;
      room.players = room.players.filter((player) => player.id !== socket.id);
      if (room.players.length === 0) return rooms.delete(room.code);
      if (wasHost) room.hostId = room.players[0].id;
      setLobby(room, wasHost
        ? `${room.players[0].name} is now host. Waiting for another player...`
        : "Opponent disconnected. Waiting for another player...");
    });
  });
}

module.exports = registerMaze;
module.exports._test = { generateMaze, solveMaze, validatePath, NORTH, EAST, SOUTH, WEST };
