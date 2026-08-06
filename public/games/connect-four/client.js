const socket = createArcadeSocket("/connect-four");

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
const boardSelect = document.getElementById("boardSelect");
const roundsSelect = document.getElementById("roundsSelect");
const lobbyMessage = document.getElementById("lobbyMessage");
const startBtn = document.getElementById("startBtn");
const hostHint = document.getElementById("hostHint");
const lobbyError = document.getElementById("lobbyError");

const myColourInput = document.getElementById("myColourInput");
const opponentColourInput = document.getElementById("opponentColourInput");
const myColourValue = document.getElementById("myColourValue");
const opponentColourValue = document.getElementById("opponentColourValue");
const gameMyColourInput = document.getElementById("gameMyColourInput");
const gameOpponentColourInput = document.getElementById("gameOpponentColourInput");

const playArea = document.getElementById("playArea");
const gameRoomCode = document.getElementById("gameRoomCode");
const roundLabel = document.getElementById("roundLabel");
const turnLabel = document.getElementById("turnLabel");
const stageKicker = document.getElementById("stageKicker");
const stageTitle = document.getElementById("stageTitle");
const stageMessage = document.getElementById("stageMessage");
const countdownView = document.getElementById("countdownView");
const countdownNumber = document.getElementById("countdownNumber");
const boardView = document.getElementById("boardView");
const columnPreview = document.getElementById("columnPreview");
const fourBoard = document.getElementById("fourBoard");
const resultView = document.getElementById("resultView");
const resultIcon = document.getElementById("resultIcon");
const resultTitle = document.getElementById("resultTitle");
const resultMessage = document.getElementById("resultMessage");
const resultBoard = document.getElementById("resultBoard");
const finalView = document.getElementById("finalView");
const finalMessage = document.getElementById("finalMessage");
const finalRankings = document.getElementById("finalRankings");
const restartBtn = document.getElementById("restartBtn");
const scoreStrip = document.getElementById("scoreStrip");
const playError = document.getElementById("playError");

let state = null;
let syncingOptions = false;
let countdownFrame = null;
let serverClockOffset = 0;
let myColour = "#ef3340";
let opponentColour = "#ffc928";
let previousBoard = [];
let droppedIndex = -1;

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

function normaliseHex(value) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null;
}

function applyColours() {
  document.documentElement.style.setProperty("--my-disc", myColour);
  document.documentElement.style.setProperty("--opponent-disc", opponentColour);
  [myColourInput, gameMyColourInput].forEach((input) => { input.value = myColour; });
  [opponentColourInput, gameOpponentColourInput].forEach((input) => { input.value = opponentColour; });
  myColourValue.textContent = myColour.toUpperCase();
  opponentColourValue.textContent = opponentColour.toUpperCase();
  if (state) {
    if (["waiting", "settings"].includes(state.phase)) renderPlayers();
    else {
      renderScoreStrip();
      if (state.phase === "play") renderBoard(fourBoard, true);
      if (state.phase === "result") renderBoard(resultBoard, false);
    }
  }
}

function updateLocalColour(kind, rawValue, source) {
  const value = normaliseHex(rawValue);
  if (!value) return;
  const other = kind === "mine" ? opponentColour : myColour;
  if (value === other) {
    source.value = kind === "mine" ? myColour : opponentColour;
    const target = playArea.classList.contains("hidden") ? lobbyError : playError;
    showError(target, "Choose two different display colours so the discs remain clear.");
    return;
  }
  if (kind === "mine") myColour = value;
  else opponentColour = value;
  applyColours();
}

myColourInput.addEventListener("input", () => updateLocalColour("mine", myColourInput.value, myColourInput));
opponentColourInput.addEventListener("input", () => updateLocalColour("opponent", opponentColourInput.value, opponentColourInput));
gameMyColourInput.addEventListener("input", () => updateLocalColour("mine", gameMyColourInput.value, gameMyColourInput));
gameOpponentColourInput.addEventListener("input", () => updateLocalColour("opponent", gameOpponentColourInput.value, gameOpponentColourInput));

function colourForPlayerNumber(number) {
  if (!state) return number === 1 ? myColour : opponentColour;
  return number === state.me.number ? myColour : opponentColour;
}

function renderPlayers() {
  playerList.innerHTML = "";
  state.players.forEach((player) => {
    const chip = document.createElement("div");
    chip.className = "player-chip";
    const colour = colourForPlayerNumber(player.number);
    chip.innerHTML = `<span class="player-dot" style="background:${colour}"></span><span>${escapeHtml(player.name)}${player.id === state.me.id ? " (you)" : ""}</span>`;
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
  socket.emit("updateFourOptions", {
    boardKey: boardSelect.value,
    rounds: Number(roundsSelect.value)
  });
}

[boardSelect, roundsSelect].forEach((select) => select.addEventListener("change", sendOptions));

roomInput.addEventListener("input", () => {
  roomInput.value = roomInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
});
createRoomBtn.addEventListener("click", () => socket.emit("createFourRoom", { name: playerName.value }));
joinRoomBtn.addEventListener("click", () => {
  const code = roomInput.value.trim().toUpperCase();
  if (!code) return showError(welcomeError, "Enter a room code.");
  socket.emit("joinFourRoom", { code, name: playerName.value });
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
  socket.emit("startFourGame");
});
restartBtn.addEventListener("click", () => socket.emit("restartFourLobby"));

function isMyTurn() {
  return state?.phase === "play" && state.currentTurnId === state.me.id;
}

function winningSet() {
  return new Set((state?.lastRound?.winningCells || []).map(([row, column]) => `${row},${column}`));
}

function renderBoard(container, interactive) {
  if (!state?.board || !state.columns || !state.rows) return;
  container.innerHTML = "";
  container.style.gridTemplateColumns = `repeat(${state.columns}, 1fr)`;
  const wins = winningSet();

  for (let row = 0; row < state.rows; row += 1) {
    for (let column = 0; column < state.columns; column += 1) {
      const index = row * state.columns + column;
      const piece = state.board[index];
      const button = document.createElement(interactive ? "button" : "div");
      if (interactive) button.type = "button";
      button.className = "four-slot";
      button.dataset.column = String(column);
      button.dataset.row = String(row);
      if (piece === 0) button.classList.add("empty");
      if (wins.has(`${row},${column}`)) button.classList.add("winning");
      if (index === droppedIndex) button.classList.add("dropped");
      const colour = piece === 0 ? "var(--empty-slot)" : colourForPlayerNumber(piece);
      button.style.setProperty("--slot-colour", colour);
      if (interactive) {
        const columnFull = state.board[column] !== 0;
        button.disabled = !isMyTurn() || columnFull;
        button.setAttribute("aria-label", piece === 0
          ? `Column ${column + 1}, row ${row + 1}. ${columnFull ? "Column full" : "Drop a disc in this column"}`
          : `${piece === state.me.number ? "Your" : "Opponent"} disc at column ${column + 1}, row ${row + 1}`);
        button.addEventListener("click", () => {
          if (!button.disabled) socket.emit("dropFourDisc", { column });
        });
      }
      container.appendChild(button);
    }
  }
}

function updatePreview(clientX) {
  columnPreview.innerHTML = "";
  if (!isMyTurn() || !state?.columns) return;
  const rect = fourBoard.getBoundingClientRect();
  if (clientX < rect.left || clientX > rect.right) return;
  const column = Math.min(state.columns - 1, Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * state.columns)));
  if (state.board[column] !== 0) return;
  const disc = document.createElement("span");
  disc.className = "preview-disc";
  disc.style.left = `${((column + 0.5) / state.columns) * 100}%`;
  disc.style.setProperty("--preview-size", `${Math.max(22, rect.width / state.columns * 0.62)}px`);
  columnPreview.appendChild(disc);
}

fourBoard.addEventListener("pointermove", (event) => updatePreview(event.clientX));
fourBoard.addEventListener("pointerleave", () => { columnPreview.innerHTML = ""; });

function hideViews() {
  countdownView.classList.add("hidden");
  boardView.classList.add("hidden");
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
  boardSelect.value = state.options.boardKey;
  roundsSelect.value = String(state.options.rounds);
  syncingOptions = false;
  [boardSelect, roundsSelect].forEach((select) => { select.disabled = !state.isHost; });
  startBtn.disabled = !state.isHost || state.players.length !== 2 || state.phase !== "settings";
  startBtn.textContent = state.isHost
    ? (state.players.length === 2 ? "Start game" : "Waiting for player 2")
    : "Waiting for host";
  hostHint.textContent = state.isHost
    ? "Your game settings update for both players. Display colours remain local."
    : "Only the host can change game settings. Display colours remain local to you.";
  lobbyMessage.textContent = state.message;
}

function renderScoreStrip() {
  scoreStrip.innerHTML = "";
  state.players.forEach((player) => {
    const pill = document.createElement("div");
    pill.className = "score-pill";
    const colour = colourForPlayerNumber(player.number);
    pill.innerHTML = `<span class="score-name"><span class="player-colour-dot" style="--dot-colour:${colour}"></span>${escapeHtml(player.name)}</span><span>${player.roundWins} win${player.roundWins === 1 ? "" : "s"}</span>`;
    scoreStrip.appendChild(pill);
  });
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
    stageTitle.textContent = "New round";
    stageMessage.textContent = state.message;
    turnLabel.textContent = "Starting";
    turnLabel.classList.remove("my-turn");
    countdownView.classList.remove("hidden");
  } else if (state.phase === "play") {
    const mine = isMyTurn();
    stageKicker.textContent = mine ? "Your move" : "Opponent's move";
    stageTitle.textContent = mine ? "Choose a column" : `Waiting for ${state.currentTurnName}`;
    stageMessage.textContent = state.message;
    turnLabel.textContent = mine ? "Your turn" : state.currentTurnName;
    turnLabel.classList.toggle("my-turn", mine);
    renderBoard(fourBoard, true);
    boardView.classList.remove("hidden");
  } else if (state.phase === "result") {
    const draw = state.lastRound?.draw;
    stageKicker.textContent = `Round ${state.round} result`;
    stageTitle.textContent = state.message;
    stageMessage.textContent = "The next round starts automatically.";
    turnLabel.textContent = "Result";
    turnLabel.classList.remove("my-turn");
    resultIcon.textContent = draw ? "🤝" : "🏁";
    resultTitle.textContent = draw ? "Round draw" : `${state.lastRound.winnerName} connects four`;
    resultMessage.textContent = draw ? "No open spaces remained." : "Four matching discs were connected in a row.";
    renderBoard(resultBoard, false);
    resultView.classList.remove("hidden");
  } else if (state.phase === "final") {
    stageKicker.textContent = "Finished";
    stageTitle.textContent = "Match result";
    stageMessage.textContent = "";
    turnLabel.textContent = "Finished";
    turnLabel.classList.remove("my-turn");
    finalMessage.textContent = state.message;
    finalRankings.innerHTML = state.rankings.map((entry, index) => `
      <div class="rank-row">
        <span class="rank-number">${index + 1}</span>
        <strong>${escapeHtml(entry.name)}</strong>
        <span class="rank-wins">${entry.roundWins} win${entry.roundWins === 1 ? "" : "s"}</span>
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
    if (state?.phase !== "countdown" || !state.phaseEndsAt) return;
    const remaining = Math.max(0, state.phaseEndsAt - (Date.now() + serverClockOffset));
    countdownNumber.textContent = String(Math.max(1, Math.ceil(remaining / 1000)));
    if (remaining > 0) countdownFrame = requestAnimationFrame(tick);
  };
  tick();
}

socket.on("fourState", (nextState) => {
  droppedIndex = -1;
  if (Array.isArray(previousBoard) && Array.isArray(nextState.board) && previousBoard.length === nextState.board.length) {
    droppedIndex = nextState.board.findIndex((value, index) => value !== 0 && previousBoard[index] === 0);
  }
  state = nextState;
  previousBoard = Array.isArray(state.board) ? [...state.board] : [];
  serverClockOffset = state.serverNow - Date.now();
  welcomeError.textContent = "";
  lobbyError.textContent = "";
  playError.textContent = "";
  if (["waiting", "settings"].includes(state.phase)) renderLobby();
  else renderPlay();
});

socket.on("fourError", (message) => {
  const target = playArea.classList.contains("hidden")
    ? (lobby.classList.contains("hidden") ? welcomeError : lobbyError)
    : playError;
  showError(target, message);
});

applyColours();
