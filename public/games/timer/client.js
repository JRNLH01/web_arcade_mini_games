const socket = createArcadeSocket("/timer");

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
const rangeSelect = document.getElementById("rangeSelect");
const roundsSelect = document.getElementById("roundsSelect");
const lobbyMessage = document.getElementById("lobbyMessage");
const startBtn = document.getElementById("startBtn");
const hostHint = document.getElementById("hostHint");
const lobbyError = document.getElementById("lobbyError");

const playArea = document.getElementById("playArea");
const gameRoomCode = document.getElementById("gameRoomCode");
const roundLabel = document.getElementById("roundLabel");
const statusLabel = document.getElementById("statusLabel");
const stageKicker = document.getElementById("stageKicker");
const stageTitle = document.getElementById("stageTitle");
const stageMessage = document.getElementById("stageMessage");
const countdownView = document.getElementById("countdownView");
const countdownTarget = document.getElementById("countdownTarget");
const countdownNumber = document.getElementById("countdownNumber");
const timerView = document.getElementById("timerView");
const targetTime = document.getElementById("targetTime");
const timerButton = document.getElementById("timerButton");
const timerButtonIcon = document.getElementById("timerButtonIcon");
const timerButtonText = document.getElementById("timerButtonText");
const timerButtonHint = document.getElementById("timerButtonHint");
const attemptStatuses = document.getElementById("attemptStatuses");
const resultView = document.getElementById("resultView");
const resultIcon = document.getElementById("resultIcon");
const resultTitle = document.getElementById("resultTitle");
const resultMessage = document.getElementById("resultMessage");
const resultTarget = document.getElementById("resultTarget");
const roundResults = document.getElementById("roundResults");
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatTime(centiseconds) {
  if (!Number.isFinite(centiseconds)) return "—";
  const safe = Math.max(0, Math.round(centiseconds));
  return `${Math.floor(safe / 100)}:${String(safe % 100).padStart(2, "0")}s`;
}

function formatPoints(points) {
  return Number.isInteger(points) ? String(points) : Number(points).toFixed(1);
}

function showError(element, message) {
  element.textContent = message || "";
  if (message) setTimeout(() => {
    if (element.textContent === message) element.textContent = "";
  }, 3500);
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
    waiting.innerHTML = '<span class="player-dot" style="background:#c8cad3"></span><span>Waiting...</span>';
    playerList.appendChild(waiting);
  }
}

function sendOptions() {
  if (syncingOptions || !state?.isHost) return;
  socket.emit("updateTimerOptions", {
    rangeKey: rangeSelect.value,
    rounds: Number(roundsSelect.value)
  });
}

[rangeSelect, roundsSelect].forEach((select) => select.addEventListener("change", sendOptions));

roomInput.addEventListener("input", () => {
  roomInput.value = roomInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
});
createRoomBtn.addEventListener("click", () => socket.emit("createTimerRoom", { name: playerName.value }));
joinRoomBtn.addEventListener("click", () => {
  const code = roomInput.value.trim().toUpperCase();
  if (!code) return showError(welcomeError, "Enter a room code.");
  socket.emit("joinTimerRoom", { code, name: playerName.value });
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
  socket.emit("startTimerGame");
});
restartBtn.addEventListener("click", () => socket.emit("restartTimerLobby"));

timerButton.addEventListener("click", () => {
  if (state?.phase !== "play") return;
  if (state.me.status === "ready") socket.emit("startTimerAttempt");
  else if (state.me.status === "timing") socket.emit("stopTimerAttempt");
});

document.addEventListener("keydown", (event) => {
  if (event.code !== "Space" || event.repeat || state?.phase !== "play") return;
  const activeTag = document.activeElement?.tagName;
  if (["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(activeTag)) return;
  event.preventDefault();
  timerButton.click();
});

function hideViews() {
  countdownView.classList.add("hidden");
  timerView.classList.add("hidden");
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
  rangeSelect.value = state.options.rangeKey;
  roundsSelect.value = String(state.options.rounds);
  syncingOptions = false;
  [rangeSelect, roundsSelect].forEach((select) => { select.disabled = !state.isHost; });
  startBtn.disabled = !state.isHost || state.players.length !== 2 || state.phase !== "settings";
  startBtn.textContent = state.isHost
    ? (state.players.length === 2 ? "Start game" : "Waiting for player 2")
    : "Waiting for host";
  hostHint.textContent = state.isHost
    ? "Your settings update for both players."
    : "Only the host can change the game settings.";
  lobbyMessage.textContent = state.message;
}

function statusText(status, isMe) {
  if (status === "timing") return isMe ? "Timer running — time hidden" : "Timer running";
  if (status === "locked") return "Time locked in";
  return "Ready to start";
}

function renderAttemptStatuses() {
  attemptStatuses.innerHTML = state.players.map((player) => {
    const isMe = player.id === state.me.id;
    return `<div class="attempt-status ${player.status}">
      <span class="attempt-dot"></span>
      <div><strong>${escapeHtml(player.name)}${isMe ? " (you)" : ""}</strong><small>${statusText(player.status, isMe)}</small></div>
    </div>`;
  }).join("");
}

function renderTimerButton() {
  const status = state.me.status;
  timerButton.classList.toggle("running", status === "timing");
  timerButton.classList.toggle("locked", status === "locked");
  timerButton.disabled = status === "locked";
  if (status === "ready") {
    timerButtonIcon.textContent = "▶";
    timerButtonText.textContent = "Start";
    timerButtonHint.textContent = "Press once to begin";
    statusLabel.textContent = "Ready";
  } else if (status === "timing") {
    timerButtonIcon.textContent = "■";
    timerButtonText.textContent = "Stop";
    timerButtonHint.textContent = "Press when you think the target has passed";
    statusLabel.textContent = "Timing";
  } else {
    timerButtonIcon.textContent = "✓";
    timerButtonText.textContent = "Locked in";
    timerButtonHint.textContent = "Waiting for the other player";
    statusLabel.textContent = "Locked";
  }
}

function renderScoreStrip() {
  scoreStrip.innerHTML = state.players.map((player) => `
    <div class="score-pill">
      <span>${escapeHtml(player.name)}</span>
      <span>${formatPoints(player.points)} point${player.points === 1 ? "" : "s"}</span>
    </div>`).join("");
}

function renderRoundResults() {
  const results = state.lastRound?.results || [];
  roundResults.innerHTML = results.map((entry) => `
    <div class="round-result ${entry.winner ? "winner" : ""}">
      <div class="round-result-name">
        <strong>${escapeHtml(entry.name)}</strong>
        ${entry.winner ? '<span class="winner-badge">Closest</span>' : ""}
      </div>
      <div class="result-metrics">
        <span><small>Stopped at</small><strong>${entry.completed ? formatTime(entry.actualCs) : "No attempt"}</strong></span>
        <span><small>Difference</small><strong>${entry.completed ? formatTime(entry.errorCs) : "—"}</strong></span>
      </div>
    </div>`).join("");
}

function renderFinalRankings() {
  finalRankings.innerHTML = state.rankings.map((entry, index) => `
    <div class="rank-row">
      <span class="rank-number">${index + 1}</span>
      <div><strong>${escapeHtml(entry.name)}</strong><small>${entry.completedRounds} completed round${entry.completedRounds === 1 ? "" : "s"}</small></div>
      <div class="rank-score"><strong>${formatPoints(entry.points)} pts</strong><small>Avg error ${formatTime(entry.averageErrorCs)}</small></div>
    </div>`).join("");
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
    stageTitle.textContent = "Remember the target";
    stageMessage.textContent = state.message;
    statusLabel.textContent = "Starting";
    countdownTarget.textContent = formatTime(state.targetCs);
    countdownView.classList.remove("hidden");
  } else if (state.phase === "play") {
    stageKicker.textContent = "Hidden timer";
    stageTitle.textContent = state.me.status === "locked" ? "Your time is locked" : "Trust your sense of time";
    stageMessage.textContent = state.message;
    targetTime.textContent = formatTime(state.targetCs);
    renderTimerButton();
    renderAttemptStatuses();
    timerView.classList.remove("hidden");
  } else if (state.phase === "result") {
    const winners = state.lastRound?.winnerNames || [];
    stageKicker.textContent = `Round ${state.round} result`;
    stageTitle.textContent = winners.length ? "Times revealed" : "Round complete";
    stageMessage.textContent = "";
    statusLabel.textContent = "Result";
    resultIcon.textContent = winners.length > 1 ? "🤝" : winners.length === 1 ? "🏁" : "⌛";
    resultTitle.textContent = state.message;
    resultMessage.textContent = "The smallest absolute difference from the target wins.";
    resultTarget.textContent = formatTime(state.lastRound?.targetCs);
    renderRoundResults();
    resultView.classList.remove("hidden");
  } else if (state.phase === "final") {
    stageKicker.textContent = "Finished";
    stageTitle.textContent = "Final result";
    stageMessage.textContent = "";
    statusLabel.textContent = "Finished";
    finalMessage.textContent = state.message;
    renderFinalRankings();
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

socket.on("timerState", (nextState) => {
  state = nextState;
  serverClockOffset = state.serverNow - Date.now();
  welcomeError.textContent = "";
  lobbyError.textContent = "";
  playError.textContent = "";
  if (["waiting", "settings"].includes(state.phase)) renderLobby();
  else renderPlay();
});

socket.on("timerError", (message) => {
  const target = playArea.classList.contains("hidden")
    ? (lobby.classList.contains("hidden") ? welcomeError : lobbyError)
    : playError;
  showError(target, message);
});
