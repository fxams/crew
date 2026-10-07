import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { migrate } from './lib/db.js'
import { coinsRouter } from './routes/coins.js'
import { healthRouter } from './routes/health.js'
import { kolsRouter } from './routes/kols.js'

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
  app.use(express.json({ limit: '1mb' }))

  app.use(healthRouter)
  app.use('/api', healthRouter)
  app.use('/api', coinsRouter)
  app.use('/api', kolsRouter)

  app.get('/', (_req, res) => {
    res.json({ service: 'crew-api', docs: '/api/healthz' })
  })

  app.listen(port, () => {
    console.log(`crew-api listening on :${port}`)
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
