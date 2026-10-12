declare module 'viem' {
  export function encodeFunctionData(args: {
    abi: unknown
    functionName: string
    args: unknown[]
  }): string
}

declare module '@zoralabs/coins-sdk' {
  export function createCoinCall(args: Record<string, unknown>): Promise<{
    calls: Array<{ to: string; data: string; value?: bigint }>
    predictedCoinAddress: string
  }>
  export const CreateConstants: {
    ContentCoinCurrencies?: { ZORA?: string; ETH?: string }
  }
}