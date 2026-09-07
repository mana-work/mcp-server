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

// [FIX: TC-C04/TC-C08] backend /gantt/:id คืน assignee/follower เป็น array ของ object
// {_id, name, email, profileImg} (verified probe 2026-07-30) ไม่ใช่ string[] ตามที่ type เดิมระบุ.
// ก่อนหน้านี้ .join(", ") ทำให้แสดง [object Object]. helper นี้รองรับทั้ง string และ object.
type Person = string | { _id?: string; name?: string; email?: string };
function formatPeople(people: unknown): string {
  if (!Array.isArray(people)) return "";
  return people
    .map((p: Person) => {
      if (typeof p === "string") return p;
      if (p && typeof p === "object") return p.name || p.email || p._id || "";
      return String(p);
    })
    .filter(Boolean)
    .join(", ");
}

export function registerTaskTools(server: McpServer, client: ManaClient) {
  server.tool(
    "list_tasks",
    "List all tasks in a project with their status, dates, and assignees",
    { projectId: z.string().describe("Project ID") },
    async ({ projectId }) => {
      // [FIX: BUG-01T] เพิ่ม field `mode` ใน request body ของ MCP ให้ backend สามารถเลือกเงื่อนไขการดึงข้อมูล task ได้
      // [FIX: BUG-01T] branch "cards" คืน res.obj = { data: [active], tasksDone: [done],
      // collections, project } (verified ใน getData3.db.js) — ต้องอ่าน res.obj.data +
      // res.obj.tasksDone โดยตรง ไม่ใช่ res.data?.data (res.data เป็น string "Get tasks...") - 2026-07-24
      const res = await client.post<{ data: GanttTask[]; tasksDone: GanttTask[] }>("/data", {
        projectId,
        mode: "cards",
      });
      const obj = (res.obj || {}) as { data?: GanttTask[]; tasksDone?: GanttTask[] };
      const tasks = [...(obj.data || []), ...(obj.tasksDone || [])];
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
      // [FIX: TC-T05] backend คืน { success:false, data:"not found data", obj:null } เมื่อ taskId
      // ไม่มีอยู่ — ก่อนหน้านี้ `res.obj || res.data` ตกลงไปที่ error string (truthy) แล้ว render
      // `# undefined`. เช็ค success ก่อน + guard กรณี t เป็น string - 2026-07-30
      if (!res.success) {
        return { content: [{ type: "text", text: "Task not found" }] };
      }
      const t = res.obj || res.data;
      if (!t || typeof t === "string") return { content: [{ type: "text", text: "Task not found" }] };

      // [FIX: BUG-01C] backend /gantt/:id คืนแค่ countComments ไม่คืน array comments
      // (getGanttById.db.js:165) -> ก่อนหน้านี้ get_task แสดง "Comments (0)" เสมอ.
      // ดึง comment จริงผ่าน /data mode:"commentsAndFiles" (getCommentFile.db.js) ที่คืน
      // res.obj = [{_id, text, createBy, createName, createdAt, type:"comment"|"file"}] - 2026-07-24
      let realComments: Array<{ _id?: string; text: string; createBy: string; createName?: string; createdAt: string }> = [];
      try {
        // [FIX: BUG-NEW-03] getData.module.js บังคับ req.body.projectId สำหรับทุก mode
        // (เช็คก่อน dispatch เข้า getData3.db.js) ก่อนหน้านี้ส่งแค่ {_id, mode} -> projectId
        // undefined -> คืน "invalid data" -> cf.obj null -> แสดง Comments (0) ทั้งที่มี comment.
        // เพิ่ม projectId (มีใน task object t) เข้าไปใน payload - 2026-07-24
        const cf = await client.post<unknown[]>("/data", {
          projectId: t.projectId,
          _id: taskId,
          mode: "commentsAndFiles",
        });
        const arr = (cf.obj || []) as Array<{ type?: string; _id?: string; text?: string; createBy?: string; createName?: string; createdAt?: string }>;
        realComments = arr
          .filter((item) => item.type === "comment")
          .map((item) => ({ _id: item._id, text: item.text || "", createBy: item.createBy || "", createName: item.createName, createdAt: item.createdAt || "" }));
      } catch {
        // ถ้าดึงไม่ได้ ใช้ countComments เป็นจำนวน แต่ไม่แสดงรายละเอียด
      }

      const todoList = (t.toDolist || [])
        .map((item) => `  - [${item.check ? "x" : " "}] ${item.name}`)
        .join("\n");
      const comments = realComments
        .map((c) => `  - **${c.createName || c.createBy}** (${c.createdAt}): ${c.text}${c._id ? ` _(ID: ${c._id})_` : ""}`)
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
**Assignees:** ${formatPeople(t.assignee) || "None"}
**Followers:** ${formatPeople(t.follower) || "None"}
**Done by:** ${t.doneBy || "-"} ${t.doneDate ? `on ${t.doneDate}` : ""}
**Income:** ${t.income || 0} | **Expenses:** ${t.expenses || 0}

## Todo List
${todoList || "No items"}

## Comments (${realComments.length})
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
      // [FIX: TC-T07] backend schema ganttTasks.model.js:19 กำหนด priority: Number
      // (1=Low,2=Medium,3=High ตาม sendEmailRemind.db.js:63-67) — ก่อนหน้านี้รับเป็น string
      // ทำให้ส่ง "high" -> Mongoose CastError -> 500 internal server - 2026-07-30
      priority: z.number().optional().describe("Priority level: 1=Low, 2=Medium, 3=High"),
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
      if (priority !== undefined) body.priority = priority;
      // [FIX: BUG-02T] เมื่อไม่มี parentTaskId ต้อง set parentId = projectId เพื่อให้ backend
      // (createTask.db.js:175,203,214) จัด task เป็น activity ระดับบนสุดของ project ถูกต้อง
      // ก่อนหน้านี้ไม่ส่ง parentId เลย -> model.parentId !== model.projectId -> task ไม่ขึ้นใน project.
      // พร้อมตั้ง type = 1 (task) เพื่อให้ updateCountTaskProject นับ task ใน project ถูก - 2026-07-24
      body.parentId = parentTaskId || projectId;
      if (!parentTaskId) body.type = 1;

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
      // [FIX: TC-T09] priority เป็น Number ใน backend (เหมือน create_task) - 2026-07-30
      priority: z.number().optional().describe("Priority level: 1=Low, 2=Medium, 3=High"),
    },
    async ({ taskId, name, description, startDate, endDate, duration, progress, priority }) => {
      const body: Record<string, unknown> = {};
      if (name) body.text = name;
      if (description) body.description = description;
      if (startDate) body.start_date = startDate;
      if (endDate) body.end_date = endDate;
      if (duration !== undefined) body.duration = duration;
      if (progress !== undefined) body.progress = progress;
      if (priority !== undefined) body.priority = priority;

      const res = await client.put(`/data/task/${taskId}`, body);
      // [FIX: BUG-02] ตรวจ `res.success` ก่อนรายงาน success — ก่อนหน้านี้ discard ผลแล้ว
      // รายงาน `updated successfully` เสมอ ทำให้ update ล้มเหลวแต่ผู้ใช้ไม่รู้ (verified ระหว่าง
      // retest TC-10 — backend คืน success:false แต่ tool รายงาน success ลวง). pattern
      // เดียวกับ ISSUE-04 ที่แก้แล้วใน done_task/delete_task - 2026-07-22
      if (!res.success) {
        return { content: [{ type: "text", text: `Failed to update task ${taskId}: ${res.message || res.data || "backend rejected the request"}` }] };
      }
      return { content: [{ type: "text", text: `Task ${taskId} updated successfully` }] };
    }
  );

  server.tool(
    "done_task",
    "Mark a task as completed",
    { taskId: z.string().describe("Task ID") },
    async ({ taskId }) => {
      // [FIX: ISSUE-04] ตรวจผลลัพธ์จาก backend ก่อนรายงาน success - ก่อนหน้านี้ discard
      // ผลแล้วรายงานสำเร็จเสมอ ทำให้ done ล้มเหลวแต่ get_task ยังแสดง Active - 2026-07-17
      // [FIX: BUG-03T] backend doneTask.db.js:17 ต้องการ model.done เป็น true/false อย่างชัดเจน
      // — ก่อนหน้านี้เรียก put โดยไม่ส่ง body -> model.done undefined -> invalidData ->
      // "backend rejected the request". ส่ง { done: true } ตาม contract - 2026-07-24
      const res = await client.put(`/done/task/${taskId}`, { done: true });
      if (!res.success) {
        return { content: [{ type: "text", text: `Failed to mark task ${taskId} as done: ${res.message || res.data || "backend rejected the request"}` }] };
      }
      return { content: [{ type: "text", text: `Task ${taskId} marked as done` }] };
    }
  );

  server.tool(
    "delete_task",
    "Delete a task (moves to trashcan)",
    { taskId: z.string().describe("Task ID") },
    async ({ taskId }) => {
      // [FIX: ISSUE-04] ตรวจผลลัพธ์จาก backend ก่อนรายงาน success - ก่อนหน้านี้ discard
      // ผลแล้วรายงานสำเร็จเสมอ ทำให้ delete ล้มเหลวแต่ get_task ยังอ่านได้ - 2026-07-17
      const res = await client.del(`/data/task/${taskId}`);
      if (!res.success) {
        return { content: [{ type: "text", text: `Failed to delete task ${taskId}: ${res.message || "backend rejected the request"}` }] };
      }
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
