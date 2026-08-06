const GRID_OPTIONS = new Set([5, 6, 7, 8, 9]);
const PAIR_OPTIONS = new Set([3, 4, 5, 6]);
const TIME_OPTIONS = new Set([30, 45, 60, 90, 120]);
const ROUND_OPTIONS = new Set([1, 3, 5]);
const COUNTDOWN_MS = 3000;
const RESULT_DELAY_MS = 5600;

const COLOURS = [
  { key: "red", hex: "#ef3340" },
  { key: "blue", hex: "#1597d4" },
  { key: "green", hex: "#55b949" },
  { key: "yellow", hex: "#ffd400" },
  { key: "purple", hex: "#8b4ab8" },
  { key: "orange", hex: "#f28c28" },
  { key: "pink", hex: "#ed5fa6" },
  { key: "teal", hex: "#16a6a1" },
  { key: "brown", hex: "#8b5a3c" }
];

function randomItem(values) {
  return values[Math.floor(Math.random() * values.length)];
}

function shuffled(values) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function coordKey(row, column) {
  return `${row},${column}`;
}

function manhattan(a, b) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
}

function countTurns(path) {
  let turns = 0;
  for (let index = 2; index < path.length; index += 1) {
    const previousDirection = [
      path[index - 1][0] - path[index - 2][0],
      path[index - 1][1] - path[index - 2][1]
    ];
    const currentDirection = [
      path[index][0] - path[index - 1][0],
      path[index][1] - path[index - 1][1]
    ];
    if (previousDirection[0] !== currentDirection[0] || previousDirection[1] !== currentDirection[1]) turns += 1;
  }
  return turns;
}

function allCells(size) {
  const cells = [];
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) cells.push([row, column]);
  }
  return cells;
}

function availableNeighbours(cell, size, occupied, localVisited) {
  const [row, column] = cell;
  return shuffled([
    [row - 1, column],
    [row + 1, column],
    [row, column - 1],
    [row, column + 1]
  ].filter(([nextRow, nextColumn]) => {
    if (nextRow < 0 || nextColumn < 0 || nextRow >= size || nextColumn >= size) return false;
    const key = coordKey(nextRow, nextColumn);
    return !occupied.has(key) && !localVisited.has(key);
  }));
}

function buildRandomPath(size, occupied, targetLength, minimumDistance) {
  const starts = shuffled(allCells(size).filter(([row, column]) => !occupied.has(coordKey(row, column))));

  for (const start of starts.slice(0, Math.min(starts.length, 28))) {
    const path = [start];
    const localVisited = new Set([coordKey(start[0], start[1])]);
    let explored = 0;

    function search() {
      explored += 1;
      if (explored > 7500) return false;

      if (path.length === targetLength) {
        const end = path[path.length - 1];
        return manhattan(start, end) >= minimumDistance && countTurns(path) >= 1;
      }

      const current = path[path.length - 1];
      const neighbours = availableNeighbours(current, size, occupied, localVisited)
        .map((cell) => ({
          cell,
          onward: availableNeighbours(cell, size, occupied, localVisited).length,
          edgeBias: Math.min(cell[0], cell[1], size - 1 - cell[0], size - 1 - cell[1])
        }))
        .sort((a, b) => {
          const randomBias = Math.random() - 0.5;
          return (a.onward - b.onward) * 0.45 + (b.edgeBias - a.edgeBias) * 0.12 + randomBias;
        });

      for (const { cell } of neighbours) {
        const key = coordKey(cell[0], cell[1]);
        path.push(cell);
        localVisited.add(key);
        if (search()) return true;
        path.pop();
        localVisited.delete(key);
      }
      return false;
    }

    if (search()) return path.map(([row, column]) => [row, column]);
  }

  return null;
}

function puzzleSignature(pairs) {
  return pairs
    .map((pair) => {
      const endpoints = [pair.a.join("-"), pair.b.join("-")].sort();
      return endpoints.join(":");
    })
    .sort()
    .join("|");
}

function generatePuzzle(size, requestedPairCount, previousSignature = "") {
  const pairCount = Math.max(3, Math.min(requestedPairCount, COLOURS.length, Math.floor((size * size) / 4)));

  for (let puzzleAttempt = 0; puzzleAttempt < 260; puzzleAttempt += 1) {
    const occupied = new Set();
    const solutionPaths = [];
    const colourChoices = shuffled(COLOURS).slice(0, pairCount);
    let failed = false;

    for (let pairIndex = 0; pairIndex < pairCount; pairIndex += 1) {
      const remainingPairs = pairCount - pairIndex - 1;
      const freeCells = size * size - occupied.size;
      const reserved = remainingPairs * 4;
      const maximumLength = Math.max(4, Math.min(size + 5, freeCells - reserved));
      const minimumLength = Math.min(maximumLength, size <= 5 ? 4 : 5);
      const targetLength = minimumLength + Math.floor(Math.random() * Math.max(1, maximumLength - minimumLength + 1));
      const minimumDistance = size >= 8 ? 4 : size >= 6 ? 3 : 2;
      const path = buildRandomPath(size, occupied, targetLength, minimumDistance);

      if (!path) {
        failed = true;
        break;
      }

      for (const [row, column] of path) occupied.add(coordKey(row, column));
      solutionPaths.push({
        colour: colourChoices[pairIndex].key,
        hex: colourChoices[pairIndex].hex,
        path
      });
    }

    if (failed) continue;

    const pairs = solutionPaths.map(({ colour, hex, path }) => ({
      colour,
      hex,
      a: path[0],
      b: path[path.length - 1]
    }));

    const endpointKeys = new Set();
    let endpointsValid = true;
    for (const pair of pairs) {
      for (const endpoint of [pair.a, pair.b]) {
        const key = coordKey(endpoint[0], endpoint[1]);
        if (endpointKeys.has(key)) endpointsValid = false;
        endpointKeys.add(key);
      }
    }
    if (!endpointsValid) continue;

    const signature = puzzleSignature(pairs);
    if (signature === previousSignature) continue;

    return {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      size,
      pairs,
      signature,
      solutionPaths
    };
  }

  // A guaranteed fallback based on horizontal lanes. It is rare, but keeps the game playable.
  const fallbackColours = shuffled(COLOURS).slice(0, pairCount);
  const pairs = [];
  const solutionPaths = [];
  for (let index = 0; index < pairCount; index += 1) {
    const row = Math.min(size - 1, index);
    const forward = index % 2 === 0;
    const path = [];
    for (let column = 0; column < size; column += 1) {
      path.push([row, forward ? column : size - 1 - column]);
    }
    const colour = fallbackColours[index];
    pairs.push({ colour: colour.key, hex: colour.hex, a: path[0], b: path[path.length - 1] });
    solutionPaths.push({ colour: colour.key, hex: colour.hex, path });
  }
  return {
    id: `${Date.now().toString(36)}-fallback`,
    size,
    pairs,
    signature: puzzleSignature(pairs),
    solutionPaths
  };
}

function sameCoord(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a[0] === b[0] && a[1] === b[1];
}

function normalizePaths(rawPaths, puzzle) {
  if (!rawPaths || typeof rawPaths !== "object" || Array.isArray(rawPaths)) return null;
  const normalized = {};
  for (const pair of puzzle.pairs) {
    const rawPath = rawPaths[pair.colour];
    if (!Array.isArray(rawPath) || rawPath.length < 2 || rawPath.length > puzzle.size * puzzle.size) return null;
    normalized[pair.colour] = rawPath.map((coord) => {
      if (!Array.isArray(coord) || coord.length !== 2) return null;
      const row = Number(coord[0]);
      const column = Number(coord[1]);
      if (!Number.isInteger(row) || !Number.isInteger(column)) return null;
      if (row < 0 || column < 0 || row >= puzzle.size || column >= puzzle.size) return null;
      return [row, column];
    });
    if (normalized[pair.colour].some((coord) => !coord)) return null;
  }
  return normalized;
}

function validatePaths(rawPaths, puzzle) {
  const paths = normalizePaths(rawPaths, puzzle);
  if (!paths) return { valid: false, reason: "Invalid path data." };

  const endpointOwner = new Map();
  for (const pair of puzzle.pairs) {
    endpointOwner.set(coordKey(pair.a[0], pair.a[1]), pair.colour);
    endpointOwner.set(coordKey(pair.b[0], pair.b[1]), pair.colour);
  }

  const occupied = new Map();
  for (const pair of puzzle.pairs) {
    const path = paths[pair.colour];
    const startsCorrectly = sameCoord(path[0], pair.a) && sameCoord(path[path.length - 1], pair.b);
    const startsReversed = sameCoord(path[0], pair.b) && sameCoord(path[path.length - 1], pair.a);
    if (!startsCorrectly && !startsReversed) {
      return { valid: false, reason: `${pair.colour} does not connect its matching dots.` };
    }

    for (let index = 0; index < path.length; index += 1) {
      const current = path[index];
      const key = coordKey(current[0], current[1]);
      if (index > 0 && manhattan(path[index - 1], current) !== 1) {
        return { valid: false, reason: "Lines must move one square at a time." };
      }
      if (occupied.has(key)) {
        return { valid: false, reason: "Different coloured lines cannot overlap or cross." };
      }
      const owner = endpointOwner.get(key);
      const isPathEnd = index === 0 || index === path.length - 1;
      if (owner && (owner !== pair.colour || !isPathEnd)) {
        return { valid: false, reason: "A line cannot pass through another dot." };
      }
      occupied.set(key, pair.colour);
    }
  }

  return { valid: true, paths };
}

function formatDuration(milliseconds) {
  return `${(milliseconds / 1000).toFixed(2)}s`;
}

function registerConnectDots(namespace) {
  const rooms = new Map();

  function makeRoomCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let index = 0; index < 5; index += 1) code += chars[Math.floor(Math.random() * chars.length)];
    return rooms.has(code) ? makeRoomCode() : code;
  }

  function chooseOption(value, allowed, fallback) {
    const parsed = Number(value);
    return allowed.has(parsed) ? parsed : fallback;
  }

  function cleanName(name, number) {
    return String(name || "").trim().slice(0, 18) || `Player ${number}`;
  }

  function makePlayer(socket, name, number) {
    return {
      id: socket.id,
      name: cleanName(name, number),
      finished: false,
      finishMs: null,
      roundWins: 0,
      completedTimes: [],
      totalCompletedMs: 0
    };
  }

  function getRoomOf(socketId) {
    for (const room of rooms.values()) {
      if (room.players.some((player) => player.id === socketId)) return room;
    }
    return null;
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
    return [...room.players]
      .map((player) => ({
        id: player.id,
        name: player.name,
        roundWins: player.roundWins,
        completedRounds: player.completedTimes.length,
        totalCompletedMs: player.totalCompletedMs,
        averageMs: player.completedTimes.length
          ? Math.round(player.totalCompletedMs / player.completedTimes.length)
          : null
      }))
      .sort((a, b) => b.roundWins - a.roundWins
        || b.completedRounds - a.completedRounds
        || (a.totalCompletedMs || Number.MAX_SAFE_INTEGER) - (b.totalCompletedMs || Number.MAX_SAFE_INTEGER));
  }

  function publicPuzzle(room, includeSolution = false) {
    if (!room.puzzle) return null;
    const payload = {
      id: room.puzzle.id,
      size: room.puzzle.size,
      pairs: room.puzzle.pairs
    };
    if (includeSolution) payload.solutionPaths = room.puzzle.solutionPaths;
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
      puzzle: ["countdown", "play", "result", "final"].includes(room.phase)
        ? publicPuzzle(room, ["result", "final"].includes(room.phase))
        : null,
      isHost: room.hostId === player.id,
      hostName: host?.name || "",
      message: room.message,
      me: {
        id: player.id,
        name: player.name,
        finished: player.finished,
        finishMs: player.finishMs,
        roundWins: player.roundWins
      },
      players: room.players.map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
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
    for (const player of room.players) namespace.to(player.id).emit("dotsState", payload(room, player));
  }

  function resetCompetition(room) {
    room.round = 0;
    room.puzzle = null;
    room.lastRound = null;
    room.previousSignature = "";
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
    room.puzzle = generatePuzzle(room.options.gridSize, room.options.pairs, room.previousSignature);
    room.previousSignature = room.puzzle.signature;
    room.phase = "countdown";
    room.phaseEndsAt = Date.now() + COUNTDOWN_MS;
    room.startedAt = null;
    room.lastRound = null;
    room.message = `Round ${room.round}: get ready to connect the matching dots.`;
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
    room.message = "Connect every matching colour. Lines cannot overlap or cross.";
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
      paths: null,
      timedOut: true
    };
    room.message = "Time is up. No player completed every connection.";
    emitRoom(room);
    schedule(room, () => advanceAfterResult(room), RESULT_DELAY_MS);
  }

  function finishWonRound(room, player, paths) {
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
      paths,
      timedOut: false
    };
    room.message = `${player.name} connected every pair first in ${formatDuration(finishMs)}!`;
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
      ? `The match ends in a tie with ${top.roundWins} round win${top.roundWins === 1 ? "" : "s"} each.`
      : `${top.name} wins the match with ${top.roundWins} round win${top.roundWins === 1 ? "" : "s"}!`;
    emitRoom(room);
  }

  namespace.on("connection", (socket) => {
    socket.on("createDotsRoom", ({ name } = {}) => {
      const code = makeRoomCode();
      const room = {
        code,
        players: [],
        hostId: socket.id,
        options: { gridSize: 7, pairs: 4, timeSeconds: 60, rounds: 3 },
        phase: "waiting",
        phaseEndsAt: null,
        startedAt: null,
        round: 0,
        puzzle: null,
        previousSignature: "",
        lastRound: null,
        message: "Waiting for another player...",
        timers: new Set()
      };
      room.players.push(makePlayer(socket, name, 1));
      rooms.set(code, room);
      socket.join(code);
      emitRoom(room);
    });

    socket.on("joinDotsRoom", ({ code, name } = {}) => {
      const cleanedCode = String(code || "").trim().toUpperCase();
      const room = rooms.get(cleanedCode);
      if (!room) return socket.emit("dotsError", "Room not found.");
      if (room.players.length >= 2) return socket.emit("dotsError", "Room is full.");
      if (room.phase !== "waiting") return socket.emit("dotsError", "This game has already started.");
      room.players.push(makePlayer(socket, name, 2));
      socket.join(room.code);
      setLobby(room, `${room.players[0].name} is host. Choose options, then start.`);
    });

    socket.on("updateDotsOptions", ({ gridSize, pairs, timeSeconds, rounds } = {}) => {
      const room = getRoomOf(socket.id);
      if (!room || room.hostId !== socket.id || !["waiting", "settings"].includes(room.phase)) return;
      room.options.gridSize = chooseOption(gridSize, GRID_OPTIONS, room.options.gridSize);
      room.options.pairs = chooseOption(pairs, PAIR_OPTIONS, room.options.pairs);
      room.options.pairs = Math.min(room.options.pairs, Math.floor((room.options.gridSize * room.options.gridSize) / 4));
      room.options.timeSeconds = chooseOption(timeSeconds, TIME_OPTIONS, room.options.timeSeconds);
      room.options.rounds = chooseOption(rounds, ROUND_OPTIONS, room.options.rounds);
      room.message = `Options: ${room.options.gridSize}×${room.options.gridSize}, ${room.options.pairs} colours, ${room.options.timeSeconds}s, ${room.options.rounds} round${room.options.rounds === 1 ? "" : "s"}.`;
      emitRoom(room);
    });

    socket.on("startDotsGame", () => {
      const room = getRoomOf(socket.id);
      if (!room || room.hostId !== socket.id || room.phase !== "settings") return;
      if (room.players.length !== 2) return socket.emit("dotsError", "Need 2 players before starting.");
      resetCompetition(room);
      startRound(room);
    });

    socket.on("finishDotsPuzzle", ({ paths } = {}) => {
      const room = getRoomOf(socket.id);
      if (!room || room.phase !== "play" || Date.now() > room.phaseEndsAt + 200) return;
      const player = room.players.find((candidate) => candidate.id === socket.id);
      if (!player || player.finished) return;
      const validation = validatePaths(paths, room.puzzle);
      if (!validation.valid) return socket.emit("dotsError", validation.reason);
      finishWonRound(room, player, validation.paths);
    });

    socket.on("restartDotsLobby", () => {
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

module.exports = registerConnectDots;
module.exports._test = { generatePuzzle, validatePaths, puzzleSignature };
