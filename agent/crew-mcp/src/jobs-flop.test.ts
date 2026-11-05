import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'server.ts'), 'utf8')

function toolBlock(name: string): string {
  const start = src.indexOf(`'${name}'`)
  expect(start).toBeGreaterThan(-1)
  const next = src.indexOf('server.registerTool(', start + 1)
  return src.slice(start, next === -1 ? undefined : next)
}

describe('MCP exposes flop-devnet jobs', () => {
  it('advertises campaign tools with flop-devnet and FLOP', () => {
    for (const name of [
      'crew_job_create_dry_run',
      'crew_job_create',
      'crew_job_fund',
      'crew_job_payout',
      'crew_job_refund',
    ]) {
      const block = toolBlock(name)
      expect(block, name).toMatch(/flop-devnet|Payee SS58|satisfyEscrow|refundEscrow|openEscrow/)
    }
    const create = toolBlock('crew_job_create')
    expect(create).toMatch(/flop-devnet/)
    expect(create).toMatch(/FLOP/)
    const fund = toolBlock('crew_job_fund')
    expect(fund).toMatch(/to:/)
    expect(fund).toMatch(/Payee SS58/)
    expect(fund).not.toMatch(/Qatar|AST|Asia\/Qatar|\+03:00/)
  })

  it('registers campaign tools even when JOBS_ENABLED is unset', () => {
    const gate = src.indexOf('const jobsEnabled')
    const create = src.indexOf(`'crew_job_create'`)
    const fund = src.indexOf(`'crew_job_fund'`)
    expect(create).toBeGreaterThan(-1)
    expect(fund).toBeGreaterThan(-1)
    expect(create).toBeLessThan(gate)
    expect(fund).toBeLessThan(gate)
  })
})
