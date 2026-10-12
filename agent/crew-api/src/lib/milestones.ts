/**
 * Per-launch milestone timeline. Real data only — no invented timestamps or posts.
 */

import { explorerTxUrl } from './agent/platforms.js'
import { coinPageUrl } from './coin-page.js'
import type { ApiCoin } from './coins.js'
import { featuredXHandle, featuredXProfileUrl } from './featured.js'
import type { DexscreenerGate, KickoffExtra, KickoffFundedAt, KickoffProposal } from './kickoff.js'

export type MilestoneStatus = 'done' | 'in-progress' | 'locked'

export type Milestone = {
  id: string
  label: string
  status: MilestoneStatus
  at: number | null
  href?: string
  tx?: string
  detail: string
  fundedAt?: KickoffFundedAt | null
  applicable: boolean
}

export type MilestoneInput = {
  coin: Pick<
    ApiCoin,
    | 'mint'
    | 'launchedAt'
    | 'signature'
    | 'feeShareSignature'
    | 'crew'
    | 'platform'
    | 'pumpUrl'
    | 'featuredXUrl'
    | 'featuredXAt'
    | 'graduatedAt'
    | 'graduatedVia'
  >
  pageUrl?: string
  firstAiAt?: number | null
  extras?: KickoffExtra[]
  proposals?: KickoffProposal[]
  dexscreener?: DexscreenerGate | null
  tractionMet?: boolean
  tractionDetail?: string
}

function extra(extras: KickoffExtra[] | undefined, id: string): KickoffExtra | undefined {
  return extras?.find((e) => e.id === id)
}

function proposal(
  proposals: KickoffProposal[] | undefined,
  itemId: string,
): KickoffProposal | undefined {
  return proposals?.find((p) => p.itemId === itemId && p.status === 'approved')
}

export function buildLaunchMilestones(input: MilestoneInput): Milestone[] {
  const coin = input.coin
  const platform = coin.platform || 'pumpfun'
  const page = input.pageUrl || coinPageUrl(coin.mint)
  const pumpish = platform === 'pumpfun'
  const handle = featuredXHandle()
  const crew = coin.crew || []
  const launchedTx = coin.signature || undefined
  const launchedHref = launchedTx ? explorerTxUrl(platform, launchedTx) : coin.pumpUrl || undefined

  const launched: Milestone = {
    id: 'launched',
    label: 'Launched',
    status: coin.launchedAt ? 'done' : 'locked',
    at: coin.launchedAt || null,
    href: launchedHref,
    tx: launchedTx,
    detail: coin.launchedAt ? 'Launch record on CrewPay.' : 'Waiting for a CrewPay launch record.',
    applicable: true,
  }

  const crewHired: Milestone = {
    id: 'crew-hired',
    label: 'Crew hired',
    status: crew.length > 0 ? 'done' : 'locked',
    at: crew.length > 0 ? coin.launchedAt || null : null,
    href: coin.feeShareSignature ? explorerTxUrl(platform, coin.feeShareSignature) : undefined,
    tx: coin.feeShareSignature || undefined,
    detail:
      crew.length > 0
        ? `${crew.length} hired KOL${crew.length === 1 ? '' : 's'} — 60% of creator fees.`
        : 'Unlocks when a hired KOL crew is on the launch record.',
    applicable: true,
  }

  const pageLive: Milestone = {
    id: 'page-live',
    label: 'Page live',
    status: 'done',
    at: coin.launchedAt || null,
    href: page,
    detail: `Hosted at ${page.replace(/^https:\/\//, '')}.`,
    applicable: true,
  }

  const ai: Milestone = {
    id: 'ai-memes',
    label: 'First AI memes',
    status: input.firstAiAt ? 'done' : 'in-progress',
    at: input.firstAiAt || null,
    detail: input.firstAiAt
      ? 'Free-tier AI crew posted the first meme pack.'
      : 'Free AI crew is on — first meme appears on the next kit refresh (rate-limited).',
    applicable: true,
  }

  const graduated: Milestone = {
    id: 'graduated',
    label: 'Graduated',
    status: coin.graduatedAt ? 'done' : 'locked',
    at: coin.graduatedAt || null,
    href: coin.pumpUrl || undefined,
    detail: !pumpish
      ? 'Pump.fun bonding-curve graduation does not apply on this venue.'
      : coin.graduatedAt
        ? `Observed${coin.graduatedVia ? ` via ${coin.graduatedVia}` : ''}.`
        : 'Unlocks when this Pump.fun coin leaves the bonding curve (PumpSwap / complete). Real quotes only.',
    applicable: pumpish,
  }

  const featuredDone = Boolean(coin.featuredXUrl)
  const featured: Milestone = {
    id: 'featured-crewpayhq',
    label: `Featured on @${handle}`,
    status: !coin.graduatedAt ? 'locked' : featuredDone ? 'done' : 'in-progress',
    at: featuredDone ? coin.featuredXAt || null : null,
    href: featuredDone ? coin.featuredXUrl || undefined : featuredXProfileUrl(),
    detail: !coin.graduatedAt
      ? `Unlocks on graduation. An external routine then posts from @${handle} and sets the URL. CrewPay does not auto-post.`
      : featuredDone
        ? `Posted from @${handle}.`
        : `Graduated — waiting for @${handle} post URL (GET /api/coins/graduated-unfeatured). CrewPay does not auto-post.`,
    applicable: pumpish,
  }

  const traction: Milestone = {
    id: 'traction',
    label: 'Traction threshold',
    status: input.dexscreener?.met ? 'done' : 'locked',
    at: null,
    detail: input.dexscreener?.met
      ? `Volume $${Math.round(input.dexscreener.volumeUsd).toLocaleString('en-US')} or mcap ${
          input.dexscreener.marketCapSol != null
            ? `${Math.round(input.dexscreener.marketCapSol)} SOL`
            : '--'
        } met.`
      : input.dexscreener?.reasons[0] ||
        input.tractionDetail ||
        'Unlocks at ~$100K volume or 1,000 SOL Pump mcap (configurable).',
    applicable: true,
  }

  const ds = extra(input.extras, 'dexscreener')
  const dsApproved = proposal(input.proposals, 'dexscreener')
  const dsFunded: Milestone = {
    id: 'dexscreener-funded',
    label: 'Dexscreener funded',
    status: dsApproved
      ? 'done'
      : ds?.fundedAt?.fullyFunded && input.dexscreener?.met
        ? 'in-progress'
        : ds?.fundedAt && ds.fundedAt.progress != null && ds.fundedAt.progress > 0
          ? 'in-progress'
          : 'locked',
    at: dsApproved?.decidedAt || dsApproved?.createdAt || null,
    fundedAt: ds?.fundedAt || null,
    detail: dsApproved
      ? 'Treasury share reserved for Dexscreener Enhanced Token Info. Queued for payout — no auto transfer.'
      : ds?.fundedAt?.label
        ? `${ds.fundedAt.label}. Price may change.`
        : 'Unlocks when this coin’s treasury share fully covers Dexscreener Enhanced Token Info and traction is met.',
    applicable: true,
  }

  const listed: Milestone = {
    id: 'listed',
    label: 'Listed',
    status: dsApproved ? 'done' : 'locked',
    at: dsApproved?.decidedAt || null,
    detail: dsApproved
      ? 'Dexscreener extra approved / queued. Listing is paid ops after payout — not claimed until then.'
      : 'Unlocks after the Dexscreener item is approved from this coin’s fee budget.',
    applicable: true,
  }

  const xItem = extra(input.extras, 'x-account')
  const xApproved = proposal(input.proposals, 'x-account')
  const ownX: Milestone | null = xItem
    ? {
        id: 'own-x',
        label: 'Own X account',
        status: xApproved ? 'done' : xItem.fundedAt.fullyFunded ? 'in-progress' : 'locked',
        at: xApproved?.decidedAt || null,
        fundedAt: xItem.fundedAt,
        detail: xApproved
          ? 'Dedicated X extra approved (queued). Not the shared @CrewPayHQ account.'
          : 'Not in the free tier. Unlocks if configured and this coin’s treasury share covers it.',
        applicable: true,
      }
    : {
        id: 'own-x',
        label: 'Own X account',
        status: 'locked',
        at: null,
        detail: 'Not in the default kit — small coins post from the shared CrewPay account.',
        applicable: false,
      }

  const domain = extra(input.extras, 'custom-domain')
  const domainApproved = proposal(input.proposals, 'custom-domain')
  const customDomain: Milestone = {
    id: 'custom-domain',
    label: 'Custom domain',
    status: domainApproved
      ? 'done'
      : domain?.fundedAt?.fullyFunded
        ? 'in-progress'
        : 'locked',
    at: domainApproved?.decidedAt || null,
    fundedAt: domain?.fundedAt || null,
    detail: domainApproved
      ? 'Custom domain extra approved (queued). Hosted page stays free.'
      : domain?.fundedAt?.label
        ? `${domain.fundedAt.label}. Default ~$10.`
        : 'Optional. Unlocks when this coin’s treasury share covers the configured domain cost.',
    applicable: true,
  }

  const rows = [
    launched,
    crewHired,
    pageLive,
    ai,
    graduated,
    featured,
    traction,
    dsFunded,
    listed,
    ownX,
    customDomain,
  ]
  return rows.filter((m) => m.applicable)
}
