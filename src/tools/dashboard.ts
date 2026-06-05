import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ManaClient } from "../client.js";

export function registerDashboardTools(server: McpServer, client: ManaClient) {
  server.tool(
    "get_workspace_summary",
    "Get a summary of workspace analytics including task progress, project status, and member activity",
    { workspaceId: z.string().describe("Workspace ID") },
    async ({ workspaceId }) => {
      const res = await client.post("/dashboard/workspace", { workspaceId });
      const data = res.obj || res.data;
      if (!data) return { content: [{ type: "text", text: "No dashboard data available" }] };
      return { content: [{ type: "text", text: `# Workspace Dashboard\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\`` }] };
    }
  );

  server.tool(
    "get_project_dashboard",
    "Get project-level analytics and progress data",
    {
      workspaceId: z.string().describe("Workspace ID"),
      projectId: z.string().optional().describe("Specific project ID (optional, shows all if omitted)"),
    },
    async ({ workspaceId, projectId }) => {
      const body: Record<string, unknown> = { workspaceId };
      if (projectId) body.projectId = projectId;
      const res = await client.post("/dashboard/project", body);
      const data = res.obj || res.data;
      if (!data) return { content: [{ type: "text", text: "No project dashboard data available" }] };
      return { content: [{ type: "text", text: `# Project Dashboard\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\`` }] };
    }
  );

  server.tool(
    "get_overdue_tasks",
    "Get a list of tasks that are past their due date and not yet completed",
    { projectId: z.string().describe("Project ID") },
    async ({ projectId }) => {
      const res = await client.post<{ data: unknown[] }>("/data", { projectId });
      const tasks = res.data?.data || res.obj || res.data || [];
      const now = new Date();
      const overdue = Array.isArray(tasks)
        ? (tasks as Record<string, unknown>[]).filter((t) => {
            const done = t.done as boolean | undefined;
            const endDate = t.end_date as string | undefined;
            const inTrash = t.inTrashcan as boolean | undefined;
            return !done && !inTrash && endDate && new Date(endDate) < now;
          })
        : [];

      if (overdue.length === 0) {
        return { content: [{ type: "text", text: "No overdue tasks found in this project" }] };
      }

      const list = overdue
        .map((t) => {
          const endDate = t.end_date as string;
          const daysOverdue = Math.floor((now.getTime() - new Date(endDate).getTime()) / (1000 * 60 * 60 * 24));
          return `- **${t.text}** (ID: ${t._id}) | Due: ${endDate} | **${daysOverdue} days overdue**`;
        })
        .join("\n");

      return { content: [{ type: "text", text: `# Overdue Tasks (${overdue.length})\n\n${list}` }] };
    }
  );
}
