import { assertReadyToConnect, loadConfig, type AcpConfig } from './config.js'
import {
  loadDirectFulfillment,
  toAutohireInput,
  toUnsignedInput,
  type Fulfillment,
} from './fulfill.js'
import { createEntryHandler, type JobSession as ProviderSession } from './handler.js'
import { logError, logInfo } from './log.js'
import { offeringRegistry } from './offerings.js'

export type AcpListenerHandle = {
  started: boolean
  stop: () => Promise<void>
}

export type StartAcpListenerOpts = {
  /** Injected fulfillment (in-process crew-api). Standalone worker loads crew-api by path. */
  fulfillment?: Fulfillment
  runAutohire?: (input: ReturnType<typeof toAutohireInput>) => Promise<unknown>
  runUnsignedLaunch?: (input: ReturnType<typeof toUnsignedInput>) => Promise<unknown>
}

function fulfillmentFromOpts(opts?: StartAcpListenerOpts): Fulfillment | undefined {
  if (opts?.fulfillment) return opts.fulfillment
  if (opts?.runAutohire && opts.runUnsignedLaunch) {
    return {
      autohire: (req, ctx) => opts.runAutohire!(toAutohireInput(req, ctx)),
      launch: (req, ctx) => opts.runUnsignedLaunch!(toUnsignedInput(req, ctx)),
    }
  }
  return undefined
}

async function startProvider(config: AcpConfig, fulfillment: Fulfillment) {
  assertReadyToConnect(config)
  const { AcpAgent, AssetToken, PrivyAlchemyEvmProviderAdapter } = await import(
    '@virtuals-protocol/acp-node-v2'
  )
  const { base, baseSepolia } = await import('viem/chains')
  const chain = config.chainId === 8453 ? base : baseSepolia
  const evmProvider = await PrivyAlchemyEvmProviderAdapter.create({
    walletAddress: config.walletAddress as `0x${string}`,
    walletId: config.walletId,
    signerPrivateKey: config.signerKey,
    chains: [chain],
    ...(config.builderCode ? { builderCode: config.builderCode } : {}),
  })
  const agent = await AcpAgent.create({ evmProvider })
  const onEntry = createEntryHandler({
    config,
    fulfillment,
    assetToken: { usdc: (amount, chainId) => AssetToken.usdc(amount, chainId) },
  })
  agent.on('entry', (session, entry) => onEntry(session as unknown as ProviderSession, entry))
  await agent.start(() => {
    logInfo(`listening for ACP jobs chainId=${config.chainId}`)
  })
  return agent
}

/**
 * Start the ACP job listener.
 * Complete no-op unless ACP_ENABLED=1 — does not connect, register, or touch funds.
 * Does not call process.exit (safe to embed in crewpay-api).
 */
export async function startAcpListener(opts?: StartAcpListenerOpts): Promise<AcpListenerHandle> {
  try {
    const config = loadConfig()
    if (!config.enabled) {
      logInfo('ACP_ENABLED is off — listener is a no-op (not connecting to Virtuals ACP).')
      return { started: false, stop: async () => {} }
    }
    logInfo(
      `starting offerings=${offeringRegistry({
        autohireUsd: config.priceAutohireUsd,
        launchUsd: config.priceLaunchUsd,
      })
        .map((o) => o.name)
        .join(',')}`,
    )
    const fulfillment = fulfillmentFromOpts(opts) ?? (await loadDirectFulfillment())
    const agent = await startProvider(config, fulfillment)
    return {
      started: true,
      async stop() {
        try {
          await agent.stop()
        } catch (err) {
          logError('stop failed', err)
        }
      },
    }
  } catch (err) {
    logError('startup failed — listener not connected', err)
    return { started: false, stop: async () => {} }
  }
}
