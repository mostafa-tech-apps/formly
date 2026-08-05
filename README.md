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
- [Technical Notes](#technical-notes)

## Features

- **Form Management:** Create, list, rename, and delete forms.
- **Dynamic Questions:** Support for Text Input, Multiple Choice, and File Uploads.
- **Advanced Conditional Logic:** Build infinite nested boolean groups (AND, OR, NOT) to dynamically show/hide questions based on previous answers. 
- **Publishing System:** Toggle forms between "Draft" and "Published" to generate a unique public URL.
- **Public Submissions:** Dedicated, unauthenticated pages for users to view and fill out forms. 
- **Analytics & Submissions:** Dashboard to view all gathered responses and file uploads.
- **Dark Mode UI:** Sleek, premium aesthetic with smooth micro-animations.
- **MCP Server:** The backend exposes an MCP endpoint at `/mcp`, so any MCP client (Claude Code, Claude Desktop) can create and manage forms through natural language. See [MCP Server](#mcp-server) below.

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

## MCP Server

The Fastify backend hosts an MCP (Model Context Protocol) server at `/mcp`, using the
Streamable HTTP transport. It exposes 11 tools that mirror the REST API one-to-one —
`list_forms`, `get_form`, `create_form`, `update_form`, `delete_form`, `add_question`,
`update_question`, `delete_question`, `reorder_questions`, `list_submissions`, and
`get_submission` — implemented in `backend/src/routes/mcp.ts` by calling the same route
handlers in-process via `app.inject()`, so there's no separate copy of the business logic
(slug generation, publish rules, etc.) to keep in sync.

Connect from Claude Code:

```bash
claude mcp add --transport http formly https://formly-4gbd.onrender.com/mcp
```

Or add to an MCP client config directly:

```json
{
  "mcpServers": {
    "formly": {
      "type": "http",
      "url": "https://formly-4gbd.onrender.com/mcp"
    }
  }
}
```

There's no auth on the API, so the MCP server has the same access anyone with the URL
has — full read/write on every form.

## Technical Notes

- **File Uploads:** Uploaded files during form submissions are saved locally in `/backend/uploads`. They are served statically by the Fastify backend.
- **Environment Variables:** Currently, API endpoints are hardcoded to `http://localhost:3001` in the `frontend/src/api/client.ts`. If deploying to production, this should be migrated to `.env` files.
