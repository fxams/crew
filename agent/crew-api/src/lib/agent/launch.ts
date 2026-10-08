import { Keypair, PublicKey, type TransactionInstruction } from '@solana/web3.js'
import { NATIVE_MINT, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { OnlinePumpSdk, PumpSdk, getBuyTokenAmountFromSolAmount } from './pump.js'
import BN from 'bn.js'
import {
  CREW_LAUNCH_ATTRIBUTION,
  MAX_INITIAL_BUY_SOL,
  MIN_LAUNCH_FEE_SOL,
  MODE_DESK_BPS,
  PLATFORM_BUYBACK_BPS,
  PUMP_COIN_URL,
  USER_DESCRIPTION_MAX,
  withCrewLaunchDescription,
  type DeskMode,
  type HireRole,
} from './constants.js'
import { uploadPumpMetadata, validateAgentImage, type AgentImageInput } from './ipfs.js'
import { planNarrativeHires, type CrewMember, type NarrativeHirePlan } from './narrative.js'
import {
  getConnection,
  getSignatureSlot,
  sendInstructions,
  sendJitoBundle,
} from './send.js'
import { buildCrewShareholders, normalizeCrew } from './shareholders.js'
import { assertSafeHttpUrl } from './safe-url.js'

export type AgentLaunchInput = {
  name: string
  ticker: string
  description?: string
  mode?: DeskMode
  twitter?: string
  website?: string
  initialBuySol?: number
  image: AgentImageInput
  /** Explicit crew — mutually exclusive with autoHire. */
  crew?: CrewMember[]
  /** Narrative auto-hire seats (1–10). */
  autoHire?: { seats?: number }
  agent?: { name: string; objective: string; model?: string }
  holderKol?: boolean
}

export type AgentLaunchResult =
  | {
      ok: true
      mint: string
      signature: string
      feeShareSignature?: string
      /** false when mint exists but CREW fee-share was not locked — agents must handle. */
      feeShareLocked: boolean
      pumpUrl: string
      launcher: string
      crew: Array<CrewMember & { effectiveBps?: number }>
      /** Full on-chain shareholder table (buyback + launcher + KOLs). */
      shareholders?: { wallet: string; bps: number; role?: string }[]
      mode: DeskMode
      /** null when launch used explicit crew[] (not Autohire). */
      hirePlan: NarrativeHirePlan | null
      warning?: string
      /** How fee-shares were locked: single-tx, jito bundle, or sequential (racy). */
      lockPath?: 'atomic-v0' | 'jito-bundle' | 'sequential' | 'holder-kol-open'
      createSlot?: number | null
      lockSlot?: number | null
      coin: {
        id: string
        mint: string
        name: string
        ticker: string
        vibe: string
        mode: DeskMode
        crew: CrewMember[]
        signature: string
        feeShareSignature?: string
        launchedAt: number
        launcher: string
        pumpUrl: string
        holderKol?: boolean
        agent?: { name: string; objective: string; model: string }
      }
    }
  | { ok: false; error: string }

function normalizeTicker(raw: string): string {
  return raw.trim().toUpperCase().replace(/^\$/, '')
}

function id(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

export function resolveCrew(input: AgentLaunchInput): {
  crew: CrewMember[]
  hirePlan?: NarrativeHirePlan
} {
  const mode = input.mode || 'agent'
  if (input.holderKol) {
    return { crew: [] }
  }
  if (input.crew?.length) {
    return { crew: normalizeCrew(input.crew, mode) }
  }
  const seats = Math.min(10, Math.max(1, Math.floor(input.autoHire?.seats ?? 5)))
  const hirePlan = planNarrativeHires(
    {
      name: input.name,
      ticker: input.ticker,
      vibe: input.description,
    },
    { limit: seats },
  )
  if (!hirePlan.crew.length) {
    throw new Error('Auto-hire found no KOLs — provide crew[] or richer narrative.')
  }
  return { crew: normalizeCrew(hirePlan.crew, mode), hirePlan }
}

export type AgentDryRunResult = {
  ok: true
  dryRun: true
  cluster: 'mainnet-beta'
  name: string
  ticker: string
  mode: DeskMode
  vibe: string
  twitter?: string
  website?: string
  holderKol: boolean
  initialBuySol: number
  /** Mirrors balance.sufficient when launcherPubkey provided; else null. */
  sufficient: boolean | null
  costs: {
    initialBuySol: number
    minFeeSol: number
    needSol: number
    note: string
  }
  feeMap: {
    platformBuybackBps: number
    deskBps: number
    crewPoolBps: number
  }
  /** share = % of KOL pool (60% in agent mode); effectiveBps = on-chain bps of all fees. */
  crew: Array<CrewMember & { effectiveBps?: number }>
  hirePlan: NarrativeHirePlan | null
  shareholders?: { wallet: string; bps: number; role?: string }[]
  agent?: { name: string; objective: string; model: string }
  balance?: {
    launcher: string
    sol: number
    sufficient: boolean
  }
  warnings: string[]
  nextSteps: string[]
  disclaimer: string
  attribution: string
  image?: { contentType: string; bytes: number }
}

/** Validate + plan a launch without uploading metadata or signing txs. */
export async function dryRunLaunchForAgent(
  input: AgentLaunchInput,
  opts?: { launcherPubkey?: string },
): Promise<AgentDryRunResult> {
  const mode: DeskMode = input.mode || 'agent'
  const name = input.name.trim()
  const ticker = normalizeTicker(input.ticker)
  const vibeRaw = (input.description || '').trim()
  if (name.length < 2 || name.length > 32) throw new Error('Name must be 2–32 characters.')
  if (!/^[A-Z0-9]{2,13}$/.test(ticker)) throw new Error('Ticker must be 2–13 letters/numbers.')
  if (vibeRaw.length > USER_DESCRIPTION_MAX) {
    throw new Error(`Description max ${USER_DESCRIPTION_MAX} characters.`)
  }
  const initialBuySol = Number(input.initialBuySol || 0)
  if (initialBuySol < 0 || initialBuySol > MAX_INITIAL_BUY_SOL) {
    throw new Error(`initialBuySol must be 0–${MAX_INITIAL_BUY_SOL}.`)
  }
  if (input.website?.trim()) {
    assertSafeHttpUrl(input.website.trim(), 'website')
  }
  // Same image rules as a real launch (rejects SVG / non-image bodies).
  const imageMeta = await validateAgentImage(input.image)

  let agent: { name: string; objective: string; model: string } | undefined
  if (mode === 'agent') {
    const agentName = (input.agent?.name || 'Crew Agent').trim().slice(0, 48)
    const objective = (
      input.agent?.objective ||
      input.description ||
      'Hire KOLs and grow the coin on CREW.'
    )
      .trim()
      .slice(0, 280)
    if (agentName.length < 2) throw new Error('agent.name must be 2+ chars')
    if (objective.length < 8) throw new Error('agent.objective must be 8+ chars')
    agent = {
      name: agentName,
      objective,
      model: (input.agent?.model || 'api').trim().slice(0, 48) || 'api',
    }
  }

  const { crew, hirePlan } = resolveCrew({ ...input, mode })
  const vibe = withCrewLaunchDescription(vibeRaw)
  const deskBps = MODE_DESK_BPS[mode]
  const crewPoolBps = 10_000 - PLATFORM_BUYBACK_BPS - deskBps
  const needSol = initialBuySol + MIN_LAUNCH_FEE_SOL
  const warnings: string[] = [
    'MAINNET ONLY — dry-run does not create a mint; a real launch spends SOL.',
    'Autohire wallets are public Pump.fun profiles — not endorsed affiliates and not opt-in partners.',
    'Never put a Solana secret in an LLM tool argument — set CREW_LAUNCHER_KEY in MCP/server env only.',
    `Description will include attribution: "${CREW_LAUNCH_ATTRIBUTION}" (appended if missing).`,
  ]
  if (input.holderKol) {
    warnings.push('holderKol=true leaves fee-shares unlocked until crew_lock_holder_kol.')
  }

  let shareholders: { wallet: string; bps: number }[] | undefined
  if (!input.holderKol) {
    const deskWallet =
      opts?.launcherPubkey?.trim() ||
      '11111111111111111111111111111111'
    try {
      shareholders = buildCrewShareholders(crew, mode, {
        deskWallet: new PublicKey(deskWallet).toBase58(),
      })
    } catch (err) {
      warnings.push(
        `Shareholder preview skipped: ${err instanceof Error ? err.message : 'invalid desk wallet'}`,
      )
    }
  }

  let balance: AgentDryRunResult['balance']
  if (opts?.launcherPubkey?.trim()) {
    const launcher = new PublicKey(opts.launcherPubkey.trim()).toBase58()
    const lamports = await getConnection().getBalance(new PublicKey(launcher), 'confirmed')
    const sol = lamports / 1e9
    balance = { launcher, sol, sufficient: sol >= needSol }
    if (!balance.sufficient) {
      warnings.push(
        `Launcher has ${sol.toFixed(4)} SOL; needs ≥ ${needSol.toFixed(3)} SOL for this plan.`,
      )
    }
  }

  const deskWalletPreview =
    opts?.launcherPubkey?.trim() || '11111111111111111111111111111111'
  const crewOut = input.holderKol
    ? [{ handle: '@holder', wallet: '(launcher)', share: 100, hireRole: 'kol' as HireRole }]
    : crew.map((m) => {
        const hit = shareholders?.find((s) => s.wallet === m.wallet)
        return hit ? { ...m, effectiveBps: hit.bps } : { ...m }
      })
  const shareholderTable = shareholders?.map((s) => {
    const role =
      s.wallet === deskWalletPreview
        ? 'launcher-ops'
        : crew.some((c) => c.wallet === s.wallet)
          ? 'kol'
          : 'buyback'
    return { ...s, role }
  })
  warnings.push(
    'crew[].share is % of the hired-KOL pool (60% in agent mode), not of all fees — see effectiveBps / shareholders for on-chain bps.',
  )

  return {
    ok: true,
    dryRun: true,
    cluster: 'mainnet-beta',
    name,
    ticker,
    mode,
    vibe,
    twitter: input.twitter?.trim() || undefined,
    website: input.website?.trim() || undefined,
    holderKol: Boolean(input.holderKol),
    initialBuySol,
    sufficient: balance ? balance.sufficient : null,
    costs: {
      initialBuySol,
      minFeeSol: MIN_LAUNCH_FEE_SOL,
      needSol,
      note: `Real launch needs ≥ ${needSol.toFixed(3)} SOL on the launcher (buy + ~${MIN_LAUNCH_FEE_SOL} fees).`,
    },
    feeMap: {
      platformBuybackBps: PLATFORM_BUYBACK_BPS,
      deskBps,
      crewPoolBps,
    },
    crew: crewOut,
    hirePlan: hirePlan ?? null,
    shareholders: shareholderTable,
    agent,
    balance,
    warnings,
    nextSteps: [
      'Review crew[] / hirePlan — remix wallets if needed (crew shares must total 100% of the KOL pool).',
      'Own wallet: run crewpay-mcp locally with CREW_LAUNCHER_KEY in env, or call REST with x-launcher-key from your secure backend — never paste secrets into chat/tool args.',
      'Hosted public MCP cannot launch with your wallet (no way to inject your secret safely).',
      'POST /api/agent/launch (or local crew_launch) — prefers atomic v0 or Jito bundle; check feeShareLocked + lockPath.',
      'GET /api/proof after launch to confirm board + buyback tape.',
    ],
    disclaimer:
      'CREW Autohire selects public Pump.fun wallets by narrative match. Listing is not consent, endorsement, or employment. Operators are responsible for who receives fee-shares.',
    attribution: CREW_LAUNCH_ATTRIBUTION,
    image: { contentType: imageMeta.contentType, bytes: imageMeta.bytes },
  }
}

export function launchNextSteps(result: Extract<AgentLaunchResult, { ok: true }>): string[] {
  if (result.feeShareLocked) {
    return [
      'Fee-shares locked — optional: crew_crank_remits when fees accrue.',
      'Verify on GET /api/proof and the coin pumpUrl.',
    ]
  }
  if (result.coin.holderKol) {
    return [
      'HTTP 202 / feeShareLocked=false — Holder KOL is open.',
      'Call crew_lock_holder_kol (or POST /api/agent/lock-holder-kol) when ready to lock.',
      'crew_status before locking to confirm state.',
    ]
  }
  return [
    'HTTP 202 / feeShareLocked=false — mint is live but CREW/KOL fees are NOT locked.',
    'Call crew_wire_fees (or POST /api/agent/wire-fees) with the same crew[] before celebrating.',
    'crew_status to confirm feeShareLocked=true.',
  ]
}

export async function launchForAgent(
  input: AgentLaunchInput,
  launcher: Keypair,
): Promise<AgentLaunchResult> {
  try {
    const mode: DeskMode = input.mode || 'agent'
    const name = input.name.trim()
    const ticker = normalizeTicker(input.ticker)
    const vibeRaw = (input.description || '').trim()
    if (name.length < 2 || name.length > 32) throw new Error('Name must be 2–32 characters.')
    if (!/^[A-Z0-9]{2,13}$/.test(ticker)) throw new Error('Ticker must be 2–13 letters/numbers.')
    if (vibeRaw.length > USER_DESCRIPTION_MAX) {
      throw new Error(`Description max ${USER_DESCRIPTION_MAX} characters.`)
    }
    const initialBuySol = Number(input.initialBuySol || 0)
    if (initialBuySol < 0 || initialBuySol > MAX_INITIAL_BUY_SOL) {
      throw new Error(`initialBuySol must be 0–${MAX_INITIAL_BUY_SOL}.`)
    }
    if (input.website?.trim()) {
      assertSafeHttpUrl(input.website.trim(), 'website')
    }

    let agent: { name: string; objective: string; model: string } | undefined
    if (mode === 'agent') {
      const agentName = (input.agent?.name || 'Crew Agent').trim().slice(0, 48)
      const objective = (
        input.agent?.objective ||
        input.description ||
        'Hire KOLs and grow the coin on CREW.'
      )
        .trim()
        .slice(0, 280)
      if (agentName.length < 2) throw new Error('agent.name must be 2+ chars')
      if (objective.length < 8) throw new Error('agent.objective must be 8+ chars')
      agent = {
        name: agentName,
        objective,
        model: (input.agent?.model || 'api').trim().slice(0, 48) || 'api',
      }
    }

    const { crew, hirePlan } = resolveCrew({ ...input, mode })
    const vibe = withCrewLaunchDescription(vibeRaw)
    const deskWallet = launcher.publicKey.toBase58()

    // Holder KOL: placeholder crew is the launcher until later lock.
    const effectiveCrew: CrewMember[] = input.holderKol
      ? [{ handle: '@holder', wallet: deskWallet, share: 100, hireRole: 'kol' as HireRole }]
      : crew

    const shareholders = input.holderKol
      ? null
      : buildCrewShareholders(effectiveCrew, mode, { deskWallet })

    const crewWithBps = effectiveCrew.map((m) => {
      const hit = shareholders?.find((s) => s.wallet === m.wallet)
      return hit ? { ...m, effectiveBps: hit.bps } : { ...m }
    })
    const shareholderTable = shareholders?.map((s) => {
      const role =
        s.wallet === deskWallet
          ? 'launcher-ops'
          : effectiveCrew.some((c) => c.wallet === s.wallet)
            ? 'kol'
            : 'buyback'
      return { ...s, role }
    })
    /** Always present — null when explicit crew[] (not Autohire). */
    const hirePlanOut: NarrativeHirePlan | null = hirePlan ?? null
    const atomicRequired =
      process.env.CREW_ATOMIC_REQUIRED === '1' ||
      process.env.CREW_ATOMIC_REQUIRED === 'true'

    const connection = getConnection()
    const lamports = await connection.getBalance(launcher.publicKey, 'confirmed')
    const needSol = initialBuySol + MIN_LAUNCH_FEE_SOL
    if (lamports / 1e9 < needSol) {
      throw new Error(
        `Launcher wallet needs ≥ ${needSol.toFixed(3)} SOL (buy ${initialBuySol} + fees); has ${(lamports / 1e9).toFixed(4)} SOL.`,
      )
    }

    const { metadataUri } = await uploadPumpMetadata({
      name,
      symbol: ticker,
      description: vibe,
      twitter: input.twitter?.trim() || undefined,
      website: input.website?.trim() || undefined,
      image: input.image,
    })

    const online = new OnlinePumpSdk(connection)
    const sdk = new PumpSdk()
    const mintKp = Keypair.generate()
    const global = await online.fetchGlobal()
    const createIxs: TransactionInstruction[] = []

    if (initialBuySol > 0) {
      const solAmount = new BN(Math.round(initialBuySol * 1e9))
      let feeConfig = null
      try {
        feeConfig = await online.fetchFeeConfig()
      } catch {
        feeConfig = null
      }
      const buyAmount = getBuyTokenAmountFromSolAmount({
        global,
        feeConfig,
        mintSupply: null,
        bondingCurve: null,
        amount: solAmount,
        quoteMint: NATIVE_MINT,
      })
      const createBuy = await sdk.createV2AndBuyInstructions({
        global,
        mint: mintKp.publicKey,
        name,
        symbol: ticker,
        uri: metadataUri,
        creator: launcher.publicKey,
        user: launcher.publicKey,
        amount: buyAmount,
        solAmount,
        mayhemMode: false,
      })
      createIxs.push(...createBuy)
    } else {
      const createIx = await sdk.createV2Instruction({
        mint: mintKp.publicKey,
        name,
        symbol: ticker,
        uri: metadataUri,
        creator: launcher.publicKey,
        user: launcher.publicKey,
        mayhemMode: false,
      })
      createIxs.push(createIx)
    }

    const mintStr = mintKp.publicKey.toBase58()
    const launchedAt = Date.now()
    const pumpUrl = PUMP_COIN_URL(mintStr)

    const createShareIx = await sdk.createFeeSharingConfig({
      creator: launcher.publicKey,
      mint: mintKp.publicKey,
      pool: null,
    })

    // Prefer atomic create(+buy)+fee-lock so snipers cannot skim undivided fees.
    // Path: (1) single v0+ALT tx  (2) Jito bundle [create, lock]  (3) sequential (racy).
    if (!input.holderKol && shareholders) {
      const newShareholders = shareholders.map((s) => ({
        address: new PublicKey(s.wallet),
        shareBps: s.bps,
      }))
      const updateShareIx = await sdk.updateFeeSharesV2({
        authority: launcher.publicKey,
        mint: mintKp.publicKey,
        currentShareholders: [launcher.publicKey],
        newShareholders,
        quoteMint: NATIVE_MINT,
        quoteTokenProgram: TOKEN_PROGRAM_ID,
      })
      const feeIxs = [createShareIx, updateShareIx]
      const coinBaseFields = {
        id: id('coin'),
        mint: mintStr,
        name,
        ticker,
        vibe,
        mode,
        crew: effectiveCrew,
        launcher: deskWallet,
        pumpUrl,
        holderKol: false as const,
        agent,
      }

      // (1) Single v0 transaction (fits when CREW_LOOKUP_TABLE compresses static accounts).
      try {
        const signature = await sendInstructions({
          payer: launcher,
          ixs: [...createIxs, ...feeIxs],
          signers: [mintKp],
          attempts: 1,
        })
        const slot = await getSignatureSlot(signature)
        return {
          ok: true,
          mint: mintStr,
          signature,
          feeShareSignature: signature,
          feeShareLocked: true,
          pumpUrl,
          launcher: deskWallet,
          crew: crewWithBps,
          shareholders: shareholderTable,
          mode,
          hirePlan: hirePlanOut,
          lockPath: 'atomic-v0',
          createSlot: slot,
          lockSlot: slot,
          coin: {
            ...coinBaseFields,
            signature,
            feeShareSignature: signature,
            launchedAt,
          },
        }
      } catch (atomicErr) {
        const atomicMsg =
          atomicErr instanceof Error ? atomicErr.message : 'atomic create+fee-share failed'
        console.warn('Agent launch single-tx atomic failed; trying Jito bundle', atomicMsg)
      }

      // (2) Jito bundle — create then lock land in order with no public mempool gap.
      try {
        const { signatures } = await sendJitoBundle({
          payer: launcher,
          steps: [
            { ixs: createIxs, signers: [mintKp] },
            { ixs: feeIxs },
          ],
        })
        const signature = signatures[0]!
        const feeShareSignature = signatures[1]!
        const [createSlot, lockSlot] = await Promise.all([
          getSignatureSlot(signature),
          getSignatureSlot(feeShareSignature),
        ])
        return {
          ok: true,
          mint: mintStr,
          signature,
          feeShareSignature,
          feeShareLocked: true,
          pumpUrl,
          launcher: deskWallet,
          crew: crewWithBps,
          shareholders: shareholderTable,
          mode,
          hirePlan: hirePlanOut,
          lockPath: 'jito-bundle',
          createSlot,
          lockSlot,
          coin: {
            ...coinBaseFields,
            signature,
            feeShareSignature,
            launchedAt,
          },
        }
      } catch (jitoErr) {
        const jitoMsg = jitoErr instanceof Error ? jitoErr.message : 'jito bundle failed'
        console.warn('Agent launch Jito bundle failed', jitoMsg)
        if (atomicRequired) {
          return {
            ok: false,
            error: `Atomic fee-lock required (CREW_ATOMIC_REQUIRED=1) but both single-tx and Jito bundle failed: ${jitoMsg}. Set CREW_LOOKUP_TABLE or retry.`,
          }
        }
      }

      // (3) Sequential fallback — race window remains; surface slots so agents can audit.
      try {
        const signature = await sendInstructions({
          payer: launcher,
          ixs: createIxs,
          signers: [mintKp],
          attempts: 1,
        })
        const createSlot = await getSignatureSlot(signature)
        const coinBase = {
          ...coinBaseFields,
          signature,
          launchedAt: Date.now(),
        }
        try {
          const feeShareSignature = await sendInstructions({
            payer: launcher,
            ixs: feeIxs,
          })
          const lockSlot = await getSignatureSlot(feeShareSignature)
          return {
            ok: true,
            mint: mintStr,
            signature,
            feeShareSignature,
            feeShareLocked: true,
            pumpUrl,
            launcher: deskWallet,
            crew: crewWithBps,
            shareholders: shareholderTable,
            mode,
            hirePlan: hirePlanOut,
            lockPath: 'sequential',
            createSlot,
            lockSlot,
            warning:
              'Fee-shares locked in a follow-up tx (atomic single-tx + Jito bundle both failed). Snipers between createSlot and lockSlot pay undivided creator fees to the launcher vault — set CREW_LOOKUP_TABLE or ensure Jito reachability.',
            coin: { ...coinBase, feeShareSignature },
          }
        } catch (feeErr) {
          const feeMsg = feeErr instanceof Error ? feeErr.message : 'fee-share failed'
          console.error('Agent launch fee-share failed after create', feeMsg)
          return {
            ok: true,
            mint: mintStr,
            signature,
            feeShareLocked: false,
            pumpUrl,
            launcher: deskWallet,
            crew: crewWithBps,
            shareholders: shareholderTable,
            mode,
            hirePlan: hirePlanOut,
            lockPath: 'sequential',
            createSlot,
            warning: `Mint live but fee-share not locked — call crew_wire_fees immediately. ${feeMsg}`,
            coin: coinBase,
          }
        }
      } catch (createErr) {
        const msg = createErr instanceof Error ? createErr.message : 'Launch failed.'
        console.error('Agent launch create failed', msg)
        return { ok: false, error: msg }
      }
    }

    // holderKol: create mint, open fee config, leave unlocked for later lock.
    try {
      const signature = await sendInstructions({
        payer: launcher,
        ixs: createIxs,
        signers: [mintKp],
        attempts: 1,
      })
      const coinBase = {
        id: id('coin'),
        mint: mintStr,
        name,
        ticker,
        vibe,
        mode,
        crew: effectiveCrew,
        signature,
        launchedAt: Date.now(),
        launcher: deskWallet,
        pumpUrl,
        holderKol: true,
        agent,
      }
      const openSig = await sendInstructions({
        payer: launcher,
        ixs: [createShareIx],
      })
      return {
        ok: true,
        mint: mintStr,
        signature,
        feeShareLocked: false,
        pumpUrl,
        launcher: deskWallet,
        crew: crewWithBps,
        shareholders: shareholderTable,
        mode,
        hirePlan: hirePlanOut,
        lockPath: 'holder-kol-open',
        createSlot: await getSignatureSlot(signature),
        warning: `Mint live · fee config ${openSig.slice(0, 8)}… · Holder KOL open — fees unlocked until crew_lock_holder_kol (same sniper exposure as sequential lock).`,
        coin: coinBase,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Launch failed.'
      console.error('Agent launch holderKol path failed', msg)
      return { ok: false, error: msg }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Launch failed.'
    console.error('Agent launch failed', msg)
    return {
      ok: false,
      error: msg,
    }
  }
}
