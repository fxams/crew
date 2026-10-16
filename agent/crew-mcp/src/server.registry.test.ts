import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('MCP Registry server.json', () => {
  it('matches package mcpName, version, and npm identifier', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      name: string
      version: string
      mcpName: string
    }
    const server = JSON.parse(readFileSync(join(root, 'server.json'), 'utf8')) as {
      name: string
      version: string
      packages: Array<{ registryType: string; identifier: string; version: string }>
      remotes: Array<{ url: string }>
    }
    expect(server.name).toBe(pkg.mcpName)
    expect(server.version).toBe(pkg.version)
    const npm = server.packages.find((p) => p.registryType === 'npm')
    expect(npm?.identifier).toBe(pkg.name)
    expect(npm?.version).toBe(pkg.version)
    expect(server.remotes[0]?.url).toBe('https://mcp.crewpay.dev/mcp')
  })
})
