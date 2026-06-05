import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ManaClient } from "../client.js";

export function registerCommentTools(server: McpServer, client: ManaClient) {
  server.tool(
    "add_comment",
    "Add a comment to a task",
    {
      taskId: z.string().describe("Task ID"),
      text: z.string().describe("Comment text"),
    },
    async ({ taskId, text }) => {
      await client.put(`/push/comment/${taskId}`, { text });
      return { content: [{ type: "text", text: `Comment added to task ${taskId}` }] };
    }
  );

  server.tool(
    "update_comment",
    "Update an existing comment on a task",
    {
      taskId: z.string().describe("Task ID"),
      commentIndex: z.number().describe("Comment index"),
      text: z.string().describe("New comment text"),
    },
    async ({ taskId, commentIndex, text }) => {
      await client.put(`/update/comment/${taskId}`, { index: commentIndex, text });
      return { content: [{ type: "text", text: `Comment ${commentIndex} updated on task ${taskId}` }] };
    }
  );

  server.tool(
    "add_assignee",
    "Assign a user to a task",
    {
      taskId: z.string().describe("Task ID"),
      userId: z.string().describe("User ID to assign"),
    },
    async ({ taskId, userId }) => {
      await client.put(`/push/assignee/${taskId}`, { userId });
      return { content: [{ type: "text", text: `User ${userId} assigned to task ${taskId}` }] };
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
      await client.put(`/push/follower/${taskId}`, { userId });
      return { content: [{ type: "text", text: `User ${userId} added as follower to task ${taskId}` }] };
    }
  );
}
