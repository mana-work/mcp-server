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
          .map((p: Project) => {
            // [FIX: BUG-01] backend endpoint GET /get/all/projects/<ws> ไม่ส่ง field `percent`
            // (verified ระหว่าง retest TC-03 — output เดิมแสดง `Progress: undefined%`).
            // คำนวณ progress จาก `tasksDone`/`task` ที่ backend ส่งจริงแทนการอ่าน field `percent`
            // ที่หายไป + guard กรณี `task` เป็น 0 เพื่อป้องกันหารด้วยศูนย์ - 2026-07-22
            const progress = p.task ? Math.round((p.tasksDone / p.task) * 100) : 0;
            return `- **${p.name}** (ID: ${p._id}) | Status: ${PROJECT_STATUS[p.status] || p.status} | Progress: ${progress}% | Tasks: ${p.tasksDone}/${p.task}`;
          })
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
      // [FIX: TC-P04] backend คืน { success:false, data:"not to access", obj:null } เมื่อ projectId
      // ไม่มีอยู่ — ก่อนหน้านี้ `res.obj || res.data` ตกลงไปที่ error string (truthy) แล้ว render
      // `# undefined`. เช็ค success ก่อน + guard กรณี p เป็น string - 2026-07-30
      if (!res.success) {
        return { content: [{ type: "text", text: "Project not found" }] };
      }
      const p = res.obj || res.data;
      if (!p || typeof p === "string") return { content: [{ type: "text", text: "Project not found" }] };
      // [FIX: ISSUE-06] backend response ไม่มี field `_id`, `percent`, `tasksDone`,
      // `task`, `activities` (verified จาก GET /get/project/<id> จริง) — ก่อนหน้านี้ handler
      // อ่าน field เหล่านี้ทำให้แสดงผลเป็น "undefined"; ปรับให้ใช้ field ที่ backend ส่งจริง +
      // ใช้ projectId จาก input แทน p._id และลบ field ที่ไม่มีออกจาก output - 2026-07-17
      const text = `# ${p.name}

**ID:** ${projectId}
**Status:** ${PROJECT_STATUS[p.status] ?? p.status}
**Start Date:** ${p.start || "Not set"}
**Due Date:** ${p.dueDate || "Not set"}
**Done Date:** ${p.doneDate || "Not set"}
**Description:** ${p.description || "No description"}
**Private:** ${p.private ? "Yes" : "No"}
**Owner:** ${p.ownedBy}
**Admins:** ${(p.admins || []).length} members
**Members:** ${(p.members || []).length} members
**Archived:** ${p.isSave ? "Yes" : "No"}
**Created:** ${p.createdAt || "unknown"}`;
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
        // [FIX: BUG-01P] backend createProject.db.js:281 เรียก model.memberTeam.map(...)
        // แต่ก่อนหน้านี้ MCP ไม่ส่ง memberTeam -> undefined.map() throw -> คืน
        // "create project failed". ผู้สร้างถูกเพิ่มเป็น owner/admin อัตโนมัติใน backend
        // (createProject.db.js:270-273) จึงส่ง [] เป็นค่าเริ่มต้น - 2026-07-24
        memberTeam: [],
      };
      if (description) body.description = description;
      if (startDate) body.start = startDate;
      if (dueDate) body.dueDate = dueDate;

      const res = await client.post<Project>("/create/project", body);
      // [FIX: ISSUE-05] ตรวจ `res.success` ก่อน — ก่อนหน้านี้ใช้ `res.obj || res.data` ทำให้
      // กรณี backend คืน `{success:false, data:"create project failed", obj:null}` ไป fallback
      // ไปที่ `data` ซึ่งเป็น error string (truthy) แล้ว access `.name`/`._id` บน string → undefined
      // ส่งผลให้รายงาน "Created project **undefined** (ID: undefined)" ทั้งที่จริงล้มเหลว - 2026-07-17
      if (!res.success) {
        return { content: [{ type: "text", text: `Failed to create project: ${res.message || res.data || "backend rejected the request"}` }] };
      }
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
