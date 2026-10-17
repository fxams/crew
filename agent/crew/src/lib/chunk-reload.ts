const RELOAD_KEY = 'crewpay-chunk-reload-v1'

/** After deploys, cached index.html may reference removed hashed chunks — reload once. */
export function installChunkLoadReloadHandler(): void {
  if (typeof window === 'undefined') return

  const reloadOnce = () => {
    if (sessionStorage.getItem(RELOAD_KEY)) return
    sessionStorage.setItem(RELOAD_KEY, '1')
    window.location.reload()
  }

  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault()
    reloadOnce()
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    const msg =
      reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
          ? reason
          : ''
    if (/Failed to fetch dynamically imported module|Loading chunk|ChunkLoadError/i.test(msg)) {
      reloadOnce()
    }
  })
}
