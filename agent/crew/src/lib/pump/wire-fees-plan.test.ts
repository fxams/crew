import { describe, expect, it } from 'vitest'
import {
  assertKnownWireFeePrograms,
  PUMP_FEE_PROGRAM_ID_STR,
  WIRE_FEE_KNOWN_PROGRAM_IDS,
} from './wire-fees-allowlist'

describe('wire-fees program allowlist', () => {
  it('allows Pump fee program', () => {
    expect(WIRE_FEE_KNOWN_PROGRAM_IDS.has(PUMP_FEE_PROGRAM_ID_STR)).toBe(true)
    expect(() => assertKnownWireFeePrograms([PUMP_FEE_PROGRAM_ID_STR])).not.toThrow()
  })

  it('rejects random program ids', () => {
    expect(() =>
      assertKnownWireFeePrograms(['FakeProg1111111111111111111111111111111']),
    ).toThrow(/Unexpected program/)
  })
})
