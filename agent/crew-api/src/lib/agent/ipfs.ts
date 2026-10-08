import { PUMP_IPFS_URL } from './constants.js'
import { fetchPublicUrl } from './safe-url.js'

export type AgentImageInput =
  | { kind: 'url'; url: string }
  | { kind: 'base64'; data: string; contentType?: string; filename?: string }

const IMAGE_MAGIC: Array<{ type: string; test: (b: Buffer) => boolean }> = [
  { type: 'image/png', test: (b) => b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { type: 'image/jpeg', test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: 'image/webp', test: (b) => b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
  { type: 'image/gif', test: (b) => b.length >= 6 && (b.toString('ascii', 0, 6) === 'GIF87a' || b.toString('ascii', 0, 6) === 'GIF89a') },
]

function sniffImageType(buf: Buffer): string | null {
  for (const row of IMAGE_MAGIC) {
    if (row.test(buf)) return row.type
  }
  return null
}

async function toBlob(image: AgentImageInput): Promise<{ blob: Blob; filename: string }> {
  if (image.kind === 'url') {
    const res = await fetchPublicUrl(image.url, { label: 'imageUrl', maxRedirects: 3, timeoutMs: 12_000 })
    if (!res.ok) throw new Error(`Failed to fetch imageUrl (${res.status})`)
    const headerType = (res.headers.get('content-type') || '').split(';')[0]!.trim().toLowerCase()
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.byteLength < 64) throw new Error('imageUrl body too small')
    if (buf.byteLength > 5_000_000) throw new Error('imageUrl max 5MB')
    const sniffed = sniffImageType(buf)
    if (!sniffed) throw new Error('imageUrl body is not a PNG/JPEG/WebP/GIF image')
    if (headerType && headerType.startsWith('image/') && headerType !== sniffed && !headerType.includes(sniffed.split('/')[1]!)) {
      // Header lies are common via CDNs — prefer magic bytes, reject only clearly non-image headers.
      if (!headerType.startsWith('image/')) {
        throw new Error('imageUrl Content-Type must be an image')
      }
    }
    const type = sniffed
    const ext = type.includes('jpeg') ? 'jpg' : type.includes('webp') ? 'webp' : type.includes('gif') ? 'gif' : 'png'
    return { blob: new Blob([buf], { type }), filename: `crew-agent.${ext}` }
  }

  let raw = image.data.trim()
  let contentType = image.contentType || 'image/png'
  const dataUrl = raw.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i)
  if (dataUrl) {
    contentType = dataUrl[1]!
    raw = dataUrl[2]!
  }
  const buf = Buffer.from(raw, 'base64')
  if (buf.byteLength < 64) throw new Error('imageBase64 too small')
  if (buf.byteLength > 5_000_000) throw new Error('imageBase64 max 5MB')
  const sniffed = sniffImageType(buf)
  if (!sniffed) throw new Error('imageBase64 is not a PNG/JPEG/WebP/GIF image')
  const type = sniffed || contentType
  const ext = type.includes('jpeg') ? 'jpg' : type.includes('webp') ? 'webp' : type.includes('gif') ? 'gif' : 'png'
  return {
    blob: new Blob([buf], { type }),
    filename: image.filename || `crew-agent.${ext}`,
  }
}

export async function uploadPumpMetadata(input: {
  name: string
  symbol: string
  description: string
  twitter?: string
  website?: string
  image: AgentImageInput
}): Promise<{ metadataUri: string }> {
  const { blob, filename } = await toBlob(input.image)
  const body = new FormData()
  body.append('name', input.name)
  body.append('symbol', input.symbol)
  body.append('description', input.description)
  body.append('showName', 'true')
  body.append('file', blob, filename)
  if (input.twitter) body.append('twitter', input.twitter)
  if (input.website) body.append('website', input.website)

  const res = await fetch(PUMP_IPFS_URL, { method: 'POST', body })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Pump IPFS upload failed (${res.status}): ${text.slice(0, 200)}`)
  }
  let json: { metadataUri?: string; uri?: string; metadata?: { uri?: string } }
  try {
    json = JSON.parse(text) as typeof json
  } catch {
    throw new Error('Pump IPFS returned non-JSON')
  }
  const metadataUri = json.metadataUri || json.uri || json.metadata?.uri
  if (!metadataUri) throw new Error('Pump IPFS response missing metadataUri')
  return { metadataUri }
}
