import { Router } from 'express'
import { sendInternalError } from '../lib/http-error.js'
import { sendSquadsActivitySharePage } from '../lib/squads-share.js'

/** Public OG + SPA shell for the Render rewrite of crewpay.dev/squads/activity. */
export const squadsSharePagesRouter = Router()

squadsSharePagesRouter.get('/squads/activity', async (req, res) => {
  try {
    await sendSquadsActivitySharePage(res, req.query.squad, req.query.mint)
  } catch (err) {
    sendInternalError(res, err, 'squads activity share page')
  }
})
