/**
 * Draft @CrewPayHQ mention posts after remits. Operator must approve before post.
 * Does not auto-tweet — approval gate only.
 */

import { randomBytes } from 'node:crypto'
import { query } from './db.js'

export type MentionDraft = {
  id: string
  status: 'pending' | 'approved' | 'posted' | 'rejected'
  mint: string
  signature: string
  handle: string
  wallet: string
  amountSol: number
  draftText: string
  xPostId: string | null
  createdAt: string
  updatedAt: string
}

function mapDraft(row: Record<string, unknown>): MentionDraft {
  return {
    id: String(row.id),
    status: String(row.status) as MentionDraft['status'],
    mint: String(row.mint || ''),
    signature: String(row.signature || ''),
    handle: String(row.handle || ''),
    wallet: String(row.wallet || ''),
    amountSol: Number(row.amount_sol || 0),
    draftText: String(row.draft_text || ''),
    xPostId: row.x_post_id ? String(row.x_post_id) : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  }
}

function buildDraftText(opts: {
  handle: string
  amountSol: number
  ticker?: string
}): string {
  const handle = opts.handle.replace(/^@+/, '')
  const sol =
    opts.amountSol >= 1 ? opts.amountSol.toFixed(3) : opts.amountSol.toFixed(4)
  const coin = opts.ticker ? `$${opts.ticker.replace(/^\$/, '')}` : 'a CrewPay launch'
  return [
    `@${handle} just got paid ${sol} SOL from ${coin} on @CrewPayHQ.`,
    ``,
    `Claim your desk → https://crewpay.dev/claim/${handle}`,
  ].join('\n')
}

/** Create a pending mention draft from a crank / remit event (idempotent on signature+wallet). */
export async function draftMentionFromRemit(opts: {
  mint: string
  signature: string
  handle?: string
  wallet?: string
  amountSol?: number
  ticker?: string
}): Promise<MentionDraft | null> {
  const wallet = (opts.wallet || '').trim()
  const signature = (opts.signature || '').trim()
  if (!signature) return null

  let handle = (opts.handle || '').replace(/^@+/, '')
  let amountSol = Number(opts.amountSol || 0)
  let ticker = opts.ticker || ''

  if ((!handle || amountSol <= 0) && wallet) {
    const { rows } = await query(
      `SELECT handle, amount_sol, ticker FROM remits
       WHERE signature = $1 AND wallet = $2
       ORDER BY at DESC LIMIT 1`,
      [signature, wallet],
    )
    const row = rows[0] as Record<string, unknown> | undefined
    if (row) {
      handle = handle || String(row.handle || '').replace(/^@+/, '')
      amountSol = amountSol || Number(row.amount_sol || 0)
      ticker = ticker || String(row.ticker || '')
    }
  }

  if (!wallet && opts.mint) {
    // Prefer largest remit row for this crank signature.
    const { rows } = await query(
      `SELECT handle, wallet, amount_sol, ticker FROM remits
       WHERE signature = $1 AND wallet <> ''
       ORDER BY amount_sol DESC LIMIT 1`,
      [signature],
    )
    const row = rows[0] as Record<string, unknown> | undefined
    if (row) {
      handle = handle || String(row.handle || '').replace(/^@+/, '')
      amountSol = amountSol || Number(row.amount_sol || 0)
      ticker = ticker || String(row.ticker || '')
      if (!wallet) {
        // fall through with row wallet
        return draftMentionFromRemit({
          ...opts,
          wallet: String(row.wallet),
          handle,
          amountSol,
          ticker,
        })
      }
    }
  }

  if (!handle || amountSol <= 0) return null

  const existing = await query(
    `SELECT * FROM kol_mention_drafts WHERE signature = $1 AND lower(handle) = lower($2) LIMIT 1`,
    [signature, handle],
  )
  if (existing.rows[0]) return mapDraft(existing.rows[0] as Record<string, unknown>)

  const id = `md_${randomBytes(8).toString('hex')}`
  const draftText = buildDraftText({ handle, amountSol, ticker })
  await query(
    `INSERT INTO kol_mention_drafts
       (id, status, mint, signature, handle, wallet, amount_sol, draft_text)
     VALUES ($1,'pending',$2,$3,$4,$5,$6,$7)`,
    [id, opts.mint || '', signature, handle, wallet, amountSol, draftText],
  )
  const { rows } = await query(`SELECT * FROM kol_mention_drafts WHERE id = $1`, [id])
  return rows[0] ? mapDraft(rows[0] as Record<string, unknown>) : null
}

export async function listMentionDrafts(
  status: MentionDraft['status'] | 'all' = 'pending',
  limit = 50,
): Promise<MentionDraft[]> {
  const safe = Math.min(100, Math.max(1, limit))
  const { rows } =
    status === 'all'
      ? await query(
          `SELECT * FROM kol_mention_drafts ORDER BY created_at DESC LIMIT $1`,
          [safe],
        )
      : await query(
          `SELECT * FROM kol_mention_drafts WHERE status = $1 ORDER BY created_at DESC LIMIT $2`,
          [status, safe],
        )
  return rows.map((r) => mapDraft(r as Record<string, unknown>))
}

export async function setMentionDraftStatus(
  id: string,
  status: 'approved' | 'rejected' | 'posted',
  xPostId?: string,
): Promise<MentionDraft | null> {
  const { rows } = await query(
    `UPDATE kol_mention_drafts
     SET status = $2,
         x_post_id = COALESCE($3, x_post_id),
         updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [id, status, xPostId || null],
  )
  return rows[0] ? mapDraft(rows[0] as Record<string, unknown>) : null
}
