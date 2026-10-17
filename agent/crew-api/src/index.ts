import { migrate } from './lib/db.js'
import { createApiApp } from './api-app.js'
import { maybeStartAcpInProcess } from './lib/acp-inprocess.js'
import { probeJitoEngines } from './lib/agent/jito.js'
import { startFeeAccrualPoller } from './lib/fee-accrual.js'

const port = Number(process.env.PORT || 10000)

async function main() {
  await migrate()
  const app = createApiApp()

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
