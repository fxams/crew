import { Router } from 'express'
import { z } from 'zod'
import { deliveryGatedPayoutsEnabled } from '../lib/delivery-gated-config.js'
import {
  getCrewPayoutLedger,
  ledgerPublicView,
  releaseVerifiedCrewPayouts,
  submitPromoDelivery,
} from '../lib/delivery-gated-payouts.js'
import { tierForWallet } from '../lib/kol-reputation.js'

export const crewPayoutsRouter = Router()

crewPayoutsRouter.get('/coins/:mint/crew-payouts', (req, res) => {
  const mint = String(req.params.mint || '').trim()
  const ledger = getCrewPayoutLedger(mint)
  if (!ledger) {
    res.status(404).json({
      ok: false,
      error: deliveryGatedPayoutsEnabled()
        ? 'No delivery ledger for this mint'
        : 'CREW_DELIVERY_GATED_PAYOUTS is off',
    })
    return
  }
  res.json({ ok: true, ledger: ledgerPublicView(ledger) })
})

crewPayoutsRouter.post('/coins/:mint/crew-payouts/submit', async (req, res) => {
  try {
    if (!deliveryGatedPayoutsEnabled()) {
      res.status(403).json({ ok: false, error: 'CREW_DELIVERY_GATED_PAYOUTS is off' })
      return
    }
    const mint = String(req.params.mint || '').trim()
    const body = z
      .object({
        wallet: z.string().min(32).max(64),
        urls: z.array(z.string().url()).min(1).max(8),
        kolHandle: z.string().max(32).optional(),
        text: z.string().max(4000).optional(),
      })
      .parse(req.body ?? {})
    const out = await submitPromoDelivery({
      mint,
      wallet: body.wallet,
      urls: body.urls,
      text: body.text,
      kolHandle: body.kolHandle,
    })
    if (!out.ok) {
      res.status(400).json({ ok: false, error: out.error || 'verification failed', checks: out.checks })
      return
    }
    res.status(201).json({
      ok: true,
      ledger: out.ledger ? ledgerPublicView(out.ledger) : null,
      checks: out.checks,
    })
  } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'submit failed' })
  }
})

crewPayoutsRouter.post('/coins/:mint/crew-payouts/release', async (req, res) => {
  try {
    if (!deliveryGatedPayoutsEnabled()) {
      res.status(403).json({ ok: false, error: 'CREW_DELIVERY_GATED_PAYOUTS is off' })
      return
    }
    const mint = String(req.params.mint || '').trim()
    const out = await releaseVerifiedCrewPayouts(mint, {
      from: typeof req.body?.from === 'string' ? req.body.from : undefined,
    })
    res.json({
      ok: true,
      releases: out.releases,
      ledger: out.ledger ? ledgerPublicView(out.ledger) : null,
    })
  } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'release failed' })
  }
})

crewPayoutsRouter.get('/kols/reputation/:wallet', (req, res) => {
  const wallet = String(req.params.wallet || '').trim()
  const { tier, score, stats } = tierForWallet(wallet)
  res.json({ ok: true, wallet, tier, score, stats })
})
