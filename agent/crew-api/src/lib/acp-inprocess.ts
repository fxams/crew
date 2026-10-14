import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  runAutohire,
  runUnsignedLaunch,
  type AutohireInput,
  type UnsignedLaunchInput,
} from './agent/commerce.js'
import { acpEnabled } from './agent/platforms.js'

export type AcpListenerHandle = {
  started: boolean
  stop: () => Promise<void>
}

export type AcpProviderModule = {
  startAcpListener: (opts?: {
    runAutohire?: (input: AutohireInput) => Promise<unknown>
    runUnsignedLaunch?: (input: UnsignedLaunchInput) => Promise<unknown>
  }) => Promise<AcpListenerHandle>
}

const idle: AcpListenerHandle = { started: false, stop: async () => {} }

let listenerStarted = false

export function getAcpListenerStatus(): { started: boolean } {
  return { started: listenerStarted }
}

export function resetAcpListenerStatusForTests(): void {
  listenerStarted = false
}

function flagOn(raw: string | undefined): boolean {
  const v = (raw || '').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}

/** Embed the ACP listener in this process. Still a no-op unless ACP_ENABLED=1. */
export function acpInProcessEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return flagOn(env.ACP_INPROCESS)
}

export function findAcpProviderEntry(startDir = dirname(fileURLToPath(import.meta.url))): string | null {
  const fromEnv = (process.env.ACP_PROVIDER_ENTRY || '').trim()
  if (fromEnv && existsSync(fromEnv)) return fromEnv
  let dir = startDir
  for (let i = 0; i < 8; i++) {
    const dist = resolve(dir, 'services/acp-provider/dist/index.js')
    const src = resolve(dir, 'services/acp-provider/src/index.ts')
    if (existsSync(dist)) return dist
    if (existsSync(src)) return src
    const parent = resolve(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  return null
}

let loadProvider: () => Promise<AcpProviderModule> = defaultLoadAcpProvider

export function setAcpProviderLoaderForTests(fn: (() => Promise<AcpProviderModule>) | null): void {
  loadProvider = fn || defaultLoadAcpProvider
}

export async function defaultLoadAcpProvider(): Promise<AcpProviderModule> {
  const entry = findAcpProviderEntry()
  if (!entry) {
    throw new Error(
      'ACP provider entry not found. Build services/acp-provider or set ACP_PROVIDER_ENTRY.',
    )
  }
  return (await import(pathToFileURL(entry).href)) as AcpProviderModule
}

/**
 * Start the Virtuals ACP listener inside crewpay-api.
 * No-op unless ACP_INPROCESS=1. Still no-op unless ACP_ENABLED=1.
 * Does not take over the process or register an agent.
 */
export async function maybeStartAcpInProcess(): Promise<AcpListenerHandle> {
  try {
    if (!acpInProcessEnabled()) {
      listenerStarted = false
      return idle
    }
    if (!acpEnabled()) {
      console.log('[acp] ACP_INPROCESS=1 but ACP_ENABLED is off — no-op')
      listenerStarted = false
      return idle
    }
    const provider = await loadProvider()
    const handle = await provider.startAcpListener({
      runAutohire,
      runUnsignedLaunch,
    })
    listenerStarted = Boolean(handle.started)
    return handle
  } catch (err) {
    console.error('[acp] in-process listener failed to start; API continues', err)
    listenerStarted = false
    return idle
  }
}
