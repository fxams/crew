import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const opsPage = readFileSync(join(here, '../components/AdminOpsPage.tsx'), 'utf8')

function flowChannelsBlock(): string {
  const start = opsPage.indexOf('const channels = [')
  const end = opsPage.indexOf(']', start)
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return opsPage.slice(start, end + 1)
}

describe('AdminOpsPage flow channels', () => {
  it('shows Direct / site as its own channel next to the agent integrations', () => {
    const channels = flowChannelsBlock()
    expect(channels).toContain("key: 'direct'")
    expect(channels).toContain("label: 'Direct / site'")
    expect(channels).toContain("key: 'mcp'")
    expect(channels).toContain("key: 'acp'")
    expect(channels).toContain("key: 'x402'")
    expect(channels).toContain("key: 'elizaos'")
  })
})
