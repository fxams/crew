import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'server.ts'), 'utf8')
const index = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'index.ts'), 'utf8')
const manifest = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../mcp.json'), 'utf8')

describe('crew_creative pointer', () => {
  it('registers a read-only pointer to creative-mcp, not a generate proxy', () => {
    expect(src).toContain("'crew_creative'")
    expect(src).toContain('https://creative-mcp-40dj.onrender.com/mcp')
    expect(src).toContain('does not proxy generate')
    expect(src).toContain('No earnings promises')
    expect(src).toContain("readOnlyHint: true")
    expect(src).toContain('/api/creative')
    expect(src.toLowerCase()).not.toMatch(/qatar|asia\/qatar|\+03:00|deepcounterfeit/)
    expect(index).toContain("'crew_creative'")
    expect(manifest).toContain('crew_creative')
  })
})
