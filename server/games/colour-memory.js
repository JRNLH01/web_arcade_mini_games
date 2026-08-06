const FLASH_OPTIONS = new Set([1, 2, 3, 4, 5]);
const GUESS_OPTIONS = new Set([5, 10, 15, 20, 30, 45, 60]);
const ROUND_OPTIONS = new Set([1, 3, 5, 10]);
const RESULT_DELAY_MS = 4500;

module.exports = function registerColourMemory(namespace) {
  const rooms = new Map();

  function makeRoomCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 5; i += 1) code += chars[Math.floor(Math.random() * chars.length)];
    return rooms.has(code) ? makeRoomCode() : code;
  }

  function cleanName(name, number) {
    return String(name || "").trim().slice(0, 18) || `Player ${number}`;
  }

  function chooseOption(value, allowed, fallback) {
    const parsed = Number(value);
    return allowed.has(parsed) ? parsed : fallback;
  }

  function randomTarget() {
    return {
      h: Math.floor(Math.random() * 360),
      s: 35 + Math.floor(Math.random() * 66),
      v: 35 + Math.floor(Math.random() * 66)
    };
  }

  function clamp(value, min, max) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return min;
    return Math.max(min, Math.min(max, parsed));
  }

  function normalizeGuess(guess = {}) {
    return {
      h: Math.round(clamp(guess.h, 0, 359)),
      s: Math.round(clamp(guess.s, 0, 100)),
      v: Math.round(clamp(guess.v, 0, 100))
    };
  }

  function scoreGuess(target, guess) {
    if (!guess) {
      return { accuracy: 0, hue: 0, saturation: 0, brightness: 0 };
    }
    const rawHueDifference = Math.abs(target.h - guess.h);
    const hueDifference = Math.min(rawHueDifference, 360 - rawHueDifference);
    const hue = Math.max(0, 1 - hueDifference / 180);
    const saturation = Math.max(0, 1 - Math.abs(target.s - guess.s) / 100);
    const brightness = Math.max(0, 1 - Math.abs(target.v - guess.v) / 100);
    const accuracy = hue * 0.5 + saturation * 0.25 + brightness * 0.25;
    return {
      accuracy: Math.round(accuracy * 10000) / 100,
      hue: Math.round(hue * 10000) / 100,
      saturation: Math.round(saturation * 10000) / 100,
      brightness: Math.round(brightness * 10000) / 100
    };
  }

  function makePlayer(socket, name, number) {
    return {
      id: socket.id,
      name: cleanName(name, number),
      number,
      guess: null,
      draft: { h: 0, s: 50, v: 50 },
      score: null,
      submitted: false,
      totalScore: 0,
      roundScores: [],
      roundWins: 0
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

  function resetCompetition(room) {
    room.round = 0;
    room.target = null;
    room.phaseEndsAt = null;
    room.roundWinnerNames = [];
    room.lastRound = null;
    for (const player of room.players) {
      player.guess = null;
      player.draft = { h: 0, s: 50, v: 50 };
      player.score = null;
      player.submitted = false;
      player.totalScore = 0;
      player.roundScores = [];
      player.roundWins = 0;
    }
  }

  function rankings(room) {
    return [...room.players]
      .map((player) => ({
        id: player.id,
        name: player.name,
        average: player.roundScores.length
          ? Math.round((player.totalScore / player.roundScores.length) * 100) / 100
          : 0,
        total: Math.round(player.totalScore * 100) / 100,
        roundWins: player.roundWins,
        scores: player.roundScores
      }))
      .sort((a, b) => b.average - a.average || b.roundWins - a.roundWins);
  }

  function payload(room, player) {
    const host = room.players.find((candidate) => candidate.id === room.hostId);
    const showTarget = ["flash", "result", "final"].includes(room.phase);
    return {
      roomCode: room.code,
      phase: room.phase,
      options: room.options,
      round: room.round,
      totalRounds: room.options.rounds,
      phaseEndsAt: room.phaseEndsAt,
      serverNow: Date.now(),
      target: showTarget ? room.target : null,
      isHost: room.hostId === player.id,
      hostName: host?.name || "",
      message: room.message,
      me: {
        id: player.id,
        name: player.name,
        submitted: player.submitted,
        score: player.score,
        totalScore: player.totalScore,
        roundScores: player.roundScores,
        roundWins: player.roundWins
      },
      players: room.players.map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        submitted: candidate.submitted,
        score: ["result", "final"].includes(room.phase) ? candidate.score : null,
        guess: ["result", "final"].includes(room.phase) ? candidate.guess : null,
        average: candidate.roundScores.length
          ? Math.round((candidate.totalScore / candidate.roundScores.length) * 100) / 100
          : 0,
        roundWins: candidate.roundWins
      })),
      lastRound: room.lastRound,
      rankings: room.phase === "final" ? rankings(room) : []
    };
  }

  function emitRoom(room) {
    for (const player of room.players) {
      namespace.to(player.id).emit("colourState", payload(room, player));
    }
  }

  function setLobby(room, message) {
    clearTimers(room);
    resetCompetition(room);
    room.phase = room.players.length === 2 ? "settings" : "waiting";
    room.message = message || (room.players.length === 2
      ? `${room.players.find((player) => player.id === room.hostId)?.name || "Host"} can set the options and start.`
      : "Waiting for another player...");
    emitRoom(room);
  }

  function startRound(room) {
    if (room.players.length !== 2) return setLobby(room, "Waiting for another player...");
    clearTimers(room);
    room.round += 1;
    room.target = randomTarget();
    room.phase = "flash";
    room.phaseEndsAt = Date.now() + room.options.flashSeconds * 1000;
    room.message = `Round ${room.round}: memorise this colour.`;
    room.lastRound = null;
    for (const player of room.players) {
      player.guess = null;
      player.draft = { h: 0, s: 50, v: 50 };
      player.score = null;
      player.submitted = false;
    }
    emitRoom(room);
    schedule(room, () => beginGuess(room), room.options.flashSeconds * 1000);
  }

  function beginGuess(room) {
    if (room.phase !== "flash") return;
    room.phase = "guess";
    room.phaseEndsAt = Date.now() + room.options.guessSeconds * 1000;
    room.message = "Recreate the colour before time runs out.";
    emitRoom(room);
    schedule(room, () => finishRound(room), room.options.guessSeconds * 1000);
  }

  function finishRound(room) {
    if (room.phase !== "guess") return;
    clearTimers(room);
    for (const player of room.players) {
      if (!player.guess) player.guess = player.draft;
      player.score = scoreGuess(room.target, player.guess);
      player.totalScore += player.score.accuracy;
      player.roundScores.push(player.score.accuracy);
    }

    const bestAccuracy = Math.max(...room.players.map((player) => player.score.accuracy));
    const winners = room.players.filter((player) => Math.abs(player.score.accuracy - bestAccuracy) < 0.005);
    for (const winner of winners) winner.roundWins += 1;

    room.roundWinnerNames = winners.map((winner) => winner.name);
    room.lastRound = {
      round: room.round,
      winnerNames: room.roundWinnerNames,
      winnerIds: winners.map((winner) => winner.id),
      target: room.target,
      players: room.players.map((player) => ({
        id: player.id,
        name: player.name,
        guess: player.guess,
        score: player.score
      }))
    };
    room.phase = "result";
    room.phaseEndsAt = Date.now() + RESULT_DELAY_MS;
    room.message = winners.length === 1
      ? `${winners[0].name} was closest this round!`
      : `Round tie between ${winners.map((winner) => winner.name).join(" and ")}!`;
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
    const tied = ordered.filter((entry) => Math.abs(entry.average - top.average) < 0.005);
    room.message = tied.length > 1
      ? `Final tie at ${top.average.toFixed(2)}% average accuracy!`
      : `${top.name} wins with ${top.average.toFixed(2)}% average accuracy!`;
    emitRoom(room);
  }

  namespace.on("connection", (socket) => {
    socket.on("createColourRoom", ({ name } = {}) => {
      const code = makeRoomCode();
      const room = {
        code,
        players: [],
        hostId: socket.id,
        options: { flashSeconds: 2, guessSeconds: 15, rounds: 3 },
        phase: "waiting",
        phaseEndsAt: null,
        round: 0,
        target: null,
        lastRound: null,
        roundWinnerNames: [],
        message: "Waiting for another player...",
        timers: new Set()
      };
      room.players.push(makePlayer(socket, name, 1));
      rooms.set(code, room);
      socket.join(code);
      emitRoom(room);
    });

    socket.on("joinColourRoom", ({ code, name } = {}) => {
      const cleanedCode = String(code || "").trim().toUpperCase();
      const room = rooms.get(cleanedCode);
      if (!room) return socket.emit("colourError", "Room not found.");
      if (room.players.length >= 2) return socket.emit("colourError", "Room is full.");
      if (room.phase !== "waiting") return socket.emit("colourError", "This game has already started.");
      room.players.push(makePlayer(socket, name, 2));
      socket.join(room.code);
      setLobby(room, `${room.players[0].name} is host. Choose options, then start.`);
    });

    socket.on("updateColourOptions", ({ flashSeconds, guessSeconds, rounds } = {}) => {
      const room = getRoomOf(socket.id);
      if (!room || room.hostId !== socket.id || !["waiting", "settings"].includes(room.phase)) return;
      room.options.flashSeconds = chooseOption(flashSeconds, FLASH_OPTIONS, room.options.flashSeconds);
      room.options.guessSeconds = chooseOption(guessSeconds, GUESS_OPTIONS, room.options.guessSeconds);
      room.options.rounds = chooseOption(rounds, ROUND_OPTIONS, room.options.rounds);
      room.message = `Options: ${room.options.flashSeconds}s flash, ${room.options.guessSeconds}s guessing, ${room.options.rounds} round${room.options.rounds === 1 ? "" : "s"}.`;
      emitRoom(room);
    });

    socket.on("startColourGame", () => {
      const room = getRoomOf(socket.id);
      if (!room || room.hostId !== socket.id || room.phase !== "settings") return;
      if (room.players.length !== 2) return socket.emit("colourError", "Need 2 players before starting.");
      resetCompetition(room);
      startRound(room);
    });

    socket.on("updateColourDraft", ({ guess } = {}) => {
      const room = getRoomOf(socket.id);
      if (!room || room.phase !== "guess") return;
      const player = room.players.find((candidate) => candidate.id === socket.id);
      if (!player || player.submitted) return;
      player.draft = normalizeGuess(guess);
    });

    socket.on("submitColourGuess", ({ guess } = {}) => {
      const room = getRoomOf(socket.id);
      if (!room || room.phase !== "guess") return;
      const player = room.players.find((candidate) => candidate.id === socket.id);
      if (!player || player.submitted) return;
      if (Date.now() > room.phaseEndsAt + 150) return;
      player.guess = normalizeGuess(guess);
      player.draft = player.guess;
      player.submitted = true;
      room.message = room.players.every((candidate) => candidate.submitted)
        ? "Both guesses are in. Revealing results..."
        : `${player.name} submitted. Waiting for the other player.`;
      emitRoom(room);
      if (room.players.every((candidate) => candidate.submitted)) finishRound(room);
    });

    socket.on("restartColourLobby", () => {
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
};
