import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  IPFS_GATEWAYS,
  PUMP_IMAGE_CDN,
  extractIpfsRef,
  isLogoMint,
  letterAvatarSvg,
  logoCandidateUrls,
  logoCacheHeaders,
  prepareLogoBytes,
  resetLogoCache,
  resolveCoinLogo,
  setLogoCacheDir,
  setLogoFetch,
} from './coin-logo.js'

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const MINT = 'So11111111111111111111111111111111111111112'

afterEach(() => {
  resetLogoCache()
  setLogoFetch(null)
  setLogoCacheDir(null)
})

describe('ipfs CID + gateway list', () => {
  it('extracts CIDs from ipfs.io, dweb.link, ipfs://, and subdomain gateways', () => {
    const cid = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'
    expect(extractIpfsRef(`https://ipfs.io/ipfs/${cid}`)).toEqual({ cid, rest: '' })
    expect(extractIpfsRef(`https://dweb.link/ipfs/${cid}/image.png`)).toEqual({
      cid,
      rest: '/image.png',
    })
    expect(extractIpfsRef(`ipfs://${cid}`)).toEqual({ cid, rest: '' })
    expect(extractIpfsRef(`https://${cid}.ipfs.nftstorage.link`)).toEqual({ cid, rest: '' })
    expect(extractIpfsRef(`https://gateway.pinata.cloud/ipfs/${cid}`)).toEqual({ cid, rest: '' })
    expect(extractIpfsRef('https://cdn.dexscreener.com/hoot.png')).toBeNull()
  })

  it('tries pump CDN, pinata, nftstorage, then ipfs.io', () => {
    const cid = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG'
    const urls = logoCandidateUrls(`https://ipfs.io/ipfs/${cid}`)
    expect(urls[0]).toBe(`${PUMP_IMAGE_CDN}${cid}`)
    expect(urls).toEqual([
      `${IPFS_GATEWAYS[0]}${cid}`,
      `${IPFS_GATEWAYS[1]}${cid}`,
      `${IPFS_GATEWAYS[2]}${cid}`,
      `${IPFS_GATEWAYS[3]}${cid}`,
    ])
    expect(urls[1]).toContain('gateway.pinata.cloud')
    expect(urls[2]).toContain('nftstorage.link')
    expect(urls[3]).toContain('ipfs.io')
  })

  it('keeps non-IPFS HTTPS URLs as a single candidate', () => {
    expect(logoCandidateUrls('https://cdn.dexscreener.com/hoot.png')).toEqual([
      'https://cdn.dexscreener.com/hoot.png',
    ])
  })
})

describe('letter avatar + mint guard', () => {
  it('renders the ticker initial and strips markup', () => {
    const svg = letterAvatarSvg('HOOT').toString('utf8')
    expect(svg).toContain('>H</text>')
    expect(letterAvatarSvg('<script>').toString('utf8')).toContain('>?</text>')
    expect(letterAvatarSvg('').toString('utf8')).toContain('>?</text>')
  })

  it('accepts Solana and EVM mints only', () => {
    expect(isLogoMint(MINT)).toBe(true)
    expect(isLogoMint('0x' + 'ab'.repeat(20))).toBe(true)
    expect(isLogoMint('../etc/passwd')).toBe(false)
    expect(isLogoMint('short')).toBe(false)
  })
})

describe('resolveCoinLogo', () => {
  it('skips 429 gateways and caches the first good image on disk', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'crew-logo-'))
    setLogoCacheDir(dir)
    const tried: string[] = []
    setLogoFetch(async (url) => {
      tried.push(url)
      if (url.includes('pump.mypinata')) return { ok: false, status: 429, buf: Buffer.alloc(0) }
      if (url.includes('gateway.pinata.cloud')) return { ok: true, status: 200, buf: PNG_1X1 }
      throw new Error(`unexpected ${url}`)
    })
    const cid = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG'
    const first = await resolveCoinLogo({
      mint: MINT,
      ticker: 'HOOT',
      imageUrl: `https://ipfs.io/ipfs/${cid}`,
    })
    expect(first.kind).toBe('image')
    expect(first.contentType).toBe('image/png')
    expect(first.source).toContain('gateway.pinata.cloud')
    expect(tried[0]).toContain('pump.mypinata.cloud')
    expect(tried[1]).toContain('gateway.pinata.cloud')
    expect(logoCacheHeaders(first)['Cache-Control']).toMatch(/max-age=604800/)
    expect(logoCacheHeaders(first)['Cross-Origin-Resource-Policy']).toBe('cross-origin')

    const disk = await readFile(join(dir, `${MINT}.bin`))
    expect(disk.equals(PNG_1X1)).toBe(true)

    tried.length = 0
    resetLogoCache()
    const second = await resolveCoinLogo({
      mint: MINT,
      ticker: 'HOOT',
      imageUrl: `https://ipfs.io/ipfs/${cid}`,
    })
    expect(second.kind).toBe('image')
    expect(tried).toEqual([])
    await rm(dir, { recursive: true, force: true })
  })

  it('serves a letter avatar when every gateway fails', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'crew-logo-'))
    setLogoCacheDir(dir)
    setLogoFetch(async () => ({ ok: false, status: 429, buf: Buffer.alloc(0) }))
    const logo = await resolveCoinLogo({
      mint: MINT,
      ticker: 'POSSUM',
      imageUrl: 'https://ipfs.io/ipfs/QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
    })
    expect(logo.kind).toBe('avatar')
    expect(logo.contentType).toMatch(/image\/svg\+xml/)
    expect(logo.buf.toString('utf8')).toContain('>P</text>')
    expect(logoCacheHeaders(logo)['Cache-Control']).toMatch(/max-age=300/)
    await rm(dir, { recursive: true, force: true })
  })

  it('rejects non-image bodies even on 200', async () => {
    setLogoFetch(async () => ({
      ok: true,
      status: 200,
      buf: Buffer.from('<!doctype html>rate limited</html>'),
    }))
    const logo = await resolveCoinLogo({
      mint: MINT,
      ticker: 'X',
      imageUrl: 'https://cdn.dexscreener.com/x.png',
    })
    expect(logo.kind).toBe('avatar')
    expect(prepareLogoBytes(Buffer.from('not-an-image'))).toBeNull()
  })
})
