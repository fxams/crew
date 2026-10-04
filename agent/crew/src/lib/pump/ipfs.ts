import { PUMP_IPFS_URL } from '../config'

export type IpfsUploadInput = {
  name: string
  symbol: string
  description: string
  twitter?: string
  website?: string
  file: File
}

export type IpfsUploadResult = {
  metadataUri: string
  raw: unknown
}

/** Upload coin metadata to Pump's IPFS endpoint (image required, same as pump.fun). */
export async function uploadPumpMetadata(input: IpfsUploadInput): Promise<IpfsUploadResult> {
  if (!input.file) {
    throw new Error('Coin image is required.')
  }

  const body = new FormData()
  body.append('name', input.name)
  body.append('symbol', input.symbol)
  body.append('description', input.description)
  body.append('showName', 'true')
  body.append('file', input.file)
  if (input.twitter) body.append('twitter', input.twitter)
  if (input.website) body.append('website', input.website)

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
