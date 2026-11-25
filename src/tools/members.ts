// members.ts — tools สำหรับดูรายชื่อ user ใน project/workspace + guide
// (แก้ปัญหา AI agent ไม่รู้วิธีใช้ tools ที่มีอยู่)

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ManaClient } from "../client.js";
import { z } from "zod";

// ── Guide: บอก AI agent ว่าทำอะไรได้บ้าง + วิธีทำ ──
const GUIDE_TEXT = `# Manawork MCP Guide

## ⚠️ IMPORTANT: You have MORE tools than you think!
Before saying "I can't do that", check this guide — most common actions ARE supported.

## Common Workflows

### "ใครอยู่ในโปรเจกต์นี้บ้าง?" / "Who's in this project?"
1. Use \`list_projects\` to get project IDs
2. Use \`list_project_members\` with the projectId to see names, emails, and roles

### "ย้ายการ์ด/เปลี่ยน section" / "Move card / change section"
There are 4 ways to move tasks:

1. **Change section/swimlane** (same project): \`update_task\` with \`parentId\` set to the section's task ID
   - Example: "ย้ายไป Dev Done" → \`update_task(taskId="xxx", parentId="6a7132...")\`
   - Use \`list_tasks\` to find section IDs (sections are parent tasks like "Ready to dev", "Dev Done", "Testing")
   
2. **Between projects**: \`move_task\` — moves task + subtasks to another project

3. **Under a new parent** (same project): \`move_task_under_parent\` — makes task a subtask of another task

4. **To another project + under a parent**: \`move_task_to_project_with_parent\` — moves and sets parent

Common phrases: "ย้ายการ์ด", "ย้าย section", "ย้ายไป Dev Done", "move card", "change section", "ย้ายไปใต้"

### "มอบหมายงานให้ใคร" / "Assign a task to someone"
1. Use \`list_project_members\` to find the person's name or email
2. Use \`add_assignee\` with taskId + their name or email
- You can use either userId, email, or full name

### "สร้างงานใหม่" / "Create a new task"
1. Use \`list_projects\` to get projectId
2. Use \`create_task\` with name, startDate, endDate, priority (1=Low 2=Medium 3=High)
- For subtasks: add parentTaskId

### "เชื่อมงานให้ทำต่อกัน" / "Link tasks (dependencies)"
Use \`create_task_link\` with sourceTaskId (must finish first) + targetTaskId (starts after)
- Link type "0" = finish-to-start (default)

### "ดูภาพรวม" / "Get overview"
- \`get_workspace_summary\` — workspace stats
- \`get_project_dashboard\` — project progress, cards, budget
- \`get_overdue_tasks\` — tasks past their deadline

### "ค้นหางาน" / "Search tasks"
Use \`search_tasks\` — searches by task name, status, assignee

### "เพิ่มคอมเมนต์"
Use \`add_comment\` with taskId + text

### "เพิ่ม follower"
Use \`add_follower\` with taskId + userId

## Tool Reference

| Tool | What it does |
|---|---|
| list_workspaces | List all workspaces |
| get_workspace | Get workspace details |
| list_projects | List projects in workspace |
| get_project | Get project details |
| create_project | Create new project |
| update_project_status | Change project status |
| list_tasks | List tasks in project |
| get_task | Get task details |
| create_task | Create new task |
| update_task | Update task — **including parentId (change section/swimlane)**, name, dates, status, priority |
| move_task | Move task to another project |
| delete_task | Delete task |
| done_task | Mark task as done |
| move_task | **Move task to another project** |
| move_task_under_parent | **Move task under a new parent (subtask)** |
| move_task_to_project_with_parent | **Move to another project + set parent** |
| create_task_link | Create dependency between tasks |
| search_tasks | Search tasks |
| list_project_members | **List people in project** |
| list_workspace_members | **List people in workspace** |
| add_assignee | Assign person to task (by userId/email/name) |
| remove_assignee | Remove assignee from task |
| add_comment | Add comment to task |
| update_comment | Edit a comment |
| add_follower | Add follower to task |
| get_workspace_summary | Workspace overview stats |
| get_project_dashboard | Project progress + cards |
| get_overdue_tasks | Overdue tasks list |

## Tips
- Always use \`list_projects\` or \`list_workspaces\` first to get valid IDs
- For person-related tasks, use \`list_project_members\` to find the right person
- Dates format: YYYY-MM-DD
- Task IDs are MongoDB ObjectIds (24 hex characters)
`;

export function registerMemberTools(server: McpServer, client: ManaClient) {
  // ── manawork_guide — AI agent เรียกดูวิธีใช้ tools ทั้งหมด ──
  server.tool(
    "manawork_guide",
    "Get a guide on how to use all Manawork tools — includes common workflows, tool reference, and tips. Call this when you're unsure how to accomplish a task.",
    {},
    async () => {
      return { content: [{ type: "text", text: GUIDE_TEXT }] };
    }
  );

  // ── list_project_members — ดูทุกคนใน project พร้อมชื่อ/อีเมล/บทบาท ──
  server.tool(
    "list_project_members",
    "List all members of a project with their names, emails, and roles (admin/member). IMPORTANT: Use this BEFORE assigning tasks — to find the right person and their userId.",
    {
      projectId: z.string().describe("Project ID (from list_projects)"),
    },
    async ({ projectId }) => {
      const result = await client.get(`/get/user/in/project/${projectId}`);
      if (!result.success) {
        return { content: [{ type: "text", text: `Failed to list members: ${result.data}` }] };
      }
      const members = (result.obj as any[]) || [];
      if (members.length === 0) {
        return { content: [{ type: "text", text: "No members found in this project." }] };
      }
      const lines = members.map((m: any) => {
        const role = m.role === "admin" || m.isAdmin ? "admin" : "member";
        return `• ${m.name || m.firstName || "Unknown"} ${m.surname || m.lastName || ""} (${role}) — ${m.email || "no email"} [ID: ${m._id}]`;
      });
      return { content: [{ type: "text", text: `Members in this project (${members.length}):\n${lines.join("\n")}` }] };
    }
  );

  // ── list_workspace_members — ดูทุกคนใน workspace ──
  server.tool(
    "list_workspace_members",
    "List all members of a workspace with their names, emails, and roles (admin/member/guest).",
    {
      workspaceId: z.string().describe("Workspace ID (from list_workspaces)"),
    },
    async ({ workspaceId }) => {
      const result = await client.get(`/get/user/in/workspace/${workspaceId}`);
      if (!result.success) {
        return { content: [{ type: "text", text: `Failed to list workspace members: ${result.data}` }] };
      }
      const members = (result.obj as any[]) || [];
      if (members.length === 0) {
        return { content: [{ type: "text", text: "No members found in this workspace." }] };
      }
      const lines = members.map((m: any) => {
        const role = m.isAdmin ? "admin" : m.isGuest ? "guest" : "member";
        return `• ${m.name || "Unknown"} ${m.surname || ""} (${role}) — ${m.email || "no email"} [ID: ${m._id}]`;
      });
      return { content: [{ type: "text", text: `Workspace members (${members.length}):\n${lines.join("\n")}` }] };
    }
  );

  // ── move_task — ย้าย task ไป project อื่น ──
  server.tool(
    "move_task",
    "Move a task to a different project. The task and all its subtasks will be moved to the new project.",
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

  // ── move_task_under_parent — ย้าย task ไปอยู่ใต้ parent ใหม่ (activity/card) ──
  server.tool(
    "move_task_under_parent",
    "Move a task to become a subtask of another task (parent) in the same project. Use when the user says 'ย้ายไปอยู่ใต้', 'make this a subtask of', 'move under', 'ย้าย parent', or wants to change the parent of a task.",
    {
      taskId: z.string().describe("ID of the task to move"),
      parentId: z.string().describe("ID of the parent task (activity) to move under"),
      projectId: z.string().describe("Project ID (same project as both tasks)"),
    },
    async ({ taskId, parentId, projectId }) => {
      const result = await client.put(`/move/card/${taskId}`, {
        projectId: projectId,
        activityId: parentId,
      });
      if (!result.success) {
        return { content: [{ type: "text", text: `Failed to move task under parent: ${result.data}` }] };
      }
      return { content: [{ type: "text", text: `Task moved successfully under parent ${parentId}.` }] };
    }
  );

  // ── move_task_to_project_with_parent — ย้าย task ไป project อื่น พร้อมกำหนด parent ──
  server.tool(
    "move_task_to_project_with_parent",
    "Move a task to a different project AND set its parent task in the destination project. Use when moving a task to another project and placing it under a specific parent there.",
    {
      taskId: z.string().describe("ID of the task to move"),
      destinationProjectId: z.string().describe("ID of the destination project"),
      destinationActivityId: z.string().describe("ID of the parent task in the destination project"),
    },
    async ({ taskId, destinationProjectId, destinationActivityId }) => {
      const result = await client.post("/move/card/to", {
        taskId: taskId,
        projectIdMoveTo: destinationProjectId,
        activityId: destinationActivityId,
      });
      if (!result.success) {
        return { content: [{ type: "text", text: `Failed to move task: ${result.data}` }] };
      }
      return { content: [{ type: "text", text: `Task moved to project ${destinationProjectId} under parent ${destinationActivityId}.` }] };
    }
  );
}
