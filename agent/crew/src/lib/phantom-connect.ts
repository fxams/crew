/**
 * Phantom Connect embedded wallets (Google / Apple). Singleton BrowserSDK.
 * Hidden unless an app id is present — we never hold keys.
 */

export type SocialProvider = 'google' | 'apple'

export type SocialWallet = {
  address: string
  signMessage: (message: Uint8Array) => Promise<Uint8Array>
}

type PhantomSdk = {
  connect: (opts: { provider: SocialProvider }) => Promise<{
    addresses?: Array<{ address?: string; addressType?: string; type?: string }>
  }>
  solana?: {
    signMessage?: (message: Uint8Array | string) => Promise<unknown>
  }
}

let sdk: PhantomSdk | null = null

export function resetPhantomSdk(): void {
  sdk = null
}

export async function getSdk(appId: string): Promise<PhantomSdk> {
  if (sdk) return sdk
  const { BrowserSDK, AddressType } = await import('@phantom/browser-sdk')
  sdk = new BrowserSDK({
    providers: ['google', 'apple'],
    appId,
    addressTypes: [AddressType.solana],
    authOptions: {
      redirectUrl: typeof window !== 'undefined' ? window.location.href.split('#')[0] : undefined,
    },
  }) as PhantomSdk
  return sdk
}

function pickSolanaAddress(
  addresses: Array<{ address?: string; addressType?: string; type?: string }> | undefined,
): string {
  const list = addresses || []
  const sol = list.find((a) => {
    const t = String(a.addressType || a.type || '').toLowerCase()
    const addr = (a.address || '').trim()
    return t.includes('solana') || (addr.length >= 32 && !addr.startsWith('0x'))
  })
  const address = (sol?.address || list[0]?.address || '').trim()
  if (address.length < 32) {
    throw new Error('Phantom did not return a Solana address.')
  }
  return address
}

function toBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value
  if (value && typeof value === 'object') {
    const rec = value as { signature?: unknown; bytes?: unknown }
    if (rec.signature instanceof Uint8Array) return rec.signature
    if (rec.bytes instanceof Uint8Array) return rec.bytes
  }
  if (typeof value === 'string') {
    const bin = atob(value)
    return Uint8Array.from(bin, (c) => c.charCodeAt(0))
  }
  throw new Error('Phantom did not return a signature.')
}

export async function connectSocialWallet(opts: {
  appId: string
  provider: SocialProvider
}): Promise<SocialWallet> {
  if (!opts.appId.trim()) {
    throw new Error('Phantom app id is not configured.')
  }
  const client = await getSdk(opts.appId.trim())
  const result = await client.connect({ provider: opts.provider })
  const address = pickSolanaAddress(result.addresses)
  return {
    address,
    signMessage: async (message) => {
      if (!client.solana?.signMessage) {
        throw new Error('This wallet cannot sign a message.')
      }
      return toBytes(await client.solana.signMessage(message))
    },
  }
}
