/*
 * Deployment configuration
 *
 * Local/full-server deployment: leave socketServerUrl as an empty string.
 * Split deployment (frontend on Vercel, backend on Render/Railway/Fly):
 * replace the empty string with the HTTPS URL of the backend, for example:
 *   socketServerUrl: "https://mini-game-arcade-server.onrender.com"
 */
window.ARCADE_CONFIG = Object.freeze({
  socketServerUrl: ""
});
