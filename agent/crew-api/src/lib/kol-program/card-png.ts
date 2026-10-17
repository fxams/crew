import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'
import { getXJsonCache, setXJsonCache } from './x-cache.js'
import { cardSvgForAnyHandle } from './card-from-handle.js'

const DAY_MS = 24 * 60 * 60 * 1000

/** resvg cannot fetch https:// avatar hrefs — inline them so the PNG matches the site card. */
async function embedRemoteImages(svg: string): Promise<string> {
  const hrefs = [...svg.matchAll(/<image[^>]+href="(https?:[^"]+)"/g)].map((m) => m[1])
  let out = svg
  for (const href of [...new Set(hrefs)]) {
    try {
      const res = await fetch(href, { headers: { 'User-Agent': 'CrewPayCard/1' }, signal: AbortSignal.timeout(4000) })
      if (!res.ok) continue
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length < 32 || buf.length > 2_000_000) continue
      const mime = (res.headers.get('content-type') || 'image/jpeg').split(';')[0]
      if (!mime.startsWith('image/')) continue
      out = out.split(href).join(`data:${mime};base64,${buf.toString('base64')}`)
    } catch {
      /* keep original href */
    }
  }
  return out
}

function fontPath(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    join(here, '../../../assets/fonts/DejaVuSans.ttf'),
    join(here, '../../../../assets/fonts/DejaVuSans.ttf'),
  ]
  for (const p of candidates) {
    try {
      readFileSync(p)
      return p
    } catch {
      /* try next */
    }
  }
  throw new Error('KOL card font not found (DejaVuSans.ttf)')
}

export async function cardPngForHandle(handle: string): Promise<Buffer | null> {
  const h = handle.replace(/^@+/, '').trim().toLowerCase()
  if (!h) return null

  const cacheKey = `cardpng:v2:${h}`
  const cached = await getXJsonCache<{ b64: string }>(cacheKey)
  if (cached?.b64) return Buffer.from(cached.b64, 'base64')

  let svg = await cardSvgForAnyHandle(handle)
  if (!svg) return null
  svg = await embedRemoteImages(svg)

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1200 },
    font: {
      fontFiles: [fontPath()],
      defaultFontFamily: 'Roboto',
      loadSystemFonts: false,
    },
  })
  const png = resvg.render().asPng()
  await setXJsonCache(cacheKey, { b64: png.toString('base64') }, DAY_MS)
  return png
}
