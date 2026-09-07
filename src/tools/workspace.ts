import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ManaClient } from "../client.js";
import type { Workspace, Project } from "../types.js";

// [FIX: BUG-01W/02W] helper นับจำนวน project จริงใน workspace — backend
// /get/my/workspace และ /get/workspace/by/:id ไม่ส่ง field `projects` กลับมา
// (verified: getMyWorkspace.db.js projection ไม่มี projects; getWorkspaceById.db.js
// สร้าง objData โดยไม่มี key projects) ทำให้ก่อนหน้านี้ (w.projects||[]).length ติด 0 เสมอ
// ใช้ /get/all/projects/<ws> (มีอยู่จริงใน getAllProjectsByWorkspaceId.db.js) เพื่อนับ - 2026-07-24
async function countProjectsInWorkspace(client: ManaClient, workspaceId: string): Promise<number> {
  try {
    const res = await client.get<Project[]>(`/get/all/projects/${workspaceId}`);
    const projects = res.obj || res.data || [];
    return Array.isArray(projects)
      ? projects.filter((p: Project) => !p.inTrashcan && !p.isSave).length
      : 0;
  } catch {
    // ถ้าดึงไม่ได้ ไม่ block ทั้ง tool — คืน -1 เพื่อสื่อว่าไม่ทราบจำนวน
    return -1;
  }
}

export function registerWorkspaceTools(server: McpServer, client: ManaClient) {
  server.tool("list_workspaces", "List all workspaces the user has access to", {}, async () => {
    const res = await client.get<Workspace[]>("/get/my/workspace");
    const workspaces = (res.obj || res.data || []) as Workspace[];
    // [FIX: BUG-01W] ดึงจำนวน project จริงของแต่ละ workspace (parallel) เพราะ backend
    // ไม่ส่ง field projects มาใน /get/my/workspace - 2026-07-24
    const wsList = Array.isArray(workspaces) ? workspaces : [];
    const counts = await Promise.all(
      wsList.map((w: Workspace) => countProjectsInWorkspace(client, w._id))
    );
    const list = wsList.length
      ? wsList
          .map((w: Workspace, i: number) => {
            const projectsLabel = counts[i] >= 0 ? String(counts[i]) : "unknown";
            return `- **${w.name}** (ID: ${w._id}) | Members: ${(w.members || []).length} | Projects: ${projectsLabel}`;
          })
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
      // [FIX: BUG-02W] นับ project จริงเพราะ backend /get/workspace/by/:id ไม่ส่ง field projects - 2026-07-24
      const projectCount = await countProjectsInWorkspace(client, workspaceId);
      const projectsLabel = projectCount >= 0 ? String(projectCount) : "unknown";
      // [FIX: ISSUE-07] ลบ field `**Created:** ${ws.createdAt}` ออกจาก output — backend
      // /get/workspace/by/<id> ไม่ส่ง field `createdAt` กลับมา (verified จาก response จริง:
      // obj = {_id, name, status, admins, members, guest, createBy, ownedBy, happiness})
      // ทำให้ output แสดง `**Created:** undefined` ก่อนหน้านี้ - 2026-07-17
      const text = `# ${ws.name}

**ID:** ${ws._id}
**Owner:** ${ws.ownedBy}
**Admins:** ${(ws.admins || []).length}
**Members:** ${(ws.members || []).length}
**Guests:** ${(ws.guest || []).length}
**Projects:** ${projectsLabel}
**Happiness Tracking:** ${ws.happiness ? "Enabled" : "Disabled"}`;
      return { content: [{ type: "text", text }] };
    }
  );
}
