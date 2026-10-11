/** Format SOL for UI — keep enough digits for tiny on-chain remits (~1e-5). */
export function formatSol(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n === 0) return '0'
  const abs = Math.abs(n)
  let text: string
  if (abs >= 100) text = n.toFixed(2)
  else if (abs >= 1) text = n.toFixed(3)
  else if (abs >= 0.0001) text = n.toFixed(4)
  else if (abs >= 1e-7) text = n.toFixed(7)
  else text = n.toFixed(9)
  return text.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '').replace(/\.$/, '')
}

export function formatSolSigned(n: number): string {
  const body = formatSol(Math.abs(n))
  if (n > 0) return `+${body}`
  if (n < 0) return `-${body}`
  return body
}
