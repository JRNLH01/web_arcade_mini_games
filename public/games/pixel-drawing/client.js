const socket = createArcadeSocket("/pixel-drawing");

const welcome = document.getElementById("welcome");
const playerName = document.getElementById("playerName");
const createRoomBtn = document.getElementById("createRoomBtn");
const roomInput = document.getElementById("roomInput");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const welcomeError = document.getElementById("welcomeError");

const lobby = document.getElementById("lobby");
const roomCode = document.getElementById("roomCode");
const copyRoomCodeBtn = document.getElementById("copyRoomCodeBtn");
const hostBadge = document.getElementById("hostBadge");
const playerList = document.getElementById("playerList");
const gridSizeSelect = document.getElementById("gridSize");
const flashSecondsSelect = document.getElementById("flashSeconds");
const drawSecondsSelect = document.getElementById("drawSeconds");
const roundsSelect = document.getElementById("rounds");
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
const flashView = document.getElementById("flashView");
const targetGrid = document.getElementById("targetGrid");
const drawView = document.getElementById("drawView");
const drawingGrid = document.getElementById("drawingGrid");
const palette = document.getElementById("palette");
const selectedColourName = document.getElementById("selectedColourName");
const clearBtn = document.getElementById("clearBtn");
const submitBtn = document.getElementById("submitBtn");
const submitHint = document.getElementById("submitHint");
const waitingView = document.getElementById("waitingView");
const resultView = document.getElementById("resultView");
const resultTarget = document.getElementById("resultTarget");
const resultCards = document.getElementById("resultCards");
const finalView = document.getElementById("finalView");
const finalTitle = document.getElementById("finalTitle");
const finalMessage = document.getElementById("finalMessage");
const finalRankings = document.getElementById("finalRankings");
const restartBtn = document.getElementById("restartBtn");
const scoreStrip = document.getElementById("scoreStrip");

let state = null;
let selectedColour = "black";
let drawing = [];
let isPainting = false;
let activePointerId = null;
let draftSyncTimer = null;
let syncingOptions = false;
let serverClockOffset = 0;
let countdownFrame = null;

function showError(element, message) {
  element.textContent = message;
  setTimeout(() => {
    if (element.textContent === message) element.textContent = "";
  }, 3000);
}

function titleCase(value) {
  return String(value || "").replace(/^./, (letter) => letter.toUpperCase());
}

function formatScore(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function blankGrid(size) {
  return Array(size * size).fill("white");
}

function hideViews() {
  flashView.classList.add("hidden");
  drawView.classList.add("hidden");
  waitingView.classList.add("hidden");
  resultView.classList.add("hidden");
  finalView.classList.add("hidden");
}

function renderGrid(element, cells, size, options = {}) {
  element.innerHTML = "";
  element.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
  const paletteMap = state?.palette || {};
  cells.forEach((colour, index) => {
    const cell = document.createElement(options.interactive ? "button" : "div");
    cell.className = "pixel-cell";
    cell.style.background = paletteMap[colour] || "#ffffff";
    if (options.interactive) {
      cell.type = "button";
      cell.dataset.index = String(index);
      cell.setAttribute("aria-label", `Square ${index + 1}: ${colour}`);
      cell.addEventListener("click", (event) => {
        // Pointer dragging paints on pointerdown/pointermove. This click path keeps
        // the cells usable with a keyboard and on browsers without Pointer Events.
        if (event.detail === 0) paintCell(index);
      });
    }
    element.appendChild(cell);
  });
}

function cellFromPointer(event) {
  const element = document.elementFromPoint(event.clientX, event.clientY);
  const cell = element?.closest?.(".pixel-cell");
  if (!cell || cell.parentElement !== drawingGrid) return null;
  return cell;
}

function paintFromPointer(event) {
  const cell = cellFromPointer(event);
  if (!cell) return;
  const index = Number(cell.dataset.index);
  if (Number.isInteger(index)) paintCell(index);
}

function stopPainting(event) {
  if (activePointerId !== null && event?.pointerId !== undefined && event.pointerId !== activePointerId) return;
  isPainting = false;
  activePointerId = null;
}

drawingGrid.addEventListener("pointerdown", (event) => {
  if (!state || state.phase !== "draw" || state.me.submitted) return;
  if (!cellFromPointer(event)) return;
  event.preventDefault();
  isPainting = true;
  activePointerId = event.pointerId;
  drawingGrid.setPointerCapture?.(event.pointerId);
  paintFromPointer(event);
});

drawingGrid.addEventListener("pointermove", (event) => {
  if (!isPainting || event.pointerId !== activePointerId) return;
  event.preventDefault();
  paintFromPointer(event);
});

drawingGrid.addEventListener("pointerup", stopPainting);
drawingGrid.addEventListener("pointercancel", stopPainting);
drawingGrid.addEventListener("lostpointercapture", stopPainting);
document.addEventListener("pointerup", stopPainting);
document.addEventListener("pointercancel", stopPainting);

function paintCell(index) {
  if (!state || state.phase !== "draw" || state.me.submitted) return;
  if (drawing[index] === selectedColour) return;
  drawing[index] = selectedColour;
  const cell = drawingGrid.children[index];
  if (cell) {
    cell.style.background = state.palette[selectedColour];
    cell.setAttribute("aria-label", `Square ${index + 1}: ${selectedColour}`);
  }
  sendDraft();
}

function sendDraft(immediate = false) {
  const emitDraft = () => {
    draftSyncTimer = null;
    socket.emit("updatePixelDraft", { cells: drawing });
  };

  if (immediate) {
    if (draftSyncTimer) clearTimeout(draftSyncTimer);
    emitDraft();
    return;
  }

  if (!draftSyncTimer) draftSyncTimer = setTimeout(emitDraft, 55);
}

function renderPalette() {
  palette.innerHTML = "";
  Object.entries(state.palette).forEach(([name, hex]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `colour-button${name === selectedColour ? " active" : ""}`;
    button.dataset.colour = name;
    button.style.background = hex;
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", String(name === selectedColour));
    button.setAttribute("aria-label", titleCase(name));
    button.title = titleCase(name);
    button.addEventListener("click", () => {
      selectedColour = name;
      selectedColourName.textContent = titleCase(name);
      renderPalette();
    });
    palette.appendChild(button);
  });
}

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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function sendOptions() {
  if (syncingOptions || !state?.isHost) return;
  socket.emit("updatePixelOptions", {
    gridSize: Number(gridSizeSelect.value),
    flashSeconds: Number(flashSecondsSelect.value),
    drawSeconds: Number(drawSecondsSelect.value),
    rounds: Number(roundsSelect.value)
  });
}

[gridSizeSelect, flashSecondsSelect, drawSecondsSelect, roundsSelect].forEach((select) => {
  select.addEventListener("change", sendOptions);
});

roomInput.addEventListener("input", () => {
  roomInput.value = roomInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
});

createRoomBtn.addEventListener("click", () => {
  socket.emit("createPixelRoom", { name: playerName.value });
});

joinRoomBtn.addEventListener("click", () => {
  const code = roomInput.value.trim().toUpperCase();
  if (!code) return showError(welcomeError, "Enter a room code.");
  socket.emit("joinPixelRoom", { code, name: playerName.value });
});

copyRoomCodeBtn.addEventListener("click", async () => {
  if (!state?.roomCode) return;
  try {
    await navigator.clipboard.writeText(state.roomCode);
    const original = copyRoomCodeBtn.textContent;
    copyRoomCodeBtn.textContent = "Copied";
    setTimeout(() => { copyRoomCodeBtn.textContent = original; }, 900);
  } catch {
    showError(lobbyError, "Could not copy automatically. Select the code manually.");
  }
});

startBtn.addEventListener("click", () => {
  if (!state?.isHost) return;
  sendOptions();
  socket.emit("startPixelGame");
});

clearBtn.addEventListener("click", () => {
  if (!state || state.phase !== "draw" || state.me.submitted) return;
  drawing = blankGrid(state.options.gridSize);
  renderGrid(drawingGrid, drawing, state.options.gridSize, { interactive: true });
  sendDraft();
});

submitBtn.addEventListener("click", () => {
  if (!state || state.phase !== "draw" || state.me.submitted) return;
  sendDraft(true);
  socket.emit("submitPixelGuess", { cells: drawing });
  submitBtn.disabled = true;
});

restartBtn.addEventListener("click", () => {
  socket.emit("restartPixelLobby");
});

function renderLobby() {
  welcome.classList.add("hidden");
  playArea.classList.add("hidden");
  lobby.classList.remove("hidden");
  roomCode.textContent = state.roomCode;
  hostBadge.textContent = state.isHost ? "You are host" : `${state.hostName} is host`;
  renderPlayers();

  syncingOptions = true;
  gridSizeSelect.value = String(state.options.gridSize);
  flashSecondsSelect.value = String(state.options.flashSeconds);
  drawSecondsSelect.value = String(state.options.drawSeconds);
  roundsSelect.value = String(state.options.rounds);
  syncingOptions = false;

  [gridSizeSelect, flashSecondsSelect, drawSecondsSelect, roundsSelect].forEach((select) => {
    select.disabled = !state.isHost;
  });
  startBtn.classList.remove("hidden");
  startBtn.disabled = !state.isHost || state.players.length !== 2 || state.phase !== "settings";
  startBtn.textContent = state.isHost
    ? (state.players.length === 2 ? "Start game" : "Waiting for player 2")
    : "Waiting for host";
  lobbyMessage.textContent = state.message;
}

function renderScoreStrip() {
  scoreStrip.innerHTML = "";
  state.players.forEach((player) => {
    const pill = document.createElement("div");
    pill.className = "score-pill";
    pill.innerHTML = `<span>${escapeHtml(player.name)} <small>${player.roundWins} round win${player.roundWins === 1 ? "" : "s"}</small></span><span>${formatScore(player.average)}</span>`;
    scoreStrip.appendChild(pill);
  });
}

function createResultCard(playerResult, winnerIds, size) {
  const card = document.createElement("article");
  const isWinner = winnerIds.includes(playerResult.id);
  card.className = `result-card${isWinner ? " winner" : ""}`;

  const heading = document.createElement("div");
  heading.className = "result-card-heading";
  heading.innerHTML = `<div><h3>${isWinner ? "★ " : ""}${escapeHtml(playerResult.name)}</h3><p class="accuracy">${formatScore(playerResult.score.accuracy)}</p></div>`;

  const grid = document.createElement("div");
  grid.className = "pixel-grid mini-grid";
  renderGrid(grid, playerResult.guess, size);

  const breakdown = document.createElement("div");
  breakdown.className = "breakdown";
  breakdown.innerHTML = `
    <span>Squares<br>${formatScore(playerResult.score.squares)}</span>
    <span>Shape<br>${formatScore(playerResult.score.shape)}</span>
    <span>Colour<br>${formatScore(playerResult.score.colour)}</span>
  `;

  const count = document.createElement("p");
  count.className = "correct-count";
  count.textContent = `${playerResult.score.correctSquares} of ${playerResult.score.totalSquares} squares exactly matched.`;

  card.append(heading, grid, breakdown, count);
  return card;
}

function renderPlay() {
  welcome.classList.add("hidden");
  lobby.classList.add("hidden");
  playArea.classList.remove("hidden");
  gameRoomCode.textContent = state.roomCode;
  roundLabel.textContent = `${state.round} / ${state.totalRounds}`;
  hideViews();

  if (state.phase === "flash") {
    stageKicker.textContent = "Memorise";
    stageTitle.textContent = "Remember this pixel image";
    stageMessage.textContent = state.message;
    renderGrid(targetGrid, state.target.cells, state.options.gridSize);
    flashView.classList.remove("hidden");
  } else if (state.phase === "draw") {
    stageKicker.textContent = state.me.submitted ? "Submitted" : "Recreate";
    stageTitle.textContent = state.me.submitted ? "Drawing locked in" : "Draw it from memory";
    stageMessage.textContent = state.message;

    if (!state.me.submitted) {
      if (drawing.length !== state.options.gridSize * state.options.gridSize) {
        drawing = blankGrid(state.options.gridSize);
      }
      renderGrid(drawingGrid, drawing, state.options.gridSize, { interactive: true });
      renderPalette();
      submitBtn.disabled = false;
      submitHint.textContent = "Your current drawing is submitted automatically when time runs out.";
      drawView.classList.remove("hidden");
    } else {
      waitingView.classList.remove("hidden");
    }
  } else if (state.phase === "result") {
    stageKicker.textContent = `Round ${state.round} result`;
    stageTitle.textContent = state.message;
    stageMessage.textContent = "Compare the original with both recreations.";
    renderGrid(resultTarget, state.lastRound.target.cells, state.options.gridSize);
    resultCards.innerHTML = "";
    state.lastRound.players.forEach((playerResult) => {
      resultCards.appendChild(createResultCard(playerResult, state.lastRound.winnerIds, state.options.gridSize));
    });
    resultView.classList.remove("hidden");
  } else if (state.phase === "final") {
    stageKicker.textContent = "Finished";
    stageTitle.textContent = "";
    stageMessage.textContent = "";
    finalTitle.textContent = "Pixel Drawing complete";
    finalMessage.textContent = state.message;
    finalRankings.innerHTML = state.rankings.map((entry, index) => `
      <div class="rank-row">
        <span class="rank-number">${index + 1}</span>
        <strong>${escapeHtml(entry.name)}</strong>
        <span class="rank-score">${formatScore(entry.average)}</span>
        <span class="rank-wins">${entry.roundWins} round win${entry.roundWins === 1 ? "" : "s"}</span>
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
    if (!state?.phaseEndsAt || !["flash", "draw", "result"].includes(state.phase)) {
      timer.textContent = "--";
      return;
    }
    const now = Date.now() + serverClockOffset;
    const remainingMs = Math.max(0, state.phaseEndsAt - now);
    timer.textContent = state.phase === "result"
      ? `${Math.ceil(remainingMs / 1000)}s`
      : `${Math.max(0, Math.ceil(remainingMs / 1000))}s`;
    if (remainingMs > 0) countdownFrame = requestAnimationFrame(tick);
  };
  tick();
}

socket.on("pixelState", (nextState) => {
  const previousPhase = state?.phase;
  const previousRound = state?.round;
  state = nextState;
  serverClockOffset = nextState.serverNow - Date.now();

  if (nextState.phase === "draw" && (previousPhase !== "draw" || previousRound !== nextState.round)) {
    drawing = blankGrid(nextState.options.gridSize);
    selectedColour = "black";
  }

  if (["waiting", "settings"].includes(nextState.phase)) renderLobby();
  else renderPlay();
});

socket.on("pixelError", (message) => {
  if (welcome.classList.contains("hidden")) showError(lobbyError, message);
  else showError(welcomeError, message);
});
