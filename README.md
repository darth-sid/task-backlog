# Tasks

A lightweight personal task manager built with Vue 3, TypeScript, and Vite.

It supports fast task capture, priority-based sorting, optional start dates and deadlines, tag management, a pinned focus area, and both list and kanban views. All data is stored locally in the browser with no backend required.

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

## Tech Stack

- Vue 3
- TypeScript
- Vite

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

## Project Structure

```text
src/
  App.vue
  components/
    TaskManager.vue
  main.ts
  style.css
public/
```

## Notes

- This is a client-only app with no server or sync layer.
- Existing saved task data includes lightweight migration logic for older task formats.
