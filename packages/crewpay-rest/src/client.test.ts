import { describe, expect, it, vi } from 'vitest'
import { CrewPayClient, hashLaunchBody } from './client.ts'

describe('CrewPayClient spend gates', () => {
  const body = { name: 'Desk Cat', ticker: 'DCAT', autoHire: { seats: 3 } }

  it('hashes launch bodies stably', () => {
    expect(hashLaunchBody(body)).toBe(hashLaunchBody({ ...body }))
    expect(hashLaunchBody(body)).not.toBe(hashLaunchBody({ ...body, ticker: 'OTHER' }))
  })

  it('blocks launch without dryRunId', () => {
    const client = new CrewPayClient({ apiUrl: 'https://example.invalid', apiKey: 'x', launcherKey: 'y' })
    expect(() => client.launch(body, { dryRunId: '' })).toThrow(/dryRunId/)
  })

  it('forwards dryRunId on launch', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, mint: 'm' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const client = new CrewPayClient({ apiUrl: 'https://example.invalid', apiKey: 'x', launcherKey: 'y' })
    await client.launch(body, { dryRunId: 'abc123def4567890' })
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    const sent = JSON.parse(String(init.body)) as { dryRunId: string }
    expect(sent.dryRunId).toBe('abc123def4567890')
    vi.unstubAllGlobals()
  })
})
