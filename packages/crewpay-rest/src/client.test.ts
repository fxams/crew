import { describe, expect, it } from 'vitest'
import {
  CrewPayClient,
  SOL_SPEND_CONFIRM_PHRASE,
  hashLaunchBody,
} from './client.ts'

describe('CrewPayClient spend gates', () => {
  const body = { name: 'Desk Cat', ticker: 'DCAT', autoHire: { seats: 3 } }

  it('hashes launch bodies stably', () => {
    expect(hashLaunchBody(body)).toBe(hashLaunchBody({ ...body }))
    expect(hashLaunchBody(body)).not.toBe(hashLaunchBody({ ...body, ticker: 'OTHER' }))
  })

  it('blocks launch without dry-run token / confirm phrase', () => {
    const client = new CrewPayClient({ apiUrl: 'https://example.invalid', apiKey: 'x', launcherKey: 'y' })
    expect(() =>
      client.launch(body, {
        humanConfirmed: true,
        confirmPhrase: SOL_SPEND_CONFIRM_PHRASE,
        dryRunToken: 'nope',
      }),
    ).toThrow(/dryRunToken/)
    expect(() =>
      client.launch(body, { humanConfirmed: true, confirmPhrase: 'yes', dryRunToken: 'x' }),
    ).toThrow(/confirmPhrase/)
    expect(() =>
      client.wireFees({ mint: 'm' }, { humanConfirmed: true, confirmPhrase: 'yes' }),
    ).toThrow(/confirmPhrase/)
  })
})
