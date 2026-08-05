# Dynamic Form Builder

A modern, full-stack application that allows users to create dynamic forms, add various question types, apply complex conditional logic, and publish them to collect public submissions. 

Built with **React**, **Vite**, **TypeScript** on the frontend, and **Fastify** with **SQLite** on the backend.

## Table of Contents

- [Features](#features)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Setup & Installation](#setup--installation)
  - [1. Backend Setup](#1-backend-setup)
  - [2. Frontend Setup](#2-frontend-setup)
- [Usage Guide](#usage-guide)
- [Accounts & Auth](#accounts--auth)
- [AI Helper](#ai-helper)
- [MCP Server](#mcp-server)
- [Testing](#testing)
- [Technical Notes](#technical-notes)

## Features

- **Form Management:** Create, list, rename, and delete forms.
- **Dynamic Questions:** Support for Text Input, Multiple Choice, and File Uploads.
- **Multi-Step Forms:** Group questions into steps with their own titles, reorder or delete steps, and drag questions between them. Published multi-step forms get Next/Back navigation and a progress bar on the public page; forms with no steps render as a single page exactly as before.
- **Advanced Conditional Logic:** Build infinite nested boolean groups (AND, OR, NOT) to dynamically show/hide questions based on previous answers. 
- **Publishing System:** Toggle forms between "Draft" and "Published" to generate a unique public URL.
- **Public Submissions:** Dedicated, unauthenticated pages for users to view and fill out forms. 
- **Analytics & Submissions:** Dashboard to view all gathered responses and file uploads.
- **Dark Mode UI:** Sleek, premium aesthetic with smooth micro-animations.
- **Accounts:** Email/password signup and login. Each user only sees and manages their own forms — the dashboard, form builder, and submissions views all require an authenticated session. Published forms remain fully public and unauthenticated for respondents.
- **AI Helper:** Inline "Improve wording" and "Suggest options" in the question editor, plus a "Generate with AI" flow that drafts a full form (splitting it into steps for larger ones) from a text prompt — the user reviews the plan before anything is created. See [AI Helper](#ai-helper) below.
- **MCP Server:** The backend exposes an MCP endpoint at `/mcp`, authenticated with a per-account API token, so any MCP client (Claude Code, Claude Desktop) can create and manage that user's forms through natural language. See [MCP Server](#mcp-server) below.

## Project Structure

This is a monorepo containing both the frontend and backend applications:

- `/frontend` - React application built with Vite and TypeScript.
- `/backend` - Fastify REST API with a local SQLite database.

---

## Prerequisites

Make sure you have the following installed on your local machine:
- **Node.js** (v18 or higher recommended)
- **npm** (comes with Node.js)

---

## Setup & Installation

### 1. Backend Setup

The backend relies on SQLite and stores its database locally.

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the backend development server:
   ```bash
   npm run dev
   ```
   *The API will start at `http://localhost:3001`. The SQLite database will be automatically created in `/backend/data/formbuilder.db`.*

### 2. Frontend Setup

1. Open a new terminal window and navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the frontend development server:
   ```bash
   npm run dev
   ```
   *(Note: The frontend expects to run on port 5174. If Vite chooses a different port, you can explicitly set it using `npm run dev -- --port 5174`)*

---

## Usage Guide

1. Open your browser and navigate to the frontend URL (e.g., `http://localhost:5174`).
2. **Create a Form:** Click "Create New Form" from the dashboard.
3. **Add Questions:** Use the "Add Question" button to build out your form.
4. **Conditional Logic:** While editing a question, switch to the "Conditional Logic" tab to add visibility rules based on the previous questions in the form.
5. **Publish:** Toggle the status switch to "Published" to generate a public link.
6. **Share:** Copy the URL and share it to start collecting submissions!

## Accounts & Auth

Signup/login is email + password (`backend/src/auth.ts`, `backend/src/routes/auth.ts`).
Passwords are hashed with `crypto.scryptSync` (no extra dependency). A logged-in session
is an opaque token in an httpOnly cookie, backed by a `sessions` table — logging out just
deletes the row. Every form/question/submission route (except the public `/api/forms/public/*`
ones) requires a valid session and scopes all queries to `req.userId`; there's no way to
read or modify another account's forms through the API.

Each account can also generate a separate, long-lived **API token** from Settings
(`POST /api/auth/token`) for MCP access — shown once, stored only as a SHA-256 hash,
regenerate/revoke any time. It's independent of the session cookie: `requireAuth` accepts
either an `Authorization: Bearer <token>` header or the session cookie, so the exact same
route handlers serve both the dashboard and the MCP server.

## AI Helper

Requires `ANTHROPIC_API_KEY` set on the backend (see `backend/.env.example` — copy it to
`backend/.env` for local dev, or set it in your host's environment variables in
production). Without it, the AI endpoints return a clean `502` instead of crashing; the
rest of the app works normally.

Uses `claude-opus-5` with structured JSON output (`backend/src/ai.ts`,
`backend/src/routes/ai.ts`):

- `POST /api/ai/improve-question` / `POST /api/ai/suggest-options` — inline per-question
  assistance surfaced as buttons in the question editor.
- `POST /api/ai/plan-form` — given a text prompt, drafts a form's title, description, and
  full question list, split across multiple steps if the form is large. This call makes
  no database writes.
- `POST /api/ai/create-form` — persists an already-drafted plan. No AI call here; it only
  runs once the user has reviewed the plan in the UI and approved it, so a form is never
  created without the user seeing it first.

## MCP Server

The Fastify backend hosts an MCP (Model Context Protocol) server at `/mcp`, using the
Streamable HTTP transport. It exposes 15 tools that mirror the REST API one-to-one —
`list_forms`, `get_form`, `create_form`, `update_form`, `delete_form`, `add_question`,
`update_question`, `delete_question`, `reorder_questions`, `add_step`, `update_step`,
`delete_step`, `reorder_steps`, `list_submissions`, and `get_submission` — implemented in
`backend/src/routes/mcp.ts` by calling the same route handlers in-process via
`app.inject()`, forwarding the caller's API token on every call, so there's no separate
copy of the business logic (slug generation, publish rules, auth scoping) to keep in sync.

Every `/mcp` request requires `Authorization: Bearer <token>` using the API token from
Settings — there's no anonymous access, and each token only sees that account's forms.

Connect from Claude Code:

```bash
claude mcp add --transport http formly https://formly-4gbd.onrender.com/mcp \
  --header "Authorization: Bearer <your-token>"
```

Or add to an MCP client config directly:

```json
{
  "mcpServers": {
    "formly": {
      "type": "http",
      "url": "https://formly-4gbd.onrender.com/mcp",
      "headers": { "Authorization": "Bearer <your-token>" }
    }
  }
}
```

## Testing

End-to-end tests live in `/e2e` (Playwright), covering the auth flow (signup, login,
logout, route guarding, account isolation, MCP token generation) and the public form
page (view + submit with zero authentication, unknown-slug handling, multi-step
navigation with progress/validation/back-preserves-answers).

```bash
cd e2e
npm install
npx playwright install chromium  # first run only, if not using --channel chrome
npm test
```

The config starts both the backend and frontend dev servers automatically
(`e2e/playwright.config.ts`) if they aren't already running.

## Technical Notes

- **File Uploads:** Uploaded files during form submissions are saved locally in `/backend/uploads`. They are served statically by the Fastify backend.
- **Environment Variables:** The frontend calls a relative `/api` path (proxied to the backend by Vite locally and by the host's rewrite rules in production), so it needs no env vars. The backend reads `ANTHROPIC_API_KEY` via `dotenv` (`backend/.env`, gitignored) — currently the only environment variable the app uses.
