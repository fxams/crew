import { describe, expect, it } from "vitest";
import { isLaunchPath } from "./routes";

describe("isLaunchPath", () => {
  it("keeps the launch desk off the home page", () => {
    expect(isLaunchPath("/")).toBe(false);
    expect(isLaunchPath("")).toBe(false);
    expect(isLaunchPath("/crew")).toBe(false);
    expect(isLaunchPath("/crew/")).toBe(false);
  });

  it("matches the launch route only", () => {
    expect(isLaunchPath("/launch")).toBe(true);
    expect(isLaunchPath("/launch/")).toBe(true);
    expect(isLaunchPath("/crew/launch")).toBe(true);
  });
});
