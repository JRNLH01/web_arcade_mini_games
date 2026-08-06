const socket = createArcadeSocket("/higher-lower");

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
const turnLabel = document.getElementById("turnLabel");
const stageKicker = document.getElementById("stageKicker");
const stageTitle = document.getElementById("stageTitle");
const stageMessage = document.getElementById("stageMessage");

const choosingView = document.getElementById("choosingView");
const secretDisplay = document.getElementById("secretDisplay");
const secretRange = document.getElementById("secretRange");
const secretInput = document.getElementById("secretInput");
const randomSecretBtn = document.getElementById("randomSecretBtn");
const lockNumberBtn = document.getElementById("lockNumberBtn");
const choiceStatuses = document.getElementById("choiceStatuses");

const countdownView = document.getElementById("countdownView");
const starterName = document.getElementById("starterName");
const countdownNumber = document.getElementById("countdownNumber");

const guessView = document.getElementById("guessView");
const lowerBound = document.getElementById("lowerBound");
const upperBound = document.getElementById("upperBound");
const guessRange = document.getElementById("guessRange");
const guessInput = document.getElementById("guessInput");
const guessBtn = document.getElementById("guessBtn");
const guessHint = document.getElementById("guessHint");
const ownSecret = document.getElementById("ownSecret");
const guessCount = document.getElementById("guessCount");
const guessHistory = document.getElementById("guessHistory");

const resultView = document.getElementById("resultView");
const resultTitle = document.getElementById("resultTitle");
const resultMessage = document.getElementById("resultMessage");
const revealedNumbers = document.getElementById("revealedNumbers");
const roundStats = document.getElementById("roundStats");

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
let lastRoundRendered = null;

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
  if (message) window.setTimeout(() => {
    if (element.textContent === message) element.textContent = "";
  }, 3200);
}

function clampWhole(value, minimum, maximum) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return minimum;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function formatNumber(value) {
  return Number(value).toLocaleString("en-US");
}

function setExclusiveView(activeView) {
  [choosingView, countdownView, guessView, resultView, finalView].forEach((view) => {
    view.classList.toggle("hidden", view !== activeView);
  });
}

function copyCode() {
  const code = state?.roomCode || roomCode.textContent.trim();
  if (!code || code === "-----") return;
  const done = () => {
    const original = copyRoomCodeBtn.textContent;
    copyRoomCodeBtn.textContent = "Copied";
    window.setTimeout(() => { copyRoomCodeBtn.textContent = original; }, 1200);
  };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(code).then(done).catch(() => {});
  else {
    const temporary = document.createElement("textarea");
    temporary.value = code;
    document.body.appendChild(temporary);
    temporary.select();
    document.execCommand("copy");
    temporary.remove();
    done();
  }
}

function submitRoomCreation() {
  createRoomBtn.disabled = true;
  socket.emit("createHigherLowerRoom", { name: playerName.value.trim() || "Player" });
  window.setTimeout(() => { createRoomBtn.disabled = false; }, 700);
}

function submitRoomJoin() {
  const code = roomInput.value.trim().toUpperCase();
  if (code.length !== 5) return showError(welcomeError, "Enter the five-character room code.");
  joinRoomBtn.disabled = true;
  socket.emit("joinHigherLowerRoom", { code, name: playerName.value.trim() || "Player" });
  window.setTimeout(() => { joinRoomBtn.disabled = false; }, 700);
}

function syncSecretControls(value) {
  if (!state) return;
  const maximum = state.options.maximum;
  const safe = clampWhole(value, 1, maximum);
  secretRange.max = String(maximum);
  secretInput.max = String(maximum);
  secretRange.value = String(safe);
  secretInput.value = String(safe);
  secretDisplay.value = formatNumber(safe);
  secretDisplay.textContent = formatNumber(safe);
}

function syncGuessControls(value) {
  if (!state) return;
  const minimum = state.me.lowerBound;
  const maximum = state.me.upperBound;
  const safe = clampWhole(value, minimum, maximum);
  guessRange.min = String(minimum);
  guessRange.max = String(maximum);
  guessInput.min = String(minimum);
  guessInput.max = String(maximum);
  guessRange.value = String(safe);
  guessInput.value = String(safe);
}

function renderLobby() {
  welcome.classList.add("hidden");
  playArea.classList.add("hidden");
  lobby.classList.remove("hidden");

  roomCode.textContent = state.roomCode;
  hostBadge.textContent = state.isHost ? "Host" : `${state.hostName || "Player"} is host`;
  playerList.innerHTML = [1, 2].map((number) => {
    const player = state.players.find((candidate) => candidate.number === number);
    return player
      ? `<div class="player-chip"><span class="player-dot"></span><span>${escapeHtml(player.name)}${player.id === state.me.id ? " · You" : ""}</span></div>`
      : `<div class="player-chip empty"><span class="player-dot waiting"></span><span>Waiting for Player ${number}</span></div>`;
  }).join("");

  syncingOptions = true;
  rangeSelect.value = String(state.options.maximum);
  roundsSelect.value = String(state.options.rounds);
  syncingOptions = false;

  rangeSelect.disabled = !state.isHost;
  roundsSelect.disabled = !state.isHost;
  startBtn.disabled = !state.isHost || state.players.length !== 2 || state.phase !== "settings";
  startBtn.textContent = state.isHost ? "Start game" : "Waiting for host";
  lobbyMessage.textContent = state.message;
  hostHint.textContent = state.isHost
    ? (state.players.length === 2 ? "You can change the settings before starting." : "Share the room code with another player.")
    : "Only the host can change settings and start the game.";
}

function renderChoiceStatuses() {
  choiceStatuses.innerHTML = state.players.map((player) => `
    <div class="choice-status ${player.secretLocked ? "locked" : "choosing"}">
      <span class="status-dot"></span>
      <div><strong>${escapeHtml(player.name)}</strong><small>${player.secretLocked ? "Number locked" : "Choosing a number"}</small></div>
    </div>
  `).join("");
}

function renderScoreStrip() {
  scoreStrip.innerHTML = state.players.map((player) => `
    <div class="score-pill ${player.id === state.me.id ? "mine" : ""}">
      <span>${escapeHtml(player.name)}${player.id === state.me.id ? " · You" : ""}</span>
      <strong>${player.roundWins} win${player.roundWins === 1 ? "" : "s"}</strong>
    </div>
  `).join("");
}

function directionMarkup(result) {
  if (result === "higher") return '<span class="direction higher">↑ Higher</span>';
  if (result === "lower") return '<span class="direction lower">↓ Lower</span>';
  return '<span class="direction correct">✓ Exact</span>';
}

function renderHistory() {
  const history = state.guessHistory || [];
  guessCount.textContent = `${history.length} guess${history.length === 1 ? "" : "es"}`;
  guessHistory.innerHTML = history.length
    ? [...history].reverse().map((entry) => `
        <div class="history-row ${entry.result}">
          <span class="turn-number">${entry.turn}</span>
          <div><strong>${escapeHtml(entry.playerName)} guessed ${formatNumber(entry.guess)}</strong><small>Opponent's number is</small></div>
          ${directionMarkup(entry.result)}
        </div>
      `).join("")
    : '<p class="empty-history">No guesses yet.</p>';
}

function renderChoosing() {
  setExclusiveView(choosingView);
  stageKicker.textContent = `Round ${state.round} · Secret choice`;
  stageTitle.textContent = state.me.secretLocked ? "Your number is locked" : `Choose from 1 to ${formatNumber(state.options.maximum)}`;
  stageMessage.textContent = state.message;
  turnLabel.textContent = "Choosing";

  const controlsLocked = state.me.secretLocked;
  secretRange.disabled = controlsLocked;
  secretInput.disabled = controlsLocked;
  randomSecretBtn.disabled = controlsLocked;
  lockNumberBtn.disabled = controlsLocked;
  lockNumberBtn.textContent = controlsLocked ? `Locked: ${formatNumber(state.me.secretNumber)}` : "Lock secret number";
  syncSecretControls(state.me.secretNumber ?? Math.ceil(state.options.maximum / 2));
  renderChoiceStatuses();
}

function renderCountdown() {
  setExclusiveView(countdownView);
  stageKicker.textContent = `Round ${state.round} · Get ready`;
  stageTitle.textContent = "Both numbers are locked";
  stageMessage.textContent = state.message;
  turnLabel.textContent = state.currentTurnId === state.me.id ? "You start" : `${state.currentTurnName} starts`;
  starterName.textContent = state.currentTurnId === state.me.id ? "You guess first" : `${state.currentTurnName} guesses first`;
}

function renderGuessing() {
  setExclusiveView(guessView);
  const mine = state.currentTurnId === state.me.id;
  stageKicker.textContent = `Round ${state.round} · ${mine ? "Your turn" : "Opponent's turn"}`;
  stageTitle.textContent = mine ? `Guess ${state.opponent?.name || "your opponent"}'s number` : `Waiting for ${state.currentTurnName}`;
  stageMessage.textContent = state.message;
  turnLabel.textContent = mine ? "Your turn" : state.currentTurnName;
  turnLabel.classList.toggle("my-turn", mine);

  lowerBound.textContent = formatNumber(state.me.lowerBound);
  upperBound.textContent = formatNumber(state.me.upperBound);
  ownSecret.textContent = state.me.secretNumber == null ? "—" : formatNumber(state.me.secretNumber);
  const suggested = Math.floor((state.me.lowerBound + state.me.upperBound) / 2);
  syncGuessControls(suggested);
  guessRange.disabled = !mine;
  guessInput.disabled = !mine;
  guessBtn.disabled = !mine;
  guessBtn.textContent = mine ? "Guess" : "Waiting";
  guessHint.textContent = mine
    ? `Choose a whole number from ${formatNumber(state.me.lowerBound)} to ${formatNumber(state.me.upperBound)}.`
    : `${state.currentTurnName} is deciding on a guess.`;
  renderHistory();
}

function renderResult() {
  setExclusiveView(resultView);
  stageKicker.textContent = `Round ${state.round} result`;
  stageTitle.textContent = state.message;
  stageMessage.textContent = "Both secret numbers are now revealed.";
  turnLabel.textContent = "Result";
  turnLabel.classList.remove("my-turn");
  resultTitle.textContent = `${state.lastRound.winnerName} found the exact number`;
  resultMessage.textContent = `The winning guess was ${formatNumber(state.lastRound.finalGuess)} after ${state.lastRound.totalTurns} total turn${state.lastRound.totalTurns === 1 ? "" : "s"}.`;
  revealedNumbers.innerHTML = state.lastRound.players.map((player) => `
    <div class="revealed-number ${player.id === state.lastRound.winnerId ? "winner" : ""}">
      <span>${escapeHtml(player.name)}'s secret</span>
      <strong>${formatNumber(player.secretNumber)}</strong>
    </div>
  `).join("");
  roundStats.innerHTML = state.lastRound.players.map((player) => `
    <div><strong>${escapeHtml(player.name)}</strong><span>${player.guessCount} guess${player.guessCount === 1 ? "" : "es"}</span></div>
  `).join("");
}

function renderFinal() {
  setExclusiveView(finalView);
  stageKicker.textContent = "Finished";
  stageTitle.textContent = "Match result";
  stageMessage.textContent = "";
  turnLabel.textContent = "Finished";
  turnLabel.classList.remove("my-turn");
  finalMessage.textContent = state.message;
  finalRankings.innerHTML = state.rankings.map((entry, index) => `
    <div class="rank-row">
      <span class="rank-number">${index + 1}</span>
      <div><strong>${escapeHtml(entry.name)}</strong><small>${entry.totalGuesses} total guess${entry.totalGuesses === 1 ? "" : "es"}</small></div>
      <span class="rank-wins">${entry.roundWins} win${entry.roundWins === 1 ? "" : "s"}</span>
    </div>
  `).join("");
}

function renderPlay() {
  welcome.classList.add("hidden");
  lobby.classList.add("hidden");
  playArea.classList.remove("hidden");

  gameRoomCode.textContent = state.roomCode;
  roundLabel.textContent = `${state.round} / ${state.totalRounds}`;
  turnLabel.classList.remove("my-turn");

  if (state.phase === "choosing") renderChoosing();
  else if (state.phase === "countdown") renderCountdown();
  else if (state.phase === "play") renderGuessing();
  else if (state.phase === "result") renderResult();
  else if (state.phase === "final") renderFinal();

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

function submitGuess() {
  if (!state || state.phase !== "play" || state.currentTurnId !== state.me.id) return;
  const guess = clampWhole(guessInput.value, state.me.lowerBound, state.me.upperBound);
  syncGuessControls(guess);
  guessBtn.disabled = true;
  socket.emit("makeHigherLowerGuess", { guess });
}

createRoomBtn.addEventListener("click", submitRoomCreation);
joinRoomBtn.addEventListener("click", submitRoomJoin);
roomInput.addEventListener("input", () => { roomInput.value = roomInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5); });
roomInput.addEventListener("keydown", (event) => { if (event.key === "Enter") submitRoomJoin(); });
copyRoomCodeBtn.addEventListener("click", copyCode);

rangeSelect.addEventListener("change", () => {
  if (!state?.isHost || syncingOptions) return;
  socket.emit("updateHigherLowerOptions", { maximum: Number(rangeSelect.value), rounds: Number(roundsSelect.value) });
});
roundsSelect.addEventListener("change", () => {
  if (!state?.isHost || syncingOptions) return;
  socket.emit("updateHigherLowerOptions", { maximum: Number(rangeSelect.value), rounds: Number(roundsSelect.value) });
});
startBtn.addEventListener("click", () => socket.emit("startHigherLowerGame"));

secretRange.addEventListener("input", () => syncSecretControls(secretRange.value));
secretInput.addEventListener("input", () => syncSecretControls(secretInput.value));
randomSecretBtn.addEventListener("click", () => syncSecretControls(1 + Math.floor(Math.random() * state.options.maximum)));
lockNumberBtn.addEventListener("click", () => {
  if (!state || state.me.secretLocked) return;
  const number = clampWhole(secretInput.value, 1, state.options.maximum);
  syncSecretControls(number);
  lockNumberBtn.disabled = true;
  socket.emit("lockHigherLowerNumber", { number });
});

guessRange.addEventListener("input", () => syncGuessControls(guessRange.value));
guessInput.addEventListener("input", () => syncGuessControls(guessInput.value));
guessInput.addEventListener("keydown", (event) => { if (event.key === "Enter") submitGuess(); });
guessBtn.addEventListener("click", submitGuess);
restartBtn.addEventListener("click", () => socket.emit("restartHigherLowerToLobby"));

socket.on("higherLowerState", (nextState) => {
  state = nextState;
  serverClockOffset = state.serverNow - Date.now();
  welcomeError.textContent = "";
  lobbyError.textContent = "";
  playError.textContent = "";
  if (["waiting", "settings"].includes(state.phase)) renderLobby();
  else renderPlay();
});

socket.on("higherLowerError", (message) => {
  const target = playArea.classList.contains("hidden")
    ? (lobby.classList.contains("hidden") ? welcomeError : lobbyError)
    : playError;
  showError(target, message);
  if (state?.phase === "choosing") lockNumberBtn.disabled = state.me.secretLocked;
  if (state?.phase === "play") guessBtn.disabled = state.currentTurnId !== state.me.id;
});
