# Changelog

## 1.2.2

### Changed

- Docs now list every supported MCP client, including OpenCode,
  ChatGPT Desktop (Developer Mode), and Codex CLI. ChatGPT web/mobile
  connectors need a remote HTTPS bridge and are documented as such.
- Replaced em dashes with plain hyphens across docs and comments.

## 1.2.1

### Changed

- Package description and keywords now list all supported MCP clients
  (Claude Desktop, Claude Code, Cursor, Windsurf, Cline, VS Code) instead
  of Claude only - the server itself was always client-agnostic.
- README adds a copy-paste prompt users can give to any AI assistant
  to set up the Manawork MCP connection for them.

## 1.2.0

### Performance

- `list_workspaces` no longer makes one heavy `/get/all/projects` call per
  workspace (N+1). Project counts are still shown by `get_workspace`.
- All HTTP requests now time out after 30s instead of hanging forever.

### Changed

- README now recommends a global install (`npm i -g @mana-work/mcp-server`)
  which starts in ~0.5s, versus `npx -y` which adds ~4s to every session start.

## 1.1.0

### Fixed

- Correct MCP tool contracts for search, project, and task endpoints
- Align MCP tools with verified backend contracts across modules
- Correct project progress display and false success on task update
- Improve error detection and reporting for API failures

### Added

- Unit tests updated to the verified backend contracts (58 tests, all passing)

## 1.0.2

- Initial public release with API key authentication
