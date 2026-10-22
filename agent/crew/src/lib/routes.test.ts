import { describe, expect, it } from "vitest";
import {
  claimHandleFromPath,
  isAdminFarcasterPath,
  isAdminOpsPath,
  isAgentsEarnPath,
  isAgentsPath,
  isClaimPath,
  isCoinsPath,
  isHomePath,
  isKolHubPath,
  isKolLeaderboardPath,
  isKolRefPath,
  isKolAlertsPath,
  isKolReservedRedirectPath,
  isKolTasksPath,
  isKolsPath,
  isLaunchPath,
  isOnepagerPath,
  isJobsListPath,
  isJobsPath,
  isProofPath,
  isReferralPath,
  isRegisterPath,
  jobIdFromPath,
  jobPagePath,
  kolHandleFromPath,
  kolRefFromPath,
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
    expect(isAgentsPath("/agents/earn")).toBe(false);
  });
});

describe("isAgentsEarnPath", () => {
  it("matches the agents-earn guide and not the API docs page", () => {
    expect(isAgentsEarnPath("/agents/earn")).toBe(true);
    expect(isAgentsEarnPath("/agents/earn/")).toBe(true);
    expect(isAgentsEarnPath("/crew/agents/earn")).toBe(true);
    expect(isAgentsEarnPath("/agents")).toBe(false);
    expect(isAgentsEarnPath("/")).toBe(false);
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

  it("parses /ref/<handle> for KOL program links", () => {
    expect(isKolRefPath("/ref/coolkol")).toBe(true);
    expect(kolRefFromPath("/ref/CoolKOL")).toBe("coolkol");
    expect(isKolRefPath("/r/coolkol")).toBe(false);
  });
});

describe("kol leaderboard path", () => {
  it("does not treat leaderboard as a profile handle", () => {
    expect(isKolHubPath("/kol")).toBe(true);
    expect(isKolHubPath("/kol/leaderboard")).toBe(false);
    expect(isKolLeaderboardPath("/kol/leaderboard")).toBe(true);
    expect(kolHandleFromPath("/kol")).toBe(null);
    expect(kolHandleFromPath("/kol/leaderboard")).toBe(null);
    expect(kolHandleFromPath("/kol/CrewPayHQ")).toBe("CrewPayHQ");
  });
});

describe("kol reserved path words", () => {
  it("does not treat tasks as a profile handle", () => {
    expect(isKolTasksPath("/kol/tasks")).toBe(true);
    expect(isKolTasksPath("/kol/tasks/")).toBe(true);
    expect(kolHandleFromPath("/kol/tasks")).toBe(null);
    expect(isKolReservedRedirectPath("/kol/tasks")).toBe(false);
  });

  it("redirects other reserved words and keeps real handles", () => {
    for (const word of ["alerts", "battles", "me", "hub", "card", "settings", "founders"]) {
      expect(kolHandleFromPath(`/kol/${word}`)).toBe(null);
    }
    expect(isKolAlertsPath("/kol/alerts")).toBe(true);
    expect(kolHandleFromPath("/kol/alerts")).toBe(null);
    expect(isKolReservedRedirectPath("/kol/alerts")).toBe(false);
    expect(isKolReservedRedirectPath("/kol/settings")).toBe(true);
    expect(isKolReservedRedirectPath("/kol/founders")).toBe(false);
    expect(isKolReservedRedirectPath("/kol/leaderboard")).toBe(false);
    expect(kolHandleFromPath("/kol/mubaraqabba")).toBe("mubaraqabba");
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

describe("jobs paths", () => {
  it("matches the content jobs board and detail", () => {
    expect(isJobsListPath("/jobs")).toBe(true);
    expect(isJobsListPath("/jobs/")).toBe(true);
    expect(isJobsPath("/jobs")).toBe(true);
    expect(isJobsPath("/jobs/job_abc12345")).toBe(true);
    expect(jobIdFromPath("/jobs/job_abc12345")).toBe("job_abc12345");
    expect(jobPagePath("job_abc12345")).toBe("/jobs/job_abc12345");
    expect(isJobsListPath("/jobs/job_abc12345")).toBe(false);
    expect(isJobsPath("/tasks")).toBe(false);
    expect(isJobsPath("/")).toBe(false);
    expect(jobIdFromPath("/jobs")).toBe(null);
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

describe("isAdminOpsPath", () => {
  it("matches the unlisted ops dashboard only", () => {
    expect(isAdminOpsPath("/admin/ops")).toBe(true);
    expect(isAdminOpsPath("/admin/ops/")).toBe(true);
    expect(isAdminOpsPath("/crew/admin/ops")).toBe(true);
    expect(isAdminOpsPath("/admin/kickoff")).toBe(false);
    expect(isAdminOpsPath("/")).toBe(false);
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
