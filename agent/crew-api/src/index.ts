import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { migrate } from './lib/db.js'
import { agentRouter } from './routes/agent.js'
import { coinsRouter } from './routes/coins.js'
import { discoveryRouter } from './routes/discovery.js'
import { healthRouter } from './routes/health.js'
import { kolRegisterRouter } from './routes/kol-register.js'
import { kolsRouter } from './routes/kols.js'
import { proofRouter } from './routes/proof.js'
import { webhooksRouter } from './routes/webhooks.js'

const port = Number(process.env.PORT || 10000)
const allowedOrigins = (process.env.CORS_ORIGINS || 'https://app.crewpay.dev,https://crewpay.dev,http://localhost:5173,http://127.0.0.1:4173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

async function main() {
  await migrate()

  const app = express()
  app.disable('x-powered-by')
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
    }),
  )
  // Agent launches may post imageBase64 — allow a few MB.
  app.use(express.json({ limit: '6mb' }))

  app.use(healthRouter)
  app.use(discoveryRouter)
  app.use('/api', healthRouter)
  app.use('/api', coinsRouter)
  app.use('/api', kolsRouter)
  app.use('/api', kolRegisterRouter)
  app.use('/api', agentRouter)
  app.use('/api', proofRouter)
  app.use('/api', webhooksRouter)

  app.get('/', (_req, res) => {
    res.json({
      service: 'crew-api',
      docs: '/api/healthz',
      agent: '/api/agent',
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
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
