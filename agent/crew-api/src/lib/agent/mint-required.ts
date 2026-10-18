/** Pump create tx must be signed by the mint keypair. The API never keeps that secret. */
export const PUMP_MINT_REQUIRED =
  'mintPubkey is required for Pump.fun unsigned builds. Generate a mint keypair locally and pass its public key so you can sign the create tx. The API does not keep a server-side mint secret.'

export function resolveUnsignedPumpMint(mintPubkey?: string | null): string {
  const mint = (mintPubkey || '').trim()
  if (!mint) throw new Error(PUMP_MINT_REQUIRED)
  return mint
}

export function pumpUnsignedNeedsMint(platform?: string | null): boolean {
  const p = (platform || 'pumpfun').toLowerCase()
  return p === 'pumpfun'
}
