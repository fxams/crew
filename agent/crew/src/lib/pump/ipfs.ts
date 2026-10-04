import { PUMP_IPFS_URL } from '../config'

export type IpfsUploadInput = {
  name: string
  symbol: string
  description: string
  twitter?: string
  website?: string
  file?: File | null
}

export type IpfsUploadResult = {
  metadataUri: string
  raw: unknown
}

/** Upload coin metadata to Pump's IPFS endpoint. */
export async function uploadPumpMetadata(input: IpfsUploadInput): Promise<IpfsUploadResult> {
  const body = new FormData()
  body.append('name', input.name)
  body.append('symbol', input.symbol)
  body.append('description', input.description)
  body.append('showName', 'true')
  if (input.twitter) body.append('twitter', input.twitter)
  if (input.website) body.append('website', input.website)

  if (input.file) {
    body.append('file', input.file)
  } else {
    // Minimal PNG placeholder so Pump accepts the form without a user image.
    const blob = await placeholderPng()
    body.append('file', blob, 'crew.png')
  }

  const res = await fetch(PUMP_IPFS_URL, {
    method: 'POST',
    body,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Pump IPFS upload failed (${res.status}): ${text.slice(0, 180)}`)
  }

  const json = (await res.json()) as { metadataUri?: string; uri?: string }
  const metadataUri = json.metadataUri || json.uri
  if (!metadataUri) {
    throw new Error('Pump IPFS response missing metadataUri.')
  }
  return { metadataUri, raw: json }
}

async function placeholderPng(): Promise<Blob> {
  // 1x1 acid-green PNG
  const bytes = Uint8Array.from(
    atob(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2X2ZcAAAAASUVORK5CYII=',
    ),
    (c) => c.charCodeAt(0),
  )
  return new Blob([bytes], { type: 'image/png' })
}
