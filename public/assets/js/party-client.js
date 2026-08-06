(function initialiseArcadeParty() {
  "use strict";

  const STORAGE_KEY = "mini-game-arcade-party-v1";
  const GAME_CONFIG = {
    "number-hunt": { namespace: "/number-hunt", create: "createRoom", join: "joinRoom", state: "state" },
    "colour-memory": { namespace: "/colour-memory", create: "createColourRoom", join: "joinColourRoom", state: "colourState" },
    "pixel-drawing": { namespace: "/pixel-drawing", create: "createPixelRoom", join: "joinPixelRoom", state: "pixelState" },
    "connect-dots": { namespace: "/connect-dots", create: "createDotsRoom", join: "joinDotsRoom", state: "dotsState" },
    maze: { namespace: "/maze", create: "createMazeRoom", join: "joinMazeRoom", state: "mazeState" },
    "connect-four": { namespace: "/connect-four", create: "createFourRoom", join: "joinFourRoom", state: "fourState" },
    timer: { namespace: "/timer", create: "createTimerRoom", join: "joinTimerRoom", state: "timerState" },
    "memory-match": { namespace: "/memory-match", create: "createMemoryMatchRoom", join: "joinMemoryMatchRoom", state: "memoryMatchState" },
    "higher-lower": { namespace: "/higher-lower", create: "createHigherLowerRoom", join: "joinHigherLowerRoom", state: "higherLowerState" }
  };

  const originalCreateArcadeSocket = window.createArcadeSocket;
  if (typeof originalCreateArcadeSocket !== "function") return;

  const gameId = (window.location.pathname.match(/^\/games\/([a-z0-9-]+)\/?$/) || [])[1] || null;
  const gameConfig = gameId ? GAME_CONFIG[gameId] : null;
  const pageInstance = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let session = readSession();
  let partyState = null;
  let gameSocket = null;
  let gameSocketConnected = false;
  let pathReady = false;
  let createSent = false;
  let joinSentForCode = "";
  let publishedRoomCode = "";
  let pathAnnounced = false;
  let partyPanel = null;
  let partyError = null;
  let leavingParty = false;

  function currentPath() {
    if (window.location.pathname === "/") return "/";
    return window.location.pathname.endsWith("/")
      ? window.location.pathname
      : `${window.location.pathname}/`;
  }

  function readSession() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
      return parsed?.code && parsed?.token ? parsed : null;
    } catch (_error) {
      return null;
    }
  }

  function saveSession(nextState) {
    session = {
      code: nextState.code,
      token: nextState.token,
      name: nextState.name || "Player",
      isHost: Boolean(nextState.isHost)
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }

  function clearSession() {
    session = null;
    partyState = null;
    window.localStorage.removeItem(STORAGE_KEY);
    document.body.classList.remove("party-active", "party-auto-joining");
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>'"]/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;"
    }[character]));
  }

  function copyPartyCode(button) {
    const code = partyState?.code || session?.code;
    if (!code) return;
    const finish = () => {
      const original = button.textContent;
      button.textContent = "Copied";
      window.setTimeout(() => { button.textContent = original; }, 1100);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(code).then(finish).catch(() => {});
      return;
    }
    const input = document.createElement("textarea");
    input.value = code;
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    input.remove();
    finish();
  }

  function setError(message) {
    if (partyError) partyError.textContent = message || "";
  }

  function renderLandingPanel() {
    if (window.location.pathname !== "/") return;
    if (!partyPanel) {
      partyPanel = document.createElement("section");
      partyPanel.id = "arcadePartyPanel";
      partyPanel.className = "party-panel panel";
      const hero = document.querySelector(".hero");
      hero?.insertAdjacentElement("afterend", partyPanel);
    }

    if (!partyState) {
      partyPanel.innerHTML = `
        <div class="party-intro">
          <p class="party-kicker">Party mode</p>
          <h2>Enter one code. Keep playing together.</h2>
          <p>Create a party once, then the other player automatically follows the host into every game.</p>
        </div>
        <div class="party-actions">
          <label class="party-name-label">Player name
            <input id="partyNameInput" type="text" maxlength="24" placeholder="Player" value="${escapeHtml(session?.name || "")}">
          </label>
          <div class="party-button-row">
            <button id="createPartyBtn" class="party-primary" type="button">Create party</button>
            <div class="party-join-group">
              <input id="partyCodeInput" type="text" maxlength="5" placeholder="CODE" autocomplete="off" aria-label="Party code">
              <button id="joinPartyBtn" class="party-secondary" type="button">Join party</button>
            </div>
          </div>
          <p id="partyError" class="party-error" role="alert"></p>
        </div>`;
      partyError = partyPanel.querySelector("#partyError");
      const nameInput = partyPanel.querySelector("#partyNameInput");
      const codeInput = partyPanel.querySelector("#partyCodeInput");
      partyPanel.querySelector("#createPartyBtn").addEventListener("click", () => {
        setError("");
        partySocket.emit("createParty", { name: nameInput.value.trim() || "Player" });
      });
      partyPanel.querySelector("#joinPartyBtn").addEventListener("click", () => {
        const code = codeInput.value.trim().toUpperCase();
        if (code.length !== 5) {
          setError("Enter the five-character party code.");
          return;
        }
        setError("");
        partySocket.emit("joinParty", { code, name: nameInput.value.trim() || "Player" });
      });
      codeInput.addEventListener("input", () => { codeInput.value = codeInput.value.toUpperCase(); });
      codeInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") partyPanel.querySelector("#joinPartyBtn").click();
      });
      return;
    }

    const memberRows = [0, 1].map((index) => {
      const member = partyState.members[index];
      if (!member) {
        return '<div class="party-member waiting"><span class="party-member-dot"></span><span>Waiting for Player</span></div>';
      }
      return `<div class="party-member"><span class="party-member-dot ${member.connected ? "online" : ""}"></span><span>${escapeHtml(member.name)}${member.isHost ? " · Host" : ""}</span></div>`;
    }).join("");

    partyPanel.innerHTML = `
      <div class="party-intro active">
        <p class="party-kicker">Party active</p>
        <h2>${partyState.isHost ? "Choose a game for everyone" : "Waiting for the host"}</h2>
        <p>${partyState.isHost ? "Open any game below and the other player will be brought there automatically." : "You will automatically follow the host into the next game."}</p>
      </div>
      <div class="party-active-card">
        <div class="party-code-line"><span>Party code</span><strong>${escapeHtml(partyState.code)}</strong><button id="copyPartyBtn" type="button">Copy</button></div>
        <div class="party-members">${memberRows}</div>
        <button id="leavePartyBtn" class="party-leave" type="button">Leave party</button>
      </div>`;
    partyPanel.querySelector("#copyPartyBtn").addEventListener("click", (event) => copyPartyCode(event.currentTarget));
    partyPanel.querySelector("#leavePartyBtn").addEventListener("click", leaveParty);
  }

  function renderGameBar() {
    if (!gameConfig) return;
    let bar = document.getElementById("arcadePartyBar");
    if (!partyState) {
      bar?.remove();
      return;
    }
    if (!bar) {
      bar = document.createElement("aside");
      bar.id = "arcadePartyBar";
      bar.className = "party-game-bar";
      document.body.prepend(bar);
    }
    const other = partyState.members.find((member) => member.name !== partyState.name || member.isHost !== partyState.isHost);
    bar.innerHTML = `
      <div class="party-game-summary">
        <span class="party-live-dot"></span>
        <strong>Party ${escapeHtml(partyState.code)}</strong>
        <span>${partyState.isHost ? "You are host" : `${escapeHtml(partyState.members.find((member) => member.isHost)?.name || "Player")} is host`}</span>
        <span>${other ? `${escapeHtml(other.name)}${other.connected ? " connected" : " reconnecting"}` : "Waiting for Player"}</span>
      </div>
      <div class="party-game-actions">
        <a href="/">Games</a>
        <button type="button">Leave party</button>
      </div>`;
    bar.querySelector("button").addEventListener("click", leaveParty);
  }

  function render() {
    document.body.classList.toggle("party-active", Boolean(partyState));
    document.body.classList.toggle("party-auto-joining", Boolean(partyState && gameConfig));
    renderLandingPanel();
    renderGameBar();
  }

  function leaveParty() {
    leavingParty = true;
    partySocket.emit("leaveParty");
    clearSession();
    window.location.assign("/");
  }

  function maybeStartGameRoom() {
    if (!partyState || !gameConfig || !gameSocket || !gameSocketConnected) return;
    if (currentPath() !== partyState.currentPath) return;

    if (partyState.isHost) {
      if (!pathReady || createSent) return;
      createSent = true;
      gameSocket.emit(gameConfig.create, { name: partyState.name || "Player" });
      return;
    }

    partySocket.emit("partyReadyForGame", { gameId });
  }

  function attachGameSocket(socket) {
    gameSocket = socket;
    gameSocketConnected = Boolean(socket.connected);
    socket.on("connect", () => {
      gameSocketConnected = true;
      maybeStartGameRoom();
    });
    socket.on("disconnect", () => { gameSocketConnected = false; });
    socket.on(gameConfig.state, (nextState) => {
      if (!partyState?.isHost) return;
      const code = String(nextState?.roomCode || "").trim().toUpperCase();
      if (!code || code === publishedRoomCode) return;
      publishedRoomCode = code;
      partySocket.emit("publishPartyGameRoom", { gameId, roomCode: code });
    });
    maybeStartGameRoom();
  }

  window.createArcadeSocket = function partyAwareCreateArcadeSocket(namespace) {
    const socket = originalCreateArcadeSocket(namespace);
    if (gameConfig && namespace === gameConfig.namespace) attachGameSocket(socket);
    return socket;
  };

  const partySocket = originalCreateArcadeSocket("/party");

  partySocket.on("connect", () => {
    if (session) partySocket.emit("resumeParty", session);
    else render();
  });

  partySocket.on("partySession", (nextState) => {
    saveSession(nextState);
    partyState = nextState;
    render();

    if (!partyState.isHost && partyState.currentPath && currentPath() !== partyState.currentPath) {
      window.location.replace(partyState.currentPath);
      return;
    }

    if (partyState.isHost && !pathAnnounced) {
      pathAnnounced = true;
      partySocket.emit("setPartyPath", { path: currentPath(), pageInstance });
    } else if (!partyState.isHost) {
      maybeStartGameRoom();
    }
  });

  partySocket.on("partyPathReady", ({ path, navigationVersion } = {}) => {
    if (!partyState?.isHost) return;
    partyState.currentPath = path || currentPath();
    partyState.navigationVersion = navigationVersion ?? partyState.navigationVersion;
    pathReady = true;
    maybeStartGameRoom();
  });

  partySocket.on("partyNavigate", ({ path } = {}) => {
    if (partyState?.isHost) return;
    const destination = String(path || "/");
    if (currentPath() === destination) window.location.reload();
    else window.location.replace(destination);
  });

  partySocket.on("partyGameRoom", ({ gameId: targetGameId, roomCode, navigationVersion } = {}) => {
    if (!partyState || partyState.isHost || !gameConfig || targetGameId !== gameId) return;
    if (navigationVersion !== partyState.navigationVersion) return;
    const code = String(roomCode || "").trim().toUpperCase();
    if (!code || code === joinSentForCode || !gameSocketConnected) return;
    joinSentForCode = code;
    gameSocket.emit(gameConfig.join, { code, name: partyState.name || "Player" });
  });

  partySocket.on("partyError", (message) => setError(String(message || "Unable to join the party.")));
  partySocket.on("partyInvalid", (message) => {
    clearSession();
    render();
    setError(String(message || "This party is no longer available."));
  });
  partySocket.on("partyClosed", ({ message } = {}) => {
    clearSession();
    if (!leavingParty) window.alert(message || "The party has ended.");
    window.location.assign("/");
  });
  partySocket.on("partyLeft", () => {
    clearSession();
    window.location.assign("/");
  });

  render();
})();
