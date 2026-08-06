const COUNTDOWN_MS = 2600;
const RESULT_DELAY_MS = 5200;
const ROUND_OPTIONS = [1, 3, 5, 7];
const RANGE_OPTIONS = {
  quick: { key: "quick", label: "Quick", minCs: 300, maxCs: 699 },
  standard: { key: "standard", label: "Standard", minCs: 500, maxCs: 999 },
  long: { key: "long", label: "Long", minCs: 800, maxCs: 1499 }
};

function makeRoomCode(rooms) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 5; index += 1) code += chars[Math.floor(Math.random() * chars.length)];
  return rooms.has(code) ? makeRoomCode(rooms) : code;
}

function chooseRounds(value, fallback) {
  const parsed = Number(value);
  return ROUND_OPTIONS.includes(parsed) ? parsed : fallback;
}

function chooseRange(value, fallback = "standard") {
  const key = String(value || "");
  return RANGE_OPTIONS[key] || RANGE_OPTIONS[fallback] || RANGE_OPTIONS.standard;
}

function randomTargetCs(rangeKey) {
  const range = chooseRange(rangeKey);
  return range.minCs + Math.floor(Math.random() * (range.maxCs - range.minCs + 1));
}

function formatTime(centiseconds) {
  if (!Number.isFinite(centiseconds)) return "—";
  const safe = Math.max(0, Math.round(centiseconds));
  return `${Math.floor(safe / 100)}:${String(safe % 100).padStart(2, "0")}s`;
}

function registerTimer(namespace) {
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
      attemptStartedAt: null,
      actualCs: null,
      errorCs: null,
      finished: false,
      points: 0,
      completedRounds: 0,
      totalErrorCs: 0
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

  function resetAttempt(player) {
    player.attemptStartedAt = null;
    player.actualCs = null;
    player.errorCs = null;
    player.finished = false;
  }

  function resetMatch(room) {
    room.round = 0;
    room.targetCs = null;
    room.lastRound = null;
    for (const player of room.players) {
      resetAttempt(player);
      player.points = 0;
      player.completedRounds = 0;
      player.totalErrorCs = 0;
    }
  }

  function playerStatus(player) {
    if (player.finished) return "locked";
    if (player.attemptStartedAt !== null) return "timing";
    return "ready";
  }

  function rankings(room) {
    return room.players
      .map((player) => ({
        id: player.id,
        name: player.name,
        number: player.number,
        points: player.points,
        completedRounds: player.completedRounds,
        totalErrorCs: player.totalErrorCs,
        averageErrorCs: player.completedRounds
          ? Math.round(player.totalErrorCs / player.completedRounds)
          : null
      }))
      .sort((a, b) => b.points - a.points
        || b.completedRounds - a.completedRounds
        || (a.completedRounds ? a.totalErrorCs : Number.MAX_SAFE_INTEGER) - (b.completedRounds ? b.totalErrorCs : Number.MAX_SAFE_INTEGER)
        || a.number - b.number);
  }

  function payload(room, player) {
    const host = room.players.find((candidate) => candidate.id === room.hostId);
    const reveal = ["result", "final"].includes(room.phase);
    return {
      roomCode: room.code,
      phase: room.phase,
      options: room.options,
      round: room.round,
      totalRounds: room.options.rounds,
      targetCs: room.targetCs,
      phaseEndsAt: room.phaseEndsAt,
      serverNow: Date.now(),
      isHost: room.hostId === player.id,
      hostName: host?.name || "",
      message: room.message,
      me: {
        id: player.id,
        name: player.name,
        number: player.number,
        status: playerStatus(player),
        points: player.points,
        actualCs: reveal ? player.actualCs : null,
        errorCs: reveal ? player.errorCs : null
      },
      players: room.players.map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        number: candidate.number,
        status: playerStatus(candidate),
        points: candidate.points,
        completedRounds: candidate.completedRounds,
        actualCs: reveal ? candidate.actualCs : null,
        errorCs: reveal ? candidate.errorCs : null
      })),
      lastRound: reveal ? room.lastRound : null,
      rankings: room.phase === "final" ? rankings(room) : []
    };
  }

  function emitRoom(room) {
    for (const player of room.players) namespace.to(player.id).emit("timerState", payload(room, player));
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
    room.targetCs = randomTargetCs(room.options.rangeKey);
    room.lastRound = null;
    for (const player of room.players) resetAttempt(player);
    room.phase = "countdown";
    room.phaseEndsAt = Date.now() + COUNTDOWN_MS;
    room.message = `Round ${room.round}: aim for exactly ${formatTime(room.targetCs)}.`;
    emitRoom(room);
    schedule(room, () => beginRound(room), COUNTDOWN_MS);
  }

  function beginRound(room) {
    if (room.phase !== "countdown") return;
    const targetMs = room.targetCs * 10;
    const attemptWindowMs = Math.max(25000, targetMs + 15000);
    room.phase = "play";
    room.phaseEndsAt = Date.now() + attemptWindowMs;
    room.message = "Press Start, estimate the target silently, then press Stop. Your running time stays hidden.";
    emitRoom(room);
    schedule(room, () => finishRound(room, true), attemptWindowMs);
  }

  function finishRound(room, timedOut = false) {
    if (room.phase !== "play") return;
    clearTimers(room);

    const completed = room.players.filter((player) => player.finished && Number.isFinite(player.errorCs));
    const bestError = completed.length ? Math.min(...completed.map((player) => player.errorCs)) : null;
    const winners = bestError === null ? [] : completed.filter((player) => player.errorCs === bestError);

    if (winners.length === 1) winners[0].points += 1;
    else if (winners.length > 1) winners.forEach((winner) => { winner.points += 0.5; });

    const results = room.players.map((player) => ({
      id: player.id,
      name: player.name,
      number: player.number,
      actualCs: player.actualCs,
      errorCs: player.errorCs,
      completed: player.finished,
      winner: winners.some((winner) => winner.id === player.id)
    }));

    room.lastRound = {
      round: room.round,
      targetCs: room.targetCs,
      timedOut,
      winnerIds: winners.map((winner) => winner.id),
      winnerNames: winners.map((winner) => winner.name),
      results
    };
    room.phase = "result";
    room.phaseEndsAt = Date.now() + RESULT_DELAY_MS;

    if (winners.length === 0) {
      room.message = "No completed attempts this round.";
    } else if (winners.length > 1) {
      room.message = `${winners.map((winner) => winner.name).join(" and ")} tie with an error of ${formatTime(bestError)}.`;
    } else {
      room.message = `${winners[0].name} is closest, only ${formatTime(bestError)} away!`;
    }

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
      && entry.completedRounds === top.completedRounds
      && entry.totalErrorCs === top.totalErrorCs);
    room.message = tied.length > 1
      ? `The timer match ends in a tie on ${top.points} point${top.points === 1 ? "" : "s"}.`
      : `${top.name} wins with ${top.points} point${top.points === 1 ? "" : "s"}!`;
    emitRoom(room);
  }

  namespace.on("connection", (socket) => {
    socket.on("createTimerRoom", ({ name } = {}) => {
      const code = makeRoomCode(rooms);
      const room = {
        code,
        players: [],
        hostId: socket.id,
        options: { rangeKey: "standard", rounds: 3 },
        phase: "waiting",
        phaseEndsAt: null,
        round: 0,
        targetCs: null,
        lastRound: null,
        message: "Waiting for another player...",
        timers: new Set()
      };
      room.players.push(makePlayer(socket, name, 1));
      rooms.set(code, room);
      socket.join(code);
      setLobby(room, "Waiting for another player...");
    });

    socket.on("joinTimerRoom", ({ code, name } = {}) => {
      const roomCode = String(code || "").trim().toUpperCase();
      const room = rooms.get(roomCode);
      if (!room) return socket.emit("timerError", "Room not found.");
      if (room.players.length >= 2) return socket.emit("timerError", "Room is full.");

      room.players.push(makePlayer(socket, name, 2));
      socket.join(room.code);
      setLobby(room, `${room.players.find((player) => player.id === room.hostId)?.name || "Host"} can choose options and start.`);
    });

    socket.on("updateTimerOptions", ({ rangeKey, rounds } = {}) => {
      const room = getRoomOf(socket.id);
      if (!room || room.hostId !== socket.id) return;
      if (!["waiting", "settings"].includes(room.phase)) return;
      room.options.rangeKey = chooseRange(rangeKey, room.options.rangeKey).key;
      room.options.rounds = chooseRounds(rounds, room.options.rounds);
      room.message = `Settings updated: ${chooseRange(room.options.rangeKey).label} targets, ${room.options.rounds} round${room.options.rounds === 1 ? "" : "s"}.`;
      emitRoom(room);
    });

    socket.on("startTimerGame", () => {
      const room = getRoomOf(socket.id);
      if (!room || room.hostId !== socket.id) return;
      if (room.players.length !== 2) return socket.emit("timerError", "Need 2 players before starting.");
      if (room.phase !== "settings") return;
      resetMatch(room);
      startRound(room);
    });

    socket.on("startTimerAttempt", () => {
      const room = getRoomOf(socket.id);
      if (!room || room.phase !== "play") return;
      const player = room.players.find((candidate) => candidate.id === socket.id);
      if (!player || player.finished || player.attemptStartedAt !== null) return;
      player.attemptStartedAt = Date.now();
      room.message = `${player.name} has started. The running time remains hidden.`;
      emitRoom(room);
    });

    socket.on("stopTimerAttempt", () => {
      const room = getRoomOf(socket.id);
      if (!room || room.phase !== "play") return;
      const player = room.players.find((candidate) => candidate.id === socket.id);
      if (!player || player.finished) return;
      if (player.attemptStartedAt === null) return socket.emit("timerError", "Press Start before stopping the timer.");

      const elapsedMs = Math.max(0, Date.now() - player.attemptStartedAt);
      player.actualCs = Math.round(elapsedMs / 10);
      player.errorCs = Math.abs(player.actualCs - room.targetCs);
      player.finished = true;
      player.completedRounds += 1;
      player.totalErrorCs += player.errorCs;
      room.message = `${player.name} has locked in a hidden time.`;

      if (room.players.every((candidate) => candidate.finished)) finishRound(room, false);
      else emitRoom(room);
    });

    socket.on("restartTimerLobby", () => {
      const room = getRoomOf(socket.id);
      if (!room) return;
      setLobby(room, `${room.players.find((player) => player.id === room.hostId)?.name || "Host"} can choose options and start again.`);
    });

    socket.on("disconnect", () => {
      const room = getRoomOf(socket.id);
      if (!room) return;
      clearTimers(room);
      const wasHost = room.hostId === socket.id;
      room.players = room.players.filter((player) => player.id !== socket.id);
      if (room.players.length === 0) {
        rooms.delete(room.code);
        return;
      }
      if (wasHost) room.hostId = room.players[0].id;
      setLobby(room, wasHost
        ? `${room.players[0].name} is now host. Waiting for another player...`
        : "Opponent disconnected. Waiting for another player...");
    });
  });
}

module.exports = registerTimer;
