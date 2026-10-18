import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PUMP_IPFS_URL } from './constants.js'
import { fetchPublicUrl } from './safe-url.js'

export type AgentImageInput =
  | { kind: 'url'; url: string }
  | { kind: 'base64'; data: string; contentType?: string; filename?: string }

const IMAGE_MAX_BYTES = 5_000_000

const IMAGE_MAGIC: Array<{ type: string; test: (b: Buffer) => boolean }> = [
  { type: 'image/png', test: (b) => b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { type: 'image/jpeg', test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: 'image/webp', test: (b) => b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
  { type: 'image/gif', test: (b) => b.length >= 6 && (b.toString('ascii', 0, 6) === 'GIF87a' || b.toString('ascii', 0, 6) === 'GIF89a') },
]

export function sniffImageType(buf: Buffer): string | null {
  for (const row of IMAGE_MAGIC) {
    if (row.test(buf)) return row.type
  }
  return null
}

/** Stream response body and abort once past maxBytes (avoids buffering huge downloads). */
async function readBodyLimited(res: Response, maxBytes: number): Promise<Buffer> {
  const declared = Number(res.headers.get('content-length') || 0)
  if (Number.isFinite(declared) && declared > maxBytes) {
    if (res.body) void res.body.cancel().catch(() => undefined)
    throw new Error('imageUrl max 5MB')
  }

  if (!res.body) {
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.byteLength > maxBytes) throw new Error('imageUrl max 5MB')
    return buf
  }

  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        throw new Error('imageUrl max 5MB')
      }
      chunks.push(value)
    }
  } catch (err) {
    try {
      await reader.cancel()
    } catch {
      /* ignore */
    }
    throw err
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)))
}

/** Fetch/decode image bytes with magic-byte check (PNG/JPEG/WebP/GIF only). */
export async function loadAgentImageBytes(
  image: AgentImageInput,
): Promise<{ buf: Buffer; contentType: string; filename: string }> {
  if (image.kind === 'url') {
    const res = await fetchPublicUrl(image.url, { label: 'imageUrl', maxRedirects: 3, timeoutMs: 12_000 })
    if (!res.ok) throw new Error(`Failed to fetch imageUrl (${res.status})`)
    const headerType = (res.headers.get('content-type') || '').split(';')[0]!.trim().toLowerCase()
    const buf = await readBodyLimited(res, IMAGE_MAX_BYTES)
    if (buf.byteLength < 64) throw new Error('imageUrl body too small')
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
    return { buf, contentType: type, filename: `crew-agent.${ext}` }
  }

  let raw = image.data.trim()
  let contentType = image.contentType || 'image/png'
  const dataUrl = raw.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i)
  if (dataUrl) {
    contentType = dataUrl[1]!
    raw = dataUrl[2]!
  }
  // Reject oversized base64 before allocating the decoded buffer.
  const approxBytes = Math.floor((raw.length * 3) / 4)
  if (approxBytes > IMAGE_MAX_BYTES) throw new Error('imageBase64 max 5MB')
  const buf = Buffer.from(raw, 'base64')
  if (buf.byteLength < 64) throw new Error('imageBase64 too small')
  if (buf.byteLength > IMAGE_MAX_BYTES) throw new Error('imageBase64 max 5MB')
  const sniffed = sniffImageType(buf)
  if (!sniffed) throw new Error('imageBase64 is not a PNG/JPEG/WebP/GIF image')
  const type = sniffed || contentType
  const ext = type.includes('jpeg') ? 'jpg' : type.includes('webp') ? 'webp' : type.includes('gif') ? 'gif' : 'png'
  return {
    buf,
    contentType: type,
    filename: image.filename || `crew-agent.${ext}`,
  }
}

export function sha256ImageBytes(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

/** Fetch/decode and magic-byte check — same rules as a real launch (PNG/JPEG/WebP/GIF only). */
export async function validateAgentImage(
  image: AgentImageInput,
): Promise<{ contentType: string; bytes: number; filename: string }> {
  const { buf, contentType, filename } = await loadAgentImageBytes(image)
  return { contentType, bytes: buf.byteLength, filename }
}

async function toBlob(image: AgentImageInput): Promise<{ blob: Blob; filename: string }> {
  const { buf, contentType, filename } = await loadAgentImageBytes(image)
  // Convert Buffer to Uint8Array for Blob compatibility under strict TS
  const view = new Uint8Array(buf)
  return { blob: new Blob([view], { type: contentType }), filename }
}

function pumpIpfsRetryMs(): number {
  const n = Number(process.env.PUMP_IPFS_RETRY_MS)
  return Number.isFinite(n) && n >= 0 ? n : 400
}

export type PumpMetadataInput = {
  name: string
  symbol: string
  description: string
  twitter?: string
  website?: string
  telegram?: string
  image: AgentImageInput
}

export type PumpMetadataResult = {
  metadataUri: string
  via: 'pump' | 'pinata' | 'crew'
}

export function publicApiUrl(): string {
  return (process.env.CREW_PUBLIC_API_URL || process.env.API_URL || 'https://api.crewpay.dev').replace(/\/$/, '')
}

export function pinataJwt(): string {
  return (process.env.PINATA_JWT || process.env.CREW_PINATA_JWT || '').trim()
}

export function buildPumpMetadataJson(input: {
  name: string
  symbol: string
  description: string
  image: string
  twitter?: string
  website?: string
  telegram?: string
}): Record<string, unknown> {
  return {
    name: input.name,
    symbol: input.symbol,
    description: input.description,
    image: input.image,
    showName: true,
    createdOn: 'https://pump.fun',
    ...(input.twitter ? { twitter: input.twitter } : {}),
    ...(input.website ? { website: input.website } : {}),
    ...(input.telegram ? { telegram: input.telegram } : {}),
  }
}

export function crewCoinMetadataUrl(input: {
  name: string
  symbol: string
  description: string
  image: string
  twitter?: string
  website?: string
}): string {
  const params = new URLSearchParams({
    name: input.name.slice(0, 64),
    symbol: input.symbol.slice(0, 16),
    description: input.description.slice(0, 240),
    image: input.image,
  })
  if (input.twitter) params.set('twitter', input.twitter.slice(0, 128))
  if (input.website) params.set('website', input.website.slice(0, 256))
  return `${publicApiUrl()}/api/agent/coin-metadata?${params}`
}

const IPFS_DIR = process.env.CREW_IPFS_CACHE_DIR || join(process.cwd(), 'data', 'agent-ipfs')

export async function persistAgentImage(buf: Buffer, contentType: string): Promise<string> {
  const sha = sha256ImageBytes(buf)
  await mkdir(IPFS_DIR, { recursive: true })
  await writeFile(join(IPFS_DIR, `${sha}.bin`), buf)
  await writeFile(join(IPFS_DIR, `${sha}.type`), contentType)
  return `${publicApiUrl()}/api/agent/coin-image/${sha}`
}

export async function readPersistedAgentImage(
  sha: string,
): Promise<{ buf: Buffer; contentType: string } | null> {
  if (!/^[a-f0-9]{64}$/i.test(sha)) return null
  try {
    const buf = await readFile(join(IPFS_DIR, `${sha}.bin`))
    const contentType = (await readFile(join(IPFS_DIR, `${sha}.type`), 'utf8')).trim() || 'image/png'
    return { buf, contentType }
  } catch {
    return null
  }
}

function parseMetadataUri(text: string): string {
  let json: { metadataUri?: string; uri?: string; metadata?: { uri?: string } }
  try {
    json = JSON.parse(text) as typeof json
  } catch {
    throw new Error('Pump IPFS returned non-JSON')
  }
  const metadataUri = json.metadataUri || json.uri || json.metadata?.uri
  if (!metadataUri) throw new Error('Pump IPFS response missing metadataUri')
  return metadataUri
}

async function uploadViaPump(input: PumpMetadataInput): Promise<PumpMetadataResult> {
  const { blob, filename } = await toBlob(input.image)
  const body = new FormData()
  body.append('name', input.name)
  body.append('symbol', input.symbol)
  body.append('description', input.description)
  body.append('showName', 'true')
  body.append('createdOn', 'https://pump.fun')
  body.append('file', blob, filename)
  if (input.twitter) body.append('twitter', input.twitter)
  if (input.website) body.append('website', input.website)
  if (input.telegram) body.append('telegram', input.telegram)

  const res = await fetch(PUMP_IPFS_URL, {
    method: 'POST',
    body,
    headers: {
      Origin: 'https://pump.fun',
      Referer: 'https://pump.fun/create',
      Accept: 'application/json',
    },
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Pump IPFS upload failed (${res.status}): ${text.slice(0, 200)}`)
  }
  return { metadataUri: parseMetadataUri(text), via: 'pump' }
}

async function uploadViaPinata(input: PumpMetadataInput): Promise<PumpMetadataResult> {
  const jwt = pinataJwt()
  if (!jwt) throw new Error('Pinata JWT not configured')
  const { buf, contentType, filename } = await loadAgentImageBytes(input.image)
  const view = new Uint8Array(buf)

  const imageBody = new FormData()
  imageBody.append('file', new Blob([view], { type: contentType }), filename)
  imageBody.append('network', 'public')
  const imageRes = await fetch('https://uploads.pinata.cloud/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}` },
    body: imageBody,
  })
  const imageText = await imageRes.text()
  if (!imageRes.ok) throw new Error(`Pinata image upload failed (${imageRes.status}): ${imageText.slice(0, 160)}`)
  const imageJson = JSON.parse(imageText) as { data?: { cid?: string }; cid?: string; IpfsHash?: string }
  const imageCid = imageJson.data?.cid || imageJson.cid || imageJson.IpfsHash
  if (!imageCid) throw new Error('Pinata image upload missing cid')
  const imageUri = `https://ipfs.io/ipfs/${imageCid}`

  const metadata = buildPumpMetadataJson({ ...input, image: imageUri })
  const metaFile = new Blob([JSON.stringify(metadata)], { type: 'application/json' })
  const metaBody = new FormData()
  metaBody.append('file', metaFile, 'metadata.json')
  metaBody.append('network', 'public')
  const metaRes = await fetch('https://uploads.pinata.cloud/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}` },
    body: metaBody,
  })
  const metaText = await metaRes.text()
  if (!metaRes.ok) throw new Error(`Pinata metadata upload failed (${metaRes.status}): ${metaText.slice(0, 160)}`)
  const metaJson = JSON.parse(metaText) as { data?: { cid?: string }; cid?: string; IpfsHash?: string }
  const metaCid = metaJson.data?.cid || metaJson.cid || metaJson.IpfsHash
  if (!metaCid) throw new Error('Pinata metadata upload missing cid')
  return { metadataUri: `https://ipfs.io/ipfs/${metaCid}`, via: 'pinata' }
}

export async function uploadViaCrewHost(input: PumpMetadataInput): Promise<PumpMetadataResult> {
  let imageUrl = input.image.kind === 'url' ? input.image.url.trim() : ''
  if (!imageUrl) {
    const { buf, contentType } = await loadAgentImageBytes(input.image)
    imageUrl = await persistAgentImage(buf, contentType)
  }
  return {
    metadataUri: crewCoinMetadataUrl({
      name: input.name,
      symbol: input.symbol,
      description: input.description,
      image: imageUrl,
      twitter: input.twitter,
      website: input.website,
    }),
    via: 'crew',
  }
}

/** Pump.fun IPFS with one retry, then Pinata (if JWT), then CrewPay-hosted metadata JSON. */
export async function uploadPumpMetadataResilient(
  input: PumpMetadataInput,
  opts?: { imageUrlFallback?: string },
): Promise<PumpMetadataResult> {
  let lastErr: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await uploadViaPump(input)
    } catch (err) {
      lastErr = err
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, pumpIpfsRetryMs()))
        continue
      }
    }
  }
  if (pinataJwt()) {
    try {
      return await uploadViaPinata(input)
    } catch (err) {
      lastErr = err
    }
  }
  try {
    return await uploadViaCrewHost(input)
  } catch (err) {
    lastErr = err
  }
  const fallback = opts?.imageUrlFallback?.trim()
  if (fallback) {
    return {
      metadataUri: crewCoinMetadataUrl({
        name: input.name,
        symbol: input.symbol,
        description: input.description,
        image: fallback,
        twitter: input.twitter,
        website: input.website,
      }),
      via: 'crew',
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Pump IPFS upload failed')
}

export async function uploadPumpMetadata(input: PumpMetadataInput): Promise<PumpMetadataResult> {
  return uploadPumpMetadataResilient(input)
}
