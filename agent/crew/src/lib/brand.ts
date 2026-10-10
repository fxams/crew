export type BrandFormat = {
  label: 'PNG' | 'JPG' | 'SVG'
  file: string
}

export type BrandAsset = {
  id: string
  title: string
  blurb: string
  kind: 'logo' | 'banner' | 'post'
  /** Primary preview file under `public/brand` (prefer raster). */
  file: string
  /** Downloadable formats — PNG/JPG first, SVG when available. */
  formats: BrandFormat[]
  ratio: '1:1' | '16:9' | 'lockup'
}

const base = import.meta.env.BASE_URL || '/'

/** Absolute app URL for a brand file (respects Vite `base`, e.g. `/crew/`). */
export function brandUrl(file: string) {
  return `${base}brand/${file.replace(/^\//, '')}`
}

function logoFormats(stem: string, withSvg = true): BrandFormat[] {
  const formats: BrandFormat[] = [
    { label: 'PNG', file: `${stem}.png` },
    { label: 'JPG', file: `${stem}.jpg` },
  ]
  if (withSvg) formats.push({ label: 'SVG', file: `${stem}.svg` })
  return formats
}

function rasterFormats(stem: string): BrandFormat[] {
  return [
    { label: 'PNG', file: `${stem}.png` },
    { label: 'JPG', file: `${stem}.jpg` },
  ]
}

/** Selectable CREW brand assets served from `/brand`. */
export const BRAND_ASSETS: BrandAsset[] = [
  {
    id: 'logo-mark',
    title: 'Logo mark',
    blurb: 'C plate — favicon & app icon',
    kind: 'logo',
    file: 'logo-mark.png',
    formats: logoFormats('logo-mark'),
    ratio: '1:1',
  },
  {
    id: 'logo-lockup',
    title: 'Logo lockup',
    blurb: 'Mark + CREW wordmark',
    kind: 'logo',
    file: 'logo-lockup.png',
    formats: logoFormats('logo-lockup'),
    ratio: 'lockup',
  },
  {
    id: 'logo-wordmark',
    title: 'Wordmark',
    blurb: 'Acid CREW type only',
    kind: 'logo',
    file: 'logo-wordmark.png',
    formats: logoFormats('logo-wordmark'),
    ratio: 'lockup',
  },
  {
    id: 'banner-og',
    title: 'OG banner',
    blurb: 'Link previews · 16:9',
    kind: 'banner',
    file: 'banner-og.jpg',
    formats: rasterFormats('banner-og'),
    ratio: '16:9',
  },
  {
    id: 'banner-x',
    title: 'X header',
    blurb: 'Profile banner · 16:9',
    kind: 'banner',
    file: 'banner-x-header.jpg',
    formats: rasterFormats('banner-x-header'),
    ratio: '16:9',
  },
  {
    id: 'post-hire',
    title: 'Post · hire',
    blurb: 'Humans get paid',
    kind: 'post',
    file: 'post-hire.jpg',
    formats: rasterFormats('post-hire'),
    ratio: '1:1',
  },
  {
    id: 'post-tape',
    title: 'Post · tape',
    blurb: 'Money on the tape',
    kind: 'post',
    file: 'post-tape.jpg',
    formats: rasterFormats('post-tape'),
    ratio: '1:1',
  },
  {
    id: 'post-zero',
    title: 'Post · buyback',
    blurb: '25% CrewPay treasury',
    kind: 'post',
    file: 'post-zero-cut.jpg',
    formats: rasterFormats('post-zero-cut'),
    ratio: '1:1',
  },
  {
    id: 'post-modes',
    title: 'Post · modes',
    blurb: 'Split · Buyback · Raid · Agent',
    kind: 'post',
    file: 'post-modes.jpg',
    formats: rasterFormats('post-modes'),
    ratio: '1:1',
  },
]

export const BRAND_PALETTE = [
  { name: 'Forest', hex: '#08100C' },
  { name: 'Ink', hex: '#F2F6EF' },
  { name: 'Acid', hex: '#C8FF3D' },
  { name: 'Amber', hex: '#FFB84D' },
  { name: 'Muted', hex: '#8F9A8A' },
] as const
