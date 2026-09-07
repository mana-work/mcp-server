import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ManaClient } from "../client.js";
import type { GanttTask } from "../types.js";

export function registerSearchTools(server: McpServer, client: ManaClient) {
  server.tool(
    "search_tasks",
    "Search for tasks by name across a project",
    {
      query: z.string().describe("Search query (task name)"),
      projectId: z.string().describe("Project ID to search in"),
    },
    async ({ query, projectId }) => {
      // [FIX: TC-S02] backend search.db.js อ่าน field `model.words` (ไม่ใช่ `model.text`) —
      // verified ใน search.db.js: `model.words != "" ? { text: new RegExp(model.words, "i") } : {}`.
      // ก่อนหน้านี้ MCP ส่ง `text` -> words undefined -> wordsTask={} -> match task ทั้งหมดใน project
      // (gibberish คืน 91 results). ส่ง `words` ตาม contract จริง - 2026-07-30
      const res = await client.post<GanttTask[]>("/search/task", {
        words: query,
        projectId,
      });
      const tasks = res.obj || res.data || [];
      if (!Array.isArray(tasks) || tasks.length === 0) {
        return { content: [{ type: "text", text: `No tasks found matching "${query}"` }] };
      }

      const list = tasks
        .map(
          (t) =>
            `- **${t.text}** (ID: ${t._id}) | ${t.done ? "[DONE]" : "[ACTIVE]"} | ${t.start_date || "-"} → ${t.end_date || "-"}`
        )
        .join("\n");

      return { content: [{ type: "text", text: `# Search Results for "${query}" (${tasks.length} found)\n\n${list}` }] };
    }
  );
}
