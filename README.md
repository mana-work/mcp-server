# @mana-work/mcp-server

[![npm version](https://img.shields.io/npm/v/@mana-work/mcp-server.svg)](https://www.npmjs.com/package/@mana-work/mcp-server)

MCP (Model Context Protocol) server that connects AI assistants to the [Manawork](https://www.manawork.com) project management platform.

Works with **any MCP-compatible client** - Claude Desktop, Claude Code, Cursor, Windsurf, Cline, VS Code, OpenCode, and ChatGPT Desktop (Developer Mode) / Codex CLI.

> ChatGPT web/mobile connectors only accept remote MCP servers (public HTTPS URL). To use Manawork there you need a bridge (e.g. an MCP-to-HTTP proxy) - the config above works everywhere else as-is.

## Quick Start (4 steps)

### 1. Generate an API Key

Sign in to Manawork > **Settings** > **API Keys** > **Generate New Key**

### 2. Install the server (recommended: global install)

```bash
npm install -g @mana-work/mcp-server
```

Global install starts in ~0.5s. Using `npx -y @mana-work/mcp-server` instead works too, but adds ~4s to every session start while npx resolves the package.

### 3. Configure your AI client

Add to your MCP client config:

**Claude Desktop -** `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows)

**Cursor / Windsurf / Cline -** Similar MCP config in settings

```json
{
  "mcpServers": {
    "manawork": {
      "command": "manawork-mcp-server",
      "env": {
        "MANA_API_URL": "https://api.manawork.com",
        "MANA_API_KEY": "mana_sk_your_api_key_here"
      }
    }
  }
}
```

<details>
<summary>Alternative: npx (no install, slower start)</summary>

```json
{
  "mcpServers": {
    "manawork": {
      "command": "npx",
      "args": ["-y", "@mana-work/mcp-server"],
      "env": {
        "MANA_API_URL": "https://api.manawork.com",
        "MANA_API_KEY": "mana_sk_your_api_key_here"
      }
    }
  }
}
```
</details>

### 4. Restart your AI client

That's it! You can now ask your AI assistant to manage your Manawork projects.

## Let your AI set it up for you

Copy this prompt and paste it into any AI assistant (replace the API key with yours):

```text
Connect me to my Manawork account via MCP.

1. Install the server: npm i -g @mana-work/mcp-server
2. Add this MCP server to your config
   (same shape for Claude Desktop, Claude Code, Cursor, Windsurf, Cline, VS Code):

{
  "mcpServers": {
    "manawork": {
      "command": "manawork-mcp-server",
      "env": {
        "MANA_API_URL": "https://api.manawork.com",
        "MANA_API_KEY": "mana_sk_your_api_key_here"
      }
    }
  }
}

My MANA API key is the one shown above. After adding it, restart and list my workspaces to verify.
```

## Prerequisites

- Node.js 18+ (for npx)
- A Manawork account
- An API key from Manawork Settings

## Supported Clients

| Client | Config Location |
|--------|----------------|
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Claude Code | `.mcp.json` in project, or `~/.claude.json` |
| Cursor | Settings → MCP |
| Windsurf | Settings → MCP |
| Cline | Settings → MCP Servers |
| VS Code (Copilot) | `.mcp.json` / MCP Servers view |
| OpenCode | `opencode.json` → `mcp` section |
| ChatGPT Desktop | Developer Mode (local stdio) |
| Codex CLI | `~/.codex/config.toml` |
| ChatGPT web/mobile | Remote MCP only - needs an HTTPS bridge |
| Any MCP client | Use the same config above |

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MANA_API_URL` | Yes | Your Manawork API URL (e.g., `https://api.manawork.com`) |
| `MANA_API_KEY` | Yes | API key from Manawork Settings > API Keys |

### Config for global install

```json
{
  "mcpServers": {
    "manawork": {
      "command": "manawork-mcp-server",
      "env": {
        "MANA_API_URL": "https://api.manawork.com",
        "MANA_API_KEY": "mana_sk_xxxxx"
      }
    }
  }
}
```

## Available Tools (22)

### Workspace
| Tool | Description |
|------|-------------|
| `list_workspaces` | List all workspaces you have access to |
| `get_workspace` | Get workspace details with members and projects |

### Project
| Tool | Description |
|------|-------------|
| `list_projects` | List all projects in a workspace |
| `get_project` | Get project details with status and progress |
| `create_project` | Create a new project |
| `update_project_status` | Change project status |

### Task
| Tool | Description |
|------|-------------|
| `list_tasks` | List all tasks in a project |
| `get_task` | Get task details with comments, files, and todo list |
| `create_task` | Create a new task |
| `update_task` | Update task properties (name, dates, priority, progress) |
| `done_task` | Mark task as completed |
| `delete_task` | Delete a task |
| `create_task_link` | Create dependency between tasks |

### Collaboration
| Tool | Description |
|------|-------------|
| `add_comment` | Add a comment to a task |
| `update_comment` | Update an existing comment |
| `add_assignee` | Assign a user to a task |
| `remove_assignee` | Remove a user from a task |
| `add_follower` | Add a follower to a task |

### Analytics
| Tool | Description |
|------|-------------|
| `get_workspace_summary` | Workspace analytics overview |
| `get_project_dashboard` | Project-level analytics |
| `get_overdue_tasks` | Find tasks past their due date |

### Search
| Tool | Description |
|------|-------------|
| `search_tasks` | Search tasks by name in a project |

## Example Prompts

- "Show me all my workspaces"
- "List projects in workspace X"
- "Create a task called 'Design homepage' in project Y, due next Friday"
- "What tasks are overdue in project X?"
- "Summarize the progress of project X"
- "Add a comment to task Z: Please review by tomorrow"
- "Assign John to task Z"
- "Show me the dashboard for workspace X"

## How It Works

```
AI Client (Claude / Cursor / Windsurf / Cline)
     |
     | MCP Protocol (stdio)
     v
@mana-work/mcp-server (this package)
     |
     | 1. Auto-authenticates API key → JWT
     | 2. Calls Manawork API with JWT
     v
Manawork Backend API
     |
     v
MongoDB
```

### Authentication Flow

1. MCP server receives your API key
2. Calls `POST /api-key/verify` on Manawork backend
3. Backend validates API key, returns a JWT token
4. MCP server uses JWT for all subsequent API calls
5. JWT auto-refreshes before expiry (23 hours)

## Development

```bash
git clone https://github.com/mana-work/mcp-server.git
cd mcp-server
npm install
npm run build
npm run dev     # watch mode
```

## Security

- API keys are prefixed with `mana_sk_` for identification
- API keys are stored hashed in the database
- JWT tokens expire after 1 day and auto-refresh
- API keys can be revoked anytime from Manawork Settings
- Maximum 5 API keys per user

## API Key Management

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api-key/generate` | Create new API key |
| `GET` | `/api-key/list` | List your API keys |
| `GET` | `/api-key/:id` | Get specific key |
| `DELETE` | `/api-key/:id` | Delete a key |
| `POST` | `/api-key/verify` | Verify key & get JWT |

## License

MIT
