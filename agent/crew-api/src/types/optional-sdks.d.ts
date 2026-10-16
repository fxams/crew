declare module 'viem' {
  export type Hex = `0x${string}`
  export function encodeFunctionData(args: {
    abi: unknown
    functionName: string
    args: unknown[]
  }): string
  export function encodeAbiParameters(types: unknown, values: unknown): Hex
  export function concat(values: readonly Hex[]): Hex
  export function slice(hex: Hex, start?: number, end?: number): Hex
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