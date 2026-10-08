import { PUMP_IPFS_URL } from './constants.js'

export type AgentImageInput =
  | { kind: 'url'; url: string }
  | { kind: 'base64'; data: string; contentType?: string; filename?: string }

async function toBlob(image: AgentImageInput): Promise<{ blob: Blob; filename: string }> {
  if (image.kind === 'url') {
    const res = await fetch(image.url, { redirect: 'follow' })
    if (!res.ok) throw new Error(`Failed to fetch imageUrl (${res.status})`)
    const type = res.headers.get('content-type') || 'image/png'
    if (!type.startsWith('image/')) throw new Error('imageUrl must point to an image')
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.byteLength < 64) throw new Error('imageUrl body too small')
    if (buf.byteLength > 5_000_000) throw new Error('imageUrl max 5MB')
    const ext = type.includes('jpeg') || type.includes('jpg') ? 'jpg' : type.includes('webp') ? 'webp' : 'png'
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
  const ext = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : contentType.includes('webp') ? 'webp' : 'png'
  return {
    blob: new Blob([buf], { type: contentType }),
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
