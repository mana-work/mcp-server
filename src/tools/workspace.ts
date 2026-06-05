import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ManaClient } from "../client.js";
import type { Workspace } from "../types.js";

export function registerWorkspaceTools(server: McpServer, client: ManaClient) {
  server.tool("list_workspaces", "List all workspaces the user has access to", {}, async () => {
    const res = await client.get<Workspace[]>("/get/my/workspace");
    const workspaces = res.obj || res.data || [];
    const list = Array.isArray(workspaces)
      ? workspaces
          .map((w: Workspace) => `- **${w.name}** (ID: ${w._id}) | Members: ${(w.members || []).length} | Projects: ${(w.projects || []).length}`)
          .join("\n")
      : "No workspaces found";
    return { content: [{ type: "text", text: `# My Workspaces\n\n${list}` }] };
  });

  server.tool(
    "get_workspace",
    "Get details of a specific workspace including its projects and members",
    { workspaceId: z.string().describe("Workspace ID") },
    async ({ workspaceId }) => {
      const res = await client.get<Workspace>(`/get/workspace/by/${workspaceId}`);
      const ws = res.obj || res.data;
      if (!ws) return { content: [{ type: "text", text: "Workspace not found" }] };
      const text = `# ${ws.name}

**ID:** ${ws._id}
**Owner:** ${ws.ownedBy}
**Admins:** ${(ws.admins || []).length}
**Members:** ${(ws.members || []).length}
**Guests:** ${(ws.guest || []).length}
**Projects:** ${(ws.projects || []).length}
**Happiness Tracking:** ${ws.happiness ? "Enabled" : "Disabled"}
**Created:** ${ws.createdAt}`;
      return { content: [{ type: "text", text }] };
    }
  );
}
