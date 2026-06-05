import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ManaClient } from "../client.js";
import type { GanttTask } from "../types.js";

function formatTask(t: GanttTask): string {
  const status = t.done ? "[DONE]" : t.inTrashcan ? "[DELETED]" : "[ACTIVE]";
  const overdue = !t.done && t.end_date && new Date(t.end_date) < new Date() ? " [OVERDUE]" : "";
  return `- **${t.text}** ${status}${overdue}
  ID: ${t._id} | Priority: ${t.priority || "-"} | Progress: ${Math.round((t.progress || 0) * 100)}%
  Start: ${t.start_date || "-"} | End: ${t.end_date || "-"} | Duration: ${t.duration || 0}d
  Assignees: ${(t.assignee || []).length} | Followers: ${(t.follower || []).length} | Comments: ${(t.comments || []).length}
  ${t.description ? `  Description: ${t.description.substring(0, 200)}${t.description.length > 200 ? "..." : ""}` : ""}`;
}

export function registerTaskTools(server: McpServer, client: ManaClient) {
  server.tool(
    "list_tasks",
    "List all tasks in a project with their status, dates, and assignees",
    { projectId: z.string().describe("Project ID") },
    async ({ projectId }) => {
      const res = await client.post<{ data: GanttTask[] }>("/data", { projectId });
      const tasks = res.data?.data || res.obj || res.data || [];
      const list = Array.isArray(tasks)
        ? tasks.map((t: GanttTask) => formatTask(t)).join("\n\n")
        : "No tasks found";
      const total = Array.isArray(tasks) ? tasks.length : 0;
      const done = Array.isArray(tasks) ? tasks.filter((t: GanttTask) => t.done).length : 0;
      return {
        content: [
          {
            type: "text",
            text: `# Tasks (${done}/${total} completed)\n\n${list}`,
          },
        ],
      };
    }
  );

  server.tool(
    "get_task",
    "Get detailed information about a specific task including comments, files, and todo list",
    { taskId: z.string().describe("Task ID") },
    async ({ taskId }) => {
      const res = await client.get<GanttTask>(`/gantt/${taskId}`);
      const t = res.obj || res.data;
      if (!t) return { content: [{ type: "text", text: "Task not found" }] };

      const todoList = (t.toDolist || [])
        .map((item) => `  - [${item.check ? "x" : " "}] ${item.name}`)
        .join("\n");
      const comments = (t.comments || [])
        .map((c) => `  - **${c.createBy}** (${c.createdAt}): ${c.text}`)
        .join("\n");
      const files = (t.files || [])
        .filter((f) => !f.inTrashcan)
        .map((f) => `  - ${f.defaultName}`)
        .join("\n");

      const text = `# ${t.text}

**ID:** ${t._id}
**Status:** ${t.done ? "Done" : "Active"}${!t.done && t.end_date && new Date(t.end_date) < new Date() ? " (OVERDUE)" : ""}
**Priority:** ${t.priority || "-"}
**Impact:** ${t.impact || "-"}
**Progress:** ${Math.round((t.progress || 0) * 100)}%
**Start:** ${t.start_date || "Not set"}
**End:** ${t.end_date || "Not set"}
**Duration:** ${t.duration || 0} days
**Description:** ${t.description || "No description"}
**Assignees:** ${(t.assignee || []).join(", ") || "None"}
**Followers:** ${(t.follower || []).join(", ") || "None"}
**Done by:** ${t.doneBy || "-"} ${t.doneDate ? `on ${t.doneDate}` : ""}
**Income:** ${t.income || 0} | **Expenses:** ${t.expenses || 0}

## Todo List
${todoList || "No items"}

## Comments (${(t.comments || []).length})
${comments || "No comments"}

## Files (${(t.files || []).filter((f) => !f.inTrashcan).length})
${files || "No files"}`;

      return { content: [{ type: "text", text }] };
    }
  );

  server.tool(
    "create_task",
    "Create a new task in a project",
    {
      projectId: z.string().describe("Project ID"),
      name: z.string().describe("Task name"),
      description: z.string().optional().describe("Task description"),
      startDate: z.string().optional().describe("Start date (YYYY-MM-DD)"),
      endDate: z.string().optional().describe("End date (YYYY-MM-DD)"),
      duration: z.number().optional().describe("Duration in days"),
      priority: z.string().optional().describe("Priority level"),
      parentTaskId: z.string().optional().describe("Parent task ID for subtasks"),
    },
    async ({ projectId, name, description, startDate, endDate, duration, priority, parentTaskId }) => {
      const body: Record<string, unknown> = {
        projectId,
        text: name,
      };
      if (description) body.description = description;
      if (startDate) body.start_date = startDate;
      if (endDate) body.end_date = endDate;
      if (duration) body.duration = duration;
      if (priority) body.priority = priority;
      if (parentTaskId) body.parentId = parentTaskId;

      const res = await client.post<GanttTask>("/data/task", body);
      const t = res.obj || res.data;
      if (!t) return { content: [{ type: "text", text: `Failed to create task: ${res.message}` }] };
      return { content: [{ type: "text", text: `Created task **${t.text}** (ID: ${t._id || t.id})` }] };
    }
  );

  server.tool(
    "update_task",
    "Update an existing task's properties",
    {
      taskId: z.string().describe("Task ID"),
      name: z.string().optional().describe("New task name"),
      description: z.string().optional().describe("New description"),
      startDate: z.string().optional().describe("New start date (YYYY-MM-DD)"),
      endDate: z.string().optional().describe("New end date (YYYY-MM-DD)"),
      duration: z.number().optional().describe("New duration in days"),
      progress: z.number().optional().describe("Progress (0-1)"),
      priority: z.string().optional().describe("Priority level"),
    },
    async ({ taskId, name, description, startDate, endDate, duration, progress, priority }) => {
      const body: Record<string, unknown> = {};
      if (name) body.text = name;
      if (description) body.description = description;
      if (startDate) body.start_date = startDate;
      if (endDate) body.end_date = endDate;
      if (duration !== undefined) body.duration = duration;
      if (progress !== undefined) body.progress = progress;
      if (priority) body.priority = priority;

      await client.put(`/data/task/${taskId}`, body);
      return { content: [{ type: "text", text: `Task ${taskId} updated successfully` }] };
    }
  );

  server.tool(
    "done_task",
    "Mark a task as completed",
    { taskId: z.string().describe("Task ID") },
    async ({ taskId }) => {
      await client.put(`/done/task/${taskId}`);
      return { content: [{ type: "text", text: `Task ${taskId} marked as done` }] };
    }
  );

  server.tool(
    "delete_task",
    "Delete a task (moves to trashcan)",
    { taskId: z.string().describe("Task ID") },
    async ({ taskId }) => {
      await client.del(`/data/task/${taskId}`);
      return { content: [{ type: "text", text: `Task ${taskId} deleted` }] };
    }
  );

  server.tool(
    "create_task_link",
    "Create a dependency link between two tasks",
    {
      projectId: z.string().describe("Project ID"),
      sourceTaskId: z.string().describe("Source task ID (predecessor)"),
      targetTaskId: z.string().describe("Target task ID (successor)"),
      linkType: z.string().optional().describe("Link type: '0'=finish-to-start (default)"),
    },
    async ({ projectId, sourceTaskId, targetTaskId, linkType }) => {
      const body: Record<string, unknown> = {
        projectId,
        source: sourceTaskId,
        target: targetTaskId,
        type: linkType || "0",
      };
      const res = await client.post("/data/link", body);
      return { content: [{ type: "text", text: `Task dependency created: ${sourceTaskId} -> ${targetTaskId}` }] };
    }
  );
}
