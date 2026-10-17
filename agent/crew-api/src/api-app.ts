import cors from 'cors'
import express, { type Express } from 'express'
import helmet from 'helmet'
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
import { suiLaunchpadRouter } from './routes/sui-launchpad.js'
import { kolProgramRouter } from './routes/kol-program.js'
import { configureTrustProxy } from './lib/client-ip.js'

const defaultOrigins =
  'https://app.crewpay.dev,https://crewpay.dev,http://localhost:5173,http://127.0.0.1:4173'

/** Production Express app (no listen). KOL routes always mounted; `programGate` enforces env flag. */
export function createApiApp(): Express {
  const allowedOrigins = (process.env.CORS_ORIGINS || defaultOrigins)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

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
      credentials: true,
      exposedHeaders: ['X-PAYMENT-RESPONSE', 'PAYMENT-RESPONSE', 'PAYMENT-REQUIRED'],
    }),
  )
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
  app.use('/api', suiLaunchpadRouter)
  app.use('/api', coinsRouter)
  app.use('/api', kolsRouter)
  app.use('/api', kolRegisterRouter)
  app.use('/api', kolProgramRouter)
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
      proof: '/api/proof',
      kolProgram: '/api/kol-program/status',
    })
  })

  return app
}
