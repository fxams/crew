import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import {
  assertOpsBudget,
  drawOpsBudget,
  ESTIMATED_OPS_CRANK_LAMPORTS,
  opsBudgetRemaining,
  opsDailyLamportsLimit,
  resetOpsBudget,
} from './ops-budget.js'

describe('ops daily lamport budget', () => {
  const saved = process.env.CREW_OPS_DAILY_LAMPORTS
  beforeEach(() => {
    resetOpsBudget()
    delete process.env.CREW_OPS_DAILY_LAMPORTS
  })
  afterEach(() => {
    resetOpsBudget()
    if (saved === undefined) delete process.env.CREW_OPS_DAILY_LAMPORTS
    else process.env.CREW_OPS_DAILY_LAMPORTS = saved
  })

  it('defaults to 2_000_000 lamports/day', () => {
    expect(opsDailyLamportsLimit()).toBe(2_000_000)
  })

  it('draws down and rejects overspend', () => {
    process.env.CREW_OPS_DAILY_LAMPORTS = String(ESTIMATED_OPS_CRANK_LAMPORTS)
    expect(opsBudgetRemaining()).toBe(ESTIMATED_OPS_CRANK_LAMPORTS)
    drawOpsBudget(ESTIMATED_OPS_CRANK_LAMPORTS)
    expect(opsBudgetRemaining()).toBe(0)
    expect(() => assertOpsBudget(1)).toThrow(/budget exhausted/)
  })
})
