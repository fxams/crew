import { randomBytes } from 'node:crypto'
import { query } from './db.js'

const TTL_MS = 10 * 60_000

type Rec = { nonce: string; wallet: string; createdAt: number }
const memory = new Map<string, Rec>()

function useDb(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim())
}

export async function issueBoardNonce(wallet: string): Promise<{ nonce: string; expiresAt: number }> {
  const nonce = randomBytes(16).toString('hex')
  const now = Date.now()
  if (!useDb()) {
    memory.set(nonce, { nonce, wallet, createdAt: now })
    return { nonce, expiresAt: now + TTL_MS }
    }
  await query(
    `DELETE FROM board_nonces WHERE created_at < now() - interval '10 minutes'`,
  )
  await query(
    `INSERT INTO board_nonces (nonce, wallet, created_at) VALUES ($1,$2, now())`,
    [nonce, wallet],
  )
  return { nonce, expiresAt: now + TTL_MS }
}

export async function consumeBoardNonce(nonce: string, wallet?: string): Promise<boolean> {
  if (!nonce || nonce.length < 8) return false
  if (!useDb()) {
    const rec = memory.get(nonce)
    if (!rec) return false
    if (Date.now() - rec.createdAt > TTL_MS) {
      memory.delete(nonce)
      return false
    }
    if (wallet && rec.wallet !== wallet) return false
    memory.delete(nonce)
    return true
  }
  const { rowCount } = wallet
    ? await query(
        `DELETE FROM board_nonces
         WHERE nonce = $1 AND wallet = $2 AND created_at >= now() - interval '10 minutes'`,
        [nonce, wallet],
      )
    : await query(
        `DELETE FROM board_nonces
         WHERE nonce = $1 AND created_at >= now() - interval '10 minutes'`,
        [nonce],
      )
  return (rowCount || 0) > 0
}

