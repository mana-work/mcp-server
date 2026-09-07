import { describe, it, expect, vi, beforeEach } from "vitest";

type ToolHandler = (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[] }>;

function createMockServer() {
  const tools: { name: string; handler: ToolHandler }[] = [];
  return {
    tool: vi.fn((name: string, _desc: string, _schema: unknown, handler: ToolHandler) => {
      tools.push({ name, handler });
    }),
    getHandler: (name: string) => {
      const t = tools.find((t) => t.name === name);
      if (!t) throw new Error(`Tool "${name}" not registered`);
      return t.handler;
    },
    getNames: () => tools.map((t) => t.name),
  };
}

type MockClient = {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
};

function createMockClient(): MockClient {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    del: vi.fn(),
  };
}

import { registerWorkspaceTools } from "../tools/workspace.js";
import { registerProjectTools } from "../tools/project.js";
import { registerTaskTools } from "../tools/task.js";
import { registerCommentTools } from "../tools/comment.js";
import { registerDashboardTools } from "../tools/dashboard.js";
import { registerSearchTools } from "../tools/search.js";
import { registerAllTools } from "../tools/index.js";

describe("registerAllTools", () => {
  it("should register all 22 tools", () => {
    const server = createMockServer();
    const client = createMockClient() as unknown as import("../client.js").ManaClient;
    registerAllTools(
      server as unknown as import("@modelcontextprotocol/sdk/server/mcp.js").McpServer,
      client
    );
    expect(server.getNames()).toHaveLength(22);
  });
});

describe("workspace tools", () => {
  let server: ReturnType<typeof createMockServer>;
  let client: MockClient;

  beforeEach(() => {
    server = createMockServer();
    client = createMockClient();
    registerWorkspaceTools(
      server as unknown as import("@modelcontextprotocol/sdk/server/mcp.js").McpServer,
      client as unknown as import("../client.js").ManaClient
    );
  });

  it("list_workspaces - should format workspace list", async () => {
    client.get.mockResolvedValue({
      success: true,
      obj: [
        { _id: "w1", name: "Workspace A", members: ["u1", "u2"], projects: ["p1"] },
        { _id: "w2", name: "Workspace B", members: [], projects: [] },
      ],
    });

    const handler = server.getHandler("list_workspaces");
    const result = await handler({});
    expect(result.content[0].text).toContain("Workspace A");
    expect(result.content[0].text).toContain("Workspace B");
    expect(result.content[0].text).toContain("Members: 2");
  });

  it("list_workspaces - should handle empty list", async () => {
    client.get.mockResolvedValue({ success: true, obj: [] });

    const handler = server.getHandler("list_workspaces");
    const result = await handler({});
    expect(result.content[0].text).toContain("My Workspaces");
  });

  it("get_workspace - should show workspace details", async () => {
    // [FIX: BUG-02W] project count now comes from GET /get/all/projects/:ws
    // (backend no longer sends a `projects` field) — mock per-URL.
    client.get.mockImplementation(async (url: string) => {
      if (url === "/get/all/projects/w1") {
        return {
          success: true,
          obj: [
            { _id: "p1", name: "Project 1", inTrashcan: false, isSave: false },
            { _id: "p2", name: "Project 2", inTrashcan: false, isSave: false },
            { _id: "p3", name: "Trashed", inTrashcan: true, isSave: false },
          ],
        };
      }
      return {
        success: true,
        obj: {
          _id: "w1",
          name: "My Workspace",
          ownedBy: "u1",
          admins: ["u1"],
          members: ["u2"],
          guest: ["u3"],
          happiness: true,
          createdAt: "2024-01-01",
        },
      };
    });

    const handler = server.getHandler("get_workspace");
    const result = await handler({ workspaceId: "w1" });
    expect(result.content[0].text).toContain("My Workspace");
    expect(result.content[0].text).toContain("Enabled");
    expect(result.content[0].text).toContain("**Projects:** 2");
    // [FIX: ISSUE-07] regression: response must NOT include "**Created:**" because
    // the real backend /get/workspace/by/<id> doesn't send `createdAt` — previous
    // handler rendered "**Created:** undefined".
    expect(result.content[0].text).not.toContain("**Created:**");
    expect(result.content[0].text).not.toContain("undefined");
  });

  it("get_workspace - should handle not found", async () => {
    client.get.mockResolvedValue({ success: true, obj: null });

    const handler = server.getHandler("get_workspace");
    const result = await handler({ workspaceId: "w1" });
    expect(result.content[0].text).toContain("not found");
  });
});

describe("project tools", () => {
  let server: ReturnType<typeof createMockServer>;
  let client: MockClient;

  beforeEach(() => {
    server = createMockServer();
    client = createMockClient();
    registerProjectTools(
      server as unknown as import("@modelcontextprotocol/sdk/server/mcp.js").McpServer,
      client as unknown as import("../client.js").ManaClient
    );
  });

  it("list_projects - should filter out trashed and saved projects", async () => {
    client.get.mockResolvedValue({
      success: true,
      obj: [
        { _id: "p1", name: "Active Project", status: 2, percent: 50, tasksDone: 3, task: 10, inTrashcan: false, isSave: false },
        { _id: "p2", name: "Trashed", status: 0, percent: 0, tasksDone: 0, task: 0, inTrashcan: true, isSave: false },
        { _id: "p3", name: "Archived", status: 0, percent: 0, tasksDone: 0, task: 0, inTrashcan: false, isSave: true },
      ],
    });

    const handler = server.getHandler("list_projects");
    const result = await handler({ workspaceId: "w1" });
    expect(result.content[0].text).toContain("Active Project");
    expect(result.content[0].text).not.toContain("Trashed");
    expect(result.content[0].text).not.toContain("Archived");
  });

  // [FIX: ISSUE-06] updated mock + assertions to match the real backend response shape
  // (verified via runtime probe of GET /get/project/<id>) — backend does NOT send
  // _id/percent/tasksDone/task/activities, but DOES send guests + createdAt.
  it("get_project - should show project details", async () => {
    client.get.mockResolvedValue({
      success: true,
      obj: {
        name: "My Project", status: 2,
        start: "2024-01-01", dueDate: "2024-06-01", doneDate: "", description: "Test desc",
        private: false, ownedBy: "u1",
        admins: [{ _id: "u1", name: "a", email: "a@b.c", profileImg: "", inWorkspace: true }],
        members: ["u2"], guests: [],
        isSave: false, createdAt: "2026-07-17T00:00:00.000Z",
      },
    });

    const handler = server.getHandler("get_project");
    const result = await handler({ projectId: "p1" });
    expect(result.content[0].text).toContain("My Project");
    expect(result.content[0].text).toContain("In progress");
    expect(result.content[0].text).toContain("**ID:** p1");
    expect(result.content[0].text).toContain("2026-07-17");
    // must NOT contain stale undefined fields (the bug we fixed)
    expect(result.content[0].text).not.toContain("undefined");
    expect(result.content[0].text).not.toContain("Progress:");
    expect(result.content[0].text).not.toContain("Tasks:**");
  });

  it("create_project - should send correct body", async () => {
    client.post.mockResolvedValue({
      success: true,
      obj: { _id: "p_new", name: "New Project" },
    });

    const handler = server.getHandler("create_project");
    const result = await handler({
      workspaceId: "w1", name: "New Project",
      description: "Desc", startDate: "2024-01-01", dueDate: "2024-06-01",
    });
    expect(client.post).toHaveBeenCalledWith("/create/project", {
      name: "New Project", workspaceId: "w1", memberTeam: [],
      description: "Desc", start: "2024-01-01", dueDate: "2024-06-01",
    });
    expect(result.content[0].text).toContain("Created project");
  });

  it("create_project - should handle failure", async () => {
    client.post.mockResolvedValue({
      success: false, message: "Unauthorized",
    });

    const handler = server.getHandler("create_project");
    const result = await handler({ workspaceId: "w1", name: "Fail" });
    expect(result.content[0].text).toContain("Failed to create");
  });

  // [FIX: ISSUE-05] Regression test: the exact UAT failure shape — success:false,
  // obj:null, data:"create project failed" (a truthy error string). Before the fix
  // the handler did `res.obj || res.data` → fell back to the error string → tried
  // to access .name/.id on it → reported "Created project **undefined** (ID: undefined)".
  it("create_project - should not falsely report success when backend returns success:false with obj:null (ISSUE-05)", async () => {
    client.post.mockResolvedValue({
      success: false, data: "create project failed", obj: null,
    });

    const handler = server.getHandler("create_project");
    const result = await handler({ workspaceId: "w1", name: "X" });
    expect(result.content[0].text).toContain("Failed to create project");
    expect(result.content[0].text).toContain("create project failed");
    expect(result.content[0].text).not.toContain("Created project");
    expect(result.content[0].text).not.toContain("undefined");
  });

  it("update_project_status - should call PUT with status", async () => {
    client.put.mockResolvedValue({ success: true });

    const handler = server.getHandler("update_project_status");
    const result = await handler({ projectId: "p1", status: 3 });
    expect(client.put).toHaveBeenCalledWith("/update/status/project/p1", { status: 3 });
    expect(result.content[0].text).toContain("Completed");
  });
});

describe("task tools", () => {
  let server: ReturnType<typeof createMockServer>;
  let client: MockClient;

  beforeEach(() => {
    server = createMockServer();
    client = createMockClient();
    registerTaskTools(
      server as unknown as import("@modelcontextprotocol/sdk/server/mcp.js").McpServer,
      client as unknown as import("../client.js").ManaClient
    );
  });

  it("list_tasks - should format tasks with counts", async () => {
    // [FIX: BUG-01T] POST /data {mode:"cards"} → res.obj = { data:[active], tasksDone:[done] }
    client.post.mockResolvedValue({
      success: true,
      obj: {
        data: [
          { _id: "t1", text: "Task A", done: false, inTrashcan: false, progress: 0.5, duration: 5, assignee: ["u1"], follower: [], comments: [] },
        ],
        tasksDone: [
          { _id: "t2", text: "Task B", done: true, inTrashcan: false, progress: 1, duration: 3, assignee: [], follower: [], comments: [] },
        ],
      },
    });

    const handler = server.getHandler("list_tasks");
    const result = await handler({ projectId: "p1" });
    expect(client.post).toHaveBeenCalledWith("/data", { projectId: "p1", mode: "cards" });
    expect(result.content[0].text).toContain("Task A");
    expect(result.content[0].text).toContain("[DONE]");
    expect(result.content[0].text).toContain("1/2 completed");
  });

  it("list_tasks - should handle no tasks", async () => {
    client.post.mockResolvedValue({ success: true, obj: { data: [], tasksDone: [] } });

    const handler = server.getHandler("list_tasks");
    const result = await handler({ projectId: "p1" });
    expect(result.content[0].text).toContain("0/0 completed");
  });

  it("get_task - should show task details with comments and files", async () => {
    client.get.mockResolvedValue({
      success: true,
      obj: {
        _id: "t1", projectId: "p1", text: "My Task", done: false, progress: 0.3, duration: 10,
        start_date: "2024-01-01", end_date: "2024-01-10", description: "Desc",
        assignee: ["u1", "u2"], follower: ["u3"], priority: "High", impact: "Medium",
        doneBy: "", doneDate: "", income: 1000, expenses: 500,
        toDolist: [{ check: true, name: "Sub task 1", assignee: "", doneBy: "" }],
        files: [{ defaultName: "file.pdf", inTrashcan: false }],
      },
    });
    // [FIX: BUG-01C] comments are fetched via POST /data mode:"commentsAndFiles"
    client.post.mockResolvedValue({
      success: true,
      obj: [
        { _id: "c1", type: "comment", text: "Hello", createBy: "u1", createName: "User One", createdAt: "2024-01-01" },
      ],
    });

    const handler = server.getHandler("get_task");
    const result = await handler({ taskId: "t1" });
    expect(result.content[0].text).toContain("My Task");
    expect(result.content[0].text).toContain("[x] Sub task 1");
    expect(result.content[0].text).toContain("Hello");
    expect(result.content[0].text).toContain("file.pdf");
  });

  it("get_task - should handle not found", async () => {
    client.get.mockResolvedValue({ success: true, obj: null });

    const handler = server.getHandler("get_task");
    const result = await handler({ taskId: "t1" });
    expect(result.content[0].text).toContain("not found");
  });

  it("create_task - should build body with optional fields", async () => {
    client.post.mockResolvedValue({
      success: true, obj: { _id: "t_new", text: "New Task" },
    });

    const handler = server.getHandler("create_task");
    await handler({
      projectId: "p1", name: "New Task", description: "Desc",
      startDate: "2024-01-01", endDate: "2024-01-10", duration: 10,
      priority: "High", parentTaskId: "t_parent",
    });

    expect(client.post).toHaveBeenCalledWith("/data/task", {
      projectId: "p1", text: "New Task", description: "Desc",
      start_date: "2024-01-01", end_date: "2024-01-10", duration: 10,
      priority: "High", parentId: "t_parent",
    });
  });

  it("create_task - should handle failure", async () => {
    client.post.mockResolvedValue({ success: false, message: "Error" });

    const handler = server.getHandler("create_task");
    const result = await handler({ projectId: "p1", name: "Fail" });
    expect(result.content[0].text).toContain("Failed to create");
  });

  it("update_task - should only send provided fields", async () => {
    client.put.mockResolvedValue({ success: true });

    const handler = server.getHandler("update_task");
    const result = await handler({ taskId: "t1", name: "Updated", progress: 0.8 });
    expect(client.put).toHaveBeenCalledWith("/data/task/t1", { text: "Updated", progress: 0.8 });
    expect(result.content[0].text).toContain("updated");
  });

  it("done_task - should mark task done", async () => {
    client.put.mockResolvedValue({ success: true });

    const handler = server.getHandler("done_task");
    const result = await handler({ taskId: "t1" });
    // [FIX: BUG-03T] backend requires explicit { done: true } body
    expect(client.put).toHaveBeenCalledWith("/done/task/t1", { done: true });
    expect(result.content[0].text).toContain("done");
  });

  it("delete_task - should delete task", async () => {
    client.del.mockResolvedValue({ success: true });

    const handler = server.getHandler("delete_task");
    const result = await handler({ taskId: "t1" });
    expect(client.del).toHaveBeenCalledWith("/data/task/t1");
    expect(result.content[0].text).toContain("deleted");
  });

  it("create_task_link - should create dependency", async () => {
    client.post.mockResolvedValue({ success: true });

    const handler = server.getHandler("create_task_link");
    const result = await handler({ projectId: "p1", sourceTaskId: "t1", targetTaskId: "t2" });
    expect(client.post).toHaveBeenCalledWith("/data/link", {
      projectId: "p1", source: "t1", target: "t2", type: "0",
    });
    expect(result.content[0].text).toContain("dependency");
  });

  it("formatTask - should mark overdue tasks", async () => {
    const pastDate = new Date(Date.now() - 86400000 * 3).toISOString();
    client.post.mockResolvedValue({
      success: true,
      obj: {
        data: [
          { _id: "t1", text: "Overdue Task", done: false, inTrashcan: false, end_date: pastDate, progress: 0, duration: 5, assignee: [], follower: [], comments: [] },
        ],
        tasksDone: [],
      },
    });

    const handler = server.getHandler("list_tasks");
    const result = await handler({ projectId: "p1" });
    expect(result.content[0].text).toContain("OVERDUE");
  });
});

describe("comment tools", () => {
  let server: ReturnType<typeof createMockServer>;
  let client: MockClient;

  beforeEach(() => {
    server = createMockServer();
    client = createMockClient();
    registerCommentTools(
      server as unknown as import("@modelcontextprotocol/sdk/server/mcp.js").McpServer,
      client as unknown as import("../client.js").ManaClient
    );
  });

  it("add_comment - should PUT comment", async () => {
    client.put.mockResolvedValue({ success: true });

    const handler = server.getHandler("add_comment");
    const result = await handler({ taskId: "t1", text: "Hello" });
    expect(client.put).toHaveBeenCalledWith("/push/comment/t1", { text: "Hello" });
    expect(result.content[0].text).toContain("Comment added");
  });

  it("update_comment - should PUT updated comment", async () => {
    client.put.mockResolvedValue({ success: true });

    // [FIX: BUG-01C] commentId (ObjectId) replaces commentIndex — backend looks up by _id
    const handler = server.getHandler("update_comment");
    const result = await handler({ taskId: "t1", commentId: "c123", text: "Updated" });
    expect(client.put).toHaveBeenCalledWith("/update/comment/t1", { _id: "c123", text: "Updated" });
    expect(result.content[0].text).toContain("updated");
  });

  it("add_assignee - should PUT assignee", async () => {
    client.put.mockResolvedValue({ success: true });

    const handler = server.getHandler("add_assignee");
    const result = await handler({ taskId: "t1", userId: "u1" });
    expect(client.put).toHaveBeenCalledWith("/push/assignee/t1", { userId: "u1" });
    expect(result.content[0].text).toContain("assigned");
  });

  it("remove_assignee - should PUT remove", async () => {
    client.put.mockResolvedValue({ success: true });

    const handler = server.getHandler("remove_assignee");
    const result = await handler({ taskId: "t1", userId: "u1" });
    expect(client.put).toHaveBeenCalledWith("/pull/assignee/t1", { userId: "u1" });
    expect(result.content[0].text).toContain("removed");
  });

  it("add_follower - should PUT follower", async () => {
    client.put.mockResolvedValue({ success: true });

    const handler = server.getHandler("add_follower");
    const result = await handler({ taskId: "t1", userId: "u1" });
    expect(client.put).toHaveBeenCalledWith("/push/follower/t1", { userId: "u1" });
    expect(result.content[0].text).toContain("follower");
  });
});

describe("dashboard tools", () => {
  let server: ReturnType<typeof createMockServer>;
  let client: MockClient;

  beforeEach(() => {
    server = createMockServer();
    client = createMockClient();
    registerDashboardTools(
      server as unknown as import("@modelcontextprotocol/sdk/server/mcp.js").McpServer,
      client as unknown as import("../client.js").ManaClient
    );
  });

  it("get_workspace_summary - should return JSON dashboard", async () => {
    client.post.mockResolvedValue({
      success: true, obj: { totalTasks: 100, completed: 50 },
    });

    const handler = server.getHandler("get_workspace_summary");
    const result = await handler({ workspaceId: "w1" });
    expect(result.content[0].text).toContain("totalTasks");
  });

  it("get_workspace_summary - should handle no data", async () => {
    client.post.mockResolvedValue({ success: true, obj: null });

    const handler = server.getHandler("get_workspace_summary");
    const result = await handler({ workspaceId: "w1" });
    expect(result.content[0].text).toContain("No dashboard data");
  });

  it("get_project_dashboard - should include optional projectId", async () => {
    // [FIX: BUG-02A] dashboard is computed in MCP from GET /get/all/projects/:ws
    client.get.mockResolvedValue({
      success: true,
      obj: [
        { _id: "p1", name: "Project 1", status: 2, task: 10, tasksDone: 5, inTrashcan: false, isSave: false },
        { _id: "p2", name: "Project 2", status: 2, task: 4, tasksDone: 4, inTrashcan: false, isSave: false },
      ],
    });

    const handler = server.getHandler("get_project_dashboard");
    const result = await handler({ workspaceId: "w1", projectId: "p1" });
    expect(client.get).toHaveBeenCalledWith("/get/all/projects/w1");
    expect(result.content[0].text).toContain("Project 1");
    expect(result.content[0].text).not.toContain("Project 2");
    expect(result.content[0].text).toContain("5/10 tasks (50%)");
  });

  it("get_project_dashboard - should work without projectId", async () => {
    client.get.mockResolvedValue({
      success: true,
      obj: [
        { _id: "p1", name: "Project 1", status: 2, task: 10, tasksDone: 5, inTrashcan: false, isSave: false },
        { _id: "p2", name: "Project 2", status: 3, task: 4, tasksDone: 4, inTrashcan: false, isSave: false },
      ],
    });

    const handler = server.getHandler("get_project_dashboard");
    const result = await handler({ workspaceId: "w1" });
    expect(client.get).toHaveBeenCalledWith("/get/all/projects/w1");
    expect(result.content[0].text).toContain("Project 1");
    expect(result.content[0].text).toContain("Project 2");
    expect(result.content[0].text).toContain("9/14 tasks");
  });

  it("get_overdue_tasks - should filter overdue non-done tasks", async () => {
    const pastDate = new Date(Date.now() - 86400000 * 2).toISOString();
    // [FIX: BUG-03A] POST /data {mode:"cards"} → res.obj = { data, tasksDone }
    client.post.mockResolvedValue({
      success: true,
      obj: {
        data: [
          { _id: "t1", text: "Overdue", done: false, inTrashcan: false, end_date: pastDate },
          { _id: "t2", text: "Done", done: true, inTrashcan: false, end_date: pastDate },
          { _id: "t3", text: "Active", done: false, inTrashcan: false, end_date: new Date(Date.now() + 86400000 * 5).toISOString() },
        ],
        tasksDone: [],
      },
    });

    const handler = server.getHandler("get_overdue_tasks");
    const result = await handler({ projectId: "p1" });
    expect(client.post).toHaveBeenCalledWith("/data", { projectId: "p1", mode: "cards" });
    expect(result.content[0].text).toContain("Overdue");
    expect(result.content[0].text).toContain("days overdue");
    expect(result.content[0].text).not.toContain("Done");
    expect(result.content[0].text).not.toContain("Active");
  });

  it("get_overdue_tasks - should show message when none overdue", async () => {
    client.post.mockResolvedValue({
      success: true,
      obj: { data: [], tasksDone: [] },
    });

    const handler = server.getHandler("get_overdue_tasks");
    const result = await handler({ projectId: "p1" });
    expect(result.content[0].text).toContain("No overdue tasks");
  });
});

describe("search tools", () => {
  let server: ReturnType<typeof createMockServer>;
  let client: MockClient;

  beforeEach(() => {
    server = createMockServer();
    client = createMockClient();
    registerSearchTools(
      server as unknown as import("@modelcontextprotocol/sdk/server/mcp.js").McpServer,
      client as unknown as import("../client.js").ManaClient
    );
  });

  it("search_tasks - should return matching tasks", async () => {
    client.post.mockResolvedValue({
      success: true,
      obj: [
        { _id: "t1", text: "Design homepage", done: false, start_date: "2024-01-01", end_date: "2024-01-10" },
        { _id: "t2", text: "Design about page", done: true, start_date: "2024-02-01", end_date: "2024-02-10" },
      ],
    });

    const handler = server.getHandler("search_tasks");
    const result = await handler({ query: "Design", projectId: "p1" });
    expect(result.content[0].text).toContain("Design homepage");
    expect(result.content[0].text).toContain("2 found");
    // [FIX: TC-S02] backend search reads `words`, not `text`
    expect(client.post).toHaveBeenCalledWith("/search/task", { words: "Design", projectId: "p1" });
  });

  it("search_tasks - should handle no results", async () => {
    client.post.mockResolvedValue({ success: true, obj: null });

    const handler = server.getHandler("search_tasks");
    const result = await handler({ query: "Nothing", projectId: "p1" });
    expect(result.content[0].text).toContain("No tasks found");
  });
});

// [FIX: ISSUE-04] regression tests — mutation handlers must surface backend
// failures instead of always reporting success.
describe("mutation tools - backend failure handling (ISSUE-04)", () => {
  let server: ReturnType<typeof createMockServer>;
  let client: MockClient;

  function fresh(taskRegister: typeof registerTaskTools, commentRegister: typeof registerCommentTools) {
    server = createMockServer();
    client = createMockClient();
    taskRegister(
      server as unknown as import("@modelcontextprotocol/sdk/server/mcp.js").McpServer,
      client as unknown as import("../client.js").ManaClient
    );
    commentRegister(
      server as unknown as import("@modelcontextprotocol/sdk/server/mcp.js").McpServer,
      client as unknown as import("../client.js").ManaClient
    );
  }

  it("done_task - reports failure when backend rejects", async () => {
    fresh(registerTaskTools, registerCommentTools);
    client.put.mockResolvedValue({ success: false, message: "Not allowed" });
    const result = await server.getHandler("done_task")({ taskId: "t1" });
    expect(result.content[0].text).toContain("Failed to mark task t1");
    expect(result.content[0].text).toContain("Not allowed");
  });

  it("delete_task - reports failure when backend rejects", async () => {
    fresh(registerTaskTools, registerCommentTools);
    client.del.mockResolvedValue({ success: false, message: "Permission denied" });
    const result = await server.getHandler("delete_task")({ taskId: "t1" });
    expect(result.content[0].text).toContain("Failed to delete task t1");
    expect(result.content[0].text).toContain("Permission denied");
  });

  it("add_comment - reports failure when backend rejects", async () => {
    fresh(registerTaskTools, registerCommentTools);
    client.put.mockResolvedValue({ success: false });
    const result = await server.getHandler("add_comment")({ taskId: "t1", text: "hi" });
    expect(result.content[0].text).toContain("Failed to add comment");
  });

  it("update_comment - reports failure when backend rejects", async () => {
    fresh(registerTaskTools, registerCommentTools);
    client.put.mockResolvedValue({ success: false, message: "Index out of range" });
    const result = await server.getHandler("update_comment")({ taskId: "t1", commentIndex: 9, text: "x" });
    expect(result.content[0].text).toContain("Failed to update comment");
    expect(result.content[0].text).toContain("Index out of range");
  });

  it("add_follower - reports failure when backend rejects", async () => {
    fresh(registerTaskTools, registerCommentTools);
    client.put.mockResolvedValue({ success: false });
    const result = await server.getHandler("add_follower")({ taskId: "t1", userId: "u1" });
    expect(result.content[0].text).toContain("Failed to add follower");
  });
});
