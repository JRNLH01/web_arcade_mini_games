const COUNTDOWN_MS = 2600;
const MISMATCH_DELAY_MS = 850;
const RESULT_DELAY_MS = 5200;
const GRID_OPTIONS = [4, 6, 8, 10, 12];
const ROUND_OPTIONS = [1, 3, 5];

const CARD_FACES = [
  "🍎", "🍊", "🍋", "🍉", "🍇", "🍓", "🫐", "🍒", "🥝", "🍍",
  "🥥", "🥑", "🍄", "🌽", "🥕", "🌶️", "🥨", "🍕", "🍔", "🍩",
  "🧁", "🍪", "🍿", "🍫", "🍭", "⚽", "🏀", "🏈", "⚾", "🎾",
  "🏐", "🎱", "🎯", "🎲", "🎸", "🎹", "🎺", "🎻", "🥁", "🚗",
  "🚕", "🚌", "🚓", "🚑", "🚒", "🚜", "✈️", "🚀", "🚁", "⛵",
  "🚲", "🛴", "⌚", "📱", "💡", "🔑", "🎁", "🎈", "🧸", "🪁",
  "⭐", "🌙", "☀️", "⚡", "🔥", "❄️", "🌈", "☂️", "🌻", "🌵",
  "🌴", "🌲", "🍀", "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻",
  "🐼", "🐨", "🐯", "🦁", "🐮", "🐷", "🐸", "🐵", "🐔", "🐧",
  "🐦", "🦄", "🐝", "🦋", "🐞", "🐢", "🐙", "🐠", "🐬", "🦀"
];

function makeRoomCode(rooms) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 5; index += 1) code += chars[Math.floor(Math.random() * chars.length)];
  return rooms.has(code) ? makeRoomCode(rooms) : code;
}

function chooseGridSize(value, fallback = 6) {
  const parsed = Number(value);
  return GRID_OPTIONS.includes(parsed) ? parsed : fallback;
}

function chooseRounds(value, fallback = 3) {
  const parsed = Number(value);
  return ROUND_OPTIONS.includes(parsed) ? parsed : fallback;
}

function shuffle(values) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function createDeck(gridSize) {
  const pairCount = (gridSize * gridSize) / 2;
  if (pairCount > CARD_FACES.length) throw new Error("Not enough card faces for selected grid size.");
  const selectedFaces = shuffle(CARD_FACES).slice(0, pairCount);
  return shuffle(selectedFaces.flatMap((face) => [face, face]));
}

function formatDuration(milliseconds) {
  if (!Number.isFinite(milliseconds)) return "—";
  return `${(Math.max(0, milliseconds) / 1000).toFixed(2)}s`;
}

function registerMemoryMatch(namespace) {
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
      firstIndex: null,
      secondIndex: null,
      matched: new Set(),
      inputLocked: false,
      moves: 0,
      points: 0,
      wins: 0,
      totalWinningTimeMs: 0,
      completedRounds: 0
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

  function resetRoundPlayer(player) {
    player.firstIndex = null;
    player.secondIndex = null;
    player.matched = new Set();
    player.inputLocked = false;
    player.moves = 0;
  }

  function resetMatch(room) {
    room.round = 0;
    room.deck = [];
    room.roundStartedAt = null;
    room.lastRound = null;
    for (const player of room.players) {
      resetRoundPlayer(player);
      player.points = 0;
      player.wins = 0;
      player.totalWinningTimeMs = 0;
      player.completedRounds = 0;
    }
  }

  function playerBoard(room, player) {
    return room.deck.map((face, index) => {
      const matched = player.matched.has(index);
      const flipped = player.firstIndex === index || player.secondIndex === index;
      const status = matched ? "matched" : flipped ? "flipped" : "hidden";
      return {
        index,
        status,
        face: status === "hidden" ? null : face
      };
    });
  }

  function rankings(room) {
    return room.players
      .map((player) => ({
        id: player.id,
        name: player.name,
        number: player.number,
        points: player.points,
        wins: player.wins,
        completedRounds: player.completedRounds,
        totalWinningTimeMs: player.totalWinningTimeMs,
        averageWinningTimeMs: player.completedRounds
          ? Math.round(player.totalWinningTimeMs / player.completedRounds)
          : null
      }))
      .sort((a, b) => b.points - a.points
        || b.wins - a.wins
        || (a.completedRounds ? a.totalWinningTimeMs : Number.MAX_SAFE_INTEGER)
          - (b.completedRounds ? b.totalWinningTimeMs : Number.MAX_SAFE_INTEGER)
        || a.number - b.number);
  }

  function payload(room, player) {
    const host = room.players.find((candidate) => candidate.id === room.hostId);
    const totalPairs = room.options.gridSize * room.options.gridSize / 2;
    return {
      roomCode: room.code,
      phase: room.phase,
      options: room.options,
      round: room.round,
      totalRounds: room.options.rounds,
      phaseEndsAt: room.phaseEndsAt,
      roundStartedAt: room.roundStartedAt,
      serverNow: Date.now(),
      isHost: room.hostId === player.id,
      hostName: host?.name || "",
      message: room.message,
      totalPairs,
      me: {
        id: player.id,
        name: player.name,
        number: player.number,
        points: player.points,
        pairsMatched: player.matched.size / 2,
        moves: player.moves,
        inputLocked: player.inputLocked,
        board: ["play"].includes(room.phase) ? playerBoard(room, player) : []
      },
      players: room.players.map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        number: candidate.number,
        points: candidate.points,
        wins: candidate.wins,
        pairsMatched: candidate.matched.size / 2,
        moves: candidate.moves,
        inputLocked: candidate.inputLocked
      })),
      lastRound: ["result", "final"].includes(room.phase) ? room.lastRound : null,
      rankings: room.phase === "final" ? rankings(room) : []
    };
  }

  function emitRoom(room) {
    for (const player of room.players) {
      namespace.to(player.id).emit("memoryMatchState", payload(room, player));
    }
  }

  function setLobby(room, message) {
    clearTimers(room);
    resetMatch(room);
    room.phase = room.players.length === 2 ? "settings" : "waiting";
    room.phaseEndsAt = null;
    room.message = message || (room.players.length === 2
      ? `${room.players.find((player) => player.id === room.hostId)?.name || "Host"} can choose options and start.`
      : "Waiting for another player...");
    emitRoom(room);
  }

  function startRound(room) {
    if (room.players.length !== 2) return setLobby(room, "Waiting for another player...");
    clearTimers(room);
    room.round += 1;
    room.deck = createDeck(room.options.gridSize);
    room.roundStartedAt = null;
    room.lastRound = null;
    for (const player of room.players) resetRoundPlayer(player);
    room.phase = "countdown";
    room.phaseEndsAt = Date.now() + COUNTDOWN_MS;
    room.message = `Round ${room.round}: get ready to match ${room.deck.length / 2} pairs.`;
    emitRoom(room);
    schedule(room, () => beginRound(room), COUNTDOWN_MS);
  }

  function beginRound(room) {
    if (room.phase !== "countdown") return;
    room.phase = "play";
    room.phaseEndsAt = null;
    room.roundStartedAt = Date.now();
    room.message = "Flip two cards at a time. The first player to match every pair wins the round.";
    emitRoom(room);
  }

  function finishRound(room, winner) {
    if (room.phase !== "play" || !winner) return;
    clearTimers(room);
    const finishMs = Math.max(0, Date.now() - room.roundStartedAt);
    winner.points += 1;
    winner.wins += 1;
    winner.completedRounds += 1;
    winner.totalWinningTimeMs += finishMs;

    room.lastRound = {
      round: room.round,
      winnerId: winner.id,
      winnerName: winner.name,
      finishMs,
      results: room.players.map((player) => ({
        id: player.id,
        name: player.name,
        number: player.number,
        pairsMatched: player.matched.size / 2,
        moves: player.moves,
        winner: player.id === winner.id,
        finishMs: player.id === winner.id ? finishMs : null
      }))
    };
    room.phase = "result";
    room.phaseEndsAt = Date.now() + RESULT_DELAY_MS;
    room.message = `${winner.name} matched every pair in ${formatDuration(finishMs)} and wins round ${room.round}!`;
    emitRoom(room);

    schedule(room, () => {
      if (room.round >= room.options.rounds) finishGame(room);
      else startRound(room);
    }, RESULT_DELAY_MS);
  }

  function finishGame(room) {
    clearTimers(room);
    room.phase = "final";
    room.phaseEndsAt = null;
    const ordered = rankings(room);
    const top = ordered[0];
    const tied = ordered.filter((entry) => entry.points === top.points
      && entry.wins === top.wins
      && entry.totalWinningTimeMs === top.totalWinningTimeMs);
    room.message = tied.length > 1
      ? `The Memory Match game ends in a tie on ${top.points} point${top.points === 1 ? "" : "s"}.`
      : `${top.name} wins Memory Match with ${top.points} point${top.points === 1 ? "" : "s"}!`;
    emitRoom(room);
  }

  namespace.on("connection", (socket) => {
    socket.on("createMemoryMatchRoom", ({ name } = {}) => {
      const code = makeRoomCode(rooms);
      const room = {
        code,
        players: [],
        hostId: socket.id,
        options: { gridSize: 6, rounds: 3 },
        phase: "waiting",
        phaseEndsAt: null,
        round: 0,
        deck: [],
        roundStartedAt: null,
        lastRound: null,
        message: "Waiting for another player...",
        timers: new Set()
      };
      room.players.push(makePlayer(socket, name, 1));
      rooms.set(code, room);
      socket.join(code);
      setLobby(room, "Waiting for another player...");
    });

    socket.on("joinMemoryMatchRoom", ({ code, name } = {}) => {
      const roomCode = String(code || "").trim().toUpperCase();
      const room = rooms.get(roomCode);
      if (!room) return socket.emit("memoryMatchError", "Room not found.");
      if (room.players.length >= 2) return socket.emit("memoryMatchError", "Room is full.");

      room.players.push(makePlayer(socket, name, 2));
      socket.join(room.code);
      setLobby(room, `${room.players.find((player) => player.id === room.hostId)?.name || "Host"} can choose options and start.`);
    });

    socket.on("updateMemoryMatchOptions", ({ gridSize, rounds } = {}) => {
      const room = getRoomOf(socket.id);
      if (!room || room.hostId !== socket.id) return;
      if (!["waiting", "settings"].includes(room.phase)) return;
      room.options.gridSize = chooseGridSize(gridSize, room.options.gridSize);
      room.options.rounds = chooseRounds(rounds, room.options.rounds);
      room.message = `Settings updated: ${room.options.gridSize}×${room.options.gridSize}, ${room.options.rounds} round${room.options.rounds === 1 ? "" : "s"}.`;
      emitRoom(room);
    });

    socket.on("startMemoryMatchGame", () => {
      const room = getRoomOf(socket.id);
      if (!room || room.hostId !== socket.id || room.phase !== "settings") return;
      if (room.players.length !== 2) return socket.emit("memoryMatchError", "Two players are required.");
      resetMatch(room);
      startRound(room);
    });

    socket.on("flipMemoryCard", ({ index } = {}) => {
      const room = getRoomOf(socket.id);
      if (!room || room.phase !== "play") return;
      const player = room.players.find((candidate) => candidate.id === socket.id);
      if (!player || player.inputLocked) return;

      const cardIndex = Number(index);
      if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex >= room.deck.length) return;
      if (player.matched.has(cardIndex) || player.firstIndex === cardIndex || player.secondIndex === cardIndex) return;

      if (player.firstIndex === null) {
        player.firstIndex = cardIndex;
        emitRoom(room);
        return;
      }

      player.secondIndex = cardIndex;
      player.moves += 1;
      const firstFace = room.deck[player.firstIndex];
      const secondFace = room.deck[player.secondIndex];

      if (firstFace === secondFace) {
        player.matched.add(player.firstIndex);
        player.matched.add(player.secondIndex);
        player.firstIndex = null;
        player.secondIndex = null;
        if (player.matched.size === room.deck.length) {
          finishRound(room, player);
          return;
        }
        emitRoom(room);
        return;
      }

      player.inputLocked = true;
      emitRoom(room);
      schedule(room, () => {
        if (room.phase !== "play") return;
        const activePlayer = room.players.find((candidate) => candidate.id === player.id);
        if (!activePlayer) return;
        activePlayer.firstIndex = null;
        activePlayer.secondIndex = null;
        activePlayer.inputLocked = false;
        emitRoom(room);
      }, MISMATCH_DELAY_MS);
    });

    socket.on("restartMemoryMatchLobby", () => {
      const room = getRoomOf(socket.id);
      if (!room) return;
      const hostName = room.players.find((player) => player.id === room.hostId)?.name || "Host";
      setLobby(room, `${hostName} can change options and start again.`);
    });

    socket.on("disconnect", () => {
      const room = getRoomOf(socket.id);
      if (!room) return;
      const wasHost = room.hostId === socket.id;
      room.players = room.players.filter((player) => player.id !== socket.id);
      clearTimers(room);

      if (room.players.length === 0) {
        rooms.delete(room.code);
        return;
      }

      if (wasHost) room.hostId = room.players[0].id;
      const hostName = room.players.find((player) => player.id === room.hostId)?.name || "Host";
      setLobby(room, wasHost
        ? `${hostName} is now host. Waiting for another player...`
        : "Opponent disconnected. Waiting for another player...");
    });
  });
}

module.exports = registerMemoryMatch;
