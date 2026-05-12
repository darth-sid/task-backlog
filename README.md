# Tasks

A lightweight personal task manager built with Vue 3, TypeScript, and Vite.

It supports fast task capture, priority-based sorting, optional start dates and deadlines, tag management, a pinned focus area, and both list and kanban views. Data is persisted in the browser and optionally synced across devices via a Vercel + Upstash KV backend.

## Features

- Create tasks with optional start dates and deadlines
- Organize work by priority: `critical`, `high`, `medium`, `low`, `minimal`
- Track task status: `unstarted`, `in progress`, `ready`, `done`
- Switch between list and kanban layouts
- Pin up to 6 tasks into a focus board
- Add notes to pinned tasks
- Create, edit, delete, and drag tags between tasks
- Filter by active, all, done, and by tag
- Persist tasks, tags, and UI settings in `localStorage`
- Optional cross-device sync via Vercel serverless API + Upstash KV

## Tech Stack

- Vue 3
- TypeScript
- Vite
- Vercel (hosting + serverless functions)
- Upstash KV (sync storage, via REST API)

## Getting Started

### Prerequisites

- Node.js 20+ recommended
- npm

### Install

```bash
npm install
```

### Run locally

```bash
npm run dev
```

Open the local Vite URL shown in the terminal, typically `http://localhost:5173`.

> To run locally with sync enabled, use `vercel dev` instead (requires the Vercel CLI and a `.env.local` with the four sync env vars listed below).

### Build for production

```bash
npm run build
```

### Preview the production build

```bash
npm run preview
```

## Data Storage

The app stores data in browser `localStorage` under these keys:

- `sid-tasks`
- `sid-tags`
- `sid-settings`

Clearing browser storage will reset the app state.

## Cross-Device Sync

Sync is optional and requires a Vercel deployment with Upstash KV.

### Environment variables

| Variable | Side | Purpose |
|---|---|---|
| `VITE_SYNC_SECRET` | Client (baked into bundle) | Bearer token sent with each sync request |
| `SYNC_SECRET` | Server only | Validates incoming requests in `api/sync.ts` |
| `KV_REST_API_URL` | Server only | Upstash REST endpoint (auto-set by Vercel KV) |
| `KV_REST_API_TOKEN` | Server only | Upstash REST token (auto-set by Vercel KV) |

Set `VITE_SYNC_SECRET` and `SYNC_SECRET` to the same value (`openssl rand -hex 32`). Store locally in `.env.local` (already git-ignored).

### How it works

- On page load the app fetches the cloud blob. If the cloud's `savedAt` timestamp is newer than the local last-sync timestamp, it replaces local data; otherwise it pushes local data up.
- Any change to tasks, tags, or settings triggers a debounced 1-second push to `/api/sync`.
- A small dot in the header shows sync state: yellow = syncing, green = synced, red = offline.
- Without `VITE_SYNC_SECRET`, the dot is hidden and the app runs fully offline.

### Deploy to Vercel

1. Create a KV database in the Vercel dashboard (Storage → KV). Accept auto-population of `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
2. Add `SYNC_SECRET` and `VITE_SYNC_SECRET` in Vercel → Settings → Environment Variables.
3. Push to GitHub and import the project (Framework: Vite, Root: `tasks/`, Output: `dist`).

## Project Structure

```text
src/
  App.vue
  components/
    TaskManager.vue
  main.ts
  style.css
api/
  sync.ts        # Vercel serverless sync endpoint
public/
vercel.json
```

## Notes

- Existing saved task data includes lightweight migration logic for older task formats.
