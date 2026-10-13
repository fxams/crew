import { describe, expect, it } from "vitest";
import {
  claimHandleFromPath,
  isAdminFarcasterPath,
  isAgentsPath,
  isClaimPath,
  isCoinsPath,
  isHomePath,
  isKolsPath,
  isLaunchPath,
  isOnepagerPath,
  isProofPath,
  isReferralPath,
  isRegisterPath,
  referralCodeFromPath,
  referralInvitePath,
} from "./routes";

describe("isHomePath", () => {
  it("matches only the site home", () => {
    expect(isHomePath("/")).toBe(true);
    expect(isHomePath("")).toBe(true);
    expect(isHomePath("/crew")).toBe(true);
    expect(isHomePath("/agents")).toBe(false);
    expect(isHomePath("/coins")).toBe(false);
    expect(isHomePath("/launch")).toBe(false);
  });
});

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

describe("referral invite paths", () => {
  it("parses /r/<code>", () => {
    expect(isReferralPath("/r/coolkol")).toBe(true);
    expect(referralCodeFromPath("/r/CoolKOL")).toBe("coolkol");
    expect(referralInvitePath("CoolKOL")).toBe("/r/coolkol");
    expect(isReferralPath("/register")).toBe(false);
  });
});

describe("isCoinsPath", () => {
  it("matches the public coins board, not a single coin page", () => {
    expect(isCoinsPath("/coins")).toBe(true);
    expect(isCoinsPath("/coins/")).toBe(true);
    expect(isCoinsPath("/crew/coins")).toBe(true);
    expect(isCoinsPath("/")).toBe(false);
    expect(isCoinsPath("/coin/So11111111111111111111111111111111111111112")).toBe(false);
    expect(isCoinsPath("/agents")).toBe(false);
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

describe("isOnepagerPath", () => {
  it("matches the public one-pager page, not the static assets", () => {
    expect(isOnepagerPath("/onepager")).toBe(true);
    expect(isOnepagerPath("/onepager/")).toBe(true);
    expect(isOnepagerPath("/crew/onepager")).toBe(true);
    expect(isOnepagerPath("/onepager.png")).toBe(false);
    expect(isOnepagerPath("/onepager.pdf")).toBe(false);
    expect(isOnepagerPath("/")).toBe(false);
    expect(isOnepagerPath("/proof")).toBe(false);
  });
});

describe("isAdminFarcasterPath", () => {
  it("matches the unlisted Farcaster admin page only", () => {
    expect(isAdminFarcasterPath("/admin/farcaster")).toBe(true);
    expect(isAdminFarcasterPath("/admin/farcaster/")).toBe(true);
    expect(isAdminFarcasterPath("/crew/admin/farcaster")).toBe(true);
    expect(isAdminFarcasterPath("/admin/kickoff")).toBe(false);
    expect(isAdminFarcasterPath("/admin")).toBe(false);
    expect(isAdminFarcasterPath("/")).toBe(false);
    expect(isHomePath("/admin/farcaster")).toBe(false);
  });
});

describe("claim paths", () => {
  it("matches /claim/:handle", () => {
    expect(isClaimPath("/claim/CrewPayHQ")).toBe(true);
    expect(claimHandleFromPath("/claim/CrewPayHQ")).toBe("CrewPayHQ");
    expect(isClaimPath("/claim/")).toBe(false);
    expect(isClaimPath("/kol/CrewPayHQ")).toBe(false);
  });
});
