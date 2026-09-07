import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ManaClient } from "../client.js";

// [FIX: BUG-02C] helper แปลง email/name -> userId ผ่าน /get/user/in/workspace/:id
// (getUserInWorkspace.db.js คืน {admins, members, guest} แต่ละคนมี {_id, email, name}).
// backend /push/assignee รับเฉพาะ userId จึงต้อง resolve ฝั่ง MCP - 2026-07-24
interface WorkspaceUserRow { _id: string; email: string; name: string }
interface WorkspaceUsers { admins?: WorkspaceUserRow[]; members?: WorkspaceUserRow[]; guest?: WorkspaceUserRow[] }
async function resolveUserId(client: ManaClient, workspaceId: string, query: string): Promise<string | undefined> {
  try {
    const res = await client.get<WorkspaceUsers>(`/get/user/in/workspace/${workspaceId}`);
    const ws = (res.obj || res.data || {}) as WorkspaceUsers;
    const all: WorkspaceUserRow[] = [
      ...(ws.admins || []),
      ...(ws.members || []),
      ...(ws.guest || []),
    ];
    const q = query.trim().toLowerCase();
    const match = all.find(
      (u) =>
        (u.email && u.email.toLowerCase() === q) ||
        (u.name && u.name.toLowerCase() === q) ||
        (u.name && u.name.toLowerCase().includes(q))
    );
    return match ? match._id : undefined;
  } catch {
    return undefined;
  }
}

export function registerCommentTools(server: McpServer, client: ManaClient) {
  server.tool(
    "add_comment",
    "Add a comment to a task",
    {
      taskId: z.string().describe("Task ID"),
      text: z.string().describe("Comment text"),
    },
    async ({ taskId, text }) => {
      // [FIX: ISSUE-04] ตรวจผลลัพธ์จาก backend ก่อนรายงาน success - ก่อนหน้านี้ discard
      // ผลแล้วรายงานสำเร็จเสมอ ทำให้ readback ไม่สอดคล้องกับผลจริง - 2026-07-17
      const res = await client.put(`/push/comment/${taskId}`, { text });
      if (!res.success) {
        return { content: [{ type: "text", text: `Failed to add comment to task ${taskId}: ${res.message || "backend rejected the request"}` }] };
      }
      return { content: [{ type: "text", text: `Comment added to task ${taskId}` }] };
    }
  );

  server.tool(
    "update_comment",
    "Update an existing comment on a task",
    {
      taskId: z.string().describe("Task ID"),
      // [FIX: BUG-01C] เปลี่ยนจาก commentIndex -> commentId เพราะ backend updateComment.db.js:22
      // ค้น comment ด้วย _id (ObjectId) ไม่ใช่ index. หา commentId ได้จาก get_task ที่แสดง
      // _(ID: ...)_ ใต้แต่ละ comment แล้ว - 2026-07-24
      commentId: z.string().describe("Comment ID (ObjectId) — get it from get_task output"),
      text: z.string().describe("New comment text"),
    },
    async ({ taskId, commentId, text }) => {
      // [FIX: BUG-01C] ส่ง {_id: commentId, text} ตาม contract ของ backend (model._id) - 2026-07-24
      const res = await client.put(`/update/comment/${taskId}`, { _id: commentId, text });
      if (!res.success) {
        // [FIX: BUG-NEW-02] เดิม backend updateComment.db.js คืน key `dat` (typo) แทน `data`
        // ทำให้ res.data เป็น undefined — backend แก้ typo แล้ว (2026-07-24) ตอนนี้ res.data
        // ทำงานได้; ยังคง fallback res.message ก่อนเพื่อความปลอดภัย
        return { content: [{ type: "text", text: `Failed to update comment ${commentId} on task ${taskId}: ${res.message || res.data || "backend rejected the request"}` }] };
      }
      return { content: [{ type: "text", text: `Comment ${commentId} updated on task ${taskId}` }] };
    }
  );

  server.tool(
    "add_assignee",
    // [FIX: BUG-02C] รับ userId เหมือนเดิม และเพิ่มทางเลือก email/name (+workspaceId สำหรับ resolve) - 2026-07-24
    "Assign a user to a task by userId, or by email/name (requires workspaceId)",
    {
      taskId: z.string().describe("Task ID"),
      userId: z.string().optional().describe("User ID to assign (use this OR email/name)"),
      email: z.string().optional().describe("User email — requires workspaceId to resolve"),
      name: z.string().optional().describe("User full name — requires workspaceId to resolve"),
      workspaceId: z.string().optional().describe("Workspace ID (required when using email/name)"),
    },
    async ({ taskId, userId, email, name, workspaceId }) => {
      // [FIX: ISSUE-04] ตรวจผล backend ก่อนรายงาน success - 2026-07-17
      let resolvedUserId = userId;
      const query = email || name;
      if (!resolvedUserId && query) {
        if (!workspaceId) {
          return { content: [{ type: "text", text: `Cannot resolve ${email ? "email" : "name"} without workspaceId. Provide workspaceId, or pass userId directly.` }] };
        }
        resolvedUserId = await resolveUserId(client, workspaceId, query);
        if (!resolvedUserId) {
          return { content: [{ type: "text", text: `No user found matching "${query}" in workspace ${workspaceId}.` }] };
        }
      }
      if (!resolvedUserId) {
        return { content: [{ type: "text", text: "Provide either userId, or email/name + workspaceId." }] };
      }
      const res = await client.put(`/push/assignee/${taskId}`, { userId: resolvedUserId });
      if (!res.success) {
        return { content: [{ type: "text", text: `Failed to assign user ${resolvedUserId} to task ${taskId}: ${res.message || res.data || "backend rejected the request"}` }] };
      }
      return { content: [{ type: "text", text: `User ${resolvedUserId} assigned to task ${taskId}` }] };
    }
  );

  server.tool(
    "remove_assignee",
    "Remove a user from a task",
    {
      taskId: z.string().describe("Task ID"),
      userId: z.string().describe("User ID to remove"),
    },
    async ({ taskId, userId }) => {
      await client.put(`/pull/assignee/${taskId}`, { userId });
      return { content: [{ type: "text", text: `User ${userId} removed from task ${taskId}` }] };
    }
  );

  server.tool(
    "add_follower",
    "Add a follower to a task",
    {
      taskId: z.string().describe("Task ID"),
      userId: z.string().describe("User ID to add as follower"),
    },
    async ({ taskId, userId }) => {
      // [FIX: ISSUE-04] ตรวจผลลัพธ์จาก backend ก่อนรายงาน success - ก่อนหน้านี้ discard
      // ผลแล้วรายงานสำเร็จเสมอ ทำให้ readback ไม่สอดคล้องกับผลจริง - 2026-07-17
      const res = await client.put(`/push/follower/${taskId}`, { userId });
      if (!res.success) {
        return { content: [{ type: "text", text: `Failed to add follower ${userId} to task ${taskId}: ${res.message || "backend rejected the request"}` }] };
      }
      return { content: [{ type: "text", text: `User ${userId} added as follower to task ${taskId}` }] };
    }
  );
}
