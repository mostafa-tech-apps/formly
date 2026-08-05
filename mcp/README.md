# formly-mcp

MCP server that exposes the Formly REST API as tools, so an MCP client (Claude Code,
Claude Desktop, etc.) can create and manage forms through natural language instead of
the dashboard UI.

It's a thin wrapper: every tool call becomes one HTTP request to a running Formly
backend. No database access, no separate state.

## Tools

| Tool | Wraps |
|---|---|
| `list_forms` | `GET /api/forms` |
| `get_form` | `GET /api/forms/:id` |
| `create_form` | `POST /api/forms` (+ `PUT` if title/description/status given) |
| `update_form` | `PUT /api/forms/:id` — also how you publish a form |
| `delete_form` | `DELETE /api/forms/:id` |
| `add_question` | `POST /api/forms/:id/questions` |
| `update_question` | `PUT /api/forms/:id/questions/:questionId` |
| `delete_question` | `DELETE /api/forms/:id/questions/:questionId` |
| `reorder_questions` | `PUT /api/forms/:id/questions/reorder` |
| `list_submissions` | `GET /api/forms/:id/submissions` |
| `get_submission` | `GET /api/forms/:id/submissions/:submissionId` |

## Setup

```bash
cd mcp
npm install
npm run build
```

Point it at a running backend with `FORMLY_API_URL` (defaults to
`http://localhost:3001`).

## Connect to Claude Code

```bash
claude mcp add formly -- node /absolute/path/to/form-builder/mcp/dist/index.js
```

Or add to `.mcp.json` / Claude Desktop's config directly:

```json
{
  "mcpServers": {
    "formly": {
      "command": "node",
      "args": ["/absolute/path/to/form-builder/mcp/dist/index.js"],
      "env": { "FORMLY_API_URL": "https://formly-4gbd.onrender.com" }
    }
  }
}
```

## Notes

- There's no auth on the Formly API, so this server has the same access anyone with
  the API URL has — full read/write on every form.
- `create_form` always creates a draft first (the API doesn't take a body on create),
  then applies title/description/status in a follow-up call if you passed any.
- Publishing (`update_form` with `status: "published"`) requires the form to already
  have at least one question, same as the UI.
