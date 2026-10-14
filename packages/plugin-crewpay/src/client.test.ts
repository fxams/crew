import { describe, expect, it, vi, afterEach } from 'vitest'
import { CrewPayApiClient } from './client.js'

describe('CrewPayApiClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends x-crew-api-key on autohire', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, crew: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const client = new CrewPayApiClient({
      apiUrl: 'https://example.invalid',
      apiKey: 'crew_ak_test_key',
    })
    await client.autohire({ name: 'Cat', ticker: 'CAT', seats: 2 })
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    const headers = init.headers as Headers
    expect(headers.get('x-crew-api-key')).toBe('crew_ak_test_key')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/agent/autohire')
  })

  it('buildUnsignedLaunch never sets launcher header', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ steps: [] }), { status: 200, headers: { 'content-type': 'application/json' } }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const client = new CrewPayApiClient({
      apiUrl: 'https://example.invalid',
      apiKey: 'crew_ak_test_key',
    })
    await client.buildUnsignedLaunch({ name: 'A', ticker: 'B', autoHire: { seats: 1 } })
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    const headers = init.headers as Headers
    expect(headers.get('x-launcher-key')).toBeNull()
  })

  it('redacts api key patterns from errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'bad crew_ak_secretvalue' }), { status: 401 })),
    )
    const client = new CrewPayApiClient({
      apiUrl: 'https://example.invalid',
      apiKey: 'crew_ak_test_key',
    })
    await expect(client.autohire({})).rejects.toThrow(/\[redacted\]/)
  })
})
