import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'server.ts'), 'utf8')

function toolBlock(name: string): string {
  const start = src.indexOf(`'${name}'`)
  expect(start).toBeGreaterThan(-1)
  const next = src.indexOf('server.registerTool(', start + 1)
  return src.slice(start, next === -1 ? undefined : next)
}

describe('Glama tool-quality copy for B-rated tools', () => {
  it('crew_proof documents purpose, when (not) to use, params, returns, and read-only hints', () => {
    const block = toolBlock('crew_proof')
    expect(block).toMatch(/Read the public CrewPay proof tape/)
    expect(block).toMatch(/When to use:/)
    expect(block).toMatch(/When not to use:/)
    expect(block).toMatch(/Side effects: none/)
    expect(block).toMatch(/Returns JSON/)
    expect(block).toMatch(/Optional integer 1–100/)
    expect(block).toMatch(/Example: 20/)
    expect(block).toMatch(/readOnlyHint: true/)
    expect(block).toMatch(/destructiveHint: false/)
    expect(block).toMatch(/idempotentHint: true/)
    expect(block).toMatch(/openWorldHint: true/)
  })

  it('launch tools lead with the 15% onchain earn sentence', () => {
    for (const name of ['crew_launch', 'crew_build_unsigned', 'crew_launch_dry_run', 'crew_autohire']) {
      const block = toolBlock(name)
      expect(block, name).toMatch(/^[\s\S]*description:\s*\n\s*'The launching agent earns 15% of creator fees onchain\./)
      expect(block, name).toMatch(/Creator fees follow trading volume and can be zero/)
    }
  })

  it('crew_wire_fees documents on-chain side effects, unsigned/signer, non-custodial, and destructive hints', () => {
    const block = toolBlock('crew_wire_fees')
    expect(block).toMatch(/Create and permanently lock Pump\.fun fee-sharing/)
    expect(block).toMatch(/When to use:/)
    expect(block).toMatch(/When not to use:/)
    expect(block).toMatch(/non-custodial/)
    expect(block).toMatch(/requires the launch wallet to sign/)
    expect(block).toMatch(/builds the fee-share create\/update transaction/)
    expect(block).toMatch(/revokes admin/)
    expect(block).toMatch(/never pass a secret as a tool argument/)
    expect(block).toMatch(/Required\. Solana Pump\.fun mint/)
    expect(block).toMatch(/Optional string \(16–64 chars\)/)
    expect(block).toMatch(/Returns JSON/)
    expect(block).toMatch(/readOnlyHint: false/)
    expect(block).toMatch(/destructiveHint: true/)
    expect(block).toMatch(/idempotentHint: false/)
    expect(block).toMatch(/openWorldHint: true/)
  })
})
