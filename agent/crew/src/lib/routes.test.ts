import { describe, expect, it } from "vitest";
import { isAgentsPath, isKolsPath, isLaunchPath, isProofPath, isRegisterPath } from "./routes";

describe("isLaunchPath", () => {
  it("keeps the launch desk off the home page", () => {
    expect(isLaunchPath("/")).toBe(false);
    expect(isLaunchPath("")).toBe(false);
    expect(isLaunchPath("/crew")).toBe(false);
    expect(isLaunchPath("/crew/")).toBe(false);
    expect(isLaunchPath("/kols")).toBe(false);
    expect(isLaunchPath("/agents")).toBe(false);
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

describe("isAgentsPath", () => {
  it("matches the agent API docs page", () => {
    expect(isAgentsPath("/agents")).toBe(true);
    expect(isAgentsPath("/agents/")).toBe(true);
    expect(isAgentsPath("/api")).toBe(true);
    expect(isAgentsPath("/crew/agents")).toBe(true);
    expect(isAgentsPath("/")).toBe(false);
    expect(isAgentsPath("/launch")).toBe(false);
    expect(isAgentsPath("/kols")).toBe(false);
  });
});

describe("isRegisterPath", () => {
  it("matches the KOL registration portal", () => {
    expect(isRegisterPath("/register")).toBe(true);
    expect(isRegisterPath("/register/")).toBe(true);
    expect(isRegisterPath("/kols")).toBe(false);
    expect(isRegisterPath("/")).toBe(false);
  });
});

describe("isProofPath", () => {
  it("matches the public proof tape", () => {
    expect(isProofPath("/proof")).toBe(true);
    expect(isProofPath("/proof/")).toBe(true);
    expect(isProofPath("/crew/proof")).toBe(true);
    expect(isProofPath("/")).toBe(false);
    expect(isProofPath("/agents")).toBe(false);
  });
});
