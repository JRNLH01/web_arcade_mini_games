const socket = createArcadeSocket("/colour-memory");

const welcome = document.getElementById("welcome");
const soloModeBtn = document.getElementById("soloModeBtn");
const multiModeBtn = document.getElementById("multiModeBtn");
const soloSetup = document.getElementById("soloSetup");
const multiSetup = document.getElementById("multiSetup");
const soloFlash = document.getElementById("soloFlash");
const soloGuess = document.getElementById("soloGuess");
const soloRounds = document.getElementById("soloRounds");
const startSoloBtn = document.getElementById("startSoloBtn");
const playerName = document.getElementById("playerName");
const roomInput = document.getElementById("roomInput");
const createRoomBtn = document.getElementById("createRoomBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const lobbyError = document.getElementById("lobbyError");

const multiplayerLobby = document.getElementById("multiplayerLobby");
const roomCode = document.getElementById("roomCode");
const copyRoomCodeBtn = document.getElementById("copyRoomCodeBtn");
const hostBadge = document.getElementById("hostBadge");
const roomStatus = document.getElementById("roomStatus");
const multiFlash = document.getElementById("multiFlash");
const multiGuess = document.getElementById("multiGuess");
const multiRounds = document.getElementById("multiRounds");
const playerList = document.getElementById("playerList");
const startMultiBtn = document.getElementById("startMultiBtn");
const hostHint = document.getElementById("hostHint");
const multiLobbyError = document.getElementById("multiLobbyError");

const playArea = document.getElementById("playArea");
const modeLabel = document.getElementById("modeLabel");
const roundLabel = document.getElementById("roundLabel");
const timerLabel = document.getElementById("timerLabel");
const restartBtn = document.getElementById("restartBtn");
const stageKicker = document.getElementById("stageKicker");
const stageTitle = document.getElementById("stageTitle");
const stageMessage = document.getElementById("stageMessage");
const flashView = document.getElementById("flashView");
const targetSwatch = document.getElementById("targetSwatch");
const guessView = document.getElementById("guessView");
const hueSlider = document.getElementById("hueSlider");
const hueMarker = document.getElementById("hueMarker");
const svPlane = document.getElementById("svPlane");
const svMarker = document.getElementById("svMarker");
const guessPreview = document.getElementById("guessPreview");
const hueValue = document.getElementById("hueValue");
const satValue = document.getElementById("satValue");
const valValue = document.getElementById("valValue");
const submitGuessBtn = document.getElementById("submitGuessBtn");
const submitHint = document.getElementById("submitHint");
const resultView = document.getElementById("resultView");
const resultTarget = document.getElementById("resultTarget");
const resultCards = document.getElementById("resultCards");
const nextSoloBtn = document.getElementById("nextSoloBtn");
const finalView = document.getElementById("finalView");
const finalTitle = document.getElementById("finalTitle");
const finalMessage = document.getElementById("finalMessage");
const finalRankings = document.getElementById("finalRankings");
const playAgainBtn = document.getElementById("playAgainBtn");
const scoreStrip = document.getElementById("scoreStrip");

let selectedMode = "solo";
let picker = { h: 0, s: 50, v: 50 };
let soloState = null;
let multiplayerState = null;
let serverClockOffset = 0;
let soloTimers = [];
let syncingMultiplayerOptions = false;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hsvToRgb({ h, s, v }) {
  const saturation = s / 100;
  const brightness = v / 100;
  const chroma = brightness * saturation;
  const hueSection = h / 60;
  const x = chroma * (1 - Math.abs((hueSection % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;

  if (hueSection < 1) [r, g, b] = [chroma, x, 0];
  else if (hueSection < 2) [r, g, b] = [x, chroma, 0];
  else if (hueSection < 3) [r, g, b] = [0, chroma, x];
  else if (hueSection < 4) [r, g, b] = [0, x, chroma];
  else if (hueSection < 5) [r, g, b] = [x, 0, chroma];
  else [r, g, b] = [chroma, 0, x];

  const match = brightness - chroma;
  return {
    r: Math.round((r + match) * 255),
    g: Math.round((g + match) * 255),
    b: Math.round((b + match) * 255)
  };
}

function colourCss(hsv) {
  if (!hsv) return "transparent";
  const { r, g, b } = hsvToRgb(hsv);
  return `rgb(${r}, ${g}, ${b})`;
}

function randomTarget() {
  return {
    h: Math.floor(Math.random() * 360),
    s: 35 + Math.floor(Math.random() * 66),
    v: 35 + Math.floor(Math.random() * 66)
  };
}

function scoreGuess(target, guess) {
  const rawHueDifference = Math.abs(target.h - guess.h);
  const hueDifference = Math.min(rawHueDifference, 360 - rawHueDifference);
  const hue = Math.max(0, 1 - hueDifference / 180);
  const saturation = Math.max(0, 1 - Math.abs(target.s - guess.s) / 100);
  const brightness = Math.max(0, 1 - Math.abs(target.v - guess.v) / 100);
  return {
    accuracy: Math.round((hue * 0.5 + saturation * 0.25 + brightness * 0.25) * 10000) / 100,
    hue: Math.round(hue * 10000) / 100,
    saturation: Math.round(saturation * 10000) / 100,
    brightness: Math.round(brightness * 10000) / 100
  };
}

function setMode(mode) {
  selectedMode = mode;
  const solo = mode === "solo";
  soloModeBtn.classList.toggle("active", solo);
  multiModeBtn.classList.toggle("active", !solo);
  soloSetup.classList.toggle("hidden", !solo);
  multiSetup.classList.toggle("hidden", solo);
}

soloModeBtn.addEventListener("click", () => setMode("solo"));
multiModeBtn.addEventListener("click", () => setMode("multi"));

function clearSoloTimers() {
  for (const timer of soloTimers) clearTimeout(timer);
  soloTimers = [];
}

function scheduleSolo(callback, delay) {
  const timer = setTimeout(callback, delay);
  soloTimers.push(timer);
}

function resetPicker() {
  picker = { h: 0, s: 50, v: 50 };
  renderPicker();
}

function renderPicker() {
  hueMarker.style.top = `${(picker.h / 359) * 100}%`;
  svMarker.style.left = `${picker.s}%`;
  svMarker.style.top = `${100 - picker.v}%`;
  svPlane.style.background = `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), hsl(${picker.h} 100% 50%)`;
  guessPreview.style.background = colourCss(picker);
  hueValue.textContent = `${picker.h}°`;
  satValue.textContent = `${picker.s}%`;
  valValue.textContent = `${picker.v}%`;
  hueSlider.setAttribute("aria-valuenow", String(picker.h));

  if (selectedMode === "multi" && multiplayerState?.phase === "guess" && !multiplayerState.me.submitted) {
    socket.emit("updateColourDraft", { guess: picker });
  }
}

function usePointer(element, update) {
  function handle(event) {
    const rect = element.getBoundingClientRect();
    update(event.clientX - rect.left, event.clientY - rect.top, rect);
  }
  element.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    element.setPointerCapture(event.pointerId);
    handle(event);
  });
  element.addEventListener("pointermove", (event) => {
    if (!element.hasPointerCapture(event.pointerId)) return;
    event.preventDefault();
    handle(event);
  });
}

usePointer(hueSlider, (_x, y, rect) => {
  picker.h = Math.round(clamp(y / rect.height, 0, 1) * 359);
  renderPicker();
});

usePointer(svPlane, (x, y, rect) => {
  picker.s = Math.round(clamp(x / rect.width, 0, 1) * 100);
  picker.v = Math.round((1 - clamp(y / rect.height, 0, 1)) * 100);
  renderPicker();
});

hueSlider.addEventListener("keydown", (event) => {
  if (!["ArrowUp", "ArrowDown"].includes(event.key)) return;
  event.preventDefault();
  picker.h = (picker.h + (event.key === "ArrowDown" ? 2 : -2) + 360) % 360;
  renderPicker();
});

svPlane.addEventListener("keydown", (event) => {
  const moves = {
    ArrowLeft: [-2, 0],
    ArrowRight: [2, 0],
    ArrowUp: [0, 2],
    ArrowDown: [0, -2]
  };
  if (!moves[event.key]) return;
  event.preventDefault();
  picker.s = clamp(picker.s + moves[event.key][0], 0, 100);
  picker.v = clamp(picker.v + moves[event.key][1], 0, 100);
  renderPicker();
});

function hideStageViews() {
  flashView.classList.add("hidden");
  guessView.classList.add("hidden");
  resultView.classList.add("hidden");
  finalView.classList.add("hidden");
}


function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatScore(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function createResultCard(name, guess, score, isWinner) {
  const card = document.createElement("article");
  card.className = `result-card${isWinner ? " winner" : ""}`;

  const swatch = document.createElement("div");
  swatch.className = "player-swatch";
  if (guess) swatch.style.background = colourCss(guess);

  const details = document.createElement("div");
  const heading = document.createElement("h3");
  heading.textContent = `${isWinner ? "★ " : ""}${name}`;
  const accuracy = document.createElement("p");
  accuracy.className = "accuracy";
  accuracy.textContent = formatScore(score?.accuracy);
  const components = document.createElement("div");
  components.className = "component-scores";
  components.innerHTML = `
    <span>Hue ${formatScore(score?.hue)}</span>
    <span>Saturation ${formatScore(score?.saturation)}</span>
    <span>Brightness ${formatScore(score?.brightness)}</span>
  `;
  details.append(heading, accuracy, components);
  card.append(swatch, details);
  return card;
}

function renderSoloScoreStrip() {
  scoreStrip.innerHTML = "";
  const average = soloState.scores.length
    ? soloState.scores.reduce((sum, round) => sum + round.score.accuracy, 0) / soloState.scores.length
    : 0;
  const pill = document.createElement("div");
  pill.className = "score-pill";
  pill.innerHTML = `<span>Current average</span><span>${formatScore(average)}</span>`;
  scoreStrip.appendChild(pill);
}

function startSolo() {
  clearSoloTimers();
  selectedMode = "solo";
  soloState = {
    options: {
      flashSeconds: Number(soloFlash.value),
      guessSeconds: Number(soloGuess.value),
      rounds: Number(soloRounds.value)
    },
    round: 0,
    phase: "",
    phaseEndsAt: null,
    target: null,
    scores: [],
    currentScore: null
  };
  welcome.classList.add("hidden");
  multiplayerLobby.classList.add("hidden");
  playArea.classList.remove("hidden");
  startSoloRound();
}

function startSoloRound() {
  clearSoloTimers();
  soloState.round += 1;
  soloState.phase = "flash";
  soloState.target = randomTarget();
  soloState.currentScore = null;
  soloState.phaseEndsAt = Date.now() + soloState.options.flashSeconds * 1000;
  resetPicker();
  renderSolo();
  scheduleSolo(beginSoloGuess, soloState.options.flashSeconds * 1000);
}

function beginSoloGuess() {
  if (soloState?.phase !== "flash") return;
  soloState.phase = "guess";
  soloState.phaseEndsAt = Date.now() + soloState.options.guessSeconds * 1000;
  renderSolo();
  scheduleSolo(() => submitSoloGuess(true), soloState.options.guessSeconds * 1000);
}

function submitSoloGuess(auto = false) {
  if (soloState?.phase !== "guess") return;
  clearSoloTimers();
  const guess = { ...picker };
  const score = scoreGuess(soloState.target, guess);
  soloState.currentScore = { guess, score };
  soloState.scores.push({ round: soloState.round, guess, score, target: soloState.target });
  soloState.phase = "result";
  soloState.phaseEndsAt = null;
  soloState.autoSubmitted = auto;
  renderSolo();
}

function finishSolo() {
  clearSoloTimers();
  soloState.phase = "final";
  soloState.phaseEndsAt = null;
  renderSolo();
}

function renderSolo() {
  modeLabel.textContent = "Solo";
  roundLabel.textContent = `${soloState.round} / ${soloState.options.rounds}`;
  hideStageViews();

  if (soloState.phase === "flash") {
    stageKicker.textContent = "Memorise";
    stageTitle.textContent = "Remember this colour";
    stageMessage.textContent = `It will disappear after ${soloState.options.flashSeconds} second${soloState.options.flashSeconds === 1 ? "" : "s"}.`;
    targetSwatch.style.background = colourCss(soloState.target);
    flashView.classList.remove("hidden");
  } else if (soloState.phase === "guess") {
    stageKicker.textContent = "Recreate";
    stageTitle.textContent = "Match the colour from memory";
    stageMessage.textContent = "Adjust hue, saturation and brightness, then lock in your answer.";
    submitGuessBtn.disabled = false;
    submitGuessBtn.textContent = "Lock in colour";
    submitHint.textContent = "Your current colour is automatically used when time runs out.";
    guessView.classList.remove("hidden");
    renderPicker();
  } else if (soloState.phase === "result") {
    stageKicker.textContent = `Round ${soloState.round} result`;
    stageTitle.textContent = soloState.autoSubmitted ? "Time up — here is your score" : "Your colour accuracy";
    stageMessage.textContent = "Accuracy uses 50% hue, 25% saturation and 25% brightness.";
    resultTarget.style.background = colourCss(soloState.target);
    resultCards.innerHTML = "";
    resultCards.classList.add("solo-result");
    resultCards.appendChild(createResultCard("Your guess", soloState.currentScore.guess, soloState.currentScore.score, true));
    nextSoloBtn.textContent = soloState.round >= soloState.options.rounds ? "View final score" : "Next round";
    nextSoloBtn.classList.remove("hidden");
    resultView.classList.remove("hidden");
  } else if (soloState.phase === "final") {
    const average = soloState.scores.reduce((sum, round) => sum + round.score.accuracy, 0) / soloState.scores.length;
    stageKicker.textContent = "Finished";
    stageTitle.textContent = "";
    stageMessage.textContent = "";
    finalTitle.textContent = "Solo game complete";
    finalMessage.textContent = `Your average accuracy was ${average.toFixed(2)}%.`;
    finalRankings.innerHTML = soloState.scores
      .map((round, index) => `<div class="rank-row"><span class="rank-number">${index + 1}</span><strong>Round ${round.round}</strong><span class="rank-score">${formatScore(round.score.accuracy)}</span></div>`)
      .join("");
    finalView.classList.remove("hidden");
  }

  renderSoloScoreStrip();
}

startSoloBtn.addEventListener("click", startSolo);
nextSoloBtn.addEventListener("click", () => {
  if (!soloState || soloState.phase !== "result") return;
  if (soloState.round >= soloState.options.rounds) finishSolo();
  else startSoloRound();
});

function showLobbyError(message) {
  const target = multiplayerLobby.classList.contains("hidden") ? lobbyError : multiLobbyError;
  target.textContent = message;
  setTimeout(() => {
    if (target.textContent === message) target.textContent = "";
  }, 2800);
}

roomInput.addEventListener("input", () => {
  roomInput.value = roomInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
});

createRoomBtn.addEventListener("click", () => {
  selectedMode = "multi";
  socket.emit("createColourRoom", { name: playerName.value });
});

joinRoomBtn.addEventListener("click", () => {
  const code = roomInput.value.trim().toUpperCase();
  if (!code) return showLobbyError("Enter a room code.");
  selectedMode = "multi";
  socket.emit("joinColourRoom", { code, name: playerName.value });
});

copyRoomCodeBtn.addEventListener("click", async () => {
  if (!multiplayerState?.roomCode) return;
  try {
    await navigator.clipboard.writeText(multiplayerState.roomCode);
    copyRoomCodeBtn.textContent = "Copied";
    setTimeout(() => { copyRoomCodeBtn.textContent = "Copy"; }, 900);
  } catch {
    multiLobbyError.textContent = "Could not copy automatically. Select the code manually.";
    setTimeout(() => { multiLobbyError.textContent = ""; }, 2800);
  }
});

function sendMultiplayerOptions() {
  if (syncingMultiplayerOptions || !multiplayerState?.isHost) return;
  socket.emit("updateColourOptions", {
    flashSeconds: Number(multiFlash.value),
    guessSeconds: Number(multiGuess.value),
    rounds: Number(multiRounds.value)
  });
}

multiFlash.addEventListener("change", sendMultiplayerOptions);
multiGuess.addEventListener("change", sendMultiplayerOptions);
multiRounds.addEventListener("change", sendMultiplayerOptions);
startMultiBtn.addEventListener("click", () => socket.emit("startColourGame"));

function renderMultiplayerLobby() {
  welcome.classList.add("hidden");
  playArea.classList.add("hidden");
  multiplayerLobby.classList.remove("hidden");
  roomCode.textContent = multiplayerState.roomCode;
  roomStatus.textContent = multiplayerState.message;

  syncingMultiplayerOptions = true;
  multiFlash.value = String(multiplayerState.options.flashSeconds);
  multiGuess.value = String(multiplayerState.options.guessSeconds);
  multiRounds.value = String(multiplayerState.options.rounds);
  const locked = !multiplayerState.isHost || multiplayerState.phase !== "settings";
  multiFlash.disabled = locked;
  multiGuess.disabled = locked;
  multiRounds.disabled = locked;
  startMultiBtn.disabled = locked || multiplayerState.players.length !== 2;
  syncingMultiplayerOptions = false;

  playerList.innerHTML = multiplayerState.players
    .map((player) => `<div class="player-chip"><span class="player-dot"></span><span>${escapeHtml(player.name)}${player.id === multiplayerState.me.id ? " (you)" : ""}</span></div>`)
    .join("");
  if (multiplayerState.players.length < 2) {
    playerList.insertAdjacentHTML("beforeend", '<div class="player-chip"><span class="player-dot" style="background:#c8cad3"></span><span>Waiting...</span></div>');
  }
  hostBadge.textContent = multiplayerState.isHost
    ? "You are host"
    : `${multiplayerState.hostName || "Host"} is host`;
  startMultiBtn.textContent = multiplayerState.isHost
    ? (multiplayerState.players.length === 2 ? "Start game" : "Waiting for player 2")
    : "Waiting for host";
  hostHint.textContent = multiplayerState.isHost
    ? "Your settings update for both players."
    : "Only the host can change settings and start the game.";
}

function renderMultiplayerScoreStrip() {
  scoreStrip.innerHTML = "";
  for (const player of multiplayerState.players) {
    const pill = document.createElement("div");
    pill.className = "score-pill";
    const status = multiplayerState.phase === "guess"
      ? (player.submitted ? "Locked in" : "Choosing...")
      : `${Number(player.average || 0).toFixed(2)}% avg`;
    pill.innerHTML = `<span>${escapeHtml(player.name)}${player.id === multiplayerState.me.id ? " (you)" : ""}</span><span>${status}</span>`;
    scoreStrip.appendChild(pill);
  }
}

function renderFinalRankings(rankings) {
  finalRankings.innerHTML = rankings.map((entry, index) => `
    <div class="rank-row">
      <span class="rank-number">${index + 1}</span>
      <strong>${escapeHtml(entry.name)}<br><small>${entry.roundWins} round win${entry.roundWins === 1 ? "" : "s"}</small></strong>
      <span class="rank-score">${formatScore(entry.average)}</span>
    </div>
  `).join("");
}

function renderMultiplayerGame() {
  welcome.classList.add("hidden");
  multiplayerLobby.classList.add("hidden");
  playArea.classList.remove("hidden");
  modeLabel.textContent = `2 Player · ${multiplayerState.roomCode}`;
  roundLabel.textContent = `${multiplayerState.round} / ${multiplayerState.totalRounds}`;
  hideStageViews();
  nextSoloBtn.classList.add("hidden");

  if (multiplayerState.phase === "flash") {
    stageKicker.textContent = "Both players memorise";
    stageTitle.textContent = "Remember this colour";
    stageMessage.textContent = "You and your opponent are seeing the same target.";
    targetSwatch.style.background = colourCss(multiplayerState.target);
    flashView.classList.remove("hidden");
  } else if (multiplayerState.phase === "guess") {
    stageKicker.textContent = "Compete for closest accuracy";
    stageTitle.textContent = multiplayerState.me.submitted ? "Colour locked in" : "Recreate the colour";
    stageMessage.textContent = multiplayerState.message;
    submitGuessBtn.disabled = multiplayerState.me.submitted;
    submitGuessBtn.textContent = multiplayerState.me.submitted ? "Locked in ✓" : "Lock in colour";
    submitHint.textContent = multiplayerState.me.submitted
      ? "Waiting for the other player or the timer."
      : "Your current colour is automatically used when time runs out.";
    guessView.classList.remove("hidden");
    renderPicker();
  } else if (multiplayerState.phase === "result") {
    stageKicker.textContent = `Round ${multiplayerState.round} result`;
    stageTitle.textContent = multiplayerState.message;
    stageMessage.textContent = "The next round starts automatically.";
    resultTarget.style.background = colourCss(multiplayerState.target);
    resultCards.innerHTML = "";
    resultCards.classList.remove("solo-result");
    const winnerIds = multiplayerState.lastRound?.winnerIds || [];
    for (const player of multiplayerState.players) {
      resultCards.appendChild(createResultCard(player.name, player.guess, player.score, winnerIds.includes(player.id)));
    }
    resultView.classList.remove("hidden");
  } else if (multiplayerState.phase === "final") {
    stageKicker.textContent = "Final result";
    stageTitle.textContent = "";
    stageMessage.textContent = "";
    finalTitle.textContent = "Competition complete";
    finalMessage.textContent = multiplayerState.message;
    renderFinalRankings(multiplayerState.rankings);
    finalView.classList.remove("hidden");
  }

  renderMultiplayerScoreStrip();
}

submitGuessBtn.addEventListener("click", () => {
  if (selectedMode === "solo") submitSoloGuess(false);
  else if (multiplayerState?.phase === "guess" && !multiplayerState.me.submitted) {
    socket.emit("submitColourGuess", { guess: picker });
  }
});

function returnToStart() {
  clearSoloTimers();
  soloState = null;
  multiplayerState = null;
  playArea.classList.add("hidden");
  multiplayerLobby.classList.add("hidden");
  welcome.classList.remove("hidden");
  timerLabel.textContent = "—";
}

restartBtn.addEventListener("click", () => {
  if (selectedMode === "multi" && multiplayerState) socket.emit("restartColourLobby");
  else returnToStart();
});

playAgainBtn.addEventListener("click", () => {
  if (selectedMode === "multi" && multiplayerState) socket.emit("restartColourLobby");
  else returnToStart();
});

socket.on("colourState", (state) => {
  selectedMode = "multi";
  multiplayerState = state;
  serverClockOffset = state.serverNow - Date.now();

  if (["waiting", "settings"].includes(state.phase)) renderMultiplayerLobby();
  else {
    if (state.phase === "guess" && !state.me.submitted && multiplayerState.round !== Number(guessView.dataset.round || -1)) {
      guessView.dataset.round = String(multiplayerState.round);
      resetPicker();
      socket.emit("updateColourDraft", { guess: picker });
    }
    renderMultiplayerGame();
  }
});

socket.on("colourError", showLobbyError);

setInterval(() => {
  let endsAt = null;
  let now = Date.now();
  if (selectedMode === "solo" && soloState) {
    endsAt = soloState.phaseEndsAt;
  } else if (selectedMode === "multi" && multiplayerState) {
    endsAt = multiplayerState.phaseEndsAt;
    now += serverClockOffset;
  }

  if (!endsAt) {
    timerLabel.textContent = "—";
    return;
  }
  const remaining = Math.max(0, endsAt - now);
  timerLabel.textContent = `${(remaining / 1000).toFixed(1)}s`;
}, 100);

setMode("solo");
resetPicker();
