import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./safe-url.js', () => ({
  fetchPublicUrl: vi.fn(),
}))

import { fetchPublicUrl } from './safe-url.js'
import { loadAgentImageBytes } from './ipfs.js'

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
