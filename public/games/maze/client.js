const socket = createArcadeSocket("/maze");

const NORTH = 1;
const EAST = 2;
const SOUTH = 4;
const WEST = 8;
const DIRECTIONS = [
  { dr: -1, dc: 0, bit: NORTH },
  { dr: 0, dc: 1, bit: EAST },
  { dr: 1, dc: 0, bit: SOUTH },
  { dr: 0, dc: -1, bit: WEST }
];

const welcome = document.getElementById("welcome");
const playerName = document.getElementById("playerName");
const roomInput = document.getElementById("roomInput");
const createRoomBtn = document.getElementById("createRoomBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const welcomeError = document.getElementById("welcomeError");

const lobby = document.getElementById("lobby");
const roomCode = document.getElementById("roomCode");
const copyRoomCodeBtn = document.getElementById("copyRoomCodeBtn");
const hostBadge = document.getElementById("hostBadge");
const playerList = document.getElementById("playerList");
const gridSizeSelect = document.getElementById("gridSizeSelect");
const timeSelect = document.getElementById("timeSelect");
const roundsSelect = document.getElementById("roundsSelect");
const lobbyMessage = document.getElementById("lobbyMessage");
const startBtn = document.getElementById("startBtn");
const hostHint = document.getElementById("hostHint");
const lobbyError = document.getElementById("lobbyError");

const playArea = document.getElementById("playArea");
const gameRoomCode = document.getElementById("gameRoomCode");
const roundLabel = document.getElementById("roundLabel");
const timer = document.getElementById("timer");
const stageKicker = document.getElementById("stageKicker");
const stageTitle = document.getElementById("stageTitle");
const stageMessage = document.getElementById("stageMessage");
const countdownView = document.getElementById("countdownView");
const countdownNumber = document.getElementById("countdownNumber");
const mazeView = document.getElementById("mazeView");
const pathProgress = document.getElementById("pathProgress");
const mazeBoard = document.getElementById("mazeBoard");
const mazeGrid = document.getElementById("mazeGrid");
const mazePathLayer = document.getElementById("mazePathLayer");
const undoBtn = document.getElementById("undoBtn");
const resetPathBtn = document.getElementById("resetPathBtn");
const resultView = document.getElementById("resultView");
const resultTitle = document.getElementById("resultTitle");
const resultTime = document.getElementById("resultTime");
const resultMazeGrid = document.getElementById("resultMazeGrid");
const resultPathLayer = document.getElementById("resultPathLayer");
const finalView = document.getElementById("finalView");
const finalMessage = document.getElementById("finalMessage");
const finalRankings = document.getElementById("finalRankings");
const restartBtn = document.getElementById("restartBtn");
const scoreStrip = document.getElementById("scoreStrip");
const playError = document.getElementById("playError");

let state = null;
let serverClockOffset = 0;
let countdownFrame = null;
let syncingOptions = false;
let localPath = [];
let renderedMazeId = null;
let submittedMazeId = null;
let pointerDrawing = false;
let pointerId = null;
let pointerMoved = false;
let lastPointerPoint = null;
let pathRenderFrame = null;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showError(element, message) {
  element.textContent = message || "";
  if (message) setTimeout(() => {
    if (element.textContent === message) element.textContent = "";
  }, 3500);
}

function sameCoord(a, b) {
  return a && b && a[0] === b[0] && a[1] === b[1];
}

function coordKey(coord) {
  return `${coord[0]},${coord[1]}`;
}

function mazeIndex(row, column) {
  return row * state.maze.size + column;
}

function directionBetween(a, b) {
  const dr = b[0] - a[0];
  const dc = b[1] - a[1];
  return DIRECTIONS.find((direction) => direction.dr === dr && direction.dc === dc) || null;
}

function canMoveBetween(a, b) {
  if (!state?.maze) return false;
  const direction = directionBetween(a, b);
  if (!direction) return false;
  const mask = state.maze.openings[mazeIndex(a[0], a[1])];
  return Boolean(mask & direction.bit);
}

function createSvgElement(name, attributes = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

function drawRoute(svg, maze, path) {
  svg.innerHTML = "";
  svg.setAttribute("viewBox", `0 0 ${maze.size} ${maze.size}`);

  const defs = createSvgElement("defs");
  const gradient = createSvgElement("linearGradient", {
    id: svg === mazePathLayer ? "mazeRouteGradient" : "resultMazeRouteGradient",
    x1: "0%",
    y1: "0%",
    x2: "100%",
    y2: "100%"
  });
  gradient.append(
    createSvgElement("stop", { offset: "0%", "stop-color": "#53ff83" }),
    createSvgElement("stop", { offset: "100%", "stop-color": "#20d7ff" })
  );
  defs.appendChild(gradient);
  svg.appendChild(defs);

  if (!Array.isArray(path) || path.length < 2) return;
  const points = path.map(([row, column]) => `${column + 0.5},${row + 0.5}`).join(" ");
  const width = Math.max(0.12, 3.1 / maze.size);
  svg.append(
    createSvgElement("polyline", {
      class: "maze-route-shadow",
      points,
      stroke: "rgba(72,255,128,.36)",
      "stroke-width": width * 2.25
    }),
    createSvgElement("polyline", {
      class: "maze-route",
      points,
      stroke: `url(#${svg === mazePathLayer ? "mazeRouteGradient" : "resultMazeRouteGradient"})`,
      "stroke-width": width
    })
  );
}

function buildMazeGrid(grid, maze) {
  grid.innerHTML = "";
  grid.style.gridTemplateColumns = `repeat(${maze.size}, 1fr)`;
  grid.style.gridTemplateRows = `repeat(${maze.size}, 1fr)`;
  const wallWidth = maze.size >= 25 ? "1px" : maze.size >= 17 ? "1.5px" : "2px";
  const wallColour = "rgba(196, 201, 230, .64)";

  for (let row = 0; row < maze.size; row += 1) {
    for (let column = 0; column < maze.size; column += 1) {
      const cell = document.createElement("div");
      cell.className = "maze-cell";
      cell.dataset.row = String(row);
      cell.dataset.column = String(column);
      const mask = maze.openings[row * maze.size + column];
      cell.style.borderStyle = "solid";
      cell.style.borderColor = wallColour;
      cell.style.borderWidth = "0";
      if (!(mask & NORTH)) cell.style.borderTopWidth = wallWidth;
      if (!(mask & WEST)) cell.style.borderLeftWidth = wallWidth;
      if (row === maze.size - 1 && !(mask & SOUTH)) cell.style.borderBottomWidth = wallWidth;
      if (column === maze.size - 1 && !(mask & EAST)) cell.style.borderRightWidth = wallWidth;
      if (sameCoord([row, column], maze.start)) cell.classList.add("start");
      if (sameCoord([row, column], maze.end)) cell.classList.add("exit");
      grid.appendChild(cell);
    }
  }
}

function schedulePathDisplay() {
  if (pathRenderFrame) return;
  pathRenderFrame = requestAnimationFrame(() => {
    pathRenderFrame = null;
    if (!state?.maze) return;
    drawRoute(mazePathLayer, state.maze, localPath);
    pathProgress.textContent = localPath.length <= 1
      ? "Start at the green entrance"
      : `${localPath.length} squares travelled`;
    undoBtn.disabled = localPath.length <= 1;
    resetPathBtn.disabled = localPath.length <= 1;
  });
}

function resetLocalMaze() {
  localPath = [state.maze.start];
  renderedMazeId = state.maze.id;
  submittedMazeId = null;
  schedulePathDisplay();
}

function appendCoord(coord) {
  if (!state?.maze || state.phase !== "play" || submittedMazeId === state.maze.id) return false;
  if (!localPath.length) localPath = [state.maze.start];
  const current = localPath[localPath.length - 1];
  if (sameCoord(current, coord)) return false;

  if (localPath.length > 1 && sameCoord(localPath[localPath.length - 2], coord)) {
    localPath.pop();
    schedulePathDisplay();
    return true;
  }

  const existingIndex = localPath.findIndex((cell) => sameCoord(cell, coord));
  if (existingIndex >= 0) {
    localPath = localPath.slice(0, existingIndex + 1);
    schedulePathDisplay();
    return true;
  }

  if (!canMoveBetween(current, coord)) return false;
  localPath.push(coord);
  schedulePathDisplay();

  if (sameCoord(coord, state.maze.end) && submittedMazeId !== state.maze.id) {
    submittedMazeId = state.maze.id;
    stageMessage.textContent = "Exit reached! Checking your route...";
    socket.emit("finishMaze", { path: localPath });
  }
  return true;
}

function coordFromPoint(clientX, clientY) {
  if (!state?.maze) return null;
  const rect = mazeBoard.getBoundingClientRect();
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
  const column = Math.min(state.maze.size - 1, Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * state.maze.size)));
  const row = Math.min(state.maze.size - 1, Math.max(0, Math.floor(((clientY - rect.top) / rect.height) * state.maze.size)));
  return [row, column];
}

function appendSampledPoint(clientX, clientY) {
  if (!lastPointerPoint) {
    lastPointerPoint = { x: clientX, y: clientY };
    const coord = coordFromPoint(clientX, clientY);
    if (coord) appendCoord(coord);
    return;
  }

  const dx = clientX - lastPointerPoint.x;
  const dy = clientY - lastPointerPoint.y;
  const distance = Math.hypot(dx, dy);
  const rect = mazeBoard.getBoundingClientRect();
  const cellSize = Math.min(rect.width, rect.height) / state.maze.size;
  const steps = Math.max(1, Math.ceil(distance / Math.max(2, cellSize * 0.22)));

  for (let step = 1; step <= steps; step += 1) {
    const ratio = step / steps;
    const coord = coordFromPoint(lastPointerPoint.x + dx * ratio, lastPointerPoint.y + dy * ratio);
    if (!coord) continue;
    const current = localPath[localPath.length - 1];
    if (sameCoord(current, coord)) continue;

    if (appendCoord(coord)) {
      pointerMoved = true;
      continue;
    }

    if (current && Math.abs(current[0] - coord[0]) === 1 && Math.abs(current[1] - coord[1]) === 1) {
      const originalPath = localPath.map((cell) => [...cell]);
      const horizontal = [current[0], coord[1]];
      const vertical = [coord[0], current[1]];
      if (appendCoord(horizontal) && appendCoord(coord)) {
        pointerMoved = true;
      } else {
        localPath = originalPath.map((cell) => [...cell]);
        if (appendCoord(vertical) && appendCoord(coord)) pointerMoved = true;
        else localPath = originalPath;
        schedulePathDisplay();
      }
    }
  }

  lastPointerPoint = { x: clientX, y: clientY };
}

mazeGrid.addEventListener("pointerdown", (event) => {
  if (!state?.maze || state.phase !== "play" || submittedMazeId === state.maze.id) return;
  const cell = event.target.closest(".maze-cell");
  if (!cell) return;
  const coord = [Number(cell.dataset.row), Number(cell.dataset.column)];
  const onCurrentPath = localPath.some((pathCell) => sameCoord(pathCell, coord));
  if (!onCurrentPath && !sameCoord(coord, state.maze.start)) return;
  event.preventDefault();
  pointerDrawing = true;
  pointerMoved = false;
  pointerId = event.pointerId;
  lastPointerPoint = { x: event.clientX, y: event.clientY };
  mazeGrid.setPointerCapture?.(event.pointerId);
  const index = localPath.findIndex((pathCell) => sameCoord(pathCell, coord));
  if (index >= 0) localPath = localPath.slice(0, index + 1);
  else localPath = [state.maze.start];
  schedulePathDisplay();
});

mazeGrid.addEventListener("pointermove", (event) => {
  if (!pointerDrawing || event.pointerId !== pointerId) return;
  event.preventDefault();
  const events = typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents() : [event];
  for (const point of events) appendSampledPoint(point.clientX, point.clientY);
});

function stopPointer(event) {
  if (!pointerDrawing || (event.pointerId !== undefined && event.pointerId !== pointerId)) return;
  pointerDrawing = false;
  pointerId = null;
  lastPointerPoint = null;
}

mazeGrid.addEventListener("pointerup", stopPointer);
mazeGrid.addEventListener("pointercancel", stopPointer);
document.addEventListener("pointerup", stopPointer);

mazeGrid.addEventListener("click", (event) => {
  if (pointerMoved) {
    pointerMoved = false;
    return;
  }
  if (!state?.maze || state.phase !== "play") return;
  const cell = event.target.closest(".maze-cell");
  if (!cell) return;
  const coord = [Number(cell.dataset.row), Number(cell.dataset.column)];
  const current = localPath[localPath.length - 1];
  const existingIndex = localPath.findIndex((pathCell) => sameCoord(pathCell, coord));
  if (existingIndex >= 0) {
    localPath = localPath.slice(0, existingIndex + 1);
    schedulePathDisplay();
  } else if (current) {
    appendCoord(coord);
  }
});

mazeBoard.addEventListener("keydown", (event) => {
  if (!state?.maze || state.phase !== "play" || submittedMazeId === state.maze.id) return;
  const current = localPath[localPath.length - 1];
  const offsets = {
    ArrowUp: [-1, 0],
    ArrowRight: [0, 1],
    ArrowDown: [1, 0],
    ArrowLeft: [0, -1]
  };
  const offset = offsets[event.key];
  if (!offset) return;
  event.preventDefault();
  appendCoord([current[0] + offset[0], current[1] + offset[1]]);
});

undoBtn.addEventListener("click", () => {
  if (localPath.length <= 1) return;
  localPath.pop();
  submittedMazeId = null;
  schedulePathDisplay();
});

resetPathBtn.addEventListener("click", () => {
  if (!state?.maze || state.phase !== "play") return;
  localPath = [state.maze.start];
  submittedMazeId = null;
  schedulePathDisplay();
});

function renderPlayers() {
  playerList.innerHTML = "";
  state.players.forEach((player) => {
    const chip = document.createElement("div");
    chip.className = "player-chip";
    chip.innerHTML = `<span class="player-dot"></span><span>${escapeHtml(player.name)}${player.id === state.me.id ? " (you)" : ""}</span>`;
    playerList.appendChild(chip);
  });
  if (state.players.length < 2) {
    const waiting = document.createElement("div");
    waiting.className = "player-chip";
    waiting.innerHTML = '<span class="player-dot" style="background:#c8cad3"></span><span>Waiting...</span>';
    playerList.appendChild(waiting);
  }
}

function sendOptions() {
  if (syncingOptions || !state?.isHost) return;
  socket.emit("updateMazeOptions", {
    gridSize: Number(gridSizeSelect.value),
    timeSeconds: Number(timeSelect.value),
    rounds: Number(roundsSelect.value)
  });
}

[gridSizeSelect, timeSelect, roundsSelect].forEach((select) => select.addEventListener("change", sendOptions));

roomInput.addEventListener("input", () => {
  roomInput.value = roomInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
});
createRoomBtn.addEventListener("click", () => socket.emit("createMazeRoom", { name: playerName.value }));
joinRoomBtn.addEventListener("click", () => {
  const code = roomInput.value.trim().toUpperCase();
  if (!code) return showError(welcomeError, "Enter a room code.");
  socket.emit("joinMazeRoom", { code, name: playerName.value });
});
copyRoomCodeBtn.addEventListener("click", async () => {
  if (!state?.roomCode) return;
  try {
    await navigator.clipboard.writeText(state.roomCode);
    copyRoomCodeBtn.textContent = "Copied";
    setTimeout(() => { copyRoomCodeBtn.textContent = "Copy"; }, 900);
  } catch {
    showError(lobbyError, "Could not copy automatically. Select the code manually.");
  }
});
startBtn.addEventListener("click", () => {
  if (!state?.isHost) return;
  sendOptions();
  socket.emit("startMazeGame");
});
restartBtn.addEventListener("click", () => socket.emit("restartMazeLobby"));

function hideViews() {
  countdownView.classList.add("hidden");
  mazeView.classList.add("hidden");
  resultView.classList.add("hidden");
  finalView.classList.add("hidden");
}

function renderLobby() {
  welcome.classList.add("hidden");
  playArea.classList.add("hidden");
  lobby.classList.remove("hidden");
  roomCode.textContent = state.roomCode;
  hostBadge.textContent = state.isHost ? "You are host" : `${state.hostName} is host`;
  renderPlayers();

  syncingOptions = true;
  gridSizeSelect.value = String(state.options.gridSize);
  timeSelect.value = String(state.options.timeSeconds);
  roundsSelect.value = String(state.options.rounds);
  syncingOptions = false;

  [gridSizeSelect, timeSelect, roundsSelect].forEach((select) => { select.disabled = !state.isHost; });
  startBtn.disabled = !state.isHost || state.players.length !== 2 || state.phase !== "settings";
  startBtn.textContent = state.isHost
    ? (state.players.length === 2 ? "Start game" : "Waiting for player 2")
    : "Waiting for host";
  hostHint.textContent = state.isHost
    ? "Your settings update for both players."
    : "Only the host can change settings and start the game.";
  lobbyMessage.textContent = state.message;
}

function formatTime(milliseconds) {
  return milliseconds == null ? "—" : `${(milliseconds / 1000).toFixed(2)}s`;
}

function renderScoreStrip() {
  scoreStrip.innerHTML = "";
  state.players.forEach((player) => {
    const pill = document.createElement("div");
    pill.className = "score-pill";
    pill.innerHTML = `<span>${escapeHtml(player.name)} <small>${player.completedRounds} escaped</small></span><span>${player.roundWins} win${player.roundWins === 1 ? "" : "s"}</span>`;
    scoreStrip.appendChild(pill);
  });
}

function renderResultMaze() {
  if (!state.maze) return;
  buildMazeGrid(resultMazeGrid, state.maze);
  drawRoute(resultPathLayer, state.maze, state.lastRound?.path || state.maze.solutionPath || []);
}

function renderPlay() {
  welcome.classList.add("hidden");
  lobby.classList.add("hidden");
  playArea.classList.remove("hidden");
  gameRoomCode.textContent = state.roomCode;
  roundLabel.textContent = `${state.round} / ${state.totalRounds}`;
  hideViews();

  if (state.phase === "countdown") {
    stageKicker.textContent = "Prepare";
    stageTitle.textContent = "New maze incoming";
    stageMessage.textContent = state.message;
    countdownView.classList.remove("hidden");
  } else if (state.phase === "play") {
    stageKicker.textContent = "Race your opponent";
    stageTitle.textContent = "Find the red exit";
    stageMessage.textContent = state.message;
    if (renderedMazeId !== state.maze.id) {
      buildMazeGrid(mazeGrid, state.maze);
      resetLocalMaze();
    }
    schedulePathDisplay();
    mazeView.classList.remove("hidden");
  } else if (state.phase === "result") {
    stageKicker.textContent = `Round ${state.round} result`;
    stageTitle.textContent = state.message;
    stageMessage.textContent = state.lastRound?.timedOut
      ? "The generated route is shown below."
      : "The first server-validated escape wins the round.";
    resultTitle.textContent = state.lastRound?.timedOut ? "No winner this round" : `${state.lastRound.winnerName} escaped first`;
    resultTime.textContent = state.lastRound?.timedOut ? "Time expired" : formatTime(state.lastRound.finishMs);
    renderResultMaze();
    resultView.classList.remove("hidden");
  } else if (state.phase === "final") {
    stageKicker.textContent = "Finished";
    stageTitle.textContent = "Match result";
    stageMessage.textContent = "";
    finalMessage.textContent = state.message;
    finalRankings.innerHTML = state.rankings.map((entry, index) => `
      <div class="rank-row">
        <span class="rank-number">${index + 1}</span>
        <strong>${escapeHtml(entry.name)}</strong>
        <span class="rank-wins">${entry.roundWins} win${entry.roundWins === 1 ? "" : "s"}</span>
        <span class="rank-time">${entry.averageMs == null ? "No escapes" : `Avg. ${formatTime(entry.averageMs)}`}</span>
      </div>
    `).join("");
    finalView.classList.remove("hidden");
  }

  renderScoreStrip();
  updateCountdown();
}

function updateCountdown() {
  if (countdownFrame) cancelAnimationFrame(countdownFrame);
  const tick = () => {
    if (!state?.phaseEndsAt || !["countdown", "play", "result"].includes(state.phase)) {
      timer.textContent = "—";
      return;
    }
    const remaining = Math.max(0, state.phaseEndsAt - (Date.now() + serverClockOffset));
    if (state.phase === "countdown") {
      const seconds = Math.max(1, Math.ceil(remaining / 1000));
      countdownNumber.textContent = String(seconds);
      timer.textContent = String(seconds);
    } else if (state.phase === "play") {
      timer.textContent = `${Math.ceil(remaining / 1000)}s`;
    } else {
      timer.textContent = "Result";
    }
    if (remaining > 0) countdownFrame = requestAnimationFrame(tick);
  };
  tick();
}

socket.on("mazeState", (nextState) => {
  state = nextState;
  serverClockOffset = state.serverNow - Date.now();
  welcomeError.textContent = "";
  lobbyError.textContent = "";
  playError.textContent = "";
  if (["waiting", "settings"].includes(state.phase)) renderLobby();
  else renderPlay();
});

socket.on("mazeError", (message) => {
  const target = playArea.classList.contains("hidden")
    ? (lobby.classList.contains("hidden") ? welcomeError : lobbyError)
    : playError;
  showError(target, message);
  if (state?.phase === "play" && message) submittedMazeId = null;
});
