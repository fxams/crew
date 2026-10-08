import { Keypair, PublicKey, type TransactionInstruction } from '@solana/web3.js'
import { NATIVE_MINT, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { OnlinePumpSdk, PumpSdk, getBuyTokenAmountFromSolAmount } from './pump.js'
import BN from 'bn.js'
import {
  PUMP_COIN_URL,
  USER_DESCRIPTION_MAX,
  withCrewLaunchDescription,
  type DeskMode,
  type HireRole,
} from './constants.js'
import { uploadPumpMetadata, type AgentImageInput } from './ipfs.js'
import { planNarrativeHires, type CrewMember, type NarrativeHirePlan } from './narrative.js'
import { getConnection, sendInstructions } from './send.js'
import { buildCrewShareholders, normalizeCrew } from './shareholders.js'

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
      pumpUrl: string
      launcher: string
      crew: CrewMember[]
      mode: DeskMode
      hirePlan?: NarrativeHirePlan
      warning?: string
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
    if (initialBuySol < 0 || initialBuySol > 100) {
      throw new Error('initialBuySol must be 0–100.')
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

    const { metadataUri } = await uploadPumpMetadata({
      name,
      symbol: ticker,
      description: vibe,
      twitter: input.twitter?.trim() || undefined,
      website: input.website?.trim() || undefined,
      image: input.image,
    })

    const connection = getConnection()
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

    const signature = await sendInstructions({
      payer: launcher,
      ixs: createIxs,
      signers: [mintKp],
      attempts: 1,
    })

    const mintStr = mintKp.publicKey.toBase58()
    const launchedAt = Date.now()
    const coinBase = {
      id: id('coin'),
      mint: mintStr,
      name,
      ticker,
      vibe,
      mode,
      crew: effectiveCrew,
      signature,
      launchedAt,
      launcher: deskWallet,
      pumpUrl: PUMP_COIN_URL(mintStr),
      holderKol: Boolean(input.holderKol),
      agent,
    }

    try {
      const createShareIx = await sdk.createFeeSharingConfig({
        creator: launcher.publicKey,
        mint: mintKp.publicKey,
        pool: null,
      })

      if (input.holderKol) {
        const openSig = await sendInstructions({
          payer: launcher,
          ixs: [createShareIx],
        })
        return {
          ok: true,
          mint: mintStr,
          signature,
          pumpUrl: coinBase.pumpUrl,
          launcher: deskWallet,
          crew: effectiveCrew,
          mode,
          hirePlan,
          warning: `Mint live · fee config ${openSig.slice(0, 8)}… · Holder KOL open — lock from desk later.`,
          coin: coinBase,
        }
      }

      const newShareholders = shareholders!.map((s) => ({
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
      const feeShareSignature = await sendInstructions({
        payer: launcher,
        ixs: [createShareIx, updateShareIx],
      })

      return {
        ok: true,
        mint: mintStr,
        signature,
        feeShareSignature,
        pumpUrl: coinBase.pumpUrl,
        launcher: deskWallet,
        crew: effectiveCrew,
        mode,
        hirePlan,
        coin: { ...coinBase, feeShareSignature },
      }
    } catch (feeErr) {
      console.error('Agent launch fee-share failed after create', feeErr)
      return {
        ok: true,
        mint: mintStr,
        signature,
        pumpUrl: coinBase.pumpUrl,
        launcher: deskWallet,
        crew: effectiveCrew,
        mode,
        hirePlan,
        warning:
          feeErr instanceof Error
            ? `Mint live but fee-share not locked — wire fees on the desk. ${feeErr.message}`
            : 'Mint live but fee-share not locked — wire fees on the desk.',
        coin: coinBase,
      }
    }
  } catch (err) {
    console.error('Agent launch failed', err)
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Launch failed.',
    }
  }
}
