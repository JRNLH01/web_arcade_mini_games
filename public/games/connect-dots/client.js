const socket = createArcadeSocket("/connect-dots");

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
const pairCountSelect = document.getElementById("pairCountSelect");
const timeSelect = document.getElementById("timeSelect");
const roundsSelect = document.getElementById("roundsSelect");
const lobbyMessage = document.getElementById("lobbyMessage");
const startBtn = document.getElementById("startBtn");
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
const puzzleView = document.getElementById("puzzleView");
const connectionProgress = document.getElementById("connectionProgress");
const activeColourLabel = document.getElementById("activeColourLabel");
const dotsBoard = document.getElementById("dotsBoard");
const dotsGrid = document.getElementById("dotsGrid");
const pathLayer = document.getElementById("pathLayer");
const undoBtn = document.getElementById("undoBtn");
const clearBtn = document.getElementById("clearBtn");
const resultView = document.getElementById("resultView");
const resultTitle = document.getElementById("resultTitle");
const resultTime = document.getElementById("resultTime");
const resultGrid = document.getElementById("resultGrid");
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
let localPaths = {};
let activeColour = null;
let pointerDrawing = false;
let pointerMoved = false;
let pointerId = null;
let lastPointerPoint = null;
let puzzleRenderFrame = null;
let submittedPuzzleId = null;
let renderedPuzzleId = null;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function titleCase(value) {
  return String(value).charAt(0).toUpperCase() + String(value).slice(1);
}

function showError(element, message) {
  element.textContent = message || "";
  if (message) setTimeout(() => {
    if (element.textContent === message) element.textContent = "";
  }, 3500);
}

function coordKey(coord) {
  return `${coord[0]},${coord[1]}`;
}

function sameCoord(a, b) {
  return a && b && a[0] === b[0] && a[1] === b[1];
}

function areAdjacent(a, b) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;
}

function getPair(colour) {
  return state?.puzzle?.pairs.find((pair) => pair.colour === colour) || null;
}

function endpointColour(coord) {
  if (!state?.puzzle) return null;
  for (const pair of state.puzzle.pairs) {
    if (sameCoord(coord, pair.a) || sameCoord(coord, pair.b)) return pair.colour;
  }
  return null;
}

function pathOccupancy(ignoreColour = null) {
  const occupied = new Map();
  for (const [colour, path] of Object.entries(localPaths)) {
    if (colour === ignoreColour) continue;
    for (const coord of path) occupied.set(coordKey(coord), colour);
  }
  return occupied;
}

function pathIsComplete(colour, path = localPaths[colour]) {
  const pair = getPair(colour);
  if (!pair || !Array.isArray(path) || path.length < 2) return false;
  return (sameCoord(path[0], pair.a) && sameCoord(path[path.length - 1], pair.b))
    || (sameCoord(path[0], pair.b) && sameCoord(path[path.length - 1], pair.a));
}

function connectedCount() {
  return state?.puzzle?.pairs.filter((pair) => pathIsComplete(pair.colour)).length || 0;
}

function allConnected() {
  return Boolean(state?.puzzle?.pairs.length) && connectedCount() === state.puzzle.pairs.length;
}

function resetLocalPuzzle() {
  localPaths = {};
  for (const pair of state.puzzle.pairs) localPaths[pair.colour] = [];
  activeColour = null;
  submittedPuzzleId = null;
  renderedPuzzleId = state.puzzle.id;
}

function createSvgElement(name, attributes = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

function drawSvg(svg, puzzle, paths = {}) {
  const size = puzzle.size;
  svg.innerHTML = "";
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);

  for (const pair of puzzle.pairs) {
    const path = paths[pair.colour] || [];
    if (path.length > 1) {
      const polyline = createSvgElement("polyline", {
        class: "path-line",
        points: path.map(([row, column]) => `${column + 0.5},${row + 0.5}`).join(" "),
        stroke: pair.hex,
        "stroke-width": Math.max(0.22, 1.8 / size)
      });
      svg.appendChild(polyline);
    }
  }

  for (const pair of puzzle.pairs) {
    for (const [row, column] of [pair.a, pair.b]) {
      const circle = createSvgElement("circle", {
        class: "endpoint-dot",
        cx: column + 0.5,
        cy: row + 0.5,
        r: Math.max(0.25, 2.2 / size),
        fill: pair.hex
      });
      const core = createSvgElement("circle", {
        class: "endpoint-core",
        cx: column + 0.5,
        cy: row + 0.5,
        r: Math.max(0.07, 0.6 / size)
      });
      svg.append(circle, core);
    }
  }
}

function buildGrid(grid, puzzle, interactive = false) {
  grid.innerHTML = "";
  grid.style.gridTemplateColumns = `repeat(${puzzle.size}, 1fr)`;
  grid.style.gridTemplateRows = `repeat(${puzzle.size}, 1fr)`;

  for (let row = 0; row < puzzle.size; row += 1) {
    for (let column = 0; column < puzzle.size; column += 1) {
      const cell = document.createElement(interactive ? "button" : "div");
      if (interactive) cell.type = "button";
      cell.className = "grid-cell";
      if (column === puzzle.size - 1) cell.classList.add("last-column");
      if (row === puzzle.size - 1) cell.classList.add("last-row");
      cell.dataset.row = String(row);
      cell.dataset.column = String(column);
      const colour = endpointColour([row, column]);
      cell.setAttribute("aria-label", colour
        ? `${titleCase(colour)} dot at row ${row + 1}, column ${column + 1}`
        : `Empty square at row ${row + 1}, column ${column + 1}`);
      grid.appendChild(cell);
    }
  }
}

function updatePuzzleDisplay() {
  if (!state?.puzzle || puzzleRenderFrame) return;
  puzzleRenderFrame = requestAnimationFrame(() => {
    puzzleRenderFrame = null;
    if (!state?.puzzle) return;
    drawSvg(pathLayer, state.puzzle, localPaths);
    const count = connectedCount();
    connectionProgress.textContent = `${count} of ${state.puzzle.pairs.length} connected`;
    activeColourLabel.textContent = activeColour
      ? `${titleCase(activeColour)} line${pathIsComplete(activeColour) ? " connected" : " selected"}`
      : "Choose a coloured dot";
    undoBtn.disabled = !activeColour || !localPaths[activeColour]?.length;

    if (allConnected() && submittedPuzzleId !== state.puzzle.id) {
      submittedPuzzleId = state.puzzle.id;
      stageMessage.textContent = "Complete! Checking your solution...";
      socket.emit("finishDotsPuzzle", { paths: localPaths });
    }
  });
}

function startPathAt(coord) {
  const endpoint = endpointColour(coord);
  let colour = endpoint;

  if (!colour) {
    for (const [candidateColour, path] of Object.entries(localPaths)) {
      if (path.some((cell) => sameCoord(cell, coord))) {
        colour = candidateColour;
        break;
      }
    }
  }
  if (!colour) return false;

  activeColour = colour;
  const existingPath = localPaths[colour] || [];
  const existingIndex = existingPath.findIndex((cell) => sameCoord(cell, coord));
  if (existingIndex >= 0) localPaths[colour] = existingPath.slice(0, existingIndex + 1);
  else localPaths[colour] = [coord];
  updatePuzzleDisplay();
  return true;
}

function extendPathTo(coord) {
  if (!activeColour) return false;
  const path = localPaths[activeColour] || [];
  if (!path.length) return startPathAt(coord);
  const current = path[path.length - 1];
  if (sameCoord(current, coord)) return false;
  if (!areAdjacent(current, coord)) return false;

  if (path.length > 1 && sameCoord(path[path.length - 2], coord)) {
    path.pop();
    updatePuzzleDisplay();
    return true;
  }

  const samePathIndex = path.findIndex((cell) => sameCoord(cell, coord));
  if (samePathIndex >= 0) {
    localPaths[activeColour] = path.slice(0, samePathIndex + 1);
    updatePuzzleDisplay();
    return true;
  }

  const occupied = pathOccupancy(activeColour);
  if (occupied.has(coordKey(coord))) return false;

  const endpoint = endpointColour(coord);
  if (endpoint && endpoint !== activeColour) return false;

  const pair = getPair(activeColour);
  if (!pair) return false;
  const isStartingEndpoint = sameCoord(coord, path[0]);
  if (endpoint === activeColour && isStartingEndpoint) return false;
  if (pathIsComplete(activeColour)) return false;

  path.push(coord);
  updatePuzzleDisplay();
  return true;
}

function coordFromPoint(clientX, clientY) {
  if (!state?.puzzle) return null;
  const rect = dotsBoard.getBoundingClientRect();
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
  const column = Math.min(state.puzzle.size - 1, Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * state.puzzle.size)));
  const row = Math.min(state.puzzle.size - 1, Math.max(0, Math.floor(((clientY - rect.top) / rect.height) * state.puzzle.size)));
  return [row, column];
}

function extendSmoothlyTo(coord) {
  if (!activeColour) return false;
  const path = localPaths[activeColour] || [];
  const current = path[path.length - 1];
  if (!current || sameCoord(current, coord)) return false;
  if (extendPathTo(coord)) return true;

  if (Math.abs(current[0] - coord[0]) === 1 && Math.abs(current[1] - coord[1]) === 1) {
    const originalPath = path.map((cell) => [...cell]);
    const horizontalFirst = [current[0], coord[1]];
    const verticalFirst = [coord[0], current[1]];
    if (extendPathTo(horizontalFirst) && extendPathTo(coord)) return true;
    localPaths[activeColour] = originalPath.map((cell) => [...cell]);
    if (extendPathTo(verticalFirst) && extendPathTo(coord)) return true;
    localPaths[activeColour] = originalPath;
    updatePuzzleDisplay();
  }
  return false;
}

function appendSampledPoint(clientX, clientY) {
  if (!lastPointerPoint) {
    lastPointerPoint = { x: clientX, y: clientY };
    return;
  }
  const dx = clientX - lastPointerPoint.x;
  const dy = clientY - lastPointerPoint.y;
  const distance = Math.hypot(dx, dy);
  const rect = dotsBoard.getBoundingClientRect();
  const cellSize = Math.min(rect.width, rect.height) / state.puzzle.size;
  const steps = Math.max(1, Math.ceil(distance / Math.max(2, cellSize * .2)));

  for (let step = 1; step <= steps; step += 1) {
    const ratio = step / steps;
    const coord = coordFromPoint(lastPointerPoint.x + dx * ratio, lastPointerPoint.y + dy * ratio);
    if (coord && extendSmoothlyTo(coord)) pointerMoved = true;
  }
  lastPointerPoint = { x: clientX, y: clientY };
}

dotsGrid.addEventListener("pointerdown", (event) => {
  if (!state || state.phase !== "play" || submittedPuzzleId === state.puzzle.id) return;
  const cell = event.target.closest(".grid-cell");
  if (!cell) return;
  event.preventDefault();
  pointerDrawing = true;
  pointerMoved = false;
  pointerId = event.pointerId;
  lastPointerPoint = { x: event.clientX, y: event.clientY };
  dotsGrid.setPointerCapture?.(event.pointerId);
  const coord = [Number(cell.dataset.row), Number(cell.dataset.column)];
  if (!startPathAt(coord) && activeColour) extendPathTo(coord);
});

dotsGrid.addEventListener("pointermove", (event) => {
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

dotsGrid.addEventListener("pointerup", stopPointer);
dotsGrid.addEventListener("pointercancel", stopPointer);
document.addEventListener("pointerup", stopPointer);

dotsGrid.addEventListener("click", (event) => {
  if (pointerMoved || !state || state.phase !== "play") {
    pointerMoved = false;
    return;
  }
  const cell = event.target.closest(".grid-cell");
  if (!cell) return;
  const coord = [Number(cell.dataset.row), Number(cell.dataset.column)];
  if (activeColour && extendPathTo(coord)) return;
  startPathAt(coord);
});

undoBtn.addEventListener("click", () => {
  if (!activeColour || !localPaths[activeColour]?.length) return;
  localPaths[activeColour].pop();
  if (!localPaths[activeColour].length) activeColour = null;
  submittedPuzzleId = null;
  updatePuzzleDisplay();
});

clearBtn.addEventListener("click", () => {
  if (!state?.puzzle || state.phase !== "play") return;
  for (const pair of state.puzzle.pairs) localPaths[pair.colour] = [];
  activeColour = null;
  submittedPuzzleId = null;
  updatePuzzleDisplay();
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
    waiting.innerHTML = `<span class="player-dot" style="background:#c8cad3"></span><span>Waiting...</span>`;
    playerList.appendChild(waiting);
  }
}

function sendOptions() {
  if (syncingOptions || !state?.isHost) return;
  socket.emit("updateDotsOptions", {
    gridSize: Number(gridSizeSelect.value),
    pairs: Number(pairCountSelect.value),
    timeSeconds: Number(timeSelect.value),
    rounds: Number(roundsSelect.value)
  });
}

[gridSizeSelect, pairCountSelect, timeSelect, roundsSelect].forEach((select) => {
  select.addEventListener("change", sendOptions);
});

roomInput.addEventListener("input", () => {
  roomInput.value = roomInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
});

createRoomBtn.addEventListener("click", () => socket.emit("createDotsRoom", { name: playerName.value }));
joinRoomBtn.addEventListener("click", () => {
  const code = roomInput.value.trim().toUpperCase();
  if (!code) return showError(welcomeError, "Enter a room code.");
  socket.emit("joinDotsRoom", { code, name: playerName.value });
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
  socket.emit("startDotsGame");
});
restartBtn.addEventListener("click", () => socket.emit("restartDotsLobby"));

function hideViews() {
  countdownView.classList.add("hidden");
  puzzleView.classList.add("hidden");
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
  pairCountSelect.value = String(state.options.pairs);
  timeSelect.value = String(state.options.timeSeconds);
  roundsSelect.value = String(state.options.rounds);
  syncingOptions = false;

  [gridSizeSelect, pairCountSelect, timeSelect, roundsSelect].forEach((select) => {
    select.disabled = !state.isHost;
  });
  startBtn.classList.remove("hidden");
  startBtn.disabled = !state.isHost || state.players.length !== 2 || state.phase !== "settings";
  startBtn.textContent = state.isHost
    ? (state.players.length === 2 ? "Start game" : "Waiting for player 2")
    : "Waiting for host";
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
    const status = state.phase === "play"
      ? "Solving…"
      : `${player.roundWins} win${player.roundWins === 1 ? "" : "s"}`;
    pill.innerHTML = `<span>${escapeHtml(player.name)} <small>${player.completedRounds} completed</small></span><span class="${state.phase === "play" ? "status-solving" : ""}">${status}</span>`;
    scoreStrip.appendChild(pill);
  });
}

function renderResultBoard() {
  if (!state.puzzle) return;
  buildGrid(resultGrid, state.puzzle, false);
  const paths = state.lastRound?.paths || Object.fromEntries(
    (state.puzzle.solutionPaths || []).map((entry) => [entry.colour, entry.path])
  );
  drawSvg(resultPathLayer, state.puzzle, paths);
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
    stageTitle.textContent = "New puzzle incoming";
    stageMessage.textContent = state.message;
    countdownView.classList.remove("hidden");
  } else if (state.phase === "play") {
    stageKicker.textContent = "Race your opponent";
    stageTitle.textContent = "Connect every matching pair";
    stageMessage.textContent = state.message;
    if (renderedPuzzleId !== state.puzzle.id) {
      resetLocalPuzzle();
      buildGrid(dotsGrid, state.puzzle, true);
    }
    updatePuzzleDisplay();
    puzzleView.classList.remove("hidden");
  } else if (state.phase === "result") {
    stageKicker.textContent = `Round ${state.round} result`;
    stageTitle.textContent = state.message;
    stageMessage.textContent = state.lastRound?.timedOut
      ? "The generated solution is shown below."
      : "The first valid completed board wins the round.";
    resultTitle.textContent = state.lastRound?.timedOut ? "No winner this round" : `${state.lastRound.winnerName} wins`;
    resultTime.textContent = state.lastRound?.timedOut ? "Time expired" : formatTime(state.lastRound.finishMs);
    renderResultBoard();
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
        <span class="rank-time">${entry.averageMs == null ? "No completions" : `Avg. ${formatTime(entry.averageMs)}`}</span>
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

socket.on("dotsState", (nextState) => {
  state = nextState;
  serverClockOffset = state.serverNow - Date.now();
  welcomeError.textContent = "";
  lobbyError.textContent = "";
  playError.textContent = "";
  if (["waiting", "settings"].includes(state.phase)) renderLobby();
  else renderPlay();
});

socket.on("dotsError", (message) => {
  const target = playArea.classList.contains("hidden")
    ? (lobby.classList.contains("hidden") ? welcomeError : lobbyError)
    : playError;
  showError(target, message);
  if (state?.phase === "play" && message) submittedPuzzleId = null;
});
