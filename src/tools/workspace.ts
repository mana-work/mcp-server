import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ManaClient } from "../client.js";
import type { Workspace, Project } from "../types.js";

// [PERF] helper นับจำนวน project จริงใน workspace — backend
// /get/workspace/by/:id ไม่ส่ง field `projects` กลับมา จึงต้องใช้
// /get/all/projects/<ws> ซึ่งเป็น endpoint หนัก (backend query 3-4 รอบ
// + ยก project documents เต็ม ๆ) — ใช้เฉพาะ get_workspace เดี่ยวเท่านั้น
// อย่าใช้ใน list_workspaces (เดิมเรียก N ครั้งต่อ N workspaces = N+1)
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
    // [PERF] 1 call เดียว — ไม่นับ project ราย workspace แล้ว (เดิมเป็น N+1:
    // เรียก /get/all/projects หนัก ๆ ต่อ workspace เพียงเพื่อแสดงเลขนับ)
    // ผู้ใช้อยากรู้รายละเอียดให้เรียก get_workspace ต่อ
    const wsList = Array.isArray(workspaces) ? workspaces : [];
    const list = wsList.length
      ? wsList
          .map(
            (w: Workspace) =>
              `- **${w.name}** (ID: ${w._id}) | Members: ${(w.members || []).length}`
          )
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
