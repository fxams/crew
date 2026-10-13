import * as jose from 'jose'

const PRIVY_ISSUER = 'privy.io'

export function privyAppIdFromEnv(): string {
  return (process.env.PRIVY_APP_ID || process.env.VITE_PRIVY_APP_ID || '').trim()
}

export function privyAppSecretFromEnv(): string {
  return (process.env.PRIVY_APP_SECRET || '').trim()
}

export function privyJwksUrl(appId: string): string {
  return `https://auth.privy.io/api/v1/apps/${encodeURIComponent(appId)}/jwks.json`
}

export function privyUserUrl(userId: string): string {
  return `https://auth.privy.io/api/v1/users/${encodeURIComponent(userId)}`
}

type PrivyLinkedAccount = {
  type?: string
  chain_type?: string
  chainType?: string
  address?: string
}

function collectAddresses(accounts: PrivyLinkedAccount[] | undefined): string[] {
  const out: string[] = []
  for (const account of accounts || []) {
    const addr = (account.address || '').trim()
    if (!addr || addr.startsWith('0x')) continue
    const chain = String(account.chain_type || account.chainType || '').toLowerCase()
    const type = String(account.type || '').toLowerCase()
    if (chain.includes('solana') || type === 'wallet' || addr.length >= 32) {
      out.push(addr)
    }
  }
  return out
}

async function verifyAccessToken(token: string, appId: string): Promise<string> {
  const JWKS = jose.createRemoteJWKSet(new URL(privyJwksUrl(appId)))
  const { payload } = await jose.jwtVerify(token, JWKS, {
    issuer: PRIVY_ISSUER,
    audience: appId,
  })
  const userId = String(payload.sub || '').trim()
  if (!userId) throw new Error('Privy token is missing a user id.')
  return userId
}

async function fetchPrivyUser(
  userId: string,
  appId: string,
  secret: string,
): Promise<PrivyLinkedAccount[]> {
  const auth = Buffer.from(`${appId}:${secret}`).toString('base64')
  const res = await fetch(privyUserUrl(userId), {
    headers: {
      Authorization: `Basic ${auth}`,
      'privy-app-id': appId,
    },
  })
  if (!res.ok) {
    throw new Error('Could not verify the Privy wallet with the app secret.')
  }
  const body = (await res.json()) as {
    linked_accounts?: PrivyLinkedAccount[]
    linkedAccounts?: PrivyLinkedAccount[]
  }
  return body.linked_accounts || body.linkedAccounts || []
}

/**
 * Confirm a Privy access token belongs to this app and (when a secret is set)
 * that the claimed Solana address is on that user. CrewPay never holds keys.
 */
export async function verifyPrivyPayoutWallet(opts: {
  token: string
  address: string
}): Promise<{ userId: string; address: string }> {
  const appId = privyAppIdFromEnv()
  if (!appId) throw new Error('Privy is not configured.')
  const token = (opts.token || '').trim()
  const address = (opts.address || '').trim()
  if (!token) throw new Error('Privy access token is required.')
  if (address.length < 32 || address.startsWith('0x')) {
    throw new Error('Invalid Solana payout wallet.')
  }
  let userId: string
  try {
    userId = await verifyAccessToken(token, appId)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Invalid Privy token.'
    throw new Error(/Privy token is missing/i.test(msg) ? msg : 'Invalid Privy token.')
  }
  const secret = privyAppSecretFromEnv()
  if (secret) {
    const accounts = await fetchPrivyUser(userId, appId, secret)
    if (!collectAddresses(accounts).includes(address)) {
      throw new Error('Privy user does not own this Solana wallet.')
    }
  }
  return { userId, address }
}
