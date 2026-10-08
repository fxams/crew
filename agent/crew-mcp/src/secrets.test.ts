import { describe, expect, it } from 'vitest'
import { assertNoSecretToolArgs } from './secrets.js'

describe('assertNoSecretToolArgs', () => {
  it('allows clean inputs', () => {
    expect(() => assertNoSecretToolArgs({ name: 'Desk Cat', ticker: 'DCAT' })).not.toThrow()
  })

  it('rejects launcherKey tool args', () => {
    expect(() => assertNoSecretToolArgs({ launcherKey: 'abc123secretsecretsecret' })).toThrow(
      /must not be a tool argument/,
    )
  })

  it('rejects privateKey aliases', () => {
    expect(() => assertNoSecretToolArgs({ privateKey: 'x'.repeat(40) })).toThrow(/privateKey/)
  })
})
