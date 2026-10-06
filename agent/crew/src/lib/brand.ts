export type BrandAsset = {
  id: string
  title: string
  blurb: string
  kind: 'logo' | 'banner' | 'post'
  /** Path under `public/brand` (no leading slash). */
  file: string
  ratio: '1:1' | '16:9' | 'lockup'
}

const base = import.meta.env.BASE_URL || '/'

/** Absolute app URL for a brand file (respects Vite `base`, e.g. `/crew/`). */
export function brandUrl(file: string) {
  return `${base}brand/${file.replace(/^\//, '')}`
}

/** Selectable CREW brand assets served from `/brand`. */
export const BRAND_ASSETS: BrandAsset[] = [
  {
    id: 'logo-mark',
    title: 'Logo mark',
    blurb: 'C plate — favicon & app icon',
    kind: 'logo',
    file: 'logo-mark.svg',
    ratio: '1:1',
  },
  {
    id: 'logo-lockup',
    title: 'Logo lockup',
    blurb: 'Mark + CREW wordmark',
    kind: 'logo',
    file: 'logo-lockup.svg',
    ratio: 'lockup',
  },
  {
    id: 'logo-wordmark',
    title: 'Wordmark',
    blurb: 'Acid CREW type only',
    kind: 'logo',
    file: 'logo-wordmark.svg',
    ratio: 'lockup',
  },
  {
    id: 'banner-og',
    title: 'OG banner',
    blurb: 'Link previews · 16:9',
    kind: 'banner',
    file: 'banner-og.jpg',
    ratio: '16:9',
  },
  {
    id: 'banner-x',
    title: 'X header',
    blurb: 'Profile banner · 16:9',
    kind: 'banner',
    file: 'banner-x-header.jpg',
    ratio: '16:9',
  },
  {
    id: 'post-hire',
    title: 'Post · hire',
    blurb: 'Humans get paid',
    kind: 'post',
    file: 'post-hire.jpg',
    ratio: '1:1',
  },
  {
    id: 'post-tape',
    title: 'Post · tape',
    blurb: 'Money on the tape',
    kind: 'post',
    file: 'post-tape.jpg',
    ratio: '1:1',
  },
  {
    id: 'post-zero',
    title: 'Post · 0% cut',
    blurb: 'Platform takes nothing',
    kind: 'post',
    file: 'post-zero-cut.jpg',
    ratio: '1:1',
  },
  {
    id: 'post-modes',
    title: 'Post · modes',
    blurb: 'Split · Buyback · Raid · Agent',
    kind: 'post',
    file: 'post-modes.jpg',
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
