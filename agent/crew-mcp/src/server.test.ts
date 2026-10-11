import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { packageVersion } from './server.js'

describe('mcp version', () => {
  it('packageVersion() matches package.json', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const pkg = JSON.parse(readFileSync(join(here, '../package.json'), 'utf8')) as {
      version?: string
    }
    expect(packageVersion()).toBe(pkg.version)
  })
})

