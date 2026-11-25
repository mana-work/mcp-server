// members.ts — tools สำหรับดูรายชื่อ user ใน project/workspace
// (แก้ปัญหา AI ไม่รู้ว่าใครอยู่ใน project ที่จะมอบหมายงาน)

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ManaClient } from "../client.js";
import { z } from "zod";

export function registerMemberTools(server: McpServer, client: ManaClient) {
  // ── list_project_members — ดูทุกคนใน project พร้อมชื่อ/อีเมล/บทบาท ──
  server.tool(
    "list_project_members",
    "List all members of a project with their names, emails, and roles (admin/member). Use this before assigning tasks to find the right person.",
    {
      projectId: z.string().describe("Project ID (from list_projects)"),
    },
    async ({ projectId }) => {
      const result = await client.get(`/get/user/in/project/${projectId}`);
      if (!result.success) {
        return { content: [{ type: "text", text: `Failed to list members: ${result.data}` }] };
      }
      const members = result.obj || [];
      if (members.length === 0) {
        return { content: [{ type: "text", text: "No members found in this project." }] };
      }
      const lines = members.map((m) => {
        const role = m.role === "admin" || m.isAdmin ? "admin" : "member";
        return `• ${m.name || m.firstName || "Unknown"} ${m.surname || m.lastName || ""} (${role}) — ${m.email || "no email"} [ID: ${m._id}]`;
      });
      return { content: [{ type: "text", text: `Members in this project (${members.length}):\n${lines.join("\n")}` }] };
    }
  );

  // ── list_workspace_members — ดูทุกคนใน workspace ──
  server.tool(
    "list_workspace_members",
    "List all members of a workspace with their names, emails, and roles. Useful for finding who to invite to a project.",
    {
      workspaceId: z.string().describe("Workspace ID (from list_workspaces)"),
    },
    async ({ workspaceId }) => {
      const result = await client.get(`/get/user/in/workspace/${workspaceId}`);
      if (!result.success) {
        return { content: [{ type: "text", text: `Failed to list workspace members: ${result.data}` }] };
      }
      const members = result.obj || [];
      if (members.length === 0) {
        return { content: [{ type: "text", text: "No members found in this workspace." }] };
      }
      const lines = members.map((m) => {
        const role = m.isAdmin ? "admin" : m.isGuest ? "guest" : "member";
        return `• ${m.name || "Unknown"} ${m.surname || ""} (${role}) — ${m.email || "no email"} [ID: ${m._id}]`;
      });
      return { content: [{ type: "text", text: `Workspace members (${members.length}):\n${lines.join("\n")}` }] };
    }
  );

  // ── move_task — ย้าย task ไป project อื่น ──
  server.tool(
    "move_task",
    "Move a task (card) from one project to another. The task and all its subtasks will be moved.",
    {
      taskId: z.string().describe("ID of the task to move"),
      projectId: z.string().describe("ID of the destination project"),
    },
    async ({ taskId, projectId }) => {
      const result = await client.post("/move/task", { id: taskId, projectId });
      if (!result.success) {
        return { content: [{ type: "text", text: `Failed to move task: ${result.data}` }] };
      }
      return { content: [{ type: "text", text: `Task moved successfully to project ${projectId}.` }] };
    }
  );
}
