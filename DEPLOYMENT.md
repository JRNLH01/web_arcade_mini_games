# Deployment guide

## Why the room resets on Vercel

Every game keeps its rooms in a JavaScript `Map` inside the running Node process. The project also uses Socket.IO, which needs a long-lived server connection. A Vercel serverless deployment can start multiple isolated function instances and does not provide one permanent process for those maps. A create/join/start sequence can therefore be handled by different instances, making the room appear to reset.

## Recommended deployment: host the complete app on Render or Railway

This is the simplest option and requires no frontend configuration.

### Render

1. Push this folder to GitHub.
2. In Render, create a new Blueprint or Web Service from the repository.
3. Render will detect `render.yaml`.
4. Leave `CLIENT_ORIGIN` blank when the same Render service serves both the website and Socket.IO backend.
5. Open the generated Render URL and test with two browser windows.

### Railway

1. Create a Railway project from the GitHub repository.
2. Railway will use `railway.json` and run `npm start`.
3. Generate a public domain for the service.
4. Open that Railway URL directly.

Keep the backend at one running instance. The current room state is in memory; horizontal scaling requires a shared store and Socket.IO adapter.

## Optional split deployment: Vercel frontend + Render/Railway backend

### 1. Deploy the backend

Deploy the repository to Render or Railway using the instructions above.

Set this backend environment variable:

```text
CLIENT_ORIGIN=https://YOUR-VERCEL-PROJECT.vercel.app
```

For a custom domain and preview domain, use a comma-separated list:

```text
CLIENT_ORIGIN=https://games.example.com,https://YOUR-VERCEL-PROJECT.vercel.app
```

### 2. Configure the frontend

Open:

```text
public/assets/js/runtime-config.js
```

Set the backend URL:

```js
window.ARCADE_CONFIG = Object.freeze({
  socketServerUrl: "https://YOUR-BACKEND.onrender.com"
});
```

Do not add a trailing slash.

### 3. Deploy only the `public` folder to Vercel

In Vercel project settings, set:

```text
Root Directory: public
Framework Preset: Other
Build Command: leave empty
Output Directory: leave empty
```

Redeploy after saving the settings.

## Local development

Keep `socketServerUrl` empty, then run:

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## Health check

The backend health endpoint is:

```text
/health
```

A healthy server returns JSON containing `"ok": true`.
