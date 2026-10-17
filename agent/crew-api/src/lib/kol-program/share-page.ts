import type { Response } from 'express'
import { siteUrl } from '../kol-register.js'
import { buildPublicKolCard } from './public-card.js'
import { buildSharePageMeta, renderKolSharePageHtml } from './share-html.js'

export const X_SHARE_HANDLE = /^[A-Za-z0-9_]{1,15}$/

function apiPublicUrl(): string {
  const u = (process.env.CREW_API_PUBLIC_URL || process.env.PUBLIC_API_URL || '').trim()
  if (u) return u.replace(/\/$/, '')
  return 'https://api.crewpay.dev'
}

export async function sendKolSharePage(
  res: Response,
  kind: 'kol' | 'ref',
  handleRaw: string,
): Promise<void> {
  const handle = String(handleRaw || '')
    .replace(/^@+/, '')
    .trim()
  if (!X_SHARE_HANDLE.test(handle)) {
    res.status(404).type('html').send('Not found')
    return
  }
  const card = await buildPublicKolCard(handle)
  const site = siteUrl()
  const meta = buildSharePageMeta({
    handle,
    kind,
    siteUrl: site,
    apiUrl: apiPublicUrl(),
    card,
  })
  const html = await renderKolSharePageHtml(meta, site)
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.setHeader('cache-control', 'public, max-age=60')
  res.setHeader('cross-origin-resource-policy', 'cross-origin')
  res.send(html)
}
