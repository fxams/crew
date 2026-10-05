export function isRpcForbidden(err: unknown): boolean {
  const text = err instanceof Error ? `${err.message} ${String(err)}` : String(err)
  return (
    /\b403\b/.test(text) ||
    /access forbidden/i.test(text) ||
    /failed to get recent blockhash/i.test(text) ||
    /429|too many requests/i.test(text) ||
    /401|unauthorized/i.test(text)
  )
}

export function formatRpcError(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err)
  if (/\b403\b|access forbidden/i.test(text)) {
    return 'Solana RPC blocked this request (403). Retrying another endpoint — or set VITE_RPC_URL to Helius/Alchemy.'
  }
  if (/429|too many requests/i.test(text)) {
    return 'Solana RPC rate-limited. Set VITE_RPC_URL to a dedicated provider for launches.'
  }
  return text
}
