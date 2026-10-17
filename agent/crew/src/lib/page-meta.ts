import { useEffect } from 'react'

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.content = content
}

export function usePageMeta(opts: {
  title: string
  description?: string
  ogImage?: string
  ogUrl?: string
}) {
  useEffect(() => {
    document.title = opts.title
    if (opts.description) {
      upsertMeta('name', 'description', opts.description)
      upsertMeta('property', 'og:description', opts.description)
    }
    upsertMeta('property', 'og:title', opts.title)
    if (opts.ogImage) upsertMeta('property', 'og:image', opts.ogImage)
    if (opts.ogUrl) upsertMeta('property', 'og:url', opts.ogUrl)
  }, [opts.title, opts.description, opts.ogImage, opts.ogUrl])
}
