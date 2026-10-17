import { Router } from 'express'
import { sendInternalError } from '../lib/http-error.js'
import { sendKolSharePage } from '../lib/kol-program/share-page.js'

/** Public OG + SPA shell for Render rewrites of crewpay.dev/kol/* and /ref/*. */
export const kolSharePagesRouter = Router()

kolSharePagesRouter.get('/kol/:handle', async (req, res) => {
  try {
    await sendKolSharePage(res, 'kol', String(req.params.handle))
  } catch (err) {
    sendInternalError(res, err, 'kol share page')
  }
})

kolSharePagesRouter.get('/ref/:handle', async (req, res) => {
  try {
    await sendKolSharePage(res, 'ref', String(req.params.handle))
  } catch (err) {
    sendInternalError(res, err, 'ref share page')
  }
})
