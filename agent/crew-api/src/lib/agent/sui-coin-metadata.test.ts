import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  resolveCoinMetadataObjectId,
  resolveSuiCoinMetadataObjectId,
  setSuiGraphqlClientForTests,
  SUI_COIN_TYPE,
} from './sui-coin-metadata.js'

afterEach(() => {
  setSuiGraphqlClientForTests(null)
  delete process.env.SUI_GRAPHQL_URL
})

describe('sui coin metadata (GraphQL)', () => {
  it('resolves SUI CoinMetadata object id', async () => {
    const query = vi.fn().mockResolvedValue({
      data: {
        objects: {
          nodes: [{ address: '0x587c29de216efd4219573e08a1f6964d4fa7cb714518c2c8a0f29abfa264327d' }],
        },
      },
    })
    setSuiGraphqlClientForTests({ query } as never)

    const id = await resolveSuiCoinMetadataObjectId()
    expect(id).toBe('0x587c29de216efd4219573e08a1f6964d4fa7cb714518c2c8a0f29abfa264327d')
    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: { structType: `0x2::coin::CoinMetadata<${SUI_COIN_TYPE}>` },
      }),
    )
  })

  it('throws when GraphQL returns no metadata', async () => {
    setSuiGraphqlClientForTests({
      query: vi.fn().mockResolvedValue({ data: { objects: { nodes: [] } } }),
    } as never)
    await expect(resolveCoinMetadataObjectId('0x2::example::FOO')).rejects.toThrow(/No legacy CoinMetadata/)
  })
})
