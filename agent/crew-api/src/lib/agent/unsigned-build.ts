import {
  getAgentKeyReferral,
  getAgentReferralByOwnerWallet,
  referrerPayoutWallet,
} from '../agent-referral.js'
import { query } from '../db.js'
import { listRegisteredHireBoosts } from '../registered-hires.js'
import { buildBagsUnsignedLaunch } from './bags.js'
import { clampTreasuryBpsOverride, withCrewLaunchDescription } from './constants.js'
import { isEvmAddress } from './evm-address.js'
import { loadAgentImageBytes, sha256ImageBytes } from './ipfs.js'
import { planNarrativeHires, type CrewMember } from './narrative.js'
import {
  LAUNCH_FEE_MAP_COPY,
  assertPlatformReady,
  getTreasuryWalletForPlatform,
  isEvmLaunchPlatform,
  isSuiLaunchPlatform,
  parseLaunchPlatform,
  platformDisplayName,
  suiLaunchpad,
  type LaunchPlatform,
} from './platforms.js'
import { buildCrewShareholders, maxCrewSeats } from './shareholders.js'
import { buildUnsignedLaunchTransactions, type UnsignedLaunchPlan } from './unsigned.js'
import { buildClankerUnsignedLaunch, resolveClankerCrewWallets } from './clanker.js'
import { buildVibevibeUnsignedLaunch, resolveVibevibeCrewWallets } from './vibevibe.js'
import { buildSuiLaunchpadUnsignedLaunch } from './sui-launchpad.js'
import { buildSuiMemezUnsignedLaunch, resolveSuiCrewWallets } from './sui-memez.js'
import { isSuiAddress } from './sui-address.js'
import { applyRegisteredEvmWallets, buildZoraUnsignedLaunch, resolveZoraCrewWallets } from './zora.js'
import { pumpUnsignedNeedsMint, resolveUnsignedPumpMint } from './mint-required.js'

export type UnsignedLaunchInput = {
  name: string
  ticker: string
  description?: string
  mode?: 'split' | 'buyback' | 'raid' | 'agent'
  twitter?: string
  website?: string
  initialBuySol?: number
  imageUrl?: string
  imageBase64?: string
  imageContentType?: string
  crew?: CrewMember[]
  autoHire?: { seats?: number }
  optInOnly?: boolean
  treasuryBps?: number
  platform?: string
  launcherPubkey: string
  mintPubkey?: string
  /** Sui step 2 — TreasuryCap object id from step 1 publish effects. */
  treasuryCapObjectId?: string
  /** Sui CrewPay launchpad step 2 — package id from step 1 publish (derives meme coin type). */
  publishedPackageId?: string
  keyId?: string
  /**
   * Paying agent wallet (ACP / x402 identity). Used as launcherPubkey for Zora
   * when the requirement omits one. Does not change the 60/15/rest fee split.
   */
  payerWallet?: string
  /** 15% launching-agent desk wallet when the x402/ACP payer matches the chain. */
  deskWallet?: string
}

export type UnsignedLaunchResult = UnsignedLaunchPlan & {
  platform: LaunchPlatform
  imageSha256: string
  crew?: CrewMember[]
  shareholders: ReturnType<typeof buildCrewShareholders> | null
  treasuryBps: number
  tip: string
  identity?: string
  submitSigned: {
    tool: 'crew_submit_signed'
    http: 'POST /api/agent/launch/submit'
    body: { platform: LaunchPlatform; signed: string[] }
    note: string
  }
  feeMap: typeof LAUNCH_FEE_MAP_COPY
}

async function resolveLaunchImageSha(body: {
  imageUrl?: string
  imageBase64?: string
  imageContentType?: string
}): Promise<string> {
  const image = body.imageUrl
    ? ({ kind: 'url', url: body.imageUrl } as const)
    : ({
        kind: 'base64',
        data: body.imageBase64!,
        contentType: body.imageContentType,
      } as const)
  const { buf } = await loadAgentImageBytes(image)
  return sha256ImageBytes(buf)
}

async function assertOptedInCrew(crew: CrewMember[]): Promise<void> {
  const addrs = [...new Set(crew.flatMap((m) => [m.wallet, m.evmWallet].filter(Boolean) as string[]))]
  if (!addrs.length) return
  const { rows } = await query<{ wallet: string; evm_wallet?: string | null }>(
    `SELECT wallet, evm_wallet FROM kol_registrations WHERE wallet = ANY ($1::text[]) OR evm_wallet = ANY ($1::text[])`,
    [addrs],
  ).catch(async () =>
    query<{ wallet: string }>(`SELECT wallet FROM kol_registrations WHERE wallet = ANY ($1::text[])`, [addrs]),
  )
  const have = new Set(
    rows.flatMap((r) => {
      const extra = 'evm_wallet' in r && r.evm_wallet ? String(r.evm_wallet) : ''
      return [String(r.wallet), extra].filter(Boolean)
    }),
  )
  const missing = addrs.filter((w) => !have.has(w))
  if (missing.length) {
    throw new Error(`optInOnly=true — these crew wallets are not registered: ${missing.join(', ')}`)
  }
}

/**
 * Internal UNSIGNED builder used by HTTP, ACP, and the same path an x402 payer hits.
 * Non-custodial: returns unsigned txs + crew_submit_signed instructions. Never takes a secret.
 */
export async function runUnsignedLaunch(input: UnsignedLaunchInput): Promise<UnsignedLaunchResult> {
  const platform = parseLaunchPlatform(input.platform)
  assertPlatformReady(platform)
  const payerWallet = (input.payerWallet || '').trim() || undefined
  let launcherPubkey = (input.launcherPubkey || '').trim()
  if (!launcherPubkey && isEvmLaunchPlatform(platform) && payerWallet && isEvmAddress(payerWallet)) {
    launcherPubkey = payerWallet
  }
  if (!launcherPubkey) {
    throw new Error('launcherPubkey is required (the address that will sign — CrewPay stays non-custodial).')
  }
  if (isEvmLaunchPlatform(platform) && !isEvmAddress(launcherPubkey)) {
    throw new Error(
      `${platformDisplayName(platform)} launches require an EVM launcherPubkey (0x…).`,
    )
  }
  if (isSuiLaunchPlatform(platform) && !isSuiAddress(launcherPubkey)) {
    throw new Error(`${platformDisplayName(platform)} launches require a Sui launcherPubkey (0x… 32-byte).`)
  }
  if (!isEvmLaunchPlatform(platform) && !isSuiLaunchPlatform(platform)) {
    try {
      // eslint-disable-next-line no-new
      new (await import('@solana/web3.js')).PublicKey(launcherPubkey)
    } catch {
      throw new Error('launcherPubkey must be a Solana address for Pump.fun / Bags.fm.')
    }
  }
  if (pumpUnsignedNeedsMint(platform)) {
    resolveUnsignedPumpMint(input.mintPubkey)
  }

  const imageSha256 = await resolveLaunchImageSha(input)
  const boundRef = input.keyId
    ? await getAgentKeyReferral(input.keyId)
    : payerWallet
      ? await getAgentReferralByOwnerWallet(payerWallet)
      : null

  const chainForRef = isEvmLaunchPlatform(platform)
    ? 'evm'
    : isSuiLaunchPlatform(platform)
      ? 'sui'
      : 'solana'
  const referralPayout = boundRef ? referrerPayoutWallet(boundRef.referrer, chainForRef) : null
  const maxSeats = maxCrewSeats({ hasAgentReferrer: Boolean(referralPayout), platform })
  let crew = input.crew?.length ? input.crew : undefined
  const registered = await listRegisteredHireBoosts()
  if (!crew) {
    const requested = Math.max(1, Math.floor(input.autoHire?.seats ?? 5))
    const seats = Math.min(maxSeats, requested)
    const plan = planNarrativeHires(
      { name: input.name, ticker: input.ticker, vibe: input.description },
      {
        limit: seats,
        registered,
        onlyRegistered: Boolean(input.optInOnly),
        requireEvmPayout: isEvmLaunchPlatform(platform),
        requireSuiPayout: isSuiLaunchPlatform(platform),
      },
    )
    crew = plan.crew
  }
  const strictEvmCrew = Boolean(input.crew?.length)
  if (platform === 'zora') {
    crew = resolveZoraCrewWallets(applyRegisteredEvmWallets(crew || [], registered), {
      strict: strictEvmCrew,
    })
  }
  if (platform === 'clanker') {
    crew = resolveClankerCrewWallets(applyRegisteredEvmWallets(crew || [], registered), {
      strict: strictEvmCrew,
    })
  }
  if (platform === 'vibevibe') {
    crew = resolveVibevibeCrewWallets(applyRegisteredEvmWallets(crew || [], registered), {
      strict: strictEvmCrew,
    })
  }
  if (platform === 'sui') {
    crew = resolveSuiCrewWallets(crew || [], { strict: Boolean(input.crew?.length) })
  }

  if (input.optInOnly && crew && crew.length) {
    await assertOptedInCrew(crew)
  }

  const chain = isEvmLaunchPlatform(platform)
    ? 'evm'
    : isSuiLaunchPlatform(platform)
      ? 'sui'
      : 'solana'
  const deskWallet = (input.deskWallet || '').trim() || launcherPubkey
  const shareholders =
    crew && crew.length
      ? buildCrewShareholders(crew, input.mode || 'agent', {
          deskWallet,
          platformWallet:
            isEvmLaunchPlatform(platform) || isSuiLaunchPlatform(platform)
              ? getTreasuryWalletForPlatform(platform)
              : undefined,
          agentReferrer: referralPayout
            ? {
                wallet: referralPayout,
                handle: boundRef?.referrer?.handle,
                code: boundRef?.referrer?.code,
              }
            : null,
          treasuryBpsOverride: clampTreasuryBpsOverride(input.treasuryBps),
          chain,
          platform,
        })
      : null

  const image = input.imageUrl
    ? ({ kind: 'url', url: input.imageUrl } as const)
    : ({ kind: 'base64', data: input.imageBase64!, contentType: input.imageContentType } as const)
  const vibe = withCrewLaunchDescription(input.description || '')
  const ticker = input.ticker.replace(/^\$/, '').toUpperCase()

  let plan: UnsignedLaunchPlan
  if (platform === 'bags') {
    const img = input.imageUrl ? undefined : await loadAgentImageBytes(image)
    plan = await buildBagsUnsignedLaunch({
      name: input.name,
      ticker,
      description: vibe,
      launcherPubkey,
      shareholders: shareholders || [],
      crew: crew || [],
      initialBuySol: input.initialBuySol ?? 0,
      imageUrl: input.imageUrl,
      image: img,
      twitter: input.twitter?.trim() || undefined,
      website: input.website?.trim() || undefined,
    })
  } else if (platform === 'zora') {
    const { metadataUri } = await import('./ipfs.js').then((m) =>
      m.uploadPumpMetadataResilient(
        {
          name: input.name,
          symbol: ticker,
          description: vibe,
          twitter: input.twitter?.trim() || undefined,
          website: input.website?.trim() || undefined,
          image,
        },
        { imageUrlFallback: input.imageUrl },
      ),
    )
    plan = await buildZoraUnsignedLaunch({
      name: input.name,
      ticker,
      metadataUri,
      launcherPubkey,
      shareholders: shareholders || [],
      initialBuySol: input.initialBuySol ?? 0,
    })
  } else if (platform === 'clanker') {
    const metadataUri =
      input.imageUrl?.trim() ||
      `https://crewpay.dev/agent/launch-metadata?ticker=${encodeURIComponent(ticker)}`
    plan = await buildClankerUnsignedLaunch({
      name: input.name,
      ticker,
      metadataUri,
      imageUrl: input.imageUrl,
      launcherPubkey,
      shareholders: shareholders || [],
      twitter: input.twitter?.trim() || undefined,
      website: input.website?.trim() || undefined,
    })
  } else if (platform === 'vibevibe') {
    const metadataUri =
      input.imageUrl?.trim() ||
      `https://crewpay.dev/agent/launch-metadata?ticker=${encodeURIComponent(ticker)}`
    plan = await buildVibevibeUnsignedLaunch({
      name: input.name,
      ticker,
      metadataUri,
      launcherPubkey,
      shareholders: shareholders || [],
    })
  } else if (platform === 'sui') {
    const metadataUri =
      input.imageUrl?.trim() ||
      `https://crewpay.dev/agent/launch-metadata?ticker=${encodeURIComponent(ticker)}`
    if (suiLaunchpad() === 'crewpay') {
      plan = await buildSuiLaunchpadUnsignedLaunch({
        name: input.name,
        ticker,
        launcherPubkey,
        shareholders: shareholders || [],
        treasuryCapObjectId: input.treasuryCapObjectId?.trim() || input.mintPubkey?.trim(),
        publishedPackageId: input.publishedPackageId?.trim(),
      })
    } else {
      plan = await buildSuiMemezUnsignedLaunch({
        name: input.name,
        ticker,
        metadataUri,
        launcherPubkey,
        shareholders: shareholders || [],
        treasuryCapObjectId: input.treasuryCapObjectId?.trim() || input.mintPubkey?.trim(),
        twitter: input.twitter?.trim() || undefined,
        website: input.website?.trim() || undefined,
      })
    }
  } else {
    const { metadataUri } = await import('./ipfs.js').then((m) =>
      m.uploadPumpMetadataResilient({
        name: input.name,
        symbol: ticker,
        description: vibe,
        twitter: input.twitter?.trim() || undefined,
        website: input.website?.trim() || undefined,
        image,
      }),
    )
    plan = await buildUnsignedLaunchTransactions({
      name: input.name,
      ticker,
      metadataUri,
      launcherPubkey,
      crewShareholders: shareholders ? shareholders.map((s) => ({ wallet: s.wallet, bps: s.bps })) : null,
      initialBuySol: input.initialBuySol ?? 0,
      mintPubkey: input.mintPubkey,
    })
  }

  const tip =
    platform === 'zora'
      ? 'UNSIGNED Zora EIP-1559 — sign split then zora_create; POST /api/agent/launch/submit { platform:"zora", signed:[hex…] }.'
      : platform === 'clanker'
        ? 'UNSIGNED Clanker EIP-1559 — sign clanker_deploy; POST /api/agent/launch/submit { platform:"clanker", signed:[hex…] }.'
        : platform === 'vibevibe'
          ? 'UNSIGNED vibe/vibe EIP-1559 — sign vibevibe_deploy; POST /api/agent/launch/submit { platform:"vibevibe", signed:[hex…] }.'
          : platform === 'sui'
            ? suiLaunchpad() === 'crewpay'
              ? 'UNSIGNED CrewPay Sui launchpad — sign sui_launchpad_publish_coin then sui_launchpad_open_pool (rebuild with treasuryCapObjectId + publishedPackageId after step 1); POST /api/agent/launch/submit { platform:"sui", signed:[base64…] }.'
              : 'UNSIGNED Sui Memez — sign sui_memez_publish_coin then sui_memez_create_pool (rebuild with treasuryCapObjectId after step 1); POST /api/agent/launch/submit { platform:"sui", signed:[base64…] }.'
            : 'UNSIGNED build — sign and submit locally (or POST /api/agent/launch/submit with the signed base64). Messages expire with the blockhash; rebuild when expired.'

  const referralWarnings: string[] = []
  if (boundRef && !referralPayout && (isEvmLaunchPlatform(platform) || isSuiLaunchPlatform(platform))) {
    referralWarnings.push(
      `Referral code ${boundRef.referrer.code} is bound, but the referrer has no Base (0x) payout wallet — on-chain map stays 60/15/25 (not 60/15/5/20). Add evm_wallet on the KOL profile.`,
    )
  }

  return {
    ...plan,
    warnings: [...(plan.warnings || []), ...referralWarnings],
    platform,
    imageSha256,
    crew,
    shareholders,
    treasuryBps: clampTreasuryBpsOverride(input.treasuryBps) ?? 2500,
    tip,
    identity: payerWallet,
    submitSigned: {
      tool: 'crew_submit_signed',
      http: 'POST /api/agent/launch/submit',
      body: { platform, signed: ['<signed-tx-in-builder-order>'] },
      note:
        'Sign the unsigned steps locally with launcherPubkey. CrewPay never holds the key. ' +
        'Then POST /api/agent/launch/submit (MCP crew_submit_signed) with the same platform, or broadcast yourself.',
    },
    feeMap: LAUNCH_FEE_MAP_COPY,
  }
}
