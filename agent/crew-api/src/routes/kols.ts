import { Router } from 'express'
import { countKols, getKolByWallet, listKols } from '../lib/kols.js'
import { sendInternalError } from '../lib/http-error.js'

export const kolsRouter = Router()

kolsRouter.get('/kols', async (req, res) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : undefined
    const limit = Number(req.query.limit || 50)
    const offset = Number(req.query.offset || 0)
    const [kols, total] = await Promise.all([
      listKols({ q, limit, offset }),
      countKols(),
    ])
    res.json({ kols, total })
  } catch (err) {
    sendInternalError(res, err, 'list kols')
  }
})

kolsRouter.get('/kols/wallet/:wallet', async (req, res) => {
  try {
    const kol = await getKolByWallet(req.params.wallet)
    if (!kol) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    res.json({ kol })
  } catch (err) {
    sendInternalError(res, err, 'get kol')
  }
})
