const COUNTDOWN_MS = 2200;
const RESULT_DELAY_MS = 4800;
const RANGE_OPTIONS = [100, 200, 500, 1000, 1500, 2000, 3000, 5000];
const ROUND_OPTIONS = [1, 3, 5, 7];

function formatNumber(value) {
  return Number(value).toLocaleString("en-US");
}

function makeRoomCode(rooms) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 5; index += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms.has(code) ? makeRoomCode(rooms) : code;
}

function chooseRange(value, fallback = 100) {
  const parsed = Number(value);
  return RANGE_OPTIONS.includes(parsed) ? parsed : fallback;
}

function chooseRounds(value, fallback = 3) {
  const parsed = Number(value);
  return ROUND_OPTIONS.includes(parsed) ? parsed : fallback;
}

function registerHigherLower(namespace) {
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
      secretNumber: null,
      secretLocked: false,
      lowerBound: 1,
      upperBound: 100,
      guesses: [],
      roundWins: 0,
      totalGuesses: 0
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

  function resetRoundPlayer(player, maximum) {
    player.secretNumber = null;
    player.secretLocked = false;
    player.lowerBound = 1;
    player.upperBound = maximum;
    player.guesses = [];
  }

  function resetMatch(room) {
    clearTimers(room);
    room.round = 0;
    room.currentTurnNumber = 1;
    room.guessHistory = [];
    room.lastRound = null;
    for (const player of room.players) {
      resetRoundPlayer(player, room.options.maximum);
      player.roundWins = 0;
      player.totalGuesses = 0;
    }
  }

  function rankings(room) {
    return [...room.players]
      .map((player) => ({
        id: player.id,
        name: player.name,
        number: player.number,
        roundWins: player.roundWins,
        totalGuesses: player.totalGuesses
      }))
      .sort((a, b) => b.roundWins - a.roundWins
        || a.totalGuesses - b.totalGuesses
        || a.number - b.number);
  }

  function payload(room, player) {
    const host = room.players.find((candidate) => candidate.id === room.hostId);
    const opponent = room.players.find((candidate) => candidate.id !== player.id);
    const currentPlayer = room.players.find((candidate) => candidate.number === room.currentTurnNumber);

    return {
      roomCode: room.code,
      phase: room.phase,
      options: room.options,
      round: room.round,
      totalRounds: room.options.rounds,
      phaseEndsAt: room.phaseEndsAt,
      serverNow: Date.now(),
      currentTurnNumber: room.currentTurnNumber,
      currentTurnId: currentPlayer?.id || null,
      currentTurnName: currentPlayer?.name || "",
      isHost: room.hostId === player.id,
      hostName: host?.name || "",
      message: room.message,
      me: {
        id: player.id,
        name: player.name,
        number: player.number,
        secretNumber: player.secretLocked ? player.secretNumber : null,
        secretLocked: player.secretLocked,
        lowerBound: player.lowerBound,
        upperBound: player.upperBound,
        guesses: player.guesses,
        roundWins: player.roundWins,
        totalGuesses: player.totalGuesses
      },
      opponent: opponent ? {
        id: opponent.id,
        name: opponent.name,
        number: opponent.number,
        secretLocked: opponent.secretLocked,
        guessCount: opponent.guesses.length,
        roundWins: opponent.roundWins,
        totalGuesses: opponent.totalGuesses
      } : null,
      players: room.players.map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        number: candidate.number,
        secretLocked: candidate.secretLocked,
        guessCount: candidate.guesses.length,
        roundWins: candidate.roundWins,
        totalGuesses: candidate.totalGuesses
      })),
      guessHistory: room.guessHistory,
      lastRound: ["result", "final"].includes(room.phase) ? room.lastRound : null,
      rankings: room.phase === "final" ? rankings(room) : []
    };
  }

  function emitRoom(room) {
    for (const player of room.players) {
      namespace.to(player.id).emit("higherLowerState", payload(room, player));
    }
  }

  function setLobby(room, message) {
    resetMatch(room);
    room.phase = room.players.length === 2 ? "settings" : "waiting";
    room.phaseEndsAt = null;
    room.message = message || (room.players.length === 2
      ? `${room.players.find((player) => player.id === room.hostId)?.name || "Host"} can choose options and start.`
      : "Waiting for another player...");
    emitRoom(room);
  }

  function startRound(room) {
    if (room.players.length !== 2) {
      setLobby(room, "Waiting for another player...");
      return;
    }

    clearTimers(room);
    room.round += 1;
    room.currentTurnNumber = room.round % 2 === 1 ? 1 : 2;
    room.guessHistory = [];
    room.lastRound = null;
    room.phase = "choosing";
    room.phaseEndsAt = null;
    for (const player of room.players) resetRoundPlayer(player, room.options.maximum);

    const starter = room.players.find((player) => player.number === room.currentTurnNumber);
    room.message = `Choose and lock a secret number from 1 to ${formatNumber(room.options.maximum)}. ${starter?.name || "Player"} will guess first.`;
    emitRoom(room);
  }

  function beginCountdown(room) {
    if (room.phase !== "choosing" || !room.players.every((player) => player.secretLocked)) return;
    room.phase = "countdown";
    room.phaseEndsAt = Date.now() + COUNTDOWN_MS;
    const starter = room.players.find((player) => player.number === room.currentTurnNumber);
    room.message = `${starter?.name || "Player"} guesses first. Keep your secret number hidden.`;
    emitRoom(room);
    schedule(room, () => beginGuessing(room), COUNTDOWN_MS);
  }

  function beginGuessing(room) {
    if (room.phase !== "countdown") return;
    room.phase = "play";
    room.phaseEndsAt = null;
    const current = room.players.find((player) => player.number === room.currentTurnNumber);
    room.message = `${current?.name || "Player"}'s turn to guess.`;
    emitRoom(room);
  }

  function finishRound(room, winner, finalGuess) {
    if (room.phase !== "play" || !winner) return;
    clearTimers(room);
    winner.roundWins += 1;
    room.phase = "result";
    room.phaseEndsAt = Date.now() + RESULT_DELAY_MS;
    room.lastRound = {
      round: room.round,
      winnerId: winner.id,
      winnerName: winner.name,
      finalGuess,
      totalTurns: room.guessHistory.length,
      players: room.players.map((player) => ({
        id: player.id,
        name: player.name,
        number: player.number,
        secretNumber: player.secretNumber,
        guessCount: player.guesses.length,
        roundWins: player.roundWins
      }))
    };
    room.message = `${winner.name} guessed ${finalGuess} exactly and wins round ${room.round}!`;
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
    const topWins = ordered[0]?.roundWins ?? 0;
    const tied = ordered.filter((entry) => entry.roundWins === topWins);
    room.message = tied.length > 1
      ? `The match ends in a ${topWins}-${topWins} tie.`
      : `${ordered[0].name} wins Higher or Lower with ${topWins} round win${topWins === 1 ? "" : "s"}!`;
    emitRoom(room);
  }

  namespace.on("connection", (socket) => {
    socket.on("createHigherLowerRoom", ({ name } = {}) => {
      const code = makeRoomCode(rooms);
      const room = {
        code,
        players: [],
        hostId: socket.id,
        options: { maximum: 100, rounds: 3 },
        phase: "waiting",
        phaseEndsAt: null,
        round: 0,
        currentTurnNumber: 1,
        guessHistory: [],
        lastRound: null,
        message: "Waiting for another player...",
        timers: new Set()
      };
      room.players.push(makePlayer(socket, name, 1));
      rooms.set(code, room);
      socket.join(code);
      emitRoom(room);
    });

    socket.on("joinHigherLowerRoom", ({ code, name } = {}) => {
      const cleanedCode = String(code || "").trim().toUpperCase();
      const room = rooms.get(cleanedCode);
      if (!room) return socket.emit("higherLowerError", "Room not found.");
      if (room.players.length >= 2) return socket.emit("higherLowerError", "Room is full.");
      if (room.phase !== "waiting") return socket.emit("higherLowerError", "This game has already started.");

      const playerNumber = room.players.some((player) => player.number === 1) ? 2 : 1;
      room.players.push(makePlayer(socket, name, playerNumber));
      socket.join(room.code);
      setLobby(room, `${room.players.find((player) => player.id === room.hostId)?.name || "Host"} is host. Choose options, then start.`);
    });

    socket.on("updateHigherLowerOptions", ({ maximum, rounds } = {}) => {
      const room = getRoomOf(socket.id);
      if (!room || room.hostId !== socket.id || !["waiting", "settings"].includes(room.phase)) return;
      room.options.maximum = chooseRange(maximum, room.options.maximum);
      room.options.rounds = chooseRounds(rounds, room.options.rounds);
      room.message = `Options: numbers 1–${formatNumber(room.options.maximum)}, ${room.options.rounds} round${room.options.rounds === 1 ? "" : "s"}.`;
      emitRoom(room);
    });

    socket.on("startHigherLowerGame", () => {
      const room = getRoomOf(socket.id);
      if (!room || room.hostId !== socket.id || room.phase !== "settings") return;
      if (room.players.length !== 2) return socket.emit("higherLowerError", "Need 2 players before starting.");
      resetMatch(room);
      startRound(room);
    });

    socket.on("lockHigherLowerNumber", ({ number } = {}) => {
      const room = getRoomOf(socket.id);
      if (!room || room.phase !== "choosing") return;
      const player = room.players.find((candidate) => candidate.id === socket.id);
      if (!player || player.secretLocked) return;
      const parsed = Number(number);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > room.options.maximum) {
        return socket.emit("higherLowerError", `Choose a whole number from 1 to ${formatNumber(room.options.maximum)}.`);
      }

      player.secretNumber = parsed;
      player.secretLocked = true;
      room.message = room.players.every((candidate) => candidate.secretLocked)
        ? "Both secret numbers are locked."
        : `${player.name} locked a number. Waiting for the other player...`;
      emitRoom(room);
      if (room.players.every((candidate) => candidate.secretLocked)) beginCountdown(room);
    });

    socket.on("makeHigherLowerGuess", ({ guess } = {}) => {
      const room = getRoomOf(socket.id);
      if (!room || room.phase !== "play") return;
      const player = room.players.find((candidate) => candidate.id === socket.id);
      const opponent = room.players.find((candidate) => candidate.id !== socket.id);
      if (!player || !opponent || player.number !== room.currentTurnNumber) {
        return socket.emit("higherLowerError", "Wait for your turn.");
      }

      const parsed = Number(guess);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > room.options.maximum) {
        return socket.emit("higherLowerError", `Guess a whole number from 1 to ${formatNumber(room.options.maximum)}.`);
      }
      if (parsed < player.lowerBound || parsed > player.upperBound) {
        return socket.emit("higherLowerError", `Your remaining range is ${formatNumber(player.lowerBound)}–${formatNumber(player.upperBound)}.`);
      }

      let result = "correct";
      if (parsed < opponent.secretNumber) {
        result = "higher";
        player.lowerBound = Math.max(player.lowerBound, parsed + 1);
      } else if (parsed > opponent.secretNumber) {
        result = "lower";
        player.upperBound = Math.min(player.upperBound, parsed - 1);
      }

      const historyEntry = {
        turn: room.guessHistory.length + 1,
        playerId: player.id,
        playerName: player.name,
        playerNumber: player.number,
        guess: parsed,
        result
      };
      player.guesses.push(historyEntry);
      player.totalGuesses += 1;
      room.guessHistory.push(historyEntry);

      if (result === "correct") {
        finishRound(room, player, parsed);
        return;
      }

      room.currentTurnNumber = opponent.number;
      const direction = result === "higher" ? "higher" : "lower";
      room.message = `${player.name} guessed ${parsed}. The number is ${direction}. ${opponent.name}'s turn.`;
      emitRoom(room);
    });

    socket.on("restartHigherLowerToLobby", () => {
      const room = getRoomOf(socket.id);
      if (!room) return;
      setLobby(room, `${room.players.find((player) => player.id === room.hostId)?.name || "Host"} can change options and start again.`);
    });

    socket.on("disconnect", () => {
      const room = getRoomOf(socket.id);
      if (!room) return;
      const wasHost = room.hostId === socket.id;
      clearTimers(room);
      room.players = room.players.filter((player) => player.id !== socket.id);
      if (room.players.length === 0) {
        rooms.delete(room.code);
        return;
      }

      if (wasHost) room.hostId = room.players[0].id;
      room.players[0].number = 1;
      setLobby(room, wasHost
        ? `${room.players[0].name} is now host. Waiting for another player...`
        : "Opponent disconnected. Waiting for another player...");
    });
  });
}

module.exports = registerHigherLower;
