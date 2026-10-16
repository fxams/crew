type Kind = 'x402' | 'acp'

/** Compact SVG marks that sit in the same circle as Pump / Bags / Zora / Clanker letters. */
export function IntegrationMark({ kind }: { kind: Kind }) {
  if (kind === 'acp') {
    return (
      <svg className="plat-mark-svg" viewBox="0 0 16 16" aria-hidden>
        <path
          fill="currentColor"
          d="M3.1 2.9h2.55L8 9.35 10.35 2.9H12.9L9.05 13.1H6.95L3.1 2.9z"
        />
      </svg>
    )
  }
  return (
    <svg className="plat-mark-svg" viewBox="0 0 16 16" aria-hidden>
      <path
        fill="currentColor"
        d="M3.15 3.15 6.7 8l-3.55 4.85h2.6L8 9.45l2.25 3.4h2.6L9.3 8l3.55-4.85H10.25L8 6.55 5.75 3.15H3.15z"
      />
    </svg>
  )
}
