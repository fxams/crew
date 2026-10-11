/**
 * Policy for dryRunId / human-approval on launch + wire-fees.
 * Approval is optional and OFF by default (per-key requireApproval).
 */

export type SpendGateDecision = 'skip' | 'consume'

/**
 * Decide whether a spend must go through the dry-run store.
 * - requireApproval=false, no dryRunId → skip (pre-#74 behavior)
 * - requireApproval=false, dryRunId set → consume (validate, no approval required)
 * - requireApproval=true, no dryRunId → throw
 * - requireApproval=true, dryRunId set → consume (approval required)
 */
export function resolveSpendGate(opts: {
  requireApproval: boolean
  dryRunId?: string | null
}): SpendGateDecision {
  const id = (opts.dryRunId || '').trim()
  if (!id) {
    if (opts.requireApproval) {
      throw new Error(
        'dryRunId required — this API key has requireApproval=true. Call POST /api/agent/launch/dry-run, open approvalUrl, then retry with dryRunId',
      )
    }
    return 'skip'
  }
  return 'consume'
}

/**
 * Who may change requireApproval on a key.
 * - Agent API key: may turn ON only
 * - Operator wallet (CREWPAY_APPROVER_WALLETS): may turn ON or OFF
 */
export function assertMaySetRequireApproval(opts: {
  next: boolean
  /** True when caller authenticated as the agent API key for this key (not operator wallet). */
  viaAgentApiKey: boolean
}): void {
  if (opts.viaAgentApiKey && opts.next === false) {
    throw new Error(
      'Agent API keys cannot turn requireApproval off — use a CREWPAY_APPROVER_WALLETS wallet signature',
    )
  }
}
