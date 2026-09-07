import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ManaClient } from "../client.js";
import type { Project } from "../types.js";
import { PROJECT_STATUS } from "../types.js";

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
    // [FIX: BUG-02A] backend /dashboard/project ต้องการ qProject+projects[] (payload ฝั่ง
    // frontend) -> MCP ส่งไม่ครบ -> คืน {projects:[]} เสมอ. แก้โดยคำนวณ dashboard เองฝั่ง MCP
    // จาก /get/all/projects/<ws> (มี task+tasksDone จริง, verified getAllProjectsByWorkspaceId.db.js) - 2026-07-24
    "Get project-level progress (computed in MCP from /get/all/projects)",
    {
      workspaceId: z.string().describe("Workspace ID"),
      projectId: z.string().optional().describe("Specific project ID (optional, shows all if omitted)"),
    },
    async ({ workspaceId, projectId }) => {
      const res = await client.get<Project[]>(`/get/all/projects/${workspaceId}`);
      let projects = ((res.obj || res.data || []) as Project[]).filter(
        (p: Project) => !p.inTrashcan && !p.isSave
      );
      if (projectId) {
        projects = projects.filter((p: Project) => p._id === projectId);
      }
      if (projects.length === 0) {
        return { content: [{ type: "text", text: "No project dashboard data available" }] };
      }

      const rows = projects
        .map((p: Project) => {
          const total = typeof p.task === "number" ? p.task : 0;
          const done = typeof p.tasksDone === "number" ? p.tasksDone : 0;
          const progress = total > 0 ? Math.round((done / total) * 100) : 0;
          return `- **${p.name}** (ID: ${p._id}) | ${PROJECT_STATUS[p.status] || p.status} | ${done}/${total} tasks (${progress}%)`;
        })
        .join("\n");

      const totalTasks = projects.reduce((s: number, p: Project) => s + (typeof p.task === "number" ? p.task : 0), 0);
      const doneTasks = projects.reduce((s: number, p: Project) => s + (typeof p.tasksDone === "number" ? p.tasksDone : 0), 0);
      const overall = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

      return {
        content: [
          { type: "text", text: `# Project Dashboard\n\n**Overall:** ${doneTasks}/${totalTasks} tasks (${overall}%) across ${projects.length} project(s)\n\n${rows}` },
        ],
      };
    }
  );

  server.tool(
    "get_overdue_tasks",
    "Get a list of tasks that are past their due date and not yet completed",
    { projectId: z.string().describe("Project ID") },
    async ({ projectId }) => {
      // [FIX: BUG-03A] ต้องส่ง `mode` มิฉะนั้น getData3.db.js fall through -> empty body.
      // branch "cards" คืน res.obj = { data:[active], tasksDone:[done] } (verified getData3.db.js).
      // รวม active+done เพื่อให้ filter overdue ครอบคลุม task ที่ done แล้วด้วย (แต่ตัวกรอง !done
      // จะตัด done ออกอยู่ดี) - 2026-07-24
      const res = await client.post<{ data: unknown[]; tasksDone: unknown[] }>("/data", {
        projectId,
        mode: "cards",
      });
      const obj = (res.obj || {}) as { data?: unknown[]; tasksDone?: unknown[] };
      const tasks = [...(obj.data || []), ...(obj.tasksDone || [])];
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
