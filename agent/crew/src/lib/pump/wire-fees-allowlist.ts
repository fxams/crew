/** Pump fee program — same id as @pump-fun/pump-sdk PUMP_FEE_PROGRAM_ID. */
export const PUMP_FEE_PROGRAM_ID_STR = 'pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ'

export const WIRE_FEE_KNOWN_PROGRAM_IDS = new Set([
  PUMP_FEE_PROGRAM_ID_STR,
  '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  '11111111111111111111111111111111',
  'SysvarRent111111111111111111111111111111111',
  'Sysvar1nstructions1111111111111111111111111',
  'ComputeBudget111111111111111111111111111111',
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
  'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
])

export function assertKnownWireFeePrograms(programIds: string[]) {
  for (const id of programIds) {
    if (!WIRE_FEE_KNOWN_PROGRAM_IDS.has(id)) {
      throw new Error(
        `Unexpected program ${id.slice(0, 8)}… in wire-fees tx. Aborting before wallet prompt.`,
      )
    }
  }
}
