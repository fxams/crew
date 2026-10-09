import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Regression for CP-2 / PRAYDOG: sendBundle must pass { encoding: "base64" }
 * because Jito defaults to base58 and rejects base64 payloads as undecodable.
 */
describe('Jito sendBundle encoding (CP-2)', () => {
  it('send.ts passes encoding base64 to sendBundle', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const src = readFileSync(join(here, 'send.ts'), 'utf8')
    expect(src).toMatch(/encoding:\s*['"]base64['"]/)
    expect(src).toMatch(/sendBundle/)
    // Must not call sendBundle with only the tx array (missing options).
    expect(src).not.toMatch(/jitoRpc\(\s*url,\s*['"]sendBundle['"],\s*\[\s*encodedTxs\s*\]\s*\)/)
  })
})
