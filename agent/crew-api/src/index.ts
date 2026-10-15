import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { migrate } from './lib/db.js'
import { agentRouter } from './routes/agent.js'
import { coinsRouter } from './routes/coins.js'
import { discoveryRouter } from './routes/discovery.js'
import { healthRouter } from './routes/health.js'
import { kolRegisterRouter } from './routes/kol-register.js'
import { walletConnectRouter } from './routes/wallet-connect.js'
import { telegramRouter } from './routes/telegram.js'
import { kolsRouter } from './routes/kols.js'
import { proofRouter } from './routes/proof.js'
import { webhooksRouter } from './routes/webhooks.js'
import { jobsRouter } from './routes/jobs.js'
import { tasksRouter } from './routes/tasks.js'
import { postLaunchRouter } from './routes/post-launch.js'
import { farcasterRouter } from './routes/farcaster.js'
import { adminOpsRouter } from './routes/admin-ops.js'
import { maybeStartAcpInProcess } from './lib/acp-inprocess.js'
import { configureTrustProxy } from './lib/client-ip.js'
import { probeJitoEngines } from './lib/agent/jito.js'
import { startFeeAccrualPoller } from './lib/fee-accrual.js'

const port = Number(process.env.PORT || 10000)
const allowedOrigins = (process.env.CORS_ORIGINS || 'https://app.crewpay.dev,https://crewpay.dev,http://localhost:5173,http://127.0.0.1:4173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

async function main() {
  await migrate()

  const app = express()
  app.disable('x-powered-by')
  configureTrustProxy(app)
  app.use(helmet({ contentSecurityPolicy: false }))
  app.use(
    cors({
      origin(origin, cb) {
        if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
          cb(null, true)
          return
        }
        cb(null, false)
      },
      // Needed so /kols/register/start can set the optional crew_reg cookie
      // (crewpay.dev → api.crewpay.dev is cross-origin). Cookie is fallback only.
      credentials: true,
      exposedHeaders: ['X-PAYMENT-RESPONSE', 'PAYMENT-RESPONSE', 'PAYMENT-REQUIRED'],
    }),
  )
  // Default JSON cap 100kb. Launch paths (including unsigned/submit/dry-run/x402)
  // may post imageBase64 — allow a few MB. Choose one parser so the body stream
  // is not consumed twice.
  const json100kb = express.json({ limit: '100kb' })
  const json6mb = express.json({ limit: '6mb' })
  app.use((req, res, next) => {
    const path = req.originalUrl.split('?')[0] || req.path
    if (path === '/api/agent/launch' || path.startsWith('/api/agent/launch/')) {
      json6mb(req, res, next)
      return
    }
    json100kb(req, res, next)
  })

  app.use(healthRouter)
  app.use(discoveryRouter)
  app.use('/api', healthRouter)
  app.use('/api', postLaunchRouter)
  app.use('/api', farcasterRouter)
  app.use('/api', adminOpsRouter)
  app.use('/api', coinsRouter)
  app.use('/api', kolsRouter)
  app.use('/api', kolRegisterRouter)
  app.use('/api', walletConnectRouter)
  app.use('/api', telegramRouter)
  app.use('/api', agentRouter)
  app.use('/api', proofRouter)
  app.use('/api', webhooksRouter)
  const jobsEnabled =
    (process.env.JOBS_ENABLED || '').trim().toLowerCase() === '1' ||
    (process.env.JOBS_ENABLED || '').trim().toLowerCase() === 'true'
  if (jobsEnabled) {
    app.use('/api', jobsRouter)
    app.use('/api', tasksRouter)
  }

  app.get('/', (_req, res) => {
    res.json({
      service: 'crew-api',
      docs: '/api/healthz',
      agent: '/api/agent',
      platforms: '/api/platforms',
      jobs: jobsEnabled ? '/api/jobs/open' : undefined,
      tasks: jobsEnabled ? '/api/tasks' : undefined,
      proof: '/api/proof',
      buybacks: '/api/buybacks',
      webhooks: '/api/webhooks',
      llms: '/llms.txt',
      llmsFull: '/llms-full.txt',
      openapi: '/openapi.json',
      wellKnown: {
        llms: '/.well-known/llms.txt',
        agent: '/.well-known/agent.json',
        aiPlugin: '/.well-known/ai-plugin.json',
        x402: '/.well-known/x402',
      },
      mcp: '/mcp.json',
      mcpHttp: 'https://mcp.crewpay.dev/mcp',
      aliases: {
        api: 'https://crewpay-api.onrender.com',
        mcpHttp: 'https://crewpay-mcp.onrender.com/mcp',
      },
    })
  })

  app.listen(port, () => {
    console.log(`crew-api listening on :${port}`)
    void probeJitoEngines()
      .then((h) => {
        console.log(
          `[jito] ${h.reachable}/${h.engines.length} engines reachable tip=${h.tipLamports} ok=${h.ok}`,
          h.engines.map((e) => `${e.ok ? 'ok' : 'fail'} ${e.ms}ms`).join(' · '),
        )
      })
      .catch((err) => {
        console.warn('[jito] startup probe failed', err)
      })
    void maybeStartAcpInProcess().catch((err) => {
      console.error('[acp] in-process listener failed; API continues', err)
    })
    startFeeAccrualPoller()
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
