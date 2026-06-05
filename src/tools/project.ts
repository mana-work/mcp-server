import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ManaClient } from "../client.js";
import type { Project } from "../types.js";
import { PROJECT_STATUS } from "../types.js";

export function registerProjectTools(server: McpServer, client: ManaClient) {
  server.tool(
    "list_projects",
    "List all projects in a workspace",
    { workspaceId: z.string().describe("Workspace ID") },
    async ({ workspaceId }) => {
      const res = await client.get<Project[]>(`/get/all/projects/${workspaceId}`);
      const projects = res.obj || res.data || [];
      const list = Array.isArray(projects)
        ? projects
            .filter((p: Project) => !p.inTrashcan && !p.isSave)
            .map(
              (p: Project) =>
                `- **${p.name}** (ID: ${p._id}) | Status: ${PROJECT_STATUS[p.status] || p.status} | Progress: ${p.percent}% | Tasks: ${p.tasksDone}/${p.task}`
            )
            .join("\n")
        : "No projects found";
      return { content: [{ type: "text", text: `# Projects\n\n${list}` }] };
    }
  );

  server.tool(
    "get_project",
    "Get detailed information about a specific project",
    { projectId: z.string().describe("Project ID") },
    async ({ projectId }) => {
      const res = await client.get<Project>(`/get/project/${projectId}`);
      const p = res.obj || res.data;
      if (!p) return { content: [{ type: "text", text: "Project not found" }] };
      const text = `# ${p.name}

**ID:** ${p._id}
**Status:** ${PROJECT_STATUS[p.status] || p.status}
**Progress:** ${p.percent}%
**Tasks:** ${p.tasksDone} / ${p.task} completed
**Start Date:** ${p.start || "Not set"}
**Due Date:** ${p.dueDate || "Not set"}
**Done Date:** ${p.doneDate || "Not set"}
**Description:** ${p.description || "No description"}
**Private:** ${p.private ? "Yes" : "No"}
**Owner:** ${p.ownedBy}
**Admins:** ${(p.admins || []).length} members
**Members:** ${(p.members || []).length} members
**Activities:** ${(p.activities || []).length}
**Archived:** ${p.isSave ? "Yes" : "No"}`;
      return { content: [{ type: "text", text }] };
    }
  );

  server.tool(
    "create_project",
    "Create a new project in a workspace",
    {
      workspaceId: z.string().describe("Workspace ID"),
      name: z.string().describe("Project name"),
      description: z.string().optional().describe("Project description"),
      startDate: z.string().optional().describe("Start date (YYYY-MM-DD)"),
      dueDate: z.string().optional().describe("Due date (YYYY-MM-DD)"),
    },
    async ({ workspaceId, name, description, startDate, dueDate }) => {
      const body: Record<string, unknown> = {
        name,
        workspaceId,
      };
      if (description) body.description = description;
      if (startDate) body.start = startDate;
      if (dueDate) body.dueDate = dueDate;

      const res = await client.post<Project>("/create/project", body);
      const p = res.obj || res.data;
      if (!p) return { content: [{ type: "text", text: `Failed to create project: ${res.message}` }] };
      return { content: [{ type: "text", text: `Created project **${p.name}** (ID: ${p._id})` }] };
    }
  );

  server.tool(
    "update_project_status",
    "Update the status of a project",
    {
      projectId: z.string().describe("Project ID"),
      status: z.number().describe("Status: 0=No status, 1=Scheduled, 2=In progress, 3=Completed, 4=On hold, 5=Cancelled"),
    },
    async ({ projectId, status }) => {
      await client.put(`/update/status/project/${projectId}`, { status });
      return { content: [{ type: "text", text: `Project status updated to **${PROJECT_STATUS[status] || status}**` }] };
    }
  );
}
