import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { assertReadyToConnect, loadConfig, type AcpConfig } from './config.js'
import { loadDirectFulfillment } from './fulfill.js'
import { createEntryHandler } from './handler.js'
import { logError, logInfo } from './log.js'
import { offeringRegistry } from './offerings.js'

export { loadConfig } from './config.js'
export { createEntryHandler } from './handler.js'
export { offeringRegistry } from './offerings.js'

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

async function startProvider(config: AcpConfig) {
  assertReadyToConnect(config)
  const { AcpAgent, AlchemyEvmProviderAdapter, AssetToken } = await import(
    '@virtuals-protocol/acp-node-v2'
  )
  const { base, baseSepolia } = await import('@account-kit/infra')
  const chain = config.chainId === 8453 ? base : baseSepolia
  const adapterOpts: {
    walletAddress: string
    privateKey: string
    entityId: number
    chains: unknown[]
    builderCode?: string
  } = {
    walletAddress: config.walletAddress,
    privateKey: config.signerKey,
    entityId: config.entityId,
    chains: [chain],
  }
  if (config.builderCode) adapterOpts.builderCode = config.builderCode
  const adapter = await AlchemyEvmProviderAdapter.create(adapterOpts)
  const agent = await AcpAgent.create({ provider: adapter })
  const fulfillment = await loadDirectFulfillment()
  const onEntry = createEntryHandler({
    config,
    fulfillment,
    assetToken: { usdc: (amount, chainId) => AssetToken.usdc(amount, chainId) },
  })
  agent.on('entry', onEntry)
  await agent.start(() => {
    logInfo(`listening for ACP jobs chainId=${config.chainId}`)
  })
  return agent
}

export async function main(): Promise<void> {
  const config = loadConfig()
  if (!config.enabled) {
    await idleForever()
    return
  }
  logInfo(
    `starting offerings=${offeringRegistry({
      autohireUsd: config.priceAutohireUsd,
      launchUsd: config.priceLaunchUsd,
    })
      .map((o) => o.name)
      .join(',')}`,
  )
  const agent = await startProvider(config)
  const stop = async () => {
    logInfo('stopping')
    try {
      await agent.stop()
    } catch (err) {
      logError('stop failed', err)
    }
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
