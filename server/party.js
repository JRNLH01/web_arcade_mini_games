const crypto = require("crypto");

const PARTY_SIZE = 2;
const PARTY_TTL_MS = 6 * 60 * 60 * 1000;

function randomCode(parties) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  } while (parties.has(code));
  return code;
}

function randomToken() {
  return crypto.randomBytes(24).toString("hex");
}

function cleanName(value) {
  return String(value || "Player").trim().slice(0, 24) || "Player";
}

function cleanCode(value) {
  return String(value || "").trim().toUpperCase();
}

function cleanPath(value) {
  const path = String(value || "/").split("?")[0].split("#")[0];
  if (path === "/") return "/";
  if (/^\/games\/[a-z0-9-]+\/?$/.test(path)) return path.endsWith("/") ? path : `${path}/`;
  return "/";
}

function gameIdFromPath(path) {
  const match = cleanPath(path).match(/^\/games\/([a-z0-9-]+)\/$/);
  return match ? match[1] : null;
}

module.exports = function registerParty(partyNamespace) {
  const parties = new Map();

  function connectedSockets(member) {
    return member.socketIds.size;
  }

  function publicState(party, member) {
    return {
      code: party.code,
      token: member.token,
      name: member.name,
      isHost: member.token === party.hostToken,
      currentPath: party.currentPath,
      navigationVersion: party.navigationVersion,
      members: [...party.members.values()].map((candidate) => ({
        name: candidate.name,
        isHost: candidate.token === party.hostToken,
        connected: connectedSockets(candidate) > 0
      }))
    };
  }

  function emitState(party) {
    for (const member of party.members.values()) {
      for (const socketId of member.socketIds) {
        partyNamespace.to(socketId).emit("partySession", publicState(party, member));
      }
    }
  }

  function attachSocket(socket, party, member) {
    if (socket.data.partyCode && socket.data.partyCode !== party.code) {
      socket.leave(socket.data.partyCode);
    }
    socket.data.partyCode = party.code;
    socket.data.partyToken = member.token;
    member.socketIds.add(socket.id);
    member.lastSeenAt = Date.now();
    party.lastActivityAt = Date.now();
    socket.join(party.code);
  }

  function memberForSocket(socket) {
    const party = parties.get(socket.data.partyCode);
    const member = party?.members.get(socket.data.partyToken);
    return party && member ? { party, member } : null;
  }

  function closeParty(party, message) {
    partyNamespace.to(party.code).emit("partyClosed", {
      message: message || "The party has ended."
    });
    parties.delete(party.code);
  }

  partyNamespace.on("connection", (socket) => {
    socket.on("createParty", ({ name } = {}) => {
      const code = randomCode(parties);
      const token = randomToken();
      const member = {
        token,
        name: cleanName(name),
        socketIds: new Set(),
        lastSeenAt: Date.now()
      };
      const party = {
        code,
        hostToken: token,
        members: new Map([[token, member]]),
        currentPath: "/",
        navigationVersion: 0,
        lastHostPageInstance: null,
        gameRooms: new Map(),
        lastActivityAt: Date.now()
      };
      parties.set(code, party);
      attachSocket(socket, party, member);
      emitState(party);
    });

    socket.on("joinParty", ({ code, name } = {}) => {
      const party = parties.get(cleanCode(code));
      if (!party) {
        socket.emit("partyError", "Party not found. Check the code and try again.");
        return;
      }
      if (party.members.size >= PARTY_SIZE) {
        socket.emit("partyError", "This party already has two players.");
        return;
      }

      const token = randomToken();
      const member = {
        token,
        name: cleanName(name),
        socketIds: new Set(),
        lastSeenAt: Date.now()
      };
      party.members.set(token, member);
      attachSocket(socket, party, member);
      emitState(party);
    });

    socket.on("resumeParty", ({ code, token } = {}) => {
      const party = parties.get(cleanCode(code));
      const member = party?.members.get(String(token || ""));
      if (!party || !member) {
        socket.emit("partyInvalid", "This saved party is no longer available.");
        return;
      }
      attachSocket(socket, party, member);
      socket.emit("partySession", publicState(party, member));
      emitState(party);
    });

    socket.on("setPartyPath", ({ path, pageInstance } = {}) => {
      const context = memberForSocket(socket);
      if (!context || context.member.token !== context.party.hostToken) return;

      const { party } = context;
      const safePath = cleanPath(path);
      const safePageInstance = String(pageInstance || "").slice(0, 80);
      if (safePageInstance && safePageInstance === party.lastHostPageInstance) {
        socket.emit("partyPathReady", {
          path: party.currentPath,
          navigationVersion: party.navigationVersion
        });
        return;
      }

      party.currentPath = safePath;
      party.navigationVersion += 1;
      party.lastHostPageInstance = safePageInstance || randomToken();
      party.gameRooms.clear();
      party.lastActivityAt = Date.now();

      socket.to(party.code).emit("partyNavigate", {
        path: safePath,
        navigationVersion: party.navigationVersion
      });
      socket.emit("partyPathReady", {
        path: safePath,
        navigationVersion: party.navigationVersion
      });
      emitState(party);
    });

    socket.on("publishPartyGameRoom", ({ gameId, roomCode } = {}) => {
      const context = memberForSocket(socket);
      if (!context || context.member.token !== context.party.hostToken) return;

      const safeGameId = String(gameId || "").trim().toLowerCase();
      const expectedGameId = gameIdFromPath(context.party.currentPath);
      const safeRoomCode = cleanCode(roomCode);
      if (!safeGameId || safeGameId !== expectedGameId || !safeRoomCode) return;

      const room = {
        gameId: safeGameId,
        roomCode: safeRoomCode,
        navigationVersion: context.party.navigationVersion
      };
      context.party.gameRooms.set(safeGameId, room);
      context.party.lastActivityAt = Date.now();
      socket.to(context.party.code).emit("partyGameRoom", room);
    });

    socket.on("partyReadyForGame", ({ gameId } = {}) => {
      const context = memberForSocket(socket);
      if (!context) return;
      const safeGameId = String(gameId || "").trim().toLowerCase();
      const expectedGameId = gameIdFromPath(context.party.currentPath);
      if (!safeGameId || safeGameId !== expectedGameId) return;

      const room = context.party.gameRooms.get(safeGameId);
      if (room && room.navigationVersion === context.party.navigationVersion) {
        socket.emit("partyGameRoom", room);
      }
    });

    socket.on("leaveParty", () => {
      const context = memberForSocket(socket);
      if (!context) return;
      const { party, member } = context;

      if (member.token === party.hostToken) {
        closeParty(party, "The host ended the party.");
        return;
      }

      party.members.delete(member.token);
      socket.leave(party.code);
      socket.data.partyCode = null;
      socket.data.partyToken = null;
      party.lastActivityAt = Date.now();
      emitState(party);
      socket.emit("partyLeft");
    });

    socket.on("disconnect", () => {
      const context = memberForSocket(socket);
      if (!context) return;
      context.member.socketIds.delete(socket.id);
      context.member.lastSeenAt = Date.now();
      context.party.lastActivityAt = Date.now();
      emitState(context.party);
    });
  });

  const cleanupTimer = setInterval(() => {
    const cutoff = Date.now() - PARTY_TTL_MS;
    for (const party of parties.values()) {
      const hasConnectedMember = [...party.members.values()].some((member) => member.socketIds.size > 0);
      if (!hasConnectedMember && party.lastActivityAt < cutoff) {
        parties.delete(party.code);
      }
    }
  }, 30 * 60 * 1000);
  cleanupTimer.unref?.();
};
