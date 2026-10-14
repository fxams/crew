import { Router } from 'express'
import { authorizeAdminOps } from '../lib/admin-ops-auth.js'
import { buildAdminOpsSnapshot } from '../lib/admin-ops.js'
import { sendInternalError } from '../lib/http-error.js'

export const adminOpsRouter = Router()

adminOpsRouter.get('/admin/ops', async (req, res) => {
  const auth = authorizeAdminOps(req)
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, error: auth.error })
    return
  }
  try {
    const snapshot = await buildAdminOpsSnapshot()
    res.setHeader('Cache-Control', 'private, no-store')
    res.json({ ...snapshot, authVia: auth.via })
  } catch (err) {
    sendInternalError(res, err, 'admin ops')
  }
})
