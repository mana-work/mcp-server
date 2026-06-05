import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ManaClient } from "../client.js";
import { registerWorkspaceTools } from "./workspace.js";
import { registerProjectTools } from "./project.js";
import { registerTaskTools } from "./task.js";
import { registerCommentTools } from "./comment.js";
import { registerDashboardTools } from "./dashboard.js";
import { registerSearchTools } from "./search.js";

export function registerAllTools(server: McpServer, client: ManaClient) {
  registerWorkspaceTools(server, client);
  registerProjectTools(server, client);
  registerTaskTools(server, client);
  registerCommentTools(server, client);
  registerDashboardTools(server, client);
  registerSearchTools(server, client);
}
