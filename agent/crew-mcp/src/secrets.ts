/** Tool-arg names that must never carry Solana secrets. */
const FORBIDDEN = ['launcherKey', 'privateKey', 'secretKey', 'CREW_LAUNCHER_KEY'] as const

/**
 * Reject Solana secrets passed as MCP tool arguments.
 * Zod strips unknown keys by default — declare these fields optional on schemas
 * so we can detect and hard-fail instead of silently dropping them.
 */
export function assertNoSecretToolArgs(input: Record<string, unknown>): void {
  for (const key of FORBIDDEN) {
    const v = input[key]
    if (v != null && String(v).trim() !== '') {
      throw new Error(
        `Rejected: "${key}" must not be a tool argument (secrets reach the model context + MCP host). ` +
          'Set CREW_LAUNCHER_KEY in the MCP server environment for a local/private install, ' +
          'or call the REST API with x-launcher-key from your own secure backend. ' +
          'The public hosted MCP cannot launch with your wallet.',
      )
    }
  }
}
