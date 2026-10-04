import type { LaunchDraft } from "../data";
import { totalShare } from "../data";

export type LaunchResult = {
  ok: true;
  mint: string;
  pumpUrl: string;
  signature: string;
  mode: LaunchDraft["mode"];
  crew: LaunchDraft["crew"];
  note: string;
};

export type LaunchError = {
  ok: false;
  error: string;
};

/**
 * Demo launcher.
 * Real Pump.fun wiring belongs in a server/agent with a funded wallet:
 * 1) upload metadata to pump.fun IPFS
 * 2) createV2 (+ optional buy) via @pump-fun/pump-sdk
 * 3) route creator fee shares to crew wallets / social recipients
 */
export async function launchCrewToken(
  draft: LaunchDraft,
): Promise<LaunchResult | LaunchError> {
  await wait(900);

  if (!draft.name.trim() || !draft.ticker.trim()) {
    return { ok: false, error: "Name and ticker are required." };
  }

  if (draft.crew.length === 0) {
    return { ok: false, error: "Add at least one X handle to the crew." };
  }

  const share = totalShare(draft.crew);
  if (share !== 100) {
    return { ok: false, error: `Crew shares must total 100% (currently ${share}%).` };
  }

  for (const member of draft.crew) {
    if (!member.handle.trim().startsWith("@")) {
      return { ok: false, error: "Handles must look like @username." };
    }
  }

  const mint = fakeMint();
  return {
    ok: true,
    mint,
    pumpUrl: `https://pump.fun/${mint}`,
    signature: fakeSig(),
    mode: draft.mode,
    crew: draft.crew,
    note:
      "Demo launch only. Connect a wallet + Pump SDK to ship on mainnet. Fee routing uses Pump sharing config / social recipients.",
  };
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fakeMint() {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let out = "";
  for (let i = 0; i < 40; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `${out}pump`;
}

function fakeSig() {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let out = "";
  for (let i = 0; i < 64; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}
