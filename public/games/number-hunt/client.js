const socket = createArcadeSocket("/number-hunt");

const lobby = document.getElementById("lobby");
const game = document.getElementById("game");
const settingsLobby = document.getElementById("settingsLobby");
const gameTopbar = document.getElementById("gameTopbar");
const gameArena = document.getElementById("gameArena");

const nameInput = document.getElementById("nameInput");
const roomInput = document.getElementById("roomInput");
const createBtn = document.getElementById("createBtn");
const joinBtn = document.getElementById("joinBtn");
const lobbyError = document.getElementById("lobbyError");

const roomCodeEl = document.getElementById("roomCode");
const gameRoomCodeEl = document.getElementById("gameRoomCode");
const copyRoomCodeBtn = document.getElementById("copyRoomCodeBtn");
const hostBadge = document.getElementById("hostBadge");
const playerList = document.getElementById("playerList");
const statusEl = document.getElementById("status");
const restartBtn = document.getElementById("restartBtn");

const settingsTitle = document.getElementById("settingsTitle");
const settingsNote = document.getElementById("settingsNote");
const boardGridSelect = document.getElementById("boardGridSelect");
const cardGridSelect = document.getElementById("cardGridSelect");
const boardGridHelp = document.getElementById("boardGridHelp");
const cardGridHelp = document.getElementById("cardGridHelp");
const startBtn = document.getElementById("startBtn");
const hostHint = document.getElementById("hostHint");
const settingsError = document.getElementById("settingsError");

const mainInstruction = document.getElementById("mainInstruction");
const calledNumberEl = document.getElementById("calledNumber");
const fillBtn = document.getElementById("fillBtn");

const numberBoard = document.getElementById("numberBoard");
const boardHint = document.getElementById("boardHint");
const myCard = document.getElementById("myCard");
const oppCard = document.getElementById("oppCard");
const myProgress = document.getElementById("myProgress");
const oppProgress = document.getElementById("oppProgress");

let state = null;
let wrongCellTimer = null;
let syncingOptions = false;

function cleanRoomCode(value) {
  return String(value || "").trim().toUpperCase();
}

function showError(message) {
  const target = !settingsLobby.classList.contains("hidden") ? settingsError : lobbyError;
  target.textContent = message;
  setTimeout(() => {
    if (target.textContent === message) target.textContent = "";
  }, 2600);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function boardTotal() {
  return state?.options ? state.options.boardGrid * state.options.boardGrid : 100;
}

function cardTotal() {
  return state?.options ? state.options.cardGrid * state.options.cardGrid : 100;
}

createBtn.addEventListener("click", () => {
  socket.emit("createRoom", { name: nameInput.value });
});

joinBtn.addEventListener("click", () => {
  const code = cleanRoomCode(roomInput.value);
  if (!code) {
    showError("Enter a room code.");
    return;
  }
  socket.emit("joinRoom", { code, name: nameInput.value });
});

roomInput.addEventListener("input", () => {
  roomInput.value = cleanRoomCode(roomInput.value);
});

function sendOptionsUpdate() {
  if (!state?.isHost || syncingOptions) return;

  socket.emit("updateOptions", {
    boardGrid: Number(boardGridSelect.value),
    cardGrid: Number(cardGridSelect.value)
  });
}

boardGridSelect.addEventListener("change", sendOptionsUpdate);
cardGridSelect.addEventListener("change", sendOptionsUpdate);

startBtn.addEventListener("click", () => {
  socket.emit("startGame");
});

copyRoomCodeBtn.addEventListener("click", async () => {
  if (!state?.roomCode) return;
  try {
    await navigator.clipboard.writeText(state.roomCode);
    copyRoomCodeBtn.textContent = "Copied";
    setTimeout(() => { copyRoomCodeBtn.textContent = "Copy"; }, 900);
  } catch {
    settingsError.textContent = "Could not copy automatically. Select the code manually.";
    setTimeout(() => { settingsError.textContent = ""; }, 2600);
  }
});

restartBtn.addEventListener("click", () => {
  socket.emit("restartToLobby");
});

fillBtn.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  if (canFill()) socket.emit("fillX");
});

// Stop Space from scrolling the browser during the game.
// Space still fills X's when it is your filling turn.
document.addEventListener("keydown", (event) => {
  if (event.code !== "Space") return;

  const gameVisible = !game.classList.contains("hidden");
  if (!gameVisible) return;

  event.preventDefault();

  if (state && canFill()) {
    socket.emit("fillX");
  }
}, { passive: false });

function canChoose() {
  return state?.phase === "choose" && state?.turnId === state?.me?.id;
}

function canHunt() {
  return state?.phase === "filling" && state?.turnId !== state?.me?.id;
}

function canFill() {
  return state?.phase === "filling" && state?.turnId === state?.me?.id;
}

function setGridVariables() {
  const boardGrid = state?.options?.boardGrid || 10;
  const cardGrid = state?.options?.cardGrid || 10;

  numberBoard.style.setProperty("--grid-size", boardGrid);
  myCard.style.setProperty("--grid-size", cardGrid);
  oppCard.style.setProperty("--card-grid-size", cardGrid);
}

function syncSettingsControls() {
  syncingOptions = true;

  const boardGrid = state?.options?.boardGrid || 10;
  const cardGrid = state?.options?.cardGrid || 10;

  boardGridSelect.value = String(boardGrid);
  cardGridSelect.value = String(cardGrid);

  boardGridHelp.textContent = `${boardGrid * boardGrid} numbers`;
  cardGridHelp.textContent = `${cardGrid * cardGrid} X boxes`;

  const disableControls = !state?.isHost || state?.phase !== "settings";
  boardGridSelect.disabled = disableControls;
  cardGridSelect.disabled = disableControls;
  startBtn.disabled = disableControls || state?.players?.length !== 2;

  settingsTitle.textContent = "Choose how to play";

  settingsNote.textContent = state?.message || (state?.players?.length === 2
    ? `Current setup: board ${boardGrid}×${boardGrid}, card ${cardGrid}×${cardGrid}.`
    : "Share the room code with another player.");

  startBtn.textContent = state?.isHost
    ? (state?.players?.length === 2 ? "Start game" : "Waiting for player 2")
    : "Waiting for host";

  hostHint.textContent = state?.isHost
    ? "Your settings update for both players."
    : "Only the host can change settings and start the game.";

  syncingOptions = false;
}

function renderBoard() {
  numberBoard.innerHTML = "";

  const activeChoose = canChoose();
  const activeHunt = canHunt();

  state.me.board.forEach((num) => {
    const btn = document.createElement("button");
    btn.className = "numberCell";
    btn.textContent = num;

    const crossed = state.me.crossed.includes(num);
    if (crossed) btn.classList.add("crossed");
    if (activeChoose && !crossed) btn.classList.add("active");
    if (activeHunt && !crossed) btn.classList.add("hunt");

    btn.disabled = crossed || !(activeChoose || activeHunt);

    btn.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      if (btn.disabled) return;

      btn.classList.add("selectedNow");
      btn.disabled = true;

      if (activeChoose) socket.emit("pickNumber", { number: num });
      if (activeHunt) socket.emit("cancelNumber", { number: num });
    });

    numberBoard.appendChild(btn);
  });
}

function renderCard(container, card, total) {
  container.innerHTML = "";

  const safeCard = card || Array(total).fill(false);
  safeCard.forEach((filled) => {
    const cell = document.createElement("div");
    cell.className = "cardCell";
    if (filled) {
      cell.classList.add("filled");
      cell.textContent = "X";
    }
    container.appendChild(cell);
  });
}

function renderInstructions() {
  const myFilled = state.me.card.filter(Boolean).length;
  const oppFilled = state.opponent?.filledCount || 0;
  const total = cardTotal();

  myProgress.textContent = `${myFilled}/${total}`;
  oppProgress.textContent = `${oppFilled}/${total}`;

  gameRoomCodeEl.textContent = state.roomCode;
  statusEl.textContent = state.message || "Game on";

  calledNumberEl.textContent = "";
  fillBtn.classList.add("hidden");
  fillBtn.disabled = true;

  if (state.phase === "choose") {
    if (canChoose()) {
      mainInstruction.textContent = "Your turn: choose a number from your board.";
      boardHint.textContent = "Choose";
    } else {
      mainInstruction.textContent = `${state.turnName} is choosing a number. Get ready to hunt.`;
      boardHint.textContent = "Locked";
    }
    return;
  }

  if (state.phase === "filling") {
    calledNumberEl.textContent = state.calledNumber;

    if (canFill()) {
      mainInstruction.textContent = `You called ${state.calledNumber}. Tap fast to fill your X card!`;
      boardHint.textContent = "Locked";
      fillBtn.classList.remove("hidden");
      fillBtn.disabled = false;
    } else {
      mainInstruction.textContent = `Find and cancel ${state.calledNumber} on your board!`;
      boardHint.textContent = "Hunt";
    }
    return;
  }

  if (state.phase === "gameover") {
    const iWon = state.winnerName === state.me.name;
    mainInstruction.textContent = iWon ? "You win!" : `${state.winnerName} wins!`;
    calledNumberEl.textContent = iWon ? "🏆" : "GG";
    boardHint.textContent = "Finished";
  }
}

function render() {
  if (!state) return;

  lobby.classList.add("hidden");
  game.classList.remove("hidden");

  roomCodeEl.textContent = state.roomCode;
  gameRoomCodeEl.textContent = state.roomCode;
  statusEl.textContent = state.message || "Waiting...";
  restartBtn.classList.toggle("hidden", state.phase === "waiting" && state.players.length < 2);

  const inSettings = state.phase === "waiting" || state.phase === "settings";
  settingsLobby.classList.toggle("hidden", !inSettings);
  gameTopbar.classList.toggle("hidden", inSettings);
  gameArena.classList.toggle("hidden", inSettings);

  hostBadge.textContent = state.isHost ? "You are host" : `${state.hostName || "Host"} is host`;
  playerList.innerHTML = state.players
    .map((player) => `<div class="player-chip"><span class="player-dot"></span><span>${escapeHtml(player.name)}${player.id === state.me.id ? " (you)" : ""}</span></div>`)
    .join("");
  if (state.players.length < 2) {
    playerList.insertAdjacentHTML("beforeend", '<div class="player-chip"><span class="player-dot" style="background:#c8cad3"></span><span>Waiting...</span></div>');
  }

  syncSettingsControls();
  setGridVariables();

  if (inSettings) return;

  renderInstructions();
  renderBoard();
  renderCard(myCard, state.me.card, cardTotal());
  renderCard(oppCard, state.opponent?.card, cardTotal());
}

socket.on("state", (newState) => {
  state = newState;
  render();
});

socket.on("errorMessage", (message) => {
  showError(message);
});

socket.on("wrongGuess", (num) => {
  const cells = [...numberBoard.children];
  const target = cells.find(cell => cell.textContent === String(num));
  if (!target) return;

  target.classList.add("wrong");
  clearTimeout(wrongCellTimer);
  wrongCellTimer = setTimeout(() => target.classList.remove("wrong"), 300);
});
