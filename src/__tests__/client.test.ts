import { describe, it, expect, vi, beforeEach } from "vitest";
import { ManaClient } from "../client.js";

describe("ManaClient", () => {
  let client: ManaClient;
  const mockFetch = vi.fn();

  // Helper: build a realistic fetch Response mock. Body is a JS value that will
  // be JSON-stringified so `response.text()` + `JSON.parse()` work end-to-end.
  function mockResponse(body: unknown, init: { ok?: boolean; status?: number; statusText?: string; contentType?: string | null } = {}) {
    const text = typeof body === "string" ? body : JSON.stringify(body);
    const status = init.status ?? 200;
    const headers = new Map<string, string>();
    if (init.contentType !== null) {
      headers.set("content-type", init.contentType ?? "application/json");
    }
    return {
      ok: init.ok ?? (status >= 200 && status < 300),
      status,
      statusText: init.statusText ?? "",
      text: () => Promise.resolve(text),
      headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
    };
  }

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
    client = new ManaClient("https://api.manawork.com", "mana_sk_testkey123");
  });

  describe("authentication", () => {
    it("should authenticate on first request", async () => {
      mockFetch
        .mockResolvedValueOnce(
          mockResponse({
            success: true,
            obj: { token: "jwt_token_123", user: { _id: "u1", name: "Test" } },
          })
        )
        .mockResolvedValueOnce(mockResponse({ success: true, obj: { id: "1" } }));

      await client.get("/test");
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenNthCalledWith(1, "https://api.manawork.com/api-key/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: "mana_sk_testkey123" }),
      });
    });

    it("should throw on invalid API key", async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ success: false, data: "Invalid API key" }));

      await expect(client.get("/test")).rejects.toThrow("Authentication failed");
    });

    it("should throw on missing token in verify response", async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ success: true, obj: {} }));

      await expect(client.get("/test")).rejects.toThrow("Authentication failed");
    });

    it("should reuse cached token within expiry", async () => {
      mockFetch
        .mockResolvedValueOnce(
          mockResponse({ success: true, obj: { token: "jwt_token_123", user: { _id: "u1" } } })
        )
        .mockResolvedValueOnce(mockResponse({ success: true, data: "first" }))
        .mockResolvedValueOnce(mockResponse({ success: true, data: "second" }));

      await client.get("/first");
      await client.get("/second");

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("should strip trailing slashes from baseUrl", () => {
      const c = new ManaClient("https://api.manawork.com///", "key");
      expect((c as unknown as { baseUrl: string }).baseUrl).toBe("https://api.manawork.com");
    });
  });

  describe("request methods", () => {
    beforeEach(() => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ success: true, obj: { token: "jwt_token", user: { _id: "u1" } } })
      );
    });

    it("should make GET request with auth header", async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ success: true, obj: { id: "1" } }));

      const res = await client.get("/test/path");
      expect(mockFetch).toHaveBeenLastCalledWith("https://api.manawork.com/test/path", {
        method: "GET",
        headers: {
          Authorization: "Bearer jwt_token",
          "Content-Type": "application/json",
        },
      });
      expect(res.success).toBe(true);
    });

    it("should make POST request with body", async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ success: true, obj: { id: "2" } }));

      await client.post("/create", { name: "test" });
      expect(mockFetch).toHaveBeenLastCalledWith("https://api.manawork.com/create", {
        method: "POST",
        headers: {
          Authorization: "Bearer jwt_token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "test" }),
      });
    });

    it("should make PUT request with body", async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ success: true }));

      await client.put("/update/1", { status: 3 });
      expect(mockFetch).toHaveBeenLastCalledWith("https://api.manawork.com/update/1", {
        method: "PUT",
        headers: {
          Authorization: "Bearer jwt_token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: 3 }),
      });
    });

    it("should make DELETE request", async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ success: true }));

      await client.del("/delete/1");
      expect(mockFetch).toHaveBeenLastCalledWith("https://api.manawork.com/delete/1", {
        method: "DELETE",
        headers: {
          Authorization: "Bearer jwt_token",
          "Content-Type": "application/json",
        },
      });
    });

    it("should not send body for GET requests", async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ success: true }));

      await client.get("/list");
      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      expect(lastCall[1]).not.toHaveProperty("body");
    });

    it("should return response even on non-ok status with JSON body", async () => {
      // Non-ok HTTP but valid JSON body → still returned (handlers decide via res.success)
      mockFetch.mockResolvedValueOnce(
        mockResponse({ success: false, message: "Server error" }, { status: 500, statusText: "Internal Server Error" })
      );

      const res = await client.get("/fail");
      expect(res.success).toBe(false);
      expect(res.message).toBe("Server error");
    });
  });

  describe("token refresh on 401", () => {
    it("should re-authenticate on 401 and retry", async () => {
      mockFetch
        .mockResolvedValueOnce(
          mockResponse({ success: true, obj: { token: "jwt_old", user: { _id: "u1" } } })
        )
        .mockResolvedValueOnce(
          mockResponse({ success: false }, { status: 401, statusText: "Unauthorized" })
        )
        .mockResolvedValueOnce(
          mockResponse({ success: true, obj: { token: "jwt_new", user: { _id: "u1" } } })
        )
        .mockResolvedValueOnce(mockResponse({ success: true, obj: { id: "1" } }));

      const res = await client.get("/test");
      expect(mockFetch).toHaveBeenCalledTimes(4);
      expect(res.success).toBe(true);
    });
  });

  // [FIX: ISSUE-01/02/03] regression tests — non-JSON / empty bodies must throw
  // a clear, status-bearing error instead of the cryptic `Unexpected token '<'`
  // or `Unexpected end of JSON input` from response.json().
  describe("non-JSON response handling (ISSUE-01/02/03)", () => {
    beforeEach(() => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ success: true, obj: { token: "jwt_token", user: { _id: "u1" } } })
      );
    });

    it("should throw a clear error on an HTML (non-JSON) response instead of `Unexpected token '<'`", async () => {
      // Reproduces ISSUE-01: get_workspace_summary saw "<html>..." from the backend.
      mockFetch.mockResolvedValueOnce(
        mockResponse("<html><body>502 Bad Gateway</body></html>", {
          status: 502,
          statusText: "Bad Gateway",
          contentType: "text/html; charset=utf-8",
        })
      );

      await expect(client.post("/dashboard/workspace", { workspaceId: "w1" })).rejects.toThrow(
        /non-JSON response: HTTP 502.*<html>/s
      );
    });

    it("should throw a clear error on an empty body instead of `Unexpected end of JSON input`", async () => {
      // Reproduces ISSUE-02/03: list_tasks / get_overdue_tasks hit /data with empty body.
      mockFetch.mockResolvedValueOnce(
        mockResponse("", { status: 200, contentType: null })
      );

      await expect(client.post("/data", { projectId: "p1" })).rejects.toThrow(
        /non-JSON response.*empty body/s
      );
    });

    // [FIX: ISSUE-08] Regression test for the real-world UAT failure mode:
    // empty body WITH `Content-Type: application/json` header (which the previous
    // heuristic let through to JSON.parse("") → `Unexpected end of JSON input`).
    it("should throw a clear error when body is empty but Content-Type claims JSON (ISSUE-08 regression)", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse("", { status: 200, contentType: "application/json; charset=utf-8" })
      );

      await expect(client.post("/data", { projectId: "p1" })).rejects.toThrow(
        /non-JSON response.*empty body/s
      );
    });

    it("should still accept a JSON body even when Content-Type is missing (lenient)", async () => {
      // Backend may omit Content-Type; a body starting with {/[ is still valid JSON.
      mockFetch.mockResolvedValueOnce(
        mockResponse({ success: true, obj: { ok: true } }, { contentType: null })
      );

      const res = await client.get("/lenient");
      expect(res.success).toBe(true);
    });
  });
});
