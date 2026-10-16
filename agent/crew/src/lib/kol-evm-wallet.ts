import bs58 from 'bs58'
import { isEvmAddress } from './evm-address'

export type KolEvmWalletProfile = {
  evmWallet?: string | null
}

export async function registerKolEvmWallet(opts: {
  apiBase: string
  solanaWallet: string
  signMessage: (message: Uint8Array) => Promise<Uint8Array>
  evmWallet: string
}): Promise<KolEvmWalletProfile> {
  const evm = opts.evmWallet.trim()
  if (!isEvmAddress(evm)) {
    throw new Error('Enter a valid Base wallet (0x + 40 hex characters).')
  }
  const w = opts.solanaWallet.trim()
  if (!w) throw new Error('Connect your Solana wallet to link a Base payout address.')
  const ts = Date.now()
  const message = `crew-kol-evm:${w}:${evm}:${ts}`
  const sig = await opts.signMessage(new TextEncoder().encode(message))
  const res = await fetch(`${opts.apiBase.replace(/\/$/, '')}/api/kols/register/evm`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-crew-wallet': w,
      'x-crew-timestamp': String(ts),
      'x-crew-signature': bs58.encode(sig),
    },
    body: JSON.stringify({ evmWallet: evm }),
  })
  const body = (await res.json()) as { profile?: KolEvmWalletProfile; error?: string }
  if (!res.ok) throw new Error(body.error || 'Could not save Base wallet.')
  return body.profile ?? { evmWallet: evm }
}
