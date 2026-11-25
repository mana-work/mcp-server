// members.ts — tools สำหรับ: guide, ดูรายชื่อคน, ย้าย/copy การ์ดและ task list
// (แก้ปัญหา AI agent ไม่รู้วิธีใช้ + งงกับ tools ที่แยกเยอะ)

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ManaClient } from "../client.js";
import { z } from "zod";

const GUIDE_TEXT = `# Manawork MCP Guide

## ⚠️ Before saying "I can't do that" — check this guide!

## How ManaWork works
- **Workspace** → contains **Projects**
- **Project** → contains **Task Lists** (sections/swimlanes like "Ready to dev", "Dev Done", "Testing")
- **Task List** → contains **Cards** (actual work items)
- Cards can also have subtasks

## Common Workflows

### "ย้ายการ์ดไปอีก section" / "Move card to another section"
\`move_card\` with taskId + destination section's taskId:
\`\`\`
move_card(taskId="abc", toSectionId="6a7132...")  // Dev Done section ID
\`\`\`
Use \`list_tasks\` to find section IDs (they appear as parent tasks with no parentId)

### "ย้ายการ์ดไป project อื่น" / "Move card to another project"
\`move_card\` with taskId + destination projectId:
\`\`\`
move_card(taskId="abc", toProjectId="def")
\`\`\`

### "ย้ายไป project อื่น AND ใต้ section ที่ระบุ"
\`move_card\` with both:
\`\`\`
move_card(taskId="abc", toProjectId="def", toSectionId="6a7132...")
\`\`\`

### "Copy การ์ดไป project อื่น"
\`copy_card\` with taskId + destination projectId:
\`\`\`
copy_card(taskId="abc", toProjectId="def", toSectionId="6a7132...")
\`\`\`

### "ย้าย/copy ทั้ง task list (section) ไป project อื่น"
\`move_task_list\` or \`copy_task_list\` with the section's taskId + destination projectId:
\`\`\`
move_task_list(taskListId="6a7132...", toProjectId="def")
\`\`\`
All cards under it will be moved/copied too.

### "ใครอยู่ใน project นี้" / "Who's in this project?"
\`list_project_members\` → names, emails, roles, user IDs

### "มอบหมายงาน" / "Assign task"
1. \`list_project_members\` → find the person
2. \`add_assignee\` with taskId + their name/email/userId

### Quick reference
| Action | Tool |
|---|---|
| See who's in project | list_project_members |
| See who's in workspace | list_workspace_members |
| Move card → section | move_card (toSectionId) |
| Move card → project | move_card (toProjectId) |
| Move card → project + section | move_card (both) |
| Copy card → project | copy_card |
| Move entire task list → project | move_task_list |
| Copy entire task list → project | copy_task_list |
| Create task | create_task |
| Update task (name/dates/priority/status) | update_task |
| Mark done | done_task |
| Delete | delete_task |
| Search | search_tasks |
| Assign person | add_assignee |
| Add comment | add_comment |
| Link tasks (dependency) | create_task_link |
| Project dashboard | get_project_dashboard |
| Overdue tasks | get_overdue_tasks |
| Workspace summary | get_workspace_summary |
| Create project | create_project |
| List projects | list_projects |
| List tasks | list_tasks |
| Get task detail | get_task |

### Tips
- Section IDs = parent tasks with no parentId → use \`list_tasks\` to find them
- To add "[Dev]" prefix: include \`name\` param in move_card or update_task
- Dates: YYYY-MM-DD | Priority: 1=Low 2=Medium 3=High
`;

export function registerMemberTools(server: McpServer, client: ManaClient) {
  // ── manawork_guide ──
  server.tool(
    "manawork_guide",
    "Complete guide: how to move/copy cards, find people, manage tasks. Call this when unsure which tool to use.",
    {},
    async () => ({ content: [{ type: "text", text: GUIDE_TEXT }] })
  );

  // ── list_project_members ──
  server.tool(
    "list_project_members",
    "List all members of a project (names, emails, roles, user IDs). Use before assigning tasks.",
    { projectId: z.string().describe("Project ID") },
    async ({ projectId }) => {
      const result = await client.get(`/get/user/in/project/${projectId}`);
      if (!result.success) {
        return { content: [{ type: "text", text: `Failed: ${result.data}` }] };
      }
      const members = (result.obj as any[]) || [];
      if (members.length === 0) {
        return { content: [{ type: "text", text: "No members." }] };
      }
      const lines = members.map((m: any) => {
        const role = m.role === "admin" || m.isAdmin ? "admin" : "member";
        return `• ${m.name || "Unknown"} ${m.surname || ""} (${role}) — ${m.email || ""} [ID: ${m._id}]`;
      });
      return { content: [{ type: "text", text: `Project members (${members.length}):\n${lines.join("\n")}` }] };
    }
  );

  // ── list_workspace_members ──
  server.tool(
    "list_workspace_members",
    "List all members of a workspace (names, emails, roles).",
    { workspaceId: z.string().describe("Workspace ID") },
    async ({ workspaceId }) => {
      const result = await client.get(`/get/user/in/workspace/${workspaceId}`);
      if (!result.success) {
        return { content: [{ type: "text", text: `Failed: ${result.data}` }] };
      }
      const members = (result.obj as any[]) || [];
      if (members.length === 0) {
        return { content: [{ type: "text", text: "No members." }] };
      }
      const lines = members.map((m: any) => {
        const role = m.isAdmin ? "admin" : m.isGuest ? "guest" : "member";
        return `• ${m.name || "Unknown"} ${m.surname || ""} (${role}) — ${m.email || ""} [ID: ${m._id}]`;
      });
      return { content: [{ type: "text", text: `Workspace members (${members.length}):\n${lines.join("\n")}` }] };
    }
  );

  // ── move_card — universal: ย้าย card ไป section อื่น / project อื่น / ทั้งคู่ ──
  server.tool(
    "move_card",
    "Move a card/task. Can: (a) move to different section in same project (toSectionId), (b) move to another project (toProjectId), (c) both. Use for 'ย้ายการ์ด', 'ย้าย section', 'move card', 'move to Dev Done', etc.",
    {
      taskId: z.string().describe("ID of the card/task to move"),
      toSectionId: z.string().optional().describe("Destination section (task list) ID — use list_tasks to find section IDs"),
      toProjectId: z.string().optional().describe("Destination project ID — for cross-project moves"),
      newName: z.string().optional().describe("Rename the card (e.g., add [Dev] prefix)"),
    },
    async ({ taskId, toSectionId, toProjectId, newName }) => {
      // Case A: same project, different section → PUT /move/card/:taskId
      if (toSectionId && !toProjectId) {
        const body: Record<string, unknown> = { activityId: toSectionId };
        // projectId จำเป็น — ต้องรู้ project ปัจจุบัน จะใช้จาก task detail
        const task = await client.get(`/get/task/${taskId}`);
        const projectId = (task as any)?.obj?.projectId || (task as any)?.projectId;
        if (projectId) {
          body.projectId = typeof projectId === "string" ? projectId : String(projectId);
        }
        if (newName) body.text = newName;
        const result = await client.put(`/move/card/${taskId}`, body);
        if (!result.success) {
          // Fallback: ลอง update_task กับ parentId โดยตรง
          const fallback = await client.put(`/data/task/${taskId}`, {
            parentId: toSectionId,
            ...(newName ? { text: newName } : {}),
          });
          if (fallback.success) {
            return { content: [{ type: "text", text: `Card moved to new section.` }] };
          }
          return { content: [{ type: "text", text: `Failed to move card: ${result.data || fallback.data}` }] };
        }
        return { content: [{ type: "text", text: `Card moved to new section.` }] };
      }

      // Case B+C: cross-project (with or without specific section)
      if (toProjectId) {
        const result = await client.post("/move/task", { id: taskId, projectId: toProjectId });
        if (!result.success) {
          return { content: [{ type: "text", text: `Failed to move: ${result.data}` }] };
        }
        // ถ้ามี section ด้วย → move ต่อใน project ใหม่
        if (toSectionId) {
          await client.put(`/move/card/${taskId}`, {
            projectId: toProjectId,
            activityId: toSectionId,
          });
        }
        if (newName) {
          await client.put(`/data/task/${taskId}`, { text: newName });
        }
        return { content: [{ type: "text", text: `Card moved${toSectionId ? " to section" : ""} in project ${toProjectId}.` }] };
      }

      return { content: [{ type: "text", text: "Provide toSectionId or toProjectId (or both)." }] };
    }
  );

  // ── copy_card ──
  server.tool(
    "copy_card",
    "Copy a card/task to another project (optionally to a specific section). Original stays in place.",
    {
      taskId: z.string().describe("ID of the card to copy"),
      toProjectId: z.string().describe("Destination project ID"),
      toSectionId: z.string().optional().describe("Destination section ID in the target project"),
    },
    async ({ taskId, toProjectId, toSectionId }) => {
      const result = await client.post("/copy/card/to", {
        cardId: taskId,
        projectId: toProjectId,
        activityId: toSectionId,
      });
      if (!result.success) {
        return { content: [{ type: "text", text: `Failed to copy: ${result.data}` }] };
      }
      return { content: [{ type: "text", text: `Card copied to project ${toProjectId}.` }] };
    }
  );

  // ── move_task_list — ย้ายทั้ง section ไป project อื่น ──
  server.tool(
    "move_task_list",
    "Move an entire task list (section) with all its cards to a different project.",
    {
      taskListId: z.string().describe("ID of the task list/section to move"),
      toProjectId: z.string().describe("Destination project ID"),
    },
    async ({ taskListId, toProjectId }) => {
      const result = await client.post("/move/task", { id: taskListId, projectId: toProjectId });
      if (!result.success) {
        return { content: [{ type: "text", text: `Failed to move task list: ${result.data}` }] };
      }
      return { content: [{ type: "text", text: `Task list and all cards moved to project ${toProjectId}.` }] };
    }
  );

  // ── copy_task_list ──
  server.tool(
    "copy_task_list",
    "Copy an entire task list (section) with all its cards to a different project. Original stays.",
    {
      taskListId: z.string().describe("ID of the task list/section to copy"),
      toProjectId: z.string().describe("Destination project ID"),
    },
    async ({ taskListId, toProjectId }) => {
      const result = await client.post("/copy/task", { id: taskListId, projectId: toProjectId });
      if (!result.success) {
        return { content: [{ type: "text", text: `Failed to copy task list: ${result.data}` }] };
      }
      return { content: [{ type: "text", text: `Task list copied to project ${toProjectId}.` }] };
    }
  );
}
