import { describe, it, expect } from "vitest";
import { PROJECT_STATUS } from "../types.js";

describe("types", () => {
  it("should have correct project status mapping", () => {
    expect(PROJECT_STATUS[0]).toBe("No status");
    expect(PROJECT_STATUS[1]).toBe("Scheduled");
    expect(PROJECT_STATUS[2]).toBe("In progress");
    expect(PROJECT_STATUS[3]).toBe("Completed");
    expect(PROJECT_STATUS[4]).toBe("On hold");
    expect(PROJECT_STATUS[5]).toBe("Cancelled");
  });

  it("should have exactly 6 status values", () => {
    expect(Object.keys(PROJECT_STATUS)).toHaveLength(6);
  });
});
