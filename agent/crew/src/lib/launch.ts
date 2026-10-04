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

const HANDLE_RE = /^@[a-z0-9_]{1,15}$/i;

function normalizeCrew(draft: LaunchDraft): LaunchDraft["crew"] | LaunchError {
  if (draft.crew.length < 1 || draft.crew.length > 5) {
    return { ok: false, error: "Tag between 1 and 5 X handles." };
  }

  const seen = new Set<string>();
  const crew = [];

  for (const member of draft.crew) {
    let handle = member.handle.trim();
    if (!handle.startsWith("@")) handle = `@${handle}`;
    handle = handle.toLowerCase();

    if (!HANDLE_RE.test(handle)) {
      return { ok: false, error: `Invalid X handle: ${member.handle || "(empty)"}` };
    }
    if (seen.has(handle)) {
      return { ok: false, error: `Duplicate crew handle: ${handle}` };
    }
    seen.add(handle);

    const share = Math.round(Number(member.share) || 0);
    if (share <= 0 || share > 100) {
      return { ok: false, error: `Bad split for ${handle}.` };
    }
    crew.push({ handle, share });
  }

  const share = totalShare(crew);
  if (share !== 100) {
    return { ok: false, error: `Crew shares must total 100% (currently ${share}%).` };
  }

  return crew;
}

/**
 * Production demo launcher.
 * Validates a permanent 100% crew fee split and returns a fake CA / pump URL.
 * Mainnet path is stubbed in mainnetLaunch below.
 */
export async function launchCrewToken(
  draft: LaunchDraft,
): Promise<LaunchResult | LaunchError> {
  await wait(700);

  const name = draft.name.trim();
  const ticker = draft.ticker.trim().toUpperCase();

  if (name.length < 2 || name.length > 32) {
    return { ok: false, error: "Name must be 2–32 characters." };
  }
  if (!/^[A-Z0-9]{2,13}$/.test(ticker)) {
    return { ok: false, error: "Ticker must be 2–13 letters/numbers." };
  }
  if (draft.vibe.trim().length > 280) {
    return { ok: false, error: "Vibe max 280 characters." };
  }
  if (draft.initialBuySol < 0 || draft.initialBuySol > 100) {
    return { ok: false, error: "Initial buy must be between 0 and 100 SOL." };
  }

  const crewOrError = normalizeCrew(draft);
  if (!Array.isArray(crewOrError)) return crewOrError;

  const mint = fakeMint();
  return {
    ok: true,
    mint,
    pumpUrl: `https://pump.fun/${mint}`,
    signature: fakeSig(),
    mode: draft.mode,
    crew: crewOrError,
    note:
      "Demo mint. Mainnet: Pump IPFS metadata → createV2 + fee-share → wallet sign.",
  };
}

/**
 * Mainnet path — stubbed for production wiring.
 * 1) Upload metadata JSON to Pump IPFS
 * 2) Build createV2 (+ optional buy) via @pump-fun/pump-sdk
 * 3) createFeeSharingConfig → updateFeeSharesV2 with permanent crew bps
 * 4) Prompt wallet sign; confirm mint; register on CREW board
 */
export async function mainnetLaunch(_draft: LaunchDraft): Promise<never> {
  void _draft;
  throw new Error(
    "mainnetLaunch is stubbed. Wire Pump SDK + wallet adapter before calling.",
  );
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
