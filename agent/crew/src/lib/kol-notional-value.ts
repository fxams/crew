/** Keep in sync with agent/crew-api/src/lib/kol-program/notional-influence-value.ts */
export const NOTIONAL_VALUE_DISCLAIMER =
  'Notional, based on public X metrics. Not earnings or a payout.'

export const NOTIONAL_VALUE_FORMULA_DOC = {
  disclaimer: NOTIONAL_VALUE_DISCLAIMER,
  steps: [
    'audience = log10(1 + followers) × 120 + log10(1 + avgImpressionsPerPost) × 90',
    'boost = 1 + min(engagementRate, 0.25) × 3',
    'notionalUsd = round(audience × boost × 2.75)',
  ],
} as const

export function formatNotionalUsd(n: number): string {
  return `$${Math.max(0, Math.round(n)).toLocaleString('en-US')}`
}
