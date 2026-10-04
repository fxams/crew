import type { WalletContextState } from '@solana/wallet-adapter-react'
import { PUMP_IPFS_URL, RPC_URL } from '../config'

export type IpfsUploadInput = {
  name: string
  symbol: string
  description: string
  twitter?: string
  website?: string
  file: File
  /** Required for Irys fallback when Pump IPFS is CORS-blocked (GitHub Pages). */
  wallet?: WalletContextState
}

export type IpfsUploadResult = {
  metadataUri: string
  raw: unknown
}

function isLocalHost(): boolean {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname
  return host === 'localhost' || host === '127.0.0.1'
}

/** Local/dev uses Vite proxy; production Pages cannot call pump.fun (no CORS). */
function pumpIpfsEndpoint(): string {
  const override = (import.meta.env.VITE_PUMP_IPFS_URL as string | undefined)?.trim()
  if (override) return override
  if (isLocalHost()) return '/pump-ipfs'
  return PUMP_IPFS_URL
}

function isNetworkBlocked(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const msg = err.message.toLowerCase()
  return (
    msg.includes('load failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network request failed') ||
    err.name === 'TypeError'
  )
}

function buildMetadata(input: IpfsUploadInput, imageUri: string) {
  return {
    name: input.name,
    symbol: input.symbol,
    description: input.description,
    image: imageUri,
    showName: true,
    createdOn: 'https://pump.fun',
    ...(input.twitter ? { twitter: input.twitter } : {}),
    ...(input.website ? { website: input.website } : {}),
  }
}

async function uploadViaPump(input: IpfsUploadInput): Promise<IpfsUploadResult> {
  const body = new FormData()
  body.append('name', input.name)
  body.append('symbol', input.symbol)
  body.append('description', input.description)
  body.append('showName', 'true')
  body.append('file', input.file)
  if (input.twitter) body.append('twitter', input.twitter)
  if (input.website) body.append('website', input.website)

  let res: Response
  try {
    res = await fetch(pumpIpfsEndpoint(), { method: 'POST', body })
  } catch (err) {
    throw new Error(
      isNetworkBlocked(err)
        ? 'Pump metadata upload blocked by browser CORS.'
        : err instanceof Error
          ? err.message
          : 'Pump metadata upload failed.',
    )
  }

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

async function uploadViaPinata(input: IpfsUploadInput): Promise<IpfsUploadResult> {
  const jwt = (import.meta.env.VITE_PINATA_JWT as string | undefined)?.trim()
  if (!jwt) throw new Error('Pinata JWT not configured.')

  const imageBody = new FormData()
  imageBody.append('file', input.file)
  imageBody.append('network', 'public')

  const imageRes = await fetch('https://uploads.pinata.cloud/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}` },
    body: imageBody,
  })
  if (!imageRes.ok) {
    const text = await imageRes.text().catch(() => '')
    throw new Error(`Pinata image upload failed (${imageRes.status}): ${text.slice(0, 160)}`)
  }
  const imageJson = (await imageRes.json()) as {
    data?: { cid?: string }
    cid?: string
  }
  const imageCid = imageJson.data?.cid || imageJson.cid
  if (!imageCid) throw new Error('Pinata image upload missing cid.')
  const imageUri = `https://ipfs.io/ipfs/${imageCid}`

  const metadata = buildMetadata(input, imageUri)
  const metaFile = new File([JSON.stringify(metadata)], 'metadata.json', {
    type: 'application/json',
  })
  const metaBody = new FormData()
  metaBody.append('file', metaFile)
  metaBody.append('network', 'public')

  const metaRes = await fetch('https://uploads.pinata.cloud/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}` },
    body: metaBody,
  })
  if (!metaRes.ok) {
    const text = await metaRes.text().catch(() => '')
    throw new Error(`Pinata metadata upload failed (${metaRes.status}): ${text.slice(0, 160)}`)
  }
  const metaJson = (await metaRes.json()) as {
    data?: { cid?: string }
    cid?: string
  }
  const metaCid = metaJson.data?.cid || metaJson.cid
  if (!metaCid) throw new Error('Pinata metadata upload missing cid.')
  return {
    metadataUri: `https://ipfs.io/ipfs/${metaCid}`,
    raw: { imageCid, metaCid, metadata },
  }
}

/**
 * Wallet-paid Irys upload — works from GitHub Pages (CORS-safe).
 * May prompt a small SOL funding signature for storage.
 */
async function uploadViaIrys(input: IpfsUploadInput): Promise<IpfsUploadResult> {
  const wallet = input.wallet
  if (!wallet?.publicKey || !wallet.signMessage) {
    throw new Error('Connect Phantom to upload coin metadata.')
  }

  const { WebUploader } = await import('@irys/web-upload')
  const { WebSolana } = await import('@irys/web-upload-solana')

  const uploader = await WebUploader(WebSolana)
    .withProvider(wallet)
    .withRpc(RPC_URL)
    .mainnet()

  const ensureBalance = async (bytes: number) => {
    const price = await uploader.getPrice(bytes)
    const bal = await uploader.getLoadedBalance()
    if (bal.lt(price)) {
      // Small buffer so the second (metadata) upload doesn't need another fund.
      const need = price.minus(bal).multipliedBy(1.35)
      await uploader.fund(need.integerValue())
    }
  }

  await ensureBalance(input.file.size + 8_192)
  const imageReceipt = await uploader.uploadFile(input.file, {
    tags: [
      { name: 'Content-Type', value: input.file.type || 'image/png' },
      { name: 'App-Name', value: 'CREW' },
    ],
  })
  const imageUri = `https://gateway.irys.xyz/${imageReceipt.id}`

  const metadata = buildMetadata(input, imageUri)
  const metaBytes = new TextEncoder().encode(JSON.stringify(metadata))
  await ensureBalance(metaBytes.byteLength + 2_048)
  const metaReceipt = await uploader.upload(JSON.stringify(metadata), {
    tags: [
      { name: 'Content-Type', value: 'application/json' },
      { name: 'App-Name', value: 'CREW' },
    ],
  })

  return {
    metadataUri: `https://gateway.irys.xyz/${metaReceipt.id}`,
    raw: { imageId: imageReceipt.id, metaId: metaReceipt.id, metadata },
  }
}

/**
 * Upload coin metadata for createV2.
 * Order: local Pump proxy → Pinata (optional JWT) → Irys via Phantom.
 */
export async function uploadPumpMetadata(input: IpfsUploadInput): Promise<IpfsUploadResult> {
  if (!input.file) {
    throw new Error('Coin image is required.')
  }

  const pinataJwt = (import.meta.env.VITE_PINATA_JWT as string | undefined)?.trim()
  const tryPump = isLocalHost() || Boolean((import.meta.env.VITE_PUMP_IPFS_URL as string | undefined)?.trim())

  if (tryPump) {
    try {
      return await uploadViaPump(input)
    } catch (err) {
      console.warn('Pump IPFS upload failed, trying fallbacks', err)
    }
  }

  if (pinataJwt) {
    try {
      return await uploadViaPinata(input)
    } catch (err) {
      console.warn('Pinata upload failed, trying Irys', err)
    }
  }

  try {
    return await uploadViaIrys(input)
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Upload failed.'
    // Never surface raw Safari "Load failed" to the desk.
    if (isNetworkBlocked(err) || /load failed|failed to fetch/i.test(detail)) {
      throw new Error(
        'Metadata upload failed. Approve the Phantom storage signature (Irys), or set VITE_PINATA_JWT.',
      )
    }
    throw new Error(detail)
  }
}
