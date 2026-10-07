import { describe, expect, it } from "vitest";
import { isKolsPath, isLaunchPath } from "./routes";

describe("isLaunchPath", () => {
  it("keeps the launch desk off the home page", () => {
    expect(isLaunchPath("/")).toBe(false);
    expect(isLaunchPath("")).toBe(false);
    expect(isLaunchPath("/crew")).toBe(false);
    expect(isLaunchPath("/crew/")).toBe(false);
    expect(isLaunchPath("/kols")).toBe(false);
  });

  it("matches the launch route only", () => {
    expect(isLaunchPath("/launch")).toBe(true);
    expect(isLaunchPath("/launch/")).toBe(true);
    expect(isLaunchPath("/crew/launch")).toBe(true);
  });
});

describe("isKolsPath", () => {
  it("matches the top KOLs directory", () => {
    expect(isKolsPath("/kols")).toBe(true);
    expect(isKolsPath("/kols/")).toBe(true);
    expect(isKolsPath("/crew/kols")).toBe(true);
    expect(isKolsPath("/")).toBe(false);
    expect(isKolsPath("/launch")).toBe(false);
  });
});
