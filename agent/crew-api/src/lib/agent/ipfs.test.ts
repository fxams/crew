import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./safe-url.js', () => ({
  fetchPublicUrl: vi.fn(),
}))

import { fetchPublicUrl } from './safe-url.js'
import {
  buildPumpMetadataJson,
  crewCoinMetadataUrl,
  loadAgentImageBytes,
  uploadPumpMetadataResilient,
  uploadViaCrewHost,
} from './ipfs.js'

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

describe('loadAgentImageBytes', () => {
  beforeEach(() => {
    vi.mocked(fetchPublicUrl).mockReset()
  })

  it('rejects oversized base64 before decode completes', async () => {
    const huge = 'A'.repeat(7_000_000)
    await expect(
      loadAgentImageBytes({ kind: 'base64', data: huge, contentType: 'image/png' }),
    ).rejects.toThrow(/max 5MB/)
  })

  it('accepts small PNG base64', async () => {
    const out = await loadAgentImageBytes({
      kind: 'base64',
      data: PNG_1X1.toString('base64'),
      contentType: 'image/png',
    })
    expect(out.contentType).toBe('image/png')
    expect(out.buf.byteLength).toBeGreaterThanOrEqual(64)
  })

  it('aborts URL fetch when Content-Length exceeds 5MB', async () => {
    vi.mocked(fetchPublicUrl).mockResolvedValue(
      new Response(null, {
        status: 200,
        headers: { 'content-type': 'image/png', 'content-length': '6000000' },
      }),
    )
    await expect(
      loadAgentImageBytes({ kind: 'url', url: 'https://example.com/huge.png' }),
    ).rejects.toThrow(/max 5MB/)
  })

  it('streams URL body and aborts past 5MB without Content-Length', async () => {
    const oversize = new Uint8Array(5_000_001)
    oversize[0] = 0x89
    oversize[1] = 0x50
    oversize[2] = 0x4e
    oversize[3] = 0x47
    let offset = 0
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset >= oversize.byteLength) {
          controller.close()
          return
        }
        const end = Math.min(offset + 64 * 1024, oversize.byteLength)
        controller.enqueue(oversize.subarray(offset, end))
        offset = end
      },
    })
    vi.mocked(fetchPublicUrl).mockResolvedValue(
      new Response(body, {
        status: 200,
        headers: { 'content-type': 'image/png' },
      }),
    )
    await expect(
      loadAgentImageBytes({ kind: 'url', url: 'https://example.com/stream.png' }),
    ).rejects.toThrow(/max 5MB/)
  })
})

describe('Pump metadata fallbacks', () => {
  const image = { kind: 'url' as const, url: 'https://example.com/owl.png' }

  beforeEach(() => {
    process.env.PUMP_IPFS_RETRY_MS = '0'
    delete process.env.PINATA_JWT
    delete process.env.CREW_PINATA_JWT
    vi.mocked(fetchPublicUrl).mockResolvedValue(
      new Response(new Uint8Array(PNG_1X1), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      }),
    )
  })

  it('builds pump.fun-shaped JSON with createdOn', () => {
    const meta = buildPumpMetadataJson({
      name: 'Night Owl',
      symbol: 'HOOT',
      description: 'owl meme',
      image: 'https://example.com/owl.png',
    })
    expect(meta.showName).toBe(true)
    expect(meta.createdOn).toBe('https://pump.fun')
    expect(meta.image).toBe('https://example.com/owl.png')
  })

  it('uses Pump when /api/ipfs returns metadataUri', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ metadataUri: 'https://ipfs.io/ipfs/bafypump' }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const out = await uploadPumpMetadataResilient({
      name: 'Night Owl',
      symbol: 'HOOT',
      description: 'owl meme',
      image,
    })
    expect(out.via).toBe('pump')
    expect(out.metadataUri).toBe('https://ipfs.io/ipfs/bafypump')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })

  it('hosts metadata on the CrewPay API when Pump IPFS returns 500', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('<html>__next_error__</html>', { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)
    const out = await uploadPumpMetadataResilient({
      name: 'Night Owl',
      symbol: 'HOOT',
      description: 'owl meme',
      image,
    })
    expect(out.via).toBe('crew')
    expect(out.metadataUri).toContain('/api/agent/coin-metadata?')
    expect(out.metadataUri).toContain('HOOT')
    expect(out.metadataUri).toContain(encodeURIComponent('https://example.com/owl.png'))
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('pump.fun'))).toBe(true)
    vi.unstubAllGlobals()
  })

  it('uses Pinata when Pump is down and PINATA_JWT is set', async () => {
    process.env.PINATA_JWT = 'test-jwt'
    const fetchMock = vi.fn(async (url: string | URL) => {
      const href = String(url)
      if (href.includes('pump.fun')) {
        return new Response('nope', { status: 500 })
      }
      if (href.includes('uploads.pinata.cloud')) {
        return new Response(JSON.stringify({ data: { cid: 'bafytestcid' } }), { status: 200 })
      }
      return new Response('miss', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const out = await uploadPumpMetadataResilient({
      name: 'Night Owl',
      symbol: 'HOOT',
      description: 'owl meme',
      image: { kind: 'base64', data: PNG_1X1.toString('base64'), contentType: 'image/png' },
    })
    expect(out.via).toBe('pinata')
    expect(out.metadataUri).toBe('https://ipfs.io/ipfs/bafytestcid')
    delete process.env.PINATA_JWT
    vi.unstubAllGlobals()
  })

  it('crew host URL is https metadata, not a fake IPFS cid', () => {
    const url = crewCoinMetadataUrl({
      name: 'Night Owl',
      symbol: 'HOOT',
      description: 'owl',
      image: 'https://example.com/owl.png',
    })
    expect(url.startsWith('https://api.crewpay.dev/api/agent/coin-metadata?')).toBe(true)
    expect(url).not.toMatch(/ipfs:\/\//)
  })

  it('crew host keeps the caller imageUrl', async () => {
    const out = await uploadViaCrewHost({
      name: 'Night Owl',
      symbol: 'HOOT',
      description: 'owl',
      image,
    })
    expect(out.via).toBe('crew')
    expect(out.metadataUri).toContain('example.com')
  })
})
