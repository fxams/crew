/**
 * vibe/vibe Seedify factory (Robinhood Chain testnet run15).
 * Selector recovered from reference tx 0xc448a4dd… against 0xe794217880011f9cA6961340eD5c16EC9559Fea0.
 * Calldata body matches viem tuple encoding below; the on-chain name is not published in 4byte registries.
 */
export const VIBEVIBE_FACTORY_TESTNET = '0xe794217880011f9cA6961340eD5c16EC9559Fea0' as const

/** Observed on testnet factory `create*` entrypoint. */
export const VIBEVIBE_FACTORY_CREATE_SELECTOR = '0x24e615b3' as const

export const VIBEVIBE_CREATE_TUPLE_COMPONENTS = [
  { type: 'string' as const, name: 'name' },
  { type: 'string' as const, name: 'symbol' },
  { type: 'string' as const, name: 'metadataURI' },
  { type: 'uint256' as const, name: 'metadataSchemaVersion' },
  { type: 'uint256' as const, name: 'minInitialTokensOut' },
  { type: 'address' as const, name: 'creatorFeeRecipient' },
  { type: 'uint256' as const, name: 'reserved0' },
  { type: 'uint256' as const, name: 'reserved1' },
  { type: 'uint256' as const, name: 'reserved2' },
  { type: 'uint256' as const, name: 'reserved3' },
  { type: 'uint256' as const, name: 'deadline' },
  { type: 'uint256' as const, name: 'reserved4' },
  { type: 'uint256' as const, name: 'reserved5' },
  { type: 'uint256' as const, name: 'reserved6' },
  { type: 'uint256' as const, name: 'reserved7' },
]

export type VibevibeCreateParams = {
  name: string
  symbol: string
  metadataURI: string
  metadataSchemaVersion: bigint
  minInitialTokensOut: bigint
  creatorFeeRecipient: `0x${string}`
  deadline: bigint
}

export const VIBEVIBE_DEFAULT_METADATA_SCHEMA_VERSION = 100n
