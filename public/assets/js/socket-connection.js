(function initialiseArcadeSocketConnection() {
  "use strict";

  function normaliseOrigin(value) {
    return String(value || "").trim().replace(/\/+$/, "");
  }

  function configuredOrigin() {
    const configValue = window.ARCADE_CONFIG?.socketServerUrl;
    return normaliseOrigin(configValue) || window.location.origin;
  }

  window.createArcadeSocket = function createArcadeSocket(namespace) {
    if (typeof window.io !== "function") {
      throw new Error("Socket.IO client failed to load.");
    }

    const cleanNamespace = String(namespace || "").startsWith("/")
      ? String(namespace)
      : `/${String(namespace || "")}`;

    return window.io(`${configuredOrigin()}${cleanNamespace}`, {
      // WebSocket-only avoids Socket.IO long-polling requests being routed to
      // different serverless instances. The backend must be a stateful host.
      transports: ["websocket"],
      upgrade: false,
      reconnection: true,
      reconnectionAttempts: 8,
      reconnectionDelay: 600,
      timeout: 10000
    });
  };
})();
