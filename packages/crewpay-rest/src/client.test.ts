import { describe, expect, it, vi } from 'vitest'
import { CrewPayClient } from './client.ts'

describe('CrewPayClient spend gates', () => {
  const body = { name: 'Desk Cat', ticker: 'DCAT', autoHire: { seats: 3 } }

  it('blocks launch/wire without dryRunId', () => {
    const client = new CrewPayClient({ apiUrl: 'https://example.invalid', apiKey: 'x', launcherKey: 'y' })
    expect(() => client.launch(body, { dryRunId: '' })).toThrow(/dryRunId/)
    expect(() => client.wireFees({ mint: 'm' }, { dryRunId: '' })).toThrow(/dryRunId/)
  })

  it('forwards dryRunId on launch and wire', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const client = new CrewPayClient({ apiUrl: 'https://example.invalid', apiKey: 'x', launcherKey: 'y' })
    await client.launch(body, { dryRunId: 'abc123def4567890' })
    await client.wireFees({ mint: 'Mint1' }, { dryRunId: 'wire123def4567890' })
    const launchBody = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)) as {
      dryRunId: string
    }
    const wireBody = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body)) as {
      dryRunId: string
    }
    expect(launchBody.dryRunId).toBe('abc123def4567890')
    expect(wireBody.dryRunId).toBe('wire123def4567890')
    vi.unstubAllGlobals()
  })
})
