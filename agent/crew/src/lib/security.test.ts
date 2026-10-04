import { describe, expect, it } from 'vitest'
import { assertSafeRpcUrl, sanitizeBoard, sanitizeCoin } from './security'

describe('assertSafeRpcUrl', () => {
  it('accepts https mainnet RPC', () => {
    expect(assertSafeRpcUrl('https://api.mainnet-beta.solana.com/')).toBe(
      'https://api.mainnet-beta.solana.com',
    )
  })

  it('rejects http', () => {
    expect(() => assertSafeRpcUrl('http://api.mainnet-beta.solana.com')).toThrow(/HTTPS/)
  })

  it('rejects localhost', () => {
    expect(() => assertSafeRpcUrl('https://localhost:8899')).toThrow(/not allowed/)
  })

  it('rejects embedded credentials', () => {
    expect(() => assertSafeRpcUrl('https://user:pass@rpc.example.com')).toThrow(/credentials/)
  })
})

describe('sanitizeBoard', () => {
  it('drops unknown modes and strips angle brackets', () => {
    const board = sanitizeBoard({
      coins: [
        {
          id: '1',
          mint: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
          name: '<script>x</script>',
          ticker: 'HACK',
          vibe: 'ok',
          mode: 'split',
          crew: [{ handle: '@a', wallet: '11111111111111111111111111111112', share: 100 }],
          signature: 'sig',
          launchedAt: 1,
          launcher: '11111111111111111111111111111111',
          pumpUrl: 'javascript:alert(1)',
        },
        {
          id: '2',
          mint: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
          name: 'Bad',
          ticker: 'BAD',
          vibe: '',
          mode: 'evil',
          crew: [],
          signature: '',
          launchedAt: 0,
          launcher: '',
          pumpUrl: '',
        },
      ],
      remits: [],
    })
    expect(board.coins).toHaveLength(1)
    expect(board.coins[0].name).not.toContain('<')
    expect(board.coins[0].pumpUrl).toMatch(/^https:\/\/pump\.fun\//)
  })

  it('keeps agent hire metadata', () => {
    const coin = sanitizeCoin({
      id: 'hire',
      mint: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
      name: 'Hire Desk',
      ticker: 'HIRE',
      vibe: 'pay humans',
      mode: 'agent',
      crew: [
        {
          handle: '@caller',
          wallet: '11111111111111111111111111111112',
          share: 100,
          hireRole: 'caller',
        },
      ],
      signature: 'sig',
      launchedAt: 9,
      launcher: '11111111111111111111111111111111',
      pumpUrl: 'https://pump.fun/coin/x',
      agent: {
        name: 'Desk Mind',
        objective: 'Hire KOLs who move the chart.',
        model: 'Claude Sonnet',
      },
    })
    expect(coin?.mode).toBe('agent')
    expect(coin?.agent?.name).toBe('Desk Mind')
    expect(coin?.crew[0].hireRole).toBe('caller')
  })
})
