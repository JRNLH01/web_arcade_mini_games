const socket = createArcadeSocket("/memory-match");

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
const roundsSelect = document.getElementById("roundsSelect");
const lobbyMessage = document.getElementById("lobbyMessage");
const startBtn = document.getElementById("startBtn");
const hostHint = document.getElementById("hostHint");
const lobbyError = document.getElementById("lobbyError");

const playArea = document.getElementById("playArea");
const gameRoomCode = document.getElementById("gameRoomCode");
const roundLabel = document.getElementById("roundLabel");
const elapsedLabel = document.getElementById("elapsedLabel");
const stageKicker = document.getElementById("stageKicker");
const stageTitle = document.getElementById("stageTitle");
const stageMessage = document.getElementById("stageMessage");
const countdownView = document.getElementById("countdownView");
const countdownNumber = document.getElementById("countdownNumber");
const boardView = document.getElementById("boardView");
const matchedLabel = document.getElementById("matchedLabel");
const movesLabel = document.getElementById("movesLabel");
const memoryBoard = document.getElementById("memoryBoard");
const boardHint = document.getElementById("boardHint");
const raceProgress = document.getElementById("raceProgress");
const resultView = document.getElementById("resultView");
const resultTitle = document.getElementById("resultTitle");
const resultMessage = document.getElementById("resultMessage");
const roundResults = document.getElementById("roundResults");
const finalView = document.getElementById("finalView");
const finalMessage = document.getElementById("finalMessage");
const finalRankings = document.getElementById("finalRankings");
const restartBtn = document.getElementById("restartBtn");
const scoreStrip = document.getElementById("scoreStrip");
const playError = document.getElementById("playError");

let state = null;
let syncingOptions = false;
let animationFrame = null;
let serverClockOffset = 0;
let renderedPlayPhase = null;
let renderedBoardKey = "";
let renderedRacePlayersKey = "";
let renderedScorePlayersKey = "";
const pendingCardFlips = new Map();

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatTime(milliseconds) {
  if (!Number.isFinite(milliseconds)) return "—";
  return `${(Math.max(0, milliseconds) / 1000).toFixed(2)}s`;
}

function showError(element, message) {
  element.textContent = message || "";
  if (message) setTimeout(() => {
    if (element.textContent === message) element.textContent = "";
  }, 4000);
}

function renderPlayers() {
  const players = [...state.players];
  while (players.length < 2) players.push(null);
  playerList.innerHTML = players.map((player, index) => player
    ? `<div class="player-chip"><span class="player-dot"></span><span>${escapeHtml(player.name)}${player.id === state.me.id ? " (you)" : ""}</span></div>`
    : `<div class="player-chip waiting"><span class="player-dot"></span><span>Waiting for Player ${index + 1}</span></div>`).join("");
}

function sendOptions() {
  if (!state?.isHost || syncingOptions) return;
  socket.emit("updateMemoryMatchOptions", {
    gridSize: Number(gridSizeSelect.value),
    rounds: Number(roundsSelect.value)
  });
}

gridSizeSelect.addEventListener("change", sendOptions);
roundsSelect.addEventListener("change", sendOptions);
createRoomBtn.addEventListener("click", () => socket.emit("createMemoryMatchRoom", { name: playerName.value }));
joinRoomBtn.addEventListener("click", () => {
  const code = roomInput.value.trim().toUpperCase();
  if (!code) return showError(welcomeError, "Enter a room code.");
  socket.emit("joinMemoryMatchRoom", { code, name: playerName.value });
});
roomInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") joinRoomBtn.click();
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
  socket.emit("startMemoryMatchGame");
});
restartBtn.addEventListener("click", () => socket.emit("restartMemoryMatchLobby"));

memoryBoard.addEventListener("click", (event) => {
  const card = event.target.closest("button[data-card-index]");
  if (!card || state?.phase !== "play" || state.me.inputLocked || card.disabled) return;

  const index = Number(card.dataset.cardIndex);
  if (!Number.isInteger(index) || pendingCardFlips.has(index)) return;

  // Give instant press feedback without rebuilding the board while the server
  // validates the flip. The card face is still revealed only by server state.
  const pendingAt = Date.now();
  pendingCardFlips.set(index, pendingAt);
  card.classList.add("is-pending");
  socket.emit("flipMemoryCard", { index });

  // Recover gracefully if a response is delayed or the flip is rejected.
  setTimeout(() => {
    if (pendingCardFlips.get(index) !== pendingAt) return;
    pendingCardFlips.delete(index);
    const pendingCard = memoryBoard.querySelector(`[data-card-index="${index}"]`);
    pendingCard?.classList.remove("is-pending");
  }, 1500);
});

function showPlayView(view) {
  if (renderedPlayPhase === state.phase && !view.classList.contains("hidden")) return;
  [countdownView, boardView, resultView, finalView].forEach((candidate) => {
    candidate.classList.toggle("hidden", candidate !== view);
  });
  renderedPlayPhase = state.phase;
}

function renderLobby() {
  pendingCardFlips.clear();
  welcome.classList.add("hidden");
  playArea.classList.add("hidden");
  lobby.classList.remove("hidden");
  roomCode.textContent = state.roomCode;
  hostBadge.textContent = state.isHost ? "You are host" : `${state.hostName} is host`;
  renderPlayers();

  syncingOptions = true;
  gridSizeSelect.value = String(state.options.gridSize);
  roundsSelect.value = String(state.options.rounds);
  syncingOptions = false;
  [gridSizeSelect, roundsSelect].forEach((select) => { select.disabled = !state.isHost; });
  startBtn.disabled = !state.isHost || state.players.length !== 2 || state.phase !== "settings";
  startBtn.textContent = state.isHost
    ? (state.players.length === 2 ? "Start game" : "Waiting for player 2")
    : "Waiting for host";
  hostHint.textContent = state.isHost
    ? "Your settings update for both players. Larger boards contain more pairs."
    : "Only the host can change the game settings.";
  lobbyMessage.textContent = state.message;
}

function cardAriaLabel(card, index) {
  const row = Math.floor(index / state.options.gridSize) + 1;
  const column = index % state.options.gridSize + 1;
  if (card.status === "hidden") return `Hidden card, row ${row}, column ${column}`;
  if (card.status === "matched") return `Matched ${card.face}, row ${row}, column ${column}`;
  return `Revealed ${card.face}, row ${row}, column ${column}`;
}

function renderBoard() {
  const size = state.options.gridSize;
  const boardKey = `${state.roomCode}:${state.round}:${size}:${state.me.board.length}`;
  memoryBoard.style.setProperty("--memory-grid-size", String(size));
  memoryBoard.dataset.gridSize = String(size);

  // Build the card elements only once per round. Later socket updates patch the
  // existing cards in place, so focus, flip animations and the page layout stay stable.
  if (renderedBoardKey !== boardKey || memoryBoard.children.length !== state.me.board.length) {
    renderedBoardKey = boardKey;
    pendingCardFlips.clear();
    memoryBoard.innerHTML = state.me.board.map((_, index) => `
      <button class="memory-card" type="button" role="gridcell" data-card-index="${index}"
        aria-label="Hidden card" aria-pressed="false">
        <span class="memory-card-inner">
          <span class="memory-card-back" aria-hidden="true">?</span>
          <span class="memory-card-face" aria-hidden="true"></span>
        </span>
      </button>`).join("");
  }

  state.me.board.forEach((card, index) => {
    const button = memoryBoard.children[index];
    if (!button) return;

    const visible = card.status !== "hidden";
    const matched = card.status === "matched";
    if (visible) pendingCardFlips.delete(index);

    button.classList.toggle("is-visible", visible);
    button.classList.toggle("is-matched", matched);
    button.classList.toggle("is-pending", pendingCardFlips.has(index));
    button.disabled = matched || state.me.inputLocked;
    button.setAttribute("aria-label", cardAriaLabel(card, index));
    button.setAttribute("aria-pressed", String(visible));

    const face = button.querySelector(".memory-card-face");
    const nextFace = visible ? String(card.face || "") : "";
    if (face.textContent !== nextFace) face.textContent = nextFace;
  });
}

function renderRaceProgress() {
  const playersKey = state.players.map((player) => player.id).join("|");
  if (renderedRacePlayersKey !== playersKey || raceProgress.children.length !== state.players.length) {
    renderedRacePlayersKey = playersKey;
    raceProgress.innerHTML = state.players.map(() => `
      <div class="race-player">
        <div class="race-player-heading"><strong></strong><span></span></div>
        <div class="progress-track"><span></span></div>
        <small></small>
      </div>`).join("");
  }

  state.players.forEach((player, index) => {
    const row = raceProgress.children[index];
    const percent = state.totalPairs ? Math.round(player.pairsMatched / state.totalPairs * 100) : 0;
    row.querySelector("strong").textContent = `${player.name}${player.id === state.me.id ? " (you)" : ""}`;
    row.querySelector(".race-player-heading span").textContent = `${player.pairsMatched}/${state.totalPairs} pairs`;
    row.querySelector(".progress-track span").style.width = `${percent}%`;
    row.querySelector("small").textContent = `${player.moves} move${player.moves === 1 ? "" : "s"}`;
  });
}

function renderScoreStrip() {
  const playersKey = state.players.map((player) => player.id).join("|");
  if (renderedScorePlayersKey !== playersKey || scoreStrip.children.length !== state.players.length) {
    renderedScorePlayersKey = playersKey;
    scoreStrip.innerHTML = state.players.map(() => `
      <div class="score-pill"><span></span><span></span></div>`).join("");
  }

  state.players.forEach((player, index) => {
    const pill = scoreStrip.children[index];
    pill.children[0].textContent = player.name;
    pill.children[1].textContent = `${player.points} point${player.points === 1 ? "" : "s"}`;
  });
}

function renderRoundResults() {
  const results = state.lastRound?.results || [];
  roundResults.innerHTML = results.map((entry) => `
    <div class="round-result ${entry.winner ? "winner" : ""}">
      <div class="round-result-name">
        <strong>${escapeHtml(entry.name)}</strong>
        ${entry.winner ? '<span class="winner-badge">Fastest</span>' : ""}
      </div>
      <div class="result-metrics">
        <span><small>Pairs found</small><strong>${entry.pairsMatched} / ${state.totalPairs}</strong></span>
        <span><small>Moves</small><strong>${entry.moves}</strong></span>
        <span><small>Finish time</small><strong>${entry.winner ? formatTime(entry.finishMs) : "—"}</strong></span>
      </div>
    </div>`).join("");
}

function renderFinalRankings() {
  finalRankings.innerHTML = state.rankings.map((entry, index) => `
    <div class="rank-row">
      <span class="rank-number">${index + 1}</span>
      <div><strong>${escapeHtml(entry.name)}</strong><small>${entry.wins} round win${entry.wins === 1 ? "" : "s"}</small></div>
      <div class="rank-score"><strong>${entry.points} pts</strong><small>Avg win ${formatTime(entry.averageWinningTimeMs)}</small></div>
    </div>`).join("");
}

function renderPlay() {
  welcome.classList.add("hidden");
  lobby.classList.add("hidden");
  playArea.classList.remove("hidden");
  gameRoomCode.textContent = state.roomCode;
  roundLabel.textContent = `${state.round} / ${state.totalRounds}`;

  if (state.phase === "countdown") {
    stageKicker.textContent = "Prepare";
    stageTitle.textContent = `${state.options.gridSize}×${state.options.gridSize} board`;
    stageMessage.textContent = state.message;
    elapsedLabel.textContent = "0.00s";
    showPlayView(countdownView);
  } else if (state.phase === "play") {
    stageKicker.textContent = "Memory race";
    stageTitle.textContent = state.me.inputLocked ? "Not a match — remember them" : "Match every pair";
    stageMessage.textContent = state.message;
    matchedLabel.textContent = `${state.me.pairsMatched} / ${state.totalPairs}`;
    movesLabel.textContent = String(state.me.moves);
    boardHint.textContent = state.me.inputLocked
      ? "These two cards will flip back shortly."
      : "Choose any two cards. Unmatched cards flip back automatically.";
    renderBoard();
    renderRaceProgress();
    showPlayView(boardView);
  } else if (state.phase === "result") {
    stageKicker.textContent = `Round ${state.round} result`;
    stageTitle.textContent = `${state.lastRound?.winnerName || "Player"} wins the race`;
    stageMessage.textContent = "";
    elapsedLabel.textContent = formatTime(state.lastRound?.finishMs);
    resultTitle.textContent = state.message;
    resultMessage.textContent = "The first player to match every pair wins the round.";
    renderRoundResults();
    showPlayView(resultView);
  } else if (state.phase === "final") {
    stageKicker.textContent = "Finished";
    stageTitle.textContent = "Final result";
    stageMessage.textContent = "";
    elapsedLabel.textContent = "Done";
    finalMessage.textContent = state.message;
    renderFinalRankings();
    showPlayView(finalView);
  }

  renderScoreStrip();
  updateClock();
}

function updateClock() {
  if (animationFrame) cancelAnimationFrame(animationFrame);
  const tick = () => {
    if (!state) return;
    const now = Date.now() + serverClockOffset;
    if (state.phase === "countdown" && state.phaseEndsAt) {
      const remaining = Math.max(0, state.phaseEndsAt - now);
      countdownNumber.textContent = String(Math.max(1, Math.ceil(remaining / 1000)));
      if (remaining > 0) animationFrame = requestAnimationFrame(tick);
    } else if (state.phase === "play" && state.roundStartedAt) {
      elapsedLabel.textContent = formatTime(now - state.roundStartedAt);
      animationFrame = requestAnimationFrame(tick);
    }
  };
  tick();
}

socket.on("memoryMatchState", (nextState) => {
  state = nextState;
  serverClockOffset = state.serverNow - Date.now();
  welcomeError.textContent = "";
  lobbyError.textContent = "";
  playError.textContent = "";
  if (["waiting", "settings"].includes(state.phase)) renderLobby();
  else renderPlay();
});

socket.on("memoryMatchError", (message) => {
  const target = playArea.classList.contains("hidden")
    ? (lobby.classList.contains("hidden") ? welcomeError : lobbyError)
    : playError;
  showError(target, message);
});
