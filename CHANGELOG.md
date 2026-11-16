# Changelog

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
