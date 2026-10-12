import { Router } from 'express'
import { getCoin } from '../lib/coins.js'
import { query } from '../lib/db.js'
import { enrichPublicCoinMeta, toPublicCoinPage, type PublicCoinMeta } from '../lib/coin-page.js'
import { aiCrewPublicNote, ensureAiCrew } from '../lib/ai-crew.js'
import { getAccruedFees } from '../lib/fee-accrual.js'
import { featuredPublic, setCoinFeaturedX } from '../lib/featured.js'
import { detectGraduation, recordGraduationIfNew } from '../lib/graduation.js'
import { getFxRates } from '../lib/fx.js'
import { buildLaunchMilestones } from '../lib/milestones.js'
import {
  budgetFromAccrual,
  decideKickoff,
  getKickoffProposal,
  kickoffPublicView,
  listKickoffAudit,
  listProposals,
  maybeProposeEligible,
} from '../lib/kickoff.js'
import { listCoinJobTemplates } from '../lib/jobs/templates.js'
import { memoryJobs } from '../lib/jobs/store.js'
import { jobToJson } from '../lib/jobs/serialize.js'
import { assertAllowlistedApprover } from '../lib/agent/approver.js'
import { verifyWalletSignature } from '../lib/wallet-auth.js'

export const postLaunchRouter = Router()

function jobsEnabled(): boolean {
  const v = (process.env.JOBS_ENABLED || '').trim().toLowerCase()
  return v === '1' || v === 'true'
}

async function hasAgentReferrer(mint: string): Promise<boolean> {
  try {
    const { rows } = await query(
      `SELECT 1 FROM coin_shareholders WHERE mint = $1 AND role = 'agent-referral' LIMIT 1`,
      [mint],
    )
    return rows.length > 0
  } catch {
    return false
  }
}

function adminWallet(req: { header(name: string): string | undefined }, message: string): string {
  const wallet = (req.header('x-crew-wallet') || '').trim()
  const tsRaw = (req.header('x-crew-timestamp') || '').trim()
  const signature = (req.header('x-crew-signature') || '').trim()
  const timestamp = Number(tsRaw)
  if (!wallet || !tsRaw || !signature || !Number.isFinite(timestamp)) {
    throw new Error('Wallet signature required (x-crew-wallet, x-crew-timestamp, x-crew-signature)')
  }
  if (Math.abs(Date.now() - timestamp) > 10 * 60_000) {
    throw new Error('Signature expired')
  }
  const ok = verifyWalletSignature({ wallet, message, signatureBase58: signature })
  if (!ok) throw new Error('Invalid wallet signature')
  return assertAllowlistedApprover(wallet)
}

postLaunchRouter.get('/coins/:mint/kit', async (req, res) => {
  try {
    const mint = String(req.params.mint || '').trim()
    const coin = await getCoin(mint)
    if (!coin) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    const meta = await enrichPublicCoinMeta(coin).catch(() => ({} as PublicCoinMeta))
    const detected = detectGraduation({
      platform: coin.platform,
      dexId: meta.dexId || null,
    })
    if (meta.graduated || detected.graduated) {
      const rec = await recordGraduationIfNew(coin, {
        graduated: true,
        via: meta.graduatedVia || detected.via || 'observed',
      }).catch(() => null)
      if (rec?.graduatedAt) {
        coin.graduatedAt = rec.graduatedAt
        coin.graduatedVia = rec.via || coin.graduatedVia
      }
    }
    const page = toPublicCoinPage(coin, meta)
    const aiCrew = ensureAiCrew({ mint: coin.mint, ticker: coin.ticker, name: coin.name })
    const [fx, accrual, referred] = await Promise.all([
      getFxRates(),
      getAccruedFees(coin.mint),
      hasAgentReferrer(coin.mint),
    ])
    const kickoffOpts = {
      mint: coin.mint,
      accruedSol: accrual.accruedSol,
      accruedEth: accrual.accruedEth,
      distributedSol: accrual.distributedSol,
      unclaimedSol: accrual.unclaimedSol,
      hasReferrer: referred,
      volumeUsd: meta.volumeUsd,
      holders: meta.holders,
      marketCapUsd: meta.marketCapUsd ?? null,
      platform: (coin.platform === 'bags' || coin.platform === 'zora' ? coin.platform : 'pumpfun') as
        | 'pumpfun'
        | 'bags'
        | 'zora',
      solUsd: fx.solUsd,
      ethUsd: fx.ethUsd,
      accruedAt: accrual.at,
      ttlMs: accrual.ttlMs,
      source: accrual.source,
    }
    const kickoff = kickoffPublicView(kickoffOpts)
    if (kickoff.traction.met) {
      maybeProposeEligible({
        mint: coin.mint,
        budget: kickoff.budget,
        traction: kickoff.traction,
        dexscreener: kickoff.dexscreener,
      })
    }
    const kickoffLive = kickoffPublicView(kickoffOpts)
    res.json({
      ok: true,
      coin: page,
      aiCrew: {
        items: aiCrew.map((i) => ({
          id: i.id,
          caption: i.caption,
          svg: i.svg,
          createdAt: i.createdAt,
        })),
        maxPerDay: Number(process.env.AI_CREW_MAX_PER_DAY || 3),
        humansAreCore: true,
        note: aiCrewPublicNote(),
      },
      kickoff: kickoffLive,
      featured: featuredPublic(coin),
      timeline: buildLaunchMilestones({
        coin,
        pageUrl: page.pageUrl,
        firstAiAt: aiCrew.length ? Math.min(...aiCrew.map((i) => i.createdAt)) : null,
        extras: kickoffLive.extras,
        proposals: kickoffLive.proposals,
        dexscreener: kickoffLive.dexscreener,
        tractionMet: kickoffLive.dexscreener.met,
        tractionDetail: kickoffLive.dexscreener.reasons[0],
      }),
      jobs: {
        enabled: jobsEnabled(),
        templates: listCoinJobTemplates(),
        open: jobsEnabled() ? memoryJobs.listOpen(mint).map(jobToJson) : [],
        note: 'Creative jobs use existing escrow. Test/devnet when JOBS_ENABLED. Humans claim, deliver, get paid after verification. No earnings promises.',
      },
    })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'kit failed' })
  }
})

postLaunchRouter.get('/admin/kickoff', (req, res) => {
  try {
    const ts = Number((req.header('x-crew-timestamp') || '').trim())
    adminWallet(req, `crew-kickoff-admin:${ts}`)
    const mint = typeof req.query.mint === 'string' ? req.query.mint.trim() : undefined
    res.json({
      ok: true,
      proposals: listProposals(mint),
      audit: listKickoffAudit(mint),
      autoApproveUsd: Number(process.env.CREW_KICKOFF_AUTO_USD || 0),
      note: 'Auto-approve (CREW_KICKOFF_AUTO_USD, default 0) queues payout. Admin approve/reject is intent only. No automatic treasury transfers.',
    })
  } catch (err) {
    res.status(401).json({ ok: false, error: err instanceof Error ? err.message : 'unauthorized' })
  }
})

postLaunchRouter.post('/admin/kickoff/:id/approve', async (req, res) => {
  try {
    const id = String(req.params.id || '')
    const ts = Number((req.header('x-crew-timestamp') || '').trim())
    const wallet = adminWallet(req, `crew-kickoff-decide:${id}:approved:${ts}`)
    const existing = getKickoffProposal(id)
    if (!existing) throw new Error('Proposal not found')
    const [fx, accrual, referred] = await Promise.all([
      getFxRates(),
      getAccruedFees(existing.mint),
      hasAgentReferrer(existing.mint),
    ])
    const budget = budgetFromAccrual({
      mint: existing.mint,
      accrual,
      hasReferrer: referred,
      solUsd: fx.solUsd,
      ethUsd: fx.ethUsd,
    })
    const out = decideKickoff(id, 'approved', wallet, { availableUsd: budget.availableUsd })
    res.json({
      ok: true,
      ...out,
      transfer: null,
      automaticSpend: false,
    })
  } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'approve failed' })
  }
})

postLaunchRouter.post('/admin/coins/:mint/featured', async (req, res) => {
  try {
    const mint = String(req.params.mint || '').trim()
    const ts = Number((req.header('x-crew-timestamp') || '').trim())
    const wallet = adminWallet(req, `crew-featured:${mint}:${ts}`)
    const url = String((req.body as { url?: string })?.url || '')
    const coin = await setCoinFeaturedX({ mint, url, setBy: wallet })
    res.json({
      ok: true,
      featured: featuredPublic(coin),
      autoPosted: false,
    })
  } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'featured failed' })
  }
})

postLaunchRouter.post('/admin/kickoff/:id/reject', (req, res) => {
  try {
    const id = String(req.params.id || '')
    const ts = Number((req.header('x-crew-timestamp') || '').trim())
    const wallet = adminWallet(req, `crew-kickoff-decide:${id}:rejected:${ts}`)
    const out = decideKickoff(id, 'rejected', wallet)
    res.json({ ok: true, ...out, transfer: null, automaticSpend: false })
  } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'reject failed' })
  }
})

