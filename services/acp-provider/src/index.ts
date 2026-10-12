import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { loadConfig } from './config.js'
import { startAcpListener } from './listen.js'
import { logError, logInfo } from './log.js'

export { loadConfig } from './config.js'
export { createEntryHandler } from './handler.js'
export { offeringRegistry } from './offerings.js'
export { toAutohireInput, toUnsignedInput } from './fulfill.js'
export { startAcpListener } from './listen.js'
export type { AcpListenerHandle, StartAcpListenerOpts } from './listen.js'

function isDirectRun(): boolean {
  const entry = process.argv[1]
  if (!entry) return false
  try {
    return resolve(fileURLToPath(import.meta.url)) === resolve(entry)
  } catch {
    return false
  }
}

function idleForever(): Promise<void> {
  logInfo('ACP_ENABLED is off — complete no-op (not connecting to Virtuals ACP).')
  return new Promise(() => {
    setInterval(() => {}, 60_000)
  })
}

export async function main(): Promise<void> {
  let config
  try {
    config = loadConfig()
  } catch (err) {
    logError('fatal', err)
    process.exit(1)
    return
  }
  if (!config.enabled) {
    await idleForever()
    return
  }
  const handle = await startAcpListener()
  if (!handle.started) {
    process.exit(1)
    return
  }
  const stop = async () => {
    logInfo('stopping')
    await handle.stop()
    process.exit(0)
  }
  process.once('SIGINT', () => void stop())
  process.once('SIGTERM', () => void stop())
}

if (isDirectRun()) {
  main().catch((err) => {
    logError('fatal', err)
    process.exit(1)
  })
}
