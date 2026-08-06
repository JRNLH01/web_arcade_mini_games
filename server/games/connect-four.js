const COUNTDOWN_MS = 2200;
const RESULT_DELAY_MS = 3600;
const ROUND_OPTIONS = [1, 3, 5, 7];
const BOARD_OPTIONS = {
  standard: { key: "standard", label: "Standard", columns: 7, rows: 6 },
  wide: { key: "wide", label: "Wide", columns: 8, rows: 7 },
  large: { key: "large", label: "Large", columns: 9, rows: 7 }
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

function chooseBoard(value, fallback) {
  const key = String(value || "");
  return BOARD_OPTIONS[key] || BOARD_OPTIONS[fallback] || BOARD_OPTIONS.standard;
}

function boardIndex(columns, row, column) {
  return row * columns + column;
}

function findDropRow(board, rows, columns, column) {
  for (let row = rows - 1; row >= 0; row -= 1) {
    if (board[boardIndex(columns, row, column)] === 0) return row;
  }
  return -1;
}

function findWinningCells(board, rows, columns, row, column, playerNumber) {
  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (const [dr, dc] of directions) {
    const run = [[row, column]];
    for (const sign of [-1, 1]) {
      let nextRow = row + dr * sign;
      let nextColumn = column + dc * sign;
      const collected = [];
      while (nextRow >= 0 && nextRow < rows && nextColumn >= 0 && nextColumn < columns
        && board[boardIndex(columns, nextRow, nextColumn)] === playerNumber) {
        collected.push([nextRow, nextColumn]);
        nextRow += dr * sign;
        nextColumn += dc * sign;
      }
      if (sign === -1) run.unshift(...collected.reverse());
      else run.push(...collected);
    }
    if (run.length >= 4) return run;
  }
  return [];
}

function registerConnectFour(namespace) {
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
      roundWins: 0
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

  function boardConfig(room) {
    return BOARD_OPTIONS[room.options.boardKey] || BOARD_OPTIONS.standard;
  }

  function orderedPlayers(room) {
    return [...room.players].sort((a, b) => b.roundWins - a.roundWins || a.number - b.number);
  }

  function payload(room, player) {
    const host = room.players.find((candidate) => candidate.id === room.hostId);
    const config = boardConfig(room);
    const currentPlayer = room.players.find((candidate) => candidate.number === room.currentTurnNumber);
    return {
      roomCode: room.code,
      phase: room.phase,
      options: room.options,
      board: room.board,
      rows: config.rows,
      columns: config.columns,
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
        roundWins: player.roundWins
      },
      players: room.players.map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        number: candidate.number,
        roundWins: candidate.roundWins
      })),
      lastRound: room.lastRound,
      rankings: room.phase === "final"
        ? orderedPlayers(room).map((candidate) => ({
            id: candidate.id,
            name: candidate.name,
            number: candidate.number,
            roundWins: candidate.roundWins
          }))
        : []
    };
  }

  function emitRoom(room) {
    for (const player of room.players) namespace.to(player.id).emit("fourState", payload(room, player));
  }

  function resetMatch(room) {
    clearTimers(room);
    room.round = 0;
    room.board = [];
    room.currentTurnNumber = 1;
    room.lastRound = null;
    for (const player of room.players) player.roundWins = 0;
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
    if (room.players.length !== 2) return setLobby(room, "Waiting for another player...");
    clearTimers(room);
    const config = boardConfig(room);
    room.round += 1;
    room.board = Array(config.rows * config.columns).fill(0);
    room.currentTurnNumber = room.round % 2 === 1 ? 1 : 2;
    room.lastRound = null;
    room.phase = "countdown";
    room.phaseEndsAt = Date.now() + COUNTDOWN_MS;
    const starter = room.players.find((player) => player.number === room.currentTurnNumber);
    room.message = `${starter?.name || "Player"} starts round ${room.round}.`;
    emitRoom(room);
    schedule(room, () => beginRound(room), COUNTDOWN_MS);
  }

  function beginRound(room) {
    if (room.phase !== "countdown") return;
    room.phase = "play";
    room.phaseEndsAt = null;
    const current = room.players.find((player) => player.number === room.currentTurnNumber);
    room.message = `${current?.name || "Player"}'s turn. Drop a disc into any open column.`;
    emitRoom(room);
  }

  function finishRound(room, winner, winningCells = [], draw = false) {
    clearTimers(room);
    if (winner) winner.roundWins += 1;
    room.phase = "result";
    room.phaseEndsAt = Date.now() + RESULT_DELAY_MS;
    room.lastRound = {
      round: room.round,
      winnerId: winner?.id || null,
      winnerName: winner?.name || null,
      winnerNumber: winner?.number || null,
      winningCells,
      draw
    };
    room.message = draw
      ? "The board is full. This round is a draw."
      : `${winner.name} connects four and wins the round!`;
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
    const ordered = orderedPlayers(room);
    room.message = ordered.length > 1 && ordered[0].roundWins === ordered[1].roundWins
      ? `The match ends in a ${ordered[0].roundWins}-${ordered[1].roundWins} tie.`
      : `${ordered[0].name} wins the match with ${ordered[0].roundWins} round win${ordered[0].roundWins === 1 ? "" : "s"}!`;
    emitRoom(room);
  }

  namespace.on("connection", (socket) => {
    socket.on("createFourRoom", ({ name } = {}) => {
      const code = makeRoomCode(rooms);
      const room = {
        code,
        players: [],
        hostId: socket.id,
        options: { boardKey: "standard", rounds: 3 },
        phase: "waiting",
        phaseEndsAt: null,
        round: 0,
        board: [],
        currentTurnNumber: 1,
        lastRound: null,
        message: "Waiting for another player...",
        timers: new Set()
      };
      room.players.push(makePlayer(socket, name, 1));
      rooms.set(code, room);
      socket.join(code);
      emitRoom(room);
    });

    socket.on("joinFourRoom", ({ code, name } = {}) => {
      const cleanedCode = String(code || "").trim().toUpperCase();
      const room = rooms.get(cleanedCode);
      if (!room) return socket.emit("fourError", "Room not found.");
      if (room.players.length >= 2) return socket.emit("fourError", "Room is full.");
      if (room.phase !== "waiting") return socket.emit("fourError", "This game has already started.");
      const playerNumber = room.players.some((player) => player.number === 1) ? 2 : 1;
      room.players.push(makePlayer(socket, name, playerNumber));
      socket.join(room.code);
      setLobby(room, `${room.players[0].name} is host. Choose options, then start.`);
    });

    socket.on("updateFourOptions", ({ boardKey, rounds } = {}) => {
      const room = getRoomOf(socket.id);
      if (!room || room.hostId !== socket.id || !["waiting", "settings"].includes(room.phase)) return;
      room.options.boardKey = chooseBoard(boardKey, room.options.boardKey).key;
      room.options.rounds = chooseRounds(rounds, room.options.rounds);
      const config = boardConfig(room);
      room.message = `Options: ${config.columns} columns × ${config.rows} rows, ${room.options.rounds} round${room.options.rounds === 1 ? "" : "s"}.`;
      emitRoom(room);
    });

    socket.on("startFourGame", () => {
      const room = getRoomOf(socket.id);
      if (!room || room.hostId !== socket.id || room.phase !== "settings") return;
      if (room.players.length !== 2) return socket.emit("fourError", "Need 2 players before starting.");
      resetMatch(room);
      startRound(room);
    });

    socket.on("dropFourDisc", ({ column } = {}) => {
      const room = getRoomOf(socket.id);
      if (!room || room.phase !== "play") return;
      const player = room.players.find((candidate) => candidate.id === socket.id);
      if (!player || player.number !== room.currentTurnNumber) return socket.emit("fourError", "Wait for your turn.");
      const config = boardConfig(room);
      const parsedColumn = Number(column);
      if (!Number.isInteger(parsedColumn) || parsedColumn < 0 || parsedColumn >= config.columns) return;
      const row = findDropRow(room.board, config.rows, config.columns, parsedColumn);
      if (row < 0) return socket.emit("fourError", "That column is full.");

      room.board[boardIndex(config.columns, row, parsedColumn)] = player.number;
      const winningCells = findWinningCells(room.board, config.rows, config.columns, row, parsedColumn, player.number);
      if (winningCells.length >= 4) return finishRound(room, player, winningCells, false);
      if (room.board.every((value) => value !== 0)) return finishRound(room, null, [], true);

      room.currentTurnNumber = player.number === 1 ? 2 : 1;
      const next = room.players.find((candidate) => candidate.number === room.currentTurnNumber);
      room.message = `${next?.name || "Player"}'s turn.`;
      emitRoom(room);
    });

    socket.on("restartFourLobby", () => {
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

module.exports = registerConnectFour;
module.exports._test = { findDropRow, findWinningCells, BOARD_OPTIONS };
