const MIN_FILL_DELAY_MS = 80;
const MIN_GRID = 3;
const MAX_GRID = 12;

module.exports = function registerNumberHunt(namespace) {
  const rooms = new Map();

  function makeRoomCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 5; i += 1) code += chars[Math.floor(Math.random() * chars.length)];
    return rooms.has(code) ? makeRoomCode() : code;
  }

  function clampGrid(value, fallback = 10) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) return fallback;
    return Math.max(MIN_GRID, Math.min(MAX_GRID, parsed));
  }

  function shuffle(values) {
    const copy = [...values];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function boardTotal(room) {
    return room.options.boardGrid * room.options.boardGrid;
  }

  function cardTotal(room) {
    return room.options.cardGrid * room.options.cardGrid;
  }

  function newBoard(room) {
    return shuffle(Array.from({ length: boardTotal(room) }, (_, i) => i + 1));
  }

  function newCard(room) {
    return Array(cardTotal(room)).fill(false);
  }

  function makePlayer(socket, name, number, room) {
    return {
      id: socket.id,
      name: name?.trim() || `Player ${number}`,
      number,
      board: newBoard(room),
      crossed: [...(room.usedNumbers || [])],
      card: newCard(room),
      lastFillAt: 0
    };
  }

  function getRoomOf(socketId) {
    for (const room of rooms.values()) {
      if (room.players.some((player) => player.id === socketId)) return room;
    }
    return null;
  }

  function getPlayer(room, socketId) {
    return room.players.find((player) => player.id === socketId);
  }

  function getOpponent(room, socketId) {
    return room.players.find((player) => player.id !== socketId);
  }

  function resetPlayers(room) {
    room.usedNumbers = [];
    for (const player of room.players) {
      player.board = newBoard(room);
      player.crossed = [];
      player.card = newCard(room);
      player.lastFillAt = 0;
    }
  }

  function playerPayload(room, player) {
    const opponent = getOpponent(room, player.id);
    const host = room.players.find((candidate) => candidate.id === room.hostId);
    return {
      roomCode: room.code,
      phase: room.phase,
      options: room.options,
      hostName: host?.name || "",
      isHost: room.hostId === player.id,
      calledNumber: room.calledNumber,
      usedNumbers: room.usedNumbers,
      turnId: room.turnId,
      turnName: room.players.find((candidate) => candidate.id === room.turnId)?.name || "",
      winnerName: room.winnerId
        ? room.players.find((candidate) => candidate.id === room.winnerId)?.name || ""
        : "",
      message: room.message,
      players: room.players.map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        number: candidate.number,
        filledCount: candidate.card.filter(Boolean).length
      })),
      me: {
        id: player.id,
        name: player.name,
        number: player.number,
        board: player.board,
        crossed: player.crossed,
        card: player.card
      },
      opponent: opponent
        ? {
            id: opponent.id,
            name: opponent.name,
            number: opponent.number,
            filledCount: opponent.card.filter(Boolean).length,
            card: opponent.card
          }
        : null
    };
  }

  function emitRoom(room) {
    for (const player of room.players) {
      namespace.to(player.id).emit("state", playerPayload(room, player));
    }
  }

  function enterSettings(room, message) {
    room.phase = room.players.length === 2 ? "settings" : "waiting";
    room.turnId = room.hostId || room.players[0]?.id || null;
    room.calledNumber = null;
    room.winnerId = null;
    room.message = message || "Waiting for another player...";
    emitRoom(room);
  }

  function startGame(room) {
    if (room.players.length !== 2) return;
    resetPlayers(room);
    room.phase = "choose";
    room.turnId = room.hostId;
    room.calledNumber = null;
    room.winnerId = null;
    room.message = `${room.players.find((player) => player.id === room.turnId)?.name || "Host"} starts.`;
    emitRoom(room);
  }

  namespace.on("connection", (socket) => {
    socket.on("createRoom", ({ name } = {}) => {
      const code = makeRoomCode();
      const room = {
        code,
        players: [],
        options: { boardGrid: 10, cardGrid: 10 },
        phase: "waiting",
        hostId: socket.id,
        turnId: socket.id,
        calledNumber: null,
        usedNumbers: [],
        winnerId: null,
        message: "Waiting for another player..."
      };
      room.players.push(makePlayer(socket, name, 1, room));
      rooms.set(code, room);
      socket.join(code);
      emitRoom(room);
    });

    socket.on("joinRoom", ({ code, name } = {}) => {
      const cleanedCode = String(code || "").trim().toUpperCase();
      const room = rooms.get(cleanedCode);
      if (!room) return socket.emit("errorMessage", "Room not found.");
      if (room.players.length >= 2) return socket.emit("errorMessage", "Room is full.");

      room.players.push(makePlayer(socket, name, 2, room));
      socket.join(room.code);
      enterSettings(room, `${room.players[0].name} is host. Set options, then start.`);
    });

    socket.on("updateOptions", ({ boardGrid, cardGrid } = {}) => {
      const room = getRoomOf(socket.id);
      if (!room || room.hostId !== socket.id) return;
      if (!["settings", "waiting"].includes(room.phase)) return;
      room.options.boardGrid = clampGrid(boardGrid, room.options.boardGrid);
      room.options.cardGrid = clampGrid(cardGrid, room.options.cardGrid);
      room.message = `Options updated: board ${room.options.boardGrid}×${room.options.boardGrid}, card ${room.options.cardGrid}×${room.options.cardGrid}.`;
      emitRoom(room);
    });

    socket.on("startGame", () => {
      const room = getRoomOf(socket.id);
      if (!room || room.hostId !== socket.id || room.phase !== "settings") return;
      if (room.players.length !== 2) return socket.emit("errorMessage", "Need 2 players before starting.");
      startGame(room);
    });

    socket.on("pickNumber", ({ number } = {}) => {
      const room = getRoomOf(socket.id);
      if (!room || room.phase !== "choose" || room.turnId !== socket.id) return;
      const player = getPlayer(room, socket.id);
      const parsed = Number(number);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > boardTotal(room)) return;
      if (room.usedNumbers.includes(parsed) || player.crossed.includes(parsed)) {
        return socket.emit("errorMessage", "That number has already been cancelled. Pick another one.");
      }
      room.phase = "filling";
      room.calledNumber = parsed;
      room.message = `${player.name} called ${parsed}. ${getOpponent(room, socket.id).name} must find it!`;
      emitRoom(room);
    });

    socket.on("fillX", () => {
      const room = getRoomOf(socket.id);
      if (!room || room.phase !== "filling" || room.turnId !== socket.id) return;
      const player = getPlayer(room, socket.id);
      const now = Date.now();
      if (now - player.lastFillAt < MIN_FILL_DELAY_MS) return;
      player.lastFillAt = now;
      const nextIndex = player.card.findIndex((cell) => !cell);
      if (nextIndex === -1) return;
      player.card[nextIndex] = true;
      if (player.card.every(Boolean)) {
        room.phase = "gameover";
        room.winnerId = player.id;
        room.message = `${player.name} filled the whole card and wins!`;
      }
      emitRoom(room);
    });

    socket.on("cancelNumber", ({ number } = {}) => {
      const room = getRoomOf(socket.id);
      if (!room || room.phase !== "filling" || room.turnId === socket.id) return;
      const parsed = Number(number);
      if (parsed !== room.calledNumber) return socket.emit("wrongGuess", parsed);
      const defender = getPlayer(room, socket.id);
      if (!room.usedNumbers.includes(parsed)) room.usedNumbers.push(parsed);
      for (const player of room.players) {
        if (!player.crossed.includes(parsed)) player.crossed.push(parsed);
      }
      room.phase = "choose";
      room.calledNumber = null;
      room.turnId = defender.id;
      room.message = `${defender.name} cancelled ${parsed}. Now ${defender.name} chooses a number.`;
      emitRoom(room);
    });

    socket.on("restartToLobby", () => {
      const room = getRoomOf(socket.id);
      if (!room) return;
      resetPlayers(room);
      enterSettings(room, `${room.players.find((player) => player.id === room.hostId)?.name || "Host"} can change options and start again.`);
    });

    socket.on("disconnect", () => {
      const room = getRoomOf(socket.id);
      if (!room) return;
      const wasHost = room.hostId === socket.id;
      room.players = room.players.filter((player) => player.id !== socket.id);
      if (room.players.length === 0) return rooms.delete(room.code);
      if (wasHost) room.hostId = room.players[0].id;
      resetPlayers(room);
      room.phase = "waiting";
      room.turnId = room.hostId;
      room.calledNumber = null;
      room.winnerId = null;
      room.message = wasHost
        ? `${room.players[0].name} is now host. Waiting for another player...`
        : "Opponent disconnected. Waiting for another player...";
      emitRoom(room);
    });
  });
};
